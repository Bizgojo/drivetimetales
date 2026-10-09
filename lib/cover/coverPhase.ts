/**
 * COVER-PIPELINE-DECOUPLE-001 — cover_generation_phase (Tasks 1, 2, 3)
 *
 * Root defect fixed (Class A pipeline defect): cover_generation was serially
 * gated behind series_voice_preflight / canonical-intro / announcement /
 * audio-readiness, so one EP1 preflight failure blocked every episode's cover.
 *
 * New rule:
 * - The cover_generation_phase is triggered right after the series blueprint +
 *   episode briefs exist (Holly records cover_tasks[] in job state at that point).
 * - cover_tasks[] for ALL episodes dispatch SIMULTANEOUSLY (Promise.all —
 *   parallel asset generation). No serial gating: an episode assembles even
 *   while its own or siblings' covers are still pending.
 * - Covers never wait for: canonical intro, announcement, voice preflight, QC,
 *   audio readiness, or publish state.
 *
 * PIPELINE CANON 001 Rule 3 note: Rule 3 sequential ordering governs EPISODES
 * (continuity/script order), not asset generation. Parallel cover assets do
 * not violate it — no episode consumes another episode's cover.
 *
 * No network, no DB, no paid calls in this module: the caller injects render().
 * Regression tests inject mocks (spend governance — no image-model spend).
 */

import {
  withCoverRetry,
  COVER_MAX_RETRIES,
  type CoverFailureClass,
} from './coverRetry'
import {
  buildCoverMissingAlert,
  fireCoverMissingAlert,
  shouldFireCoverAlert,
  type CoverAlertSinks,
} from './coverAlert'

/** Steps a cover task must NEVER wait for (decoupling contract). */
export const COVER_DECOUPLED_FROM = [
  'series_voice_preflight',
  'canonical_intro',
  'announcement',
  'voice_preflight',
  'qc',
  'audio_readiness',
  'publish_state',
] as const

export type CoverTaskKind = 'series_cover' | 'episode_cover' | 'announcement_art' | 'branding_art'

export type CoverTaskStatus = 'queued' | 'rendering' | 'done' | 'failed'

export interface CoverTask {
  taskId: string
  kind: CoverTaskKind
  seriesId: string
  storyId: string | null
  episodeNumber: number | null
  title: string | null
  status: CoverTaskStatus
  attempts: number
  /** Set when the asset could not be produced — warning, never blocking. */
  coverMissing: boolean
  failureClass: CoverFailureClass | null
  coverUrl: string | null
  decoupledFrom: readonly string[]
  createdAt: string
}

export interface CoverPhaseEpisodeInput {
  storyId: string
  episodeNumber?: number | null
  title?: string | null
}

export interface BuildCoverPhaseInput {
  seriesId: string
  seriesTitle?: string | null
  episodes: CoverPhaseEpisodeInput[]
  includeAnnouncementArt?: boolean
  includeBrandingArt?: boolean
}

