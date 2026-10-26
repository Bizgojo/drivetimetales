import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  DISPATCH_FAILURE_THRESHOLD,
  DISPATCH_FAILURE_WINDOW_MS,
  RETRY_CAP,
  SERIES_IDENTICAL_FAILURE_CAP,
  SERIES_RETRY_CAP_WINDOW_MS,
  capEligibleFailures,
  topFailureSignature,
  failureCircuitOpen,
  countRecentFailures,
  hasActiveMixJob,
  retryCapWindowStartMs,
  transientDispatchHold,
  transientEscalation,
  TRANSIENT_BACKOFF_MS,
  TRANSIENT_ESCALATE_WINDOW_MS,
  type JobStatusRow,
} from '@/lib/dispatchGuards'
import { ACCOUNT_WIDE_CAUSES, type TransientCause } from '@/lib/transientFailure'
import { findQueueDuplicates, type QueueDedupRow } from '@/lib/dispatchDedup'
import { failureDestinationForStory, ONE_REPAIR_PASS_REASON } from '@/lib/workflowTransitions'
import { syncPremiseIndexForTransition } from '@/lib/premiseIndex'
import {
  isSeriesMemberTypedStandalone,
  mistypedSeriesRows,
  seriesTypeMismatchReason,
  type SeriesTypeRow,
} from '@/lib/seriesTypeConsistency'
import { dispatchReadinessReasons } from '@/lib/scriptReadiness'

export const runtime = 'nodejs'
export const maxDuration = 60

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']
// Statuses that mean "a job already exists for this story — don't create another"
// Note: 'failed' is intentionally excluded — a single failed job does not block
// re-dispatch. But repeated failures DO: the story/series-level failure circuit
// (ATL-DISPATCH-DEFECTS-001) blocks dispatch after DISPATCH_FAILURE_THRESHOLD
// failed jobs inside a rolling DISPATCH_FAILURE_WINDOW_MS window and moves the
// stories to repair_queue. The per-job circuit breaker in the runner cannot
// catch this because every dispatch retry is a NEW job row.
const BLOCKING_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']
const READY_OR_FURTHER_STATES = new Set([
  'stories_in_queue',
  'scripts_ready',
  'ready_for_review',
  'approved_ready',
  'unpublished_library',
  'published',
])
const NUM_RUNNERS = 4              // production-runner:worker-1..4 (pipeline_runner_state)
// ATL-IO-CAP-001 (Marc GO 2026-07-10): IO-aware ceiling on total ACTIVE jobs.
// NANO exhausted its daily IO budget under ~16 uncapped concurrent jobs (Jul 9
// outage). MEDIUM has ~8x NANO's IO baseline (dashboard ceilings: 3K IOPS /
// 125 MB/s). 8 = half the load that killed NANO on 8x the budget -> >10x
// headroom for launch traffic. Raise only with dashboard IO evidence.
const MAX_DISPATCH_PER_RUN = 8

type StoryRow = {
  id: string
  title: string | null
  author?: string | null
  story_type: string | null
  workflow_state: string | null
  series_id: string | null
  series_name: string | null
  episode_number: number | null
  series_episode_number: number | null
  series_total_episodes: number | null
  needs_attention?: boolean | null
  dispatch_failure_reset_at?: string | null
  production_repair_count?: number | null
}

type DispatchResult = {
  jobId: string
  jobType: 'standalone' | 'series'
  storyId?: string
  seriesId?: string
  title?: string | null
  episodeCount?: number
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

function cleanState(value: unknown) {
  return String(value || '').trim()
}

function episodeNumber(story: StoryRow) {
  return Number(story.episode_number || story.series_episode_number || 0)
}

function expectedEpisodeCount(stories: StoryRow[]) {
  const fromRows = stories
    .map((story) => Number(story.series_total_episodes || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  return Math.max(stories.length, ...fromRows)
}

function exactName(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

async function validateActiveAuthor(
  supabase: any,
  story: Pick<StoryRow, 'id' | 'title' | 'author'>,
  now: string,
) {
  const authorName = String(story.author || '').trim()
  const reason = authorName
    ? `Dispatch blocked: story.author "${authorName}" does not resolve to an active authors row`
    : 'Dispatch blocked: story.author is missing'

  if (authorName) {
    const { data, error } = await supabase
      .from('authors')
      .select('id,name')
      .eq('is_active', true)
      .ilike('name', authorName)

    if (error) {
      return { ok: false, reason: `Dispatch author validation failed: ${error.message}` }
    }

    const exactMatches = (data || []).filter((author: { name: string | null }) => exactName(author.name) === exactName(authorName))
    if (exactMatches.length === 1) return { ok: true, reason: null }
  }

  const { error: updateError } = await supabase
    .from('stories')
    .update({
      needs_attention: true,
      needs_attention_reason: reason,
      workflow_state_changed_by: 'atlas',
      workflow_state_changed_at: now,
      workflow_state_change_reason: reason,
    })
    .eq('id', story.id)

  if (updateError) {
    return { ok: false, reason: `Author validation failed and needs_attention update failed: ${updateError.message}` }
  }

  console.warn('[dispatch-queue] Skipped (author validation):', story.id, story.title, reason)
  return { ok: false, reason }
}

function seriesIsReady(stories: StoryRow[]) {
  const expected = expectedEpisodeCount(stories)
  if (expected < 2 || stories.length < expected) return false

  const episodeNumbers = new Set(stories.map(episodeNumber).filter((value) => value > 0))
  if (episodeNumbers.size < expected) return false

  return stories.every((story) => READY_OR_FURTHER_STATES.has(cleanState(story.workflow_state)))
}

async function handleDispatchQueue(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // DISPATCH-READINESS-GATE-001: every free deterministic gate (incl.
  // runtime-vs-brief and series cast continuity) runs BEFORE a job exists.
  let narratorVoiceNamesCache: string[] | null = null
  async function narratorVoiceNames(): Promise<string[]> {
    if (narratorVoiceNamesCache) return narratorVoiceNamesCache
    const { data } = await supabase.from('narrator_voices').select('name')
    narratorVoiceNamesCache = ((data || []) as Array<{ name: string | null }>).map((v) => String(v.name || ''))
    return narratorVoiceNamesCache
  }
  async function readinessReasonsFor(storyIds: string[]): Promise<string[] | { error: string }> {
    const { data, error } = await supabase
      .from('stories')
      .select('id,title,script,story_type,series_id,series_total_episodes,episode_number,series_episode_number,series_is_finale,duration_mins')
      .in('id', storyIds)
    if (error) return { error: error.message }
    const voices = await narratorVoiceNames()
    return dispatchReadinessReasons(((data || []) as any[]).map((row) => ({
      id: row.id,
      title: row.title,
      script: row.script,
      storyType: row.story_type,
      seriesId: row.series_id,
      seriesTotalEpisodes: row.series_total_episodes,
      episodeNumber: row.episode_number ?? row.series_episode_number,
      isFinale: row.series_is_finale,
      briefMinutes: row.duration_mins,
      narratorVoiceNames: voices,
    })))
  }
  function readinessReason(reasons: string[]): string {
    const head = reasons.slice(0, 12).join(' | ')
    return `DISPATCH-READINESS-GATE-001: ${reasons.length} pre-spend blocker(s) found before any job was created — ${head}${reasons.length > 12 ? ` | +${reasons.length - 12} more` : ''}. Fix the script(s), then clear needs_attention.`
  }

  const dispatched: DispatchResult[] = []
  const skipped: Array<Record<string, unknown>> = []
  const now = new Date().toISOString()
  const deduped: Array<{ id: string; title: string }> = []
  let needsAttentionSkipped = 0

  // ── TRANSIENT-FAILURE-001: global pause on account-wide outside failures ──
  // A dead ElevenLabs/Anthropic/OpenAI key or empty balance fails EVERY job the
  // same way. Pause the whole dispatch cycle for TRANSIENT_BACKOFF_MS after the
  // newest such failure so N queued stories can't each burn a retry.
  {
    const globalSince = new Date(Date.now() - TRANSIENT_BACKOFF_MS).toISOString()
    const { data: recentTransient, error: recentTransientError } = await supabase
      .from('production_jobs')
      .select('updated_at,error_json')
      .eq('status', 'failed')
      .gte('updated_at', globalSince)
      .eq('error_json->>transient', 'true')
      .in('error_json->>transient_cause', Array.from(ACCOUNT_WIDE_CAUSES))
      .order('updated_at', { ascending: false })
      .limit(1)
    if (recentTransientError) {
      console.warn('[dispatch-queue] Global transient check failed (continuing):', recentTransientError.message)
    } else {
      const accountWide = (recentTransient || []).find((row) =>
        ACCOUNT_WIDE_CAUSES.has(String((row.error_json as any)?.transient_cause || '') as TransientCause),
      )
      if (accountWide) {
        const retryAfterIso = new Date(Date.parse(accountWide.updated_at) + TRANSIENT_BACKOFF_MS).toISOString()
        const cause = String((accountWide.error_json as any)?.transient_cause)
        console.warn('[dispatch-queue] Paused: account-wide outside failure', cause, 'retry after', retryAfterIso)
        return json({
          success: true,
          dispatchedCount: 0,
          paused: { reason: 'global_transient_backoff', cause, retryAfterIso },
        })
      }
    }
  }

  // ── Duplicate-title detection (PIPE-AUDIT-001 item 3) ──────────────────────
  // Series-scoped matching only (see lib/dispatchDedup.ts). Duplicates are
  // FLAGGED for human confirmation (needs_attention) — never auto-moved to
  // cold_storage and never job-cancelled. The needs_attention gates below
  // keep flagged stories out of dispatch until a human decides.
  const { data: allQueued } = await supabase
    .from('stories')
    .select('id,title,series_id,story_type,production_priority,created_at,needs_attention')
    .eq('workflow_state', 'stories_in_queue')

  if (allQueued && allQueued.length > 0) {
    const duplicateGroups = findQueueDuplicates(allQueued as QueueDedupRow[])
    const alreadyFlagged = new Set(
      (allQueued as Array<{ id: string; needs_attention?: boolean | null }>)
        .filter((story) => story.needs_attention === true)
        .map((story) => story.id),
    )
    const dupesToFlag = duplicateGroups
      .flatMap((group) => group.duplicateIds)
      .filter((id) => !alreadyFlagged.has(id))

    if (dupesToFlag.length > 0) {
      const { data: flagged } = await supabase
        .from('stories')
        .update({
          needs_attention: true,
          needs_attention_reason:
            'Possible duplicate title within the same series/standalone scope detected by dispatch-queue cron. Human confirmation required before removal — no automatic cold_storage.',
          needs_attention_at: now,
        })
        .in('id', dupesToFlag)
        .select('id,title')

      for (const r of (flagged || []) as Array<{ id: string; title: string }>) {
        deduped.push({ id: r.id, title: r.title })
        console.log(`[dispatch-queue] Duplicate title flagged for review: "${r.title}" (${r.id})`)
      }
    }
  }

  // Check how many active jobs already exist — only dispatch enough to fill up to MAX_DISPATCH_PER_RUN
  const { count: existingActiveCount } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_JOB_STATUSES)
  const activeCount = existingActiveCount ?? 0
  const dispatchTarget = Math.max(0, MAX_DISPATCH_PER_RUN - activeCount)
  console.log(`[dispatch-queue] Active jobs: ${activeCount}, target: ${MAX_DISPATCH_PER_RUN}, will dispatch up to: ${dispatchTarget}`)
  if (dispatchTarget === 0) {
    return json({ success: true, dispatched: [], skipped: [], needsAttentionSkipped, message: `Queue full (${activeCount} active jobs, target ${MAX_DISPATCH_PER_RUN})` }, 200)
  }

  if (dispatched.length < dispatchTarget) {
    const { data: queuedSeriesEpisodes, error: queuedSeriesError } = await supabase
      .from('stories')
      .select('series_id')
      .eq('workflow_state', 'stories_in_queue')
      .eq('story_type', 'series_episode')
      .not('series_id', 'is', null)
      .limit(200)

    if (queuedSeriesError) {
      console.error('[dispatch-queue] Failed to load queued series ids:', queuedSeriesError)
      return json({ success: false, error: queuedSeriesError.message }, 500)
    }

    const candidateSeriesIds = Array.from(new Set(
      ((queuedSeriesEpisodes || []) as Array<{ series_id: string | null }>)
        .map((story) => story.series_id)
        .filter((id): id is string => Boolean(id)),
    ))

    const { data: activeSeriesJobs, error: activeSeriesError } = candidateSeriesIds.length
      ? await supabase
          .from('production_jobs')
          .select('id,series_id,status,current_step')
          .in('series_id', candidateSeriesIds)
          .in('status', BLOCKING_JOB_STATUSES)
      : { data: [], error: null }

    if (activeSeriesError) {
      console.error('[dispatch-queue] Failed to load active series jobs:', activeSeriesError)
      return json({ success: false, error: activeSeriesError.message }, 500)
    }

    const activeSeriesIds = new Set(
      ((activeSeriesJobs || []) as Array<{ series_id: string | null }>).map((job) => job.series_id).filter(Boolean),
    )
    // TMP-SPACE-LOW-001: mix serialization — one mix job per series at a
    // time. current_step is loaded above so the skip reason names the mix
    // case explicitly (auditable) instead of the generic active_job_exists.
    const activeMixSeriesIds = new Set(
      ((activeSeriesJobs || []) as Array<JobStatusRow & { series_id: string | null }>)
        .filter((job) => hasActiveMixJob([job]))
        .map((job) => job.series_id)
        .filter(Boolean) as string[],
    )

    for (const seriesId of candidateSeriesIds) {
      if (dispatched.length >= dispatchTarget) break
      if (activeMixSeriesIds.has(seriesId)) {
        skipped.push({ seriesId, reason: 'active_mix_job_exists' })
        continue
      }
      if (activeSeriesIds.has(seriesId)) {
        skipped.push({ seriesId, reason: 'active_job_exists' })
        continue
      }

      // ── ATL-DISPATCH-DEFECTS-001: series-level failure circuit ──────────
      // >= DISPATCH_FAILURE_THRESHOLD failed jobs for this series inside the
      // rolling window → do NOT create another job; park the queued episodes
      // in repair_queue so a human/repair flow decides what happens next.
      const failureWindowStart = new Date(Date.now() - DISPATCH_FAILURE_WINDOW_MS).toISOString()
      // PIPE-AUDIT-001 item-4 parity for the SERIES circuit: an authorized
      // dispatch_failure_reset_at stamp on the series' episodes floors the
      // failure window — failures at/before the reset are already-diagnosed
      // history and must not re-trip the circuit (previously only the
      // standalone retry cap honored resets; every re-release cost a 2h wait).
      const { data: seriesResetRows } = await supabase
        .from('stories')
        .select('dispatch_failure_reset_at')
        .eq('series_id', seriesId)
        .not('dispatch_failure_reset_at', 'is', null)
        .order('dispatch_failure_reset_at', { ascending: false })
        .limit(1)
      const seriesResetMs = Date.parse(seriesResetRows?.[0]?.dispatch_failure_reset_at || '') || 0
      const effectiveWindowStart = seriesResetMs > Date.parse(failureWindowStart)
        ? new Date(seriesResetMs).toISOString()
        : failureWindowStart
      // TRANSIENT-FAILURE-001: look back far enough for the transient hold
      // window too (still floored by a human reset), and load error_json so
      // transient failures can be told apart from story defects.
      const seriesLookbackStart = new Date(Math.min(
        Date.parse(effectiveWindowStart),
        Math.max(Date.now() - TRANSIENT_ESCALATE_WINDOW_MS, seriesResetMs),
      )).toISOString()
      const { data: seriesFailureRows, error: seriesFailuresError } = await supabase
        .from('production_jobs')
        .select('id,status,updated_at,error_json')
        .eq('series_id', seriesId)
        .eq('status', 'failed')
        .gte('updated_at', seriesLookbackStart)
      // Circuit keeps its original window (2h, floored by the reset stamp).
      const recentSeriesFailures = (seriesFailureRows || []).filter(
        (row) => Date.parse(row.updated_at || '') >= Date.parse(effectiveWindowStart),
      )

      if (seriesFailuresError) {
        console.error('[dispatch-queue] Failed to load recent series failures:', seriesId, seriesFailuresError)
        skipped.push({ seriesId, reason: 'failure_lookup_failed', error: seriesFailuresError.message })
        continue
      }

      if (failureCircuitOpen((recentSeriesFailures || []) as JobStatusRow[], Date.now())) {
        const failCount = countRecentFailures((recentSeriesFailures || []) as JobStatusRow[], Date.now())
        const reason = `Dispatch failure circuit open: ${failCount} failed production jobs for series ${seriesId} within 2h (threshold ${DISPATCH_FAILURE_THRESHOLD}). Moved to repair_queue by dispatch-queue cron — repeated re-dispatch was creating a new failing job every cycle.`

        // ATL-FOLLOWUP-002 (Marc 2026-07-09): episodes that already consumed
        // their single repair pass go straight to cold_storage; the rest go to
        // the hold bucket (repair_queue — displayed as "Production Holds").
        const { data: circuitEpisodes, error: circuitEpisodesError } = await supabase
          .from('stories')
          .select('id,production_repair_count')
          .eq('series_id', seriesId)
          .eq('workflow_state', 'stories_in_queue')

        if (circuitEpisodesError) {
          console.error('[dispatch-queue] Failed to load episodes for failure-circuit routing:', seriesId, circuitEpisodesError)
          skipped.push({ seriesId, reason: 'failure_circuit_open', failedJobsInWindow: failCount, movedTo: 'none', error: circuitEpisodesError.message })
          continue
        }

        const episodeRows = (circuitEpisodes || []) as Array<{ id: string; production_repair_count: number | null }>
        const coldStorageIds = episodeRows.filter((row) => failureDestinationForStory(row.production_repair_count).state === 'cold_storage').map((row) => row.id)
        const repairQueueIds = episodeRows.filter((row) => !coldStorageIds.includes(row.id)).map((row) => row.id)

        if (repairQueueIds.length > 0) {
          const { error: repairMoveError } = await supabase
            .from('stories')
            .update({
              workflow_state: 'repair_queue',
              workflow_state_changed_by: 'atlas',
              workflow_state_changed_at: now,
              workflow_state_change_reason: reason,
              needs_attention: true,
              needs_attention_reason: reason,
            })
            .in('id', repairQueueIds)

          if (repairMoveError) {
            console.error('[dispatch-queue] Failed to move failing series to repair_queue:', seriesId, repairMoveError)
          } else {
            // PREMISE-UNIQUENESS-001: repair_queue is a protected state — reserve premises (best-effort).
            await syncPremiseIndexForTransition(supabase, { storyIds: repairQueueIds, toState: 'repair_queue' })
          }
        }

        if (coldStorageIds.length > 0) {
          const coldReason = `${reason} Doctrine: ${ONE_REPAIR_PASS_REASON}.`
          const { error: coldMoveError } = await supabase
            .from('stories')
            .update({
              workflow_state: 'cold_storage',
              workflow_state_changed_by: 'atlas',
              workflow_state_changed_at: now,
              workflow_state_change_reason: coldReason,
              needs_attention: true,
              needs_attention_reason: coldReason,
            })
            .in('id', coldStorageIds)

          if (coldMoveError) {
            console.error('[dispatch-queue] Failed to move repeat-failure episodes to cold_storage:', seriesId, coldMoveError)
          } else {
            // PREMISE-UNIQUENESS-001: cold storage frees the premise for reuse (best-effort).
            await syncPremiseIndexForTransition(supabase, { storyIds: coldStorageIds, toState: 'cold_storage' })
          }
          console.warn('[dispatch-queue] One-repair-pass doctrine — episodes moved to cold_storage:', seriesId, coldStorageIds)
        }

        console.warn('[dispatch-queue] Failure circuit OPEN — series moved to repair_queue/cold_storage:', seriesId, reason)
        skipped.push({ seriesId, reason: 'failure_circuit_open', failedJobsInWindow: failCount, movedTo: 'repair_queue', movedToColdStorage: coldStorageIds.length, movedToRepairQueue: repairQueueIds.length })
        continue
      }

      // TRANSIENT-FAILURE-001: recent outside failures (key, credits, rate
      // limit, outage, lost runner) → wait, don't park, don't flag.
      const seriesEscalation = transientEscalation((seriesFailureRows || []) as JobStatusRow[], Date.now(), seriesResetMs)
      if (seriesEscalation) {
        // Outside cause still unfixed after many retries → tell a human.
        // Flag only (no repair_queue move): clearing the flag resumes production.
        const reason = `Outside failure keeps recurring (${seriesEscalation.cause}, ${seriesEscalation.transientFailures} failed jobs in 48h). Fix the outside cause (API key / balance / provider), then clear needs_attention. Episodes were NOT moved.`
        const { error: escalateError } = await supabase
          .from('stories')
          .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
          .eq('series_id', seriesId)
          .eq('workflow_state', 'stories_in_queue')
          .or('needs_attention.is.null,needs_attention.eq.false')
        if (escalateError) console.error('[dispatch-queue] Failed to flag series for recurring transient failure:', seriesId, escalateError)
        skipped.push({ seriesId, reason: 'transient_escalated', ...seriesEscalation })
        continue
      }
      const seriesTransientHold = transientDispatchHold((seriesFailureRows || []) as JobStatusRow[], Date.now(), seriesResetMs)
      if (seriesTransientHold) {
        console.log('[dispatch-queue] Series waiting after transient failure:', seriesId, seriesTransientHold)
        skipped.push({ seriesId, ...seriesTransientHold })
        continue
      }

      // ── ATLAS-SERIES-RETRY-CAP-001: series long-window + signature caps ──
      // The standalone path has a 5-in-7d RETRY_CAP; the series path had
      // none — a series failing with the same story/content defect once per
      // cycle (wider than the 2h circuit, or re-queued by a repair flow)
      // minted a new production_jobs row every cycle, forever. Count
      // NON-TRANSIENT failures in the reset-floored 7d window (transient/
      // infra rows never count — they have their own 48h escalation above),
      // and park with needs_attention + audit instead of inserting. Flag-
      // only (episodes stay where they are): clearing the flag via
      // content-approval clear_needs_attention stamps
      // dispatch_failure_reset_at, which floors this window on reset.
      const seriesCapWindowStart = new Date(retryCapWindowStartMs(Date.now(), {
        windowMs: SERIES_RETRY_CAP_WINDOW_MS,
        resetAtIso: seriesResetMs > 0 ? new Date(seriesResetMs).toISOString() : null,
        ignoreBeforeIso: process.env.RETRY_CAP_IGNORE_FAILURES_BEFORE || null,
      })).toISOString()
      const { data: seriesCapRows, error: seriesCapError } = await supabase
        .from('production_jobs')
        .select('id,status,updated_at,current_step,error_json')
        .eq('series_id', seriesId)
        .eq('status', 'failed')
        .gte('updated_at', seriesCapWindowStart)
      if (seriesCapError) {
        console.error('[dispatch-queue] Series retry-cap lookup failed:', seriesId, seriesCapError)
        skipped.push({ seriesId, reason: 'failure_lookup_failed', error: seriesCapError.message })
        continue
      }
      const capOpts = {
        windowMs: SERIES_RETRY_CAP_WINDOW_MS,
        resetAtIso: seriesResetMs > 0 ? new Date(seriesResetMs).toISOString() : null,
        ignoreBeforeIso: process.env.RETRY_CAP_IGNORE_FAILURES_BEFORE || null,
      }
      const eligibleSeriesFailures = capEligibleFailures((seriesCapRows || []) as JobStatusRow[], Date.now(), capOpts)
      const topSeriesSignature = topFailureSignature((seriesCapRows || []) as JobStatusRow[], Date.now(), capOpts)
      const seriesCapTripped = eligibleSeriesFailures.length >= RETRY_CAP
      const seriesSignatureTripped = (topSeriesSignature?.count ?? 0) >= SERIES_IDENTICAL_FAILURE_CAP
      if (seriesCapTripped || seriesSignatureTripped) {
        const reason = seriesSignatureTripped
          ? `Identical series failure repeating (${topSeriesSignature!.count}x in 7d, cap ${SERIES_IDENTICAL_FAILURE_CAP}): ${topSeriesSignature!.signature}. Same story/content defect failing every cycle — parked for manual review instead of minting new production_jobs rows. Clear via content-approval clear_needs_attention to reset the counter with an audit trail.`
          : `Series retry cap reached: ${eligibleSeriesFailures.length} failed jobs since ${seriesCapWindowStart} (cap ${RETRY_CAP}/7d). Manual review required — clear the flag via content-approval clear_needs_attention to reset the counter with an audit trail.`
        const { error: seriesAttentionError } = await supabase
          .from('stories')
          .update({
            needs_attention: true,
            needs_attention_reason: reason,
            needs_attention_at: now,
          })
          .eq('series_id', seriesId)
          .eq('workflow_state', 'stories_in_queue')
        if (seriesAttentionError) {
          console.error('[dispatch-queue] Failed to flag series retry-cap:', seriesId, seriesAttentionError)
          skipped.push({ seriesId, reason: 'needs_attention_update_failed', error: seriesAttentionError.message })
          continue
        }
        console.log('[dispatch-queue] Skipped (series retry cap):', seriesId, reason)
        skipped.push({
          seriesId,
          reason: seriesSignatureTripped ? 'series_identical_failure_capped' : 'series_retry_cap_reached',
          failedJobsInSevenDays: eligibleSeriesFailures.length,
          ...(topSeriesSignature ? { topSignature: topSeriesSignature.signature, topSignatureCount: topSeriesSignature.count } : {}),
        })
        continue
      }

      const { data: seriesStories, error: seriesStoriesError } = await supabase
        .from('stories')
        .select('id,title,author,story_type,workflow_state,series_id,series_name,episode_number,series_episode_number,series_total_episodes,needs_attention')
        .eq('series_id', seriesId)

      if (seriesStoriesError) {
        console.error('[dispatch-queue] Failed to load series stories:', seriesId, seriesStoriesError)
        skipped.push({ seriesId, reason: 'series_load_failed', error: seriesStoriesError.message })
        continue
      }

      // SERIES-TYPE-CONSISTENCY-001: mixed story_type inside one series used to
      // be skipped silently forever ("series_not_fully_written"). Flag it.
      const mistyped = mistypedSeriesRows((seriesStories || []) as SeriesTypeRow[])
      if (mistyped.length > 0) {
        const reason = seriesTypeMismatchReason(seriesId, mistyped)
        const { error: typeFlagError } = await supabase
          .from('stories')
          .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
          .eq('series_id', seriesId)
          .neq('workflow_state', 'cold_storage')
          .or('needs_attention.is.null,needs_attention.eq.false')
        if (typeFlagError) console.error('[dispatch-queue] Failed to flag mixed-type series:', seriesId, typeFlagError)
        console.warn('[dispatch-queue] Skipped (mixed story_type in series):', seriesId, reason)
        skipped.push({ seriesId, reason: 'series_story_type_mismatch', mistypedIds: mistyped.map((row) => row.id) })
        continue
      }

      // Rule-1 doctrine (Marc 2026-07-09): cold_storage rows are retired from
      // production. They must not count toward series completeness or block
      // dispatch — a recommissioned replacement occupies the episode slot
      // (e.g. Limestone ep3 "Forty Feet Down" replacing cold-stored "The
      // Sealing"). A cold-stored episode with NO replacement leaves a real
      // episode-number gap, so seriesIsReady still correctly waits.
      const episodes = ((seriesStories || []) as StoryRow[]).filter(
        (row) => String(row.workflow_state || '').trim() !== 'cold_storage',
      )
      const attentionEpisode = episodes.find((episode) => episode.needs_attention === true)
      if (attentionEpisode) {
        needsAttentionSkipped += 1
        console.log('[dispatch-queue] Skipped (needs_attention):', attentionEpisode.id, attentionEpisode.title)
        skipped.push({ seriesId, storyId: attentionEpisode.id, reason: 'episode_needs_attention' })
        continue
      }

      let authorValidationFailed = false
      for (const episode of episodes) {
        const validation = await validateActiveAuthor(supabase, episode, now)
        if (!validation.ok) {
          needsAttentionSkipped += 1
          skipped.push({ seriesId, storyId: episode.id, reason: 'author_validation_failed', details: validation.reason })
          authorValidationFailed = true
          break
        }
      }
      if (authorValidationFailed) continue

      if (!seriesIsReady(episodes)) {
        skipped.push({
          seriesId,
          reason: 'series_not_fully_written',
          episodeCount: episodes.length,
          expectedEpisodeCount: expectedEpisodeCount(episodes),
        })
        continue
      }

      // DISPATCH-READINESS-GATE-001 (series)
      {
        const readiness = await readinessReasonsFor(episodes.map((episode) => episode.id))
        if (!Array.isArray(readiness)) {
          skipped.push({ seriesId, reason: 'readiness_lookup_failed', error: readiness.error })
          continue
        }
        if (readiness.length > 0) {
          const reason = readinessReason(readiness)
          const { error: readinessFlagError } = await supabase
            .from('stories')
            .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
            .eq('series_id', seriesId)
            .neq('workflow_state', 'cold_storage')
          if (readinessFlagError) console.error('[dispatch-queue] Failed to flag series readiness:', seriesId, readinessFlagError)
          console.warn('[dispatch-queue] Skipped (readiness gate):', seriesId, reason)
          skipped.push({ seriesId, reason: 'readiness_gate_failed', blockers: readiness.slice(0, 20) })
          continue
        }
      }

      const episodeCount = expectedEpisodeCount(episodes)
      const seriesName = episodes.find((episode) => episode.series_name)?.series_name || null

      // ── ATL-DISPATCH-DEFECTS-001: defensive uniqueness re-check ─────────
      // The activeSeriesIds snapshot above can be seconds stale (overlapping
      // cron invocations). Re-verify no non-terminal job exists immediately
      // before insert. The partial unique index
      // production_jobs_one_active_per_series is the final guarantee.
      const { count: activeSeriesNow, error: activeRecheckError } = await supabase
        .from('production_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId)
        .in('status', BLOCKING_JOB_STATUSES)

      if (activeRecheckError) {
        console.error('[dispatch-queue] Active-job recheck failed for series:', seriesId, activeRecheckError)
        skipped.push({ seriesId, reason: 'active_recheck_failed', error: activeRecheckError.message })
        continue
      }
      if ((activeSeriesNow ?? 0) > 0) {
        console.warn('[dispatch-queue] Skipped series — active job appeared between snapshot and insert:', seriesId)
        skipped.push({ seriesId, reason: 'active_job_exists_recheck' })
        continue
      }

      const { data: job, error: insertError } = await supabase
        .from('production_jobs')
        .insert({
          series_id: seriesId,
          job_type: 'series',
          status: 'queued',
          // Series episodes already have scripts — must run score_validate_package
          // before series_voice_preflight (runner enforces this gate).
          current_step: 'score_validate_package',
          step_index: 0,
          input_json: {
            mode: 'series',
            source: 'hal',
            seriesId,
          },
          state_json: {
            seriesId,
            totalEpisodes: episodeCount,
            dispatchSource: 'cron/dispatch-queue',
            dispatchedAt: now,
            initialStep: 'score_validate_package',
          },
          logs: [
            {
              at: now,
              event: 'Queued complete series from stories_in_queue by dispatch-queue cron',
              seriesId,
              episodeCount,
              source: 'hal',
            },
          ],
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[dispatch-queue] Failed to dispatch series:', seriesId, insertError)
        skipped.push({ seriesId, reason: 'insert_failed', error: insertError.message })
        continue
      }

      dispatched.push({
        jobId: job.id,
        jobType: 'series',
        seriesId,
        title: seriesName,
        episodeCount,
      })
    }
  }

  if (dispatched.length < dispatchTarget) {
    const { data: preexistingStandaloneNeedsAttention, count: preexistingStandaloneNeedsAttentionCount } = await supabase
      .from('stories')
      .select('id,title', { count: 'exact' })
      .eq('workflow_state', 'stories_in_queue')
      .in('story_type', ['standalone', 'single'])
      .eq('needs_attention', true)

    needsAttentionSkipped += preexistingStandaloneNeedsAttentionCount ?? 0
    ;((preexistingStandaloneNeedsAttention || []) as Array<{ id: string; title: string | null }>).forEach((story) => {
      console.log('[dispatch-queue] Skipped (needs_attention):', story.id, story.title)
    })

    const { data: standaloneStories, error: standaloneError } = await supabase
      .from('stories')
      .select('id,title,story_type,workflow_state,series_id,series_name,episode_number,series_episode_number,series_total_episodes,needs_attention,dispatch_failure_reset_at,production_repair_count')
      .eq('workflow_state', 'stories_in_queue')
      .in('story_type', ['standalone', 'single'])
      .not('needs_attention', 'eq', true)
      .order('production_priority', { ascending: false, nullsFirst: false })
      .order('workflow_state_changed_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(50)

    if (standaloneError) {
      console.error('[dispatch-queue] Failed to load standalone queue:', standaloneError)
      return json({ success: false, error: standaloneError.message }, 500)
    }

    const standaloneIds = ((standaloneStories || []) as StoryRow[]).map((story) => story.id)
    const { data: activeStandaloneJobs, error: activeStandaloneError } = standaloneIds.length
      ? await supabase
          .from('production_jobs')
          .select('id,story_id,status')
          .in('story_id', standaloneIds)
          .in('status', BLOCKING_JOB_STATUSES)
      : { data: [], error: null }

    if (activeStandaloneError) {
      console.error('[dispatch-queue] Failed to load active standalone jobs:', activeStandaloneError)
      return json({ success: false, error: activeStandaloneError.message }, 500)
    }

    const activeStandaloneStoryIds = new Set(
      ((activeStandaloneJobs || []) as Array<{ story_id: string | null }>).map((job) => job.story_id).filter(Boolean),
    )

    for (const story of (standaloneStories || []) as StoryRow[]) {
      if (dispatched.length >= dispatchTarget) break
      if (activeStandaloneStoryIds.has(story.id)) {
        skipped.push({ storyId: story.id, reason: 'active_job_exists' })
        continue
      }

      // SERIES-TYPE-CONSISTENCY-001: never produce a series member as a standalone.
      if (isSeriesMemberTypedStandalone(story as SeriesTypeRow)) {
        const reason = seriesTypeMismatchReason(String(story.series_id), [story as SeriesTypeRow])
        const { error: typeFlagError } = await supabase
          .from('stories')
          .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
          .eq('id', story.id)
        if (typeFlagError) console.error('[dispatch-queue] Failed to flag series member typed standalone:', story.id, typeFlagError)
        needsAttentionSkipped += 1
        skipped.push({ storyId: story.id, reason: 'series_member_typed_standalone' })
        continue
      }

      // DISPATCH-READINESS-GATE-001 (standalone)
      {
        const readiness = await readinessReasonsFor([story.id])
        if (!Array.isArray(readiness)) {
          skipped.push({ storyId: story.id, reason: 'readiness_lookup_failed', error: readiness.error })
          continue
        }
        if (readiness.length > 0) {
          const reason = readinessReason(readiness)
          const { error: readinessFlagError } = await supabase
            .from('stories')
            .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
            .eq('id', story.id)
          if (readinessFlagError) console.error('[dispatch-queue] Failed to flag story readiness:', story.id, readinessFlagError)
          needsAttentionSkipped += 1
          skipped.push({ storyId: story.id, reason: 'readiness_gate_failed', blockers: readiness.slice(0, 20) })
          continue
        }
      }

      // ── ATL-DISPATCH-DEFECTS-001: story-level failure circuit ───────────
      // Checked BEFORE the 7-day retry cap: 3 failures in 2h is a retry storm
      // (a new failing job every dispatch cycle) and must stop immediately,
      // long before the 5-in-7-days cap trips.
      const storyFailureWindowStart = new Date(Date.now() - DISPATCH_FAILURE_WINDOW_MS).toISOString()
      // TRANSIENT-FAILURE-001: wider lookback (floored by a human reset) +
      // error_json, so transient failures can be told apart from defects.
      const storyResetMs = Date.parse(story.dispatch_failure_reset_at || '') || 0
      const storyLookbackStart = new Date(Math.min(
        Date.parse(storyFailureWindowStart),
        Math.max(Date.now() - TRANSIENT_ESCALATE_WINDOW_MS, storyResetMs),
      )).toISOString()
      const { data: storyFailureRows, error: storyFailuresError } = await supabase
        .from('production_jobs')
        .select('id,status,updated_at,error_json')
        .eq('story_id', story.id)
        .eq('status', 'failed')
        .gte('updated_at', storyLookbackStart)
      // Circuit keeps its original 2h window.
      const recentStoryFailures = (storyFailureRows || []).filter(
        (row) => Date.parse(row.updated_at || '') >= Date.parse(storyFailureWindowStart),
      )

      if (storyFailuresError) {
        console.error('[dispatch-queue] Failed to load recent story failures:', story.id, storyFailuresError)
        skipped.push({ storyId: story.id, reason: 'failure_lookup_failed', error: storyFailuresError.message })
        continue
      }

      if (failureCircuitOpen((recentStoryFailures || []) as JobStatusRow[], Date.now())) {
        const failCount2h = countRecentFailures((recentStoryFailures || []) as JobStatusRow[], Date.now())
        // ATL-FOLLOWUP-002 (Marc 2026-07-09): a story that already consumed its
        // single repair pass goes straight to cold_storage on the next
        // production failure; first-time failures go to the hold bucket.
        const destination = failureDestinationForStory(story.production_repair_count)
        const baseReason = `Dispatch failure circuit open: ${failCount2h} failed production jobs for story within 2h (threshold ${DISPATCH_FAILURE_THRESHOLD}). Moved to ${destination.state} by dispatch-queue cron — repeated re-dispatch was creating a new failing job every cycle.`
        const reason = destination.doctrineReason ? `${baseReason} Doctrine: ${destination.doctrineReason}.` : baseReason
        const { error: repairMoveError } = await supabase
          .from('stories')
          .update({
            workflow_state: destination.state,
            workflow_state_changed_by: 'atlas',
            workflow_state_changed_at: now,
            workflow_state_change_reason: reason,
            needs_attention: true,
            needs_attention_reason: reason,
          })
          .eq('id', story.id)
          .eq('workflow_state', 'stories_in_queue')

        if (repairMoveError) {
          console.error(`[dispatch-queue] Failed to move failing story to ${destination.state}:`, story.id, repairMoveError)
        }
        console.warn(`[dispatch-queue] Failure circuit OPEN — story moved to ${destination.state}:`, story.id, story.title, reason)
        skipped.push({ storyId: story.id, reason: 'failure_circuit_open', failedJobsInWindow: failCount2h, movedTo: destination.state })
        continue
      }

      // TRANSIENT-FAILURE-001: recent outside failures → wait, don't park.
      const storyEscalation = transientEscalation((storyFailureRows || []) as JobStatusRow[], Date.now(), storyResetMs)
      if (storyEscalation) {
        const reason = `Outside failure keeps recurring (${storyEscalation.cause}, ${storyEscalation.transientFailures} failed jobs in 48h). Fix the outside cause (API key / balance / provider), then clear needs_attention. Story was NOT moved.`
        const { error: escalateError } = await supabase
          .from('stories')
          .update({ needs_attention: true, needs_attention_reason: reason, needs_attention_at: now })
          .eq('id', story.id)
        if (escalateError) console.error('[dispatch-queue] Failed to flag story for recurring transient failure:', story.id, escalateError)
        skipped.push({ storyId: story.id, reason: 'transient_escalated', ...storyEscalation })
        continue
      }
      const storyTransientHold = transientDispatchHold((storyFailureRows || []) as JobStatusRow[], Date.now(), storyResetMs)
      if (storyTransientHold) {
        console.log('[dispatch-queue] Story waiting after transient failure:', story.id, storyTransientHold)
        skipped.push({ storyId: story.id, ...storyTransientHold })
        continue
      }

      // ── PIPE-AUDIT-001 item 4: retry cap with reset floor ────────────────
      // Failures older than the per-story dispatch_failure_reset_at (set with
      // audit trail when a human clears flags) or the global
      // RETRY_CAP_IGNORE_FAILURES_BEFORE deploy floor no longer count —
      // otherwise infra-era failures re-block stories for a full 7 days even
      // after their causes are fixed and flags are cleared.
      const capWindowStart = new Date(retryCapWindowStartMs(Date.now(), {
        resetAtIso: story.dispatch_failure_reset_at ?? null,
        ignoreBeforeIso: process.env.RETRY_CAP_IGNORE_FAILURES_BEFORE || null,
      })).toISOString()
      const { count: failCount, error: failCountError } = await supabase
        .from('production_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', story.id)
        .eq('status', 'failed')
        .gte('updated_at', capWindowStart)
        // TRANSIENT-FAILURE-001: outside failures (incl. legacy lost-runner
        // rows) never count toward the cap. NULL-safe: rows without the key stay.
        .or('error_json->>transient.is.null,error_json->>transient.neq.true')
        .or('error_json->>kind.is.null,error_json->>kind.neq.zombie_stalled')

      if (failCountError) {
        console.error('[dispatch-queue] Retry-cap lookup failed:', story.id, failCountError)
        skipped.push({ storyId: story.id, reason: 'failure_lookup_failed', error: failCountError.message })
        continue
      }

      if ((failCount ?? 0) >= RETRY_CAP) {
        const reason = `Retry cap reached: ${failCount} failed jobs since ${capWindowStart} (cap ${RETRY_CAP}/7d). Manual review required — clear the flag via content-approval clear_needs_attention to reset the counter with an audit trail.`
        const { error: attentionError } = await supabase
          .from('stories')
          .update({
            needs_attention: true,
            needs_attention_reason: reason,
            needs_attention_at: now,
          })
          .eq('id', story.id)

        if (attentionError) {
          console.error('[dispatch-queue] Failed to flag retry-capped story:', story.id, attentionError)
          skipped.push({ storyId: story.id, reason: 'needs_attention_update_failed', error: attentionError.message })
          continue
        }

        needsAttentionSkipped += 1
        console.log('[dispatch-queue] Skipped (needs_attention):', story.id, story.title)
        skipped.push({ storyId: story.id, reason: 'retry_cap_reached', failedJobsInSevenDays: failCount ?? 0 })
        continue
      }

      // ── ATL-DISPATCH-DEFECTS-001: defensive uniqueness re-check ─────────
      // See series-path comment. Backed by production_jobs_one_active_per_story.
      const { count: activeStoryNow, error: storyRecheckError } = await supabase
        .from('production_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', story.id)
        .in('status', BLOCKING_JOB_STATUSES)

      if (storyRecheckError) {
        console.error('[dispatch-queue] Active-job recheck failed for story:', story.id, storyRecheckError)
        skipped.push({ storyId: story.id, reason: 'active_recheck_failed', error: storyRecheckError.message })
        continue
      }
      if ((activeStoryNow ?? 0) > 0) {
        console.warn('[dispatch-queue] Skipped story — active job appeared between snapshot and insert:', story.id)
        skipped.push({ storyId: story.id, reason: 'active_job_exists_recheck' })
        continue
      }

      const { data: job, error: insertError } = await supabase
        .from('production_jobs')
        .insert({
          story_id: story.id,
          job_type: 'standalone',
          status: 'queued',
          // Stories in stories_in_queue already have scripts — start at voice production, not script generation
          current_step: 'voice_preflight',
          step_index: 0,
          input_json: {
            mode: 'standalone',
            source: 'hal',
            storyId: story.id,
          },
          state_json: {
            storyId: story.id,
            dispatchSource: 'cron/dispatch-queue',
            dispatchedAt: now,
          },
          logs: [
            {
              at: now,
              event: 'Queued from stories_in_queue by dispatch-queue cron',
              storyId: story.id,
              source: 'hal',
            },
          ],
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[dispatch-queue] Failed to dispatch standalone story:', story.id, insertError)
        skipped.push({ storyId: story.id, reason: 'insert_failed', error: insertError.message })
        continue
      }

      dispatched.push({
        jobId: job.id,
        jobType: 'standalone',
        storyId: story.id,
        title: story.title,
      })
    }
  }

  console.log('[dispatch-queue] Dispatch complete', {
    dispatchedCount: dispatched.length,
    dispatched,
    skippedCount: skipped.length,
    needsAttentionSkipped,
  })

  return json({
    success: true,
    dispatchedCount: dispatched.length,
    dispatched,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 20),
    needsAttentionSkipped,
    dedupedCount: deduped.length,
    deduped,
  })
}

export async function GET(request: NextRequest) {
  return handleDispatchQueue(request)
}

export async function POST(request: NextRequest) {
  return handleDispatchQueue(request)
}