function taskIdFor(kind: CoverTaskKind, seriesId: string, storyId: string | null, ep: number | null): string {
  const who = storyId || `ep${ep ?? 'x'}`
  return `cover:${kind}:${String(seriesId).slice(0, 8)}:${who}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Build the full cover_tasks[] group for a series: series cover + one episode
 * cover per episode + announcement art + branding art. Called right after the
 * series blueprint + episode briefs exist — before any audio/voice work.
 */
export function buildCoverPhaseTasks(input: BuildCoverPhaseInput): CoverTask[] {
  const tasks: CoverTask[] = []
  const createdAt = nowIso()
  const base = { decoupledFrom: COVER_DECOUPLED_FROM, createdAt } as const

  tasks.push({
    taskId: taskIdFor('series_cover', input.seriesId, null, null),
    kind: 'series_cover',
    seriesId: input.seriesId,
    storyId: null,
    episodeNumber: null,
    title: input.seriesTitle ?? null,
    status: 'queued',
    attempts: 0,
    coverMissing: false,
    failureClass: null,
    coverUrl: null,
    ...base,
  })

  const sorted = [...(input.episodes || [])].sort(
    (a, b) => Number(a.episodeNumber ?? 999) - Number(b.episodeNumber ?? 999),
  )
  for (const ep of sorted) {
    tasks.push({
      taskId: taskIdFor('episode_cover', input.seriesId, ep.storyId, ep.episodeNumber ?? null),
      kind: 'episode_cover',
      seriesId: input.seriesId,
      storyId: ep.storyId,
      episodeNumber: ep.episodeNumber ?? null,
      title: ep.title ?? null,
      status: 'queued',
      attempts: 0,
      coverMissing: false,
      failureClass: null,
      coverUrl: null,
      ...base,
    })
  }

  if (input.includeAnnouncementArt !== false) {
    tasks.push({
      taskId: taskIdFor('announcement_art', input.seriesId, null, null),
      kind: 'announcement_art',
      seriesId: input.seriesId,
      storyId: null,
      episodeNumber: null,
      title: input.seriesTitle ?? null,
      status: 'queued',
      attempts: 0,
      coverMissing: false,
      failureClass: null,
      coverUrl: null,
      ...base,
    })
  }

  if (input.includeBrandingArt !== false) {
    tasks.push({
      taskId: taskIdFor('branding_art', input.seriesId, null, null),
      kind: 'branding_art',
      seriesId: input.seriesId,
      storyId: null,
      episodeNumber: null,
      title: input.seriesTitle ?? null,
      status: 'queued',
      attempts: 0,
      coverMissing: false,
      failureClass: null,
      coverUrl: null,
      ...base,
    })
  }

  return tasks
}

/** State_json payload Holly records right after episode briefs are created. */
export function buildCoverPhaseState(
  input: BuildCoverPhaseInput,
  triggeredAfter: 'episode_briefs' | 'series_blueprint' = 'episode_briefs',
): Record<string, unknown> {
  const tasks = buildCoverPhaseTasks(input)
  return {
    triggeredAfter,
    triggeredAt: nowIso(),
    decoupledFrom: [...COVER_DECOUPLED_FROM],
    taskCount: tasks.length,
    tasks,
  }
}

export interface CoverRenderResult {
  coverUrl: string
}

export interface DispatchCoverTasksOptions {
  maxRetries?: number
  alertSinks?: CoverAlertSinks
  /** Override alert threshold (default: fire after 2 failed retries). */
  alertAfterFailedRetries?: number
}

export interface DispatchCoverTasksResult {
  tasks: CoverTask[]
  done: number
  failed: number
  coverMissing: number
  alertsFired: number
}

async function runSingleCoverTask(
  task: CoverTask,
  render: (task: CoverTask, prompt: string, attempt: number) => Promise<CoverRenderResult>,
  basePrompt: string,
  opts: DispatchCoverTasksOptions,
  alerted: { count: number },
): Promise<CoverTask> {
  task.status = 'rendering'
  const outcome = await withCoverRetry<CoverRenderResult>(
    basePrompt,
    (prompt, attempt) => render(task, prompt, attempt),
    {
      maxRetries: opts.maxRetries ?? COVER_MAX_RETRIES,
      validate: (r) => (r && String(r.coverUrl || '').trim() ? null : 'Renderer returned an empty asset (empty_asset).'),
      onRetry: (info) => {
        task.attempts = info.attempt
        task.failureClass = info.failureClass
        if (shouldFireCoverAlert(info.attempt) && (opts.alertAfterFailedRetries ?? 2) <= info.attempt) {
          alerted.count += 1
          // Fire-and-forget: never blocks the retry loop or the phase.
          void fireCoverMissingAlert(
            buildCoverMissingAlert({
              seriesId: task.seriesId,
              storyId: task.storyId,
              episodeNumber: task.episodeNumber,
              taskId: task.taskId,
              taskKind: task.kind,
              failedAttempts: info.attempt,
              failureClass: info.failureClass,
              lastError: info.reason,
            }),
            opts.alertSinks || {},
          )
        }
      },
    },
  )
  task.attempts = outcome.attempts
  if (outcome.ok && outcome.result?.coverUrl) {
    task.status = 'done'
    task.coverUrl = outcome.result.coverUrl
  } else {
    // Missing cover = warning + cover_missing flag, NOT a blocking error.
    task.status = 'failed'
    task.coverMissing = true
    task.failureClass = outcome.failureClass || task.failureClass
  }
  return task
}

/**
 * Dispatch ALL cover tasks simultaneously (parallel asset generation).
 * Never throws and never awaits voice/audio state: episodes assemble with
 * covers pending; covers are addable later (cover_post_publish_update).
 */
export async function dispatchCoverTasks(
  tasks: CoverTask[],
  render: (task: CoverTask, prompt: string, attempt: number) => Promise<CoverRenderResult>,
  promptFor: (task: CoverTask) => string = (task) =>
    `Cover art for ${task.title || task.kind} (${task.kind}, series ${task.seriesId}${task.episodeNumber !== null ? ` EP${task.episodeNumber}` : ''}).`,
  opts: DispatchCoverTasksOptions = {},
): Promise<DispatchCoverTasksResult> {
  const alerted = { count: 0 }
  const settled = await Promise.all(
    (tasks || []).map((task) => runSingleCoverTask(task, render, promptFor(task), opts, alerted)),
  )
  const done = settled.filter((t) => t.status === 'done').length
  const failed = settled.filter((t) => t.status === 'failed').length
  return {
    tasks: settled,
    done,
    failed,
    coverMissing: settled.filter((t) => t.coverMissing).length,
    alertsFired: alerted.count,
  }
}
