/**
 * COVER-PIPELINE-DECOUPLE-001 regression tests (Marc directive 2026-10-08).
 *
 * Root defect (Class A pipeline defect): cover_generation was serially gated
 * behind series_voice_preflight / canonical-intro / announcement /
 * audio-readiness, so one EP1 preflight failure blocked every episode's cover
 * (Alderton Inheritance 591eec91: EP1 numeral-preflight failure + EP2/EP3
 * covers missing, all 3 in repair_queue).
 *
 * ALL image calls here are MOCKED — zero paid image-model spend.
 * No DB, no network. Pure-module validation of:
 *   1. 3-ep series: parallel cover_tasks[] dispatch, all done.
 *   2. 10-ep series: parallel dispatch at scale, all done.
 *   3. Failed EP1 (voice preflight failure): EP2/EP3 covers still dispatch
 *      and complete — covers never wait for preflight.
 *   4. Missing announcement: episode/series covers complete; announcement_art
 *      task flags cover_missing without blocking the rest.
 *   5. Missing cover: renderer always fails → 3 retries, alert fires after 2
 *      failed retries, cover_missing flag set, dispatch resolves (no stall,
 *      no throw — Alderton assembles with covers pending).
 *   6. Retry-then-succeed: Holly prompt regeneration across attempts.
 *   7. Alderton tolerance: cover_url demoted from blocking → warning.
 *   8. Post-publish late-cover update payloads.
 *   9. Image backend routing: dall-e-3 primary, Belle rejected as image agent.
 *
 * PIPELINE CANON 001 Rule 3 note: sequential ordering governs EPISODES
 * (continuity/script order), not asset generation — parallel cover assets do
 * not violate it (no episode consumes another episode's cover).
 */
import {
  buildCoverPhaseTasks,
  buildCoverPhaseState,
  dispatchCoverTasks,
  COVER_DECOUPLED_FROM,
  type CoverTask,
  type CoverTaskKind,
} from '@/lib/cover/coverPhase'
import {
  classifyCoverFailure,
  withCoverRetry,
  buildStrategosRetryPrompt,
  COVER_MAX_RETRIES,
} from '@/lib/cover/coverRetry'
import {
  buildCoverMissingAlert,
  fireCoverMissingAlert,
  shouldFireCoverAlert,
  agentLogEntryForCoverAlert,
} from '@/lib/cover/coverAlert'
import {
  partitionAssemblyBlockers,
  isCoverMissingOnly,
  COVER_MISSING_FLAG,
} from '@/lib/cover/assemblyTolerance'
import {
  buildCoverPostPublishUpdate,
  applyCoverPostPublishUpdate,
} from '@/lib/cover/coverPostPublish'
import {
  selectImageBackend,
  assertNotBelleImageAgent,
  IMAGE_BACKEND_PRIORITY,
} from '@/lib/cover/imageRouter'

const SERIES = '591eec91-alderton-test'

function eps(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    storyId: `story-ep${i + 1}`,
    episodeNumber: i + 1,
    title: `Episode ${i + 1}`,
  }))
}

/** Mock renderer: succeeds after `failFirst` failures per task. */
function mockRenderer(failFirst = 0, failKind: string | null = null) {
  const calls: Array<{ taskId: string; attempt: number; prompt: string }> = []
  let inFlight = 0
  let maxInFlight = 0
  const counts = new Map<string, number>()
  const render = async (task: CoverTask, prompt: string, attempt: number) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    calls.push({ taskId: task.taskId, attempt, prompt })
    try {
      await new Promise((r) => setTimeout(r, 5))
      const n = (counts.get(task.taskId) || 0) + 1
      counts.set(task.taskId, n)
      if (failKind && n <= failFirst) throw Object.assign(new Error(failKind), { details: { substep: 'image generation', status: 500 } })
      if (n <= failFirst) throw new Error('mock transient render failure (HTTP 500 image generation error)')
      return { coverUrl: `https://cdn.test/${task.taskId}.jpg` }
    } finally {
      inFlight -= 1
    }
  }
  return { render, calls, counts, maxInFlight: () => maxInFlight }
}

describe('COVER-PIPELINE-DECOUPLE-001 — 3-ep series parallel covers', () => {
  it('builds series + 3 episode + announcement + branding tasks, all decoupled', () => {
    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, seriesTitle: 'Alderton', episodes: eps(3) })
    expect(tasks).toHaveLength(6)
    const kinds = tasks.map((t) => t.kind)
    expect(kinds.filter((k) => k === 'episode_cover')).toHaveLength(3)
    expect(kinds).toContain('series_cover')
    expect(kinds).toContain('announcement_art')
    expect(kinds).toContain('branding_art')
    for (const t of tasks) {
      expect([...t.decoupledFrom]).toEqual(expect.arrayContaining([...COVER_DECOUPLED_FROM]))
      expect(t.decoupledFrom).toContain('series_voice_preflight')
      expect(t.status).toBe('queued')
    }
  })

  it('dispatches all tasks simultaneously (parallel) and completes', async () => {
    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, episodes: eps(3) })
    const mock = mockRenderer()
    const result = await dispatchCoverTasks(tasks, mock.render)
    expect(result.done).toBe(6)
    expect(result.failed).toBe(0)
    expect(result.coverMissing).toBe(0)
    // Parallelism proof: all 6 in flight at once (max concurrency == task count).
    expect(mock.maxInFlight()).toBe(6)
    for (const t of result.tasks) {
      expect(t.status).toBe('done')
      expect(t.coverUrl).toBeTruthy()
    }
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — 10-ep series at scale', () => {
  it('dispatches 13 tasks in parallel, no stall', async () => {
    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, episodes: eps(10) })
    expect(tasks).toHaveLength(13)
    const mock = mockRenderer()
    const result = await dispatchCoverTasks(tasks, mock.render)
    expect(result.done).toBe(13)
    expect(result.failed).toBe(0)
    expect(mock.maxInFlight()).toBe(13)
  }, 15000)
})

describe('COVER-PIPELINE-DECOUPLE-001 — failed EP1 does not block EP2/EP3 covers', () => {
  it('covers dispatch and complete with EP1 voice preflight failed (numeral digit defect)', async () => {
    // Simulated EP1 series_voice_preflight failure (Class B story defect —
    // digit numeral "1" in BELLE B intro). The cover phase takes NO preflight
    // input at all: dispatch signature has no preflight parameter.
    const ep1Preflight = { passed: false, failed: true, episodeNumber: 1, kind: 'numeral_pre_tts' }
    expect(ep1Preflight.passed).toBe(false)

    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, episodes: eps(3) })
    const mock = mockRenderer()
    const result = await dispatchCoverTasks(tasks, mock.render)
    // EP2/EP3 episode covers complete despite EP1 preflight failure.
    const ep2 = result.tasks.find((t) => t.episodeNumber === 2 && t.kind === 'episode_cover')
    const ep3 = result.tasks.find((t) => t.episodeNumber === 3 && t.kind === 'episode_cover')
    expect(ep2?.status).toBe('done')
    expect(ep3?.status).toBe('done')
    expect(result.done).toBe(6)
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — missing announcement', () => {
  it('announcement_art flags cover_missing while every other cover completes', async () => {
    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, episodes: eps(3) })
    const mock = mockRenderer()
    const render = async (task: CoverTask, prompt: string, attempt: number) => {
      if (task.kind === 'announcement_art') {
        throw Object.assign(new Error('mock announcement render: image generation error'), {
          details: { substep: 'image generation', status: 500 },
        })
      }
      return mock.render(task, prompt, attempt)
    }
    const result = await dispatchCoverTasks(tasks, render)
    expect(result.done).toBe(5)
    expect(result.failed).toBe(1)
    expect(result.coverMissing).toBe(1)
    const ann = result.tasks.find((t) => t.kind === 'announcement_art')
    expect(ann?.status).toBe('failed')
    expect(ann?.coverMissing).toBe(true)
    // Alert fired for the announcement task (≥2 failed attempts → 3 retries).
    expect(result.alertsFired).toBeGreaterThanOrEqual(1)
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — missing cover: retry, alert, non-blocking', () => {
  it('retries up to 3, fires alert after 2 failed retries, resolves without throwing', async () => {
    const tasks = buildCoverPhaseTasks({ seriesId: SERIES, episodes: eps(1) })
    const alwaysFail = async () => {
      throw Object.assign(new Error('mock persistent failure: image generation error'), {
        details: { substep: 'image generation', status: 500 },
      })
    }
    const fired: unknown[] = []
    const result = await dispatchCoverTasks(tasks, alwaysFail, undefined, {
      alertSinks: { logToAgentLogs: (e) => { fired.push(e) } },
    })
    expect(result.failed).toBeGreaterThanOrEqual(1)
    expect(result.coverMissing).toBe(result.failed)
    const ep = result.tasks.find((t) => t.kind === 'episode_cover')
    expect(ep?.attempts).toBe(1 + COVER_MAX_RETRIES)
    expect(ep?.coverMissing).toBe(true)
    expect(result.alertsFired).toBeGreaterThanOrEqual(1)
    expect(fired.length).toBeGreaterThanOrEqual(1)
    // No stall: dispatch resolved (this line runs = no throw, no hang).
  })

  it('classifies all four trigger kinds as retryable; auth as non-retryable', () => {
    expect(classifyCoverFailure('provider returned no image data').failureClass).toBe('empty_asset')
    expect(classifyCoverFailure('image generation error', { substep: 'image generation', status: 500 }).retryable).toBe(true)
    expect(classifyCoverFailure('Cover luminance still below threshold').failureClass).toBe('invalid_composition')
    expect(classifyCoverFailure('render lacks subject: generic scenery').failureClass).toBe('missing_subject')
    const auth = classifyCoverFailure('Unauthorized: invalid api key', { status: 401 })
    expect(auth.retryable).toBe(false)
    expect(auth.failureClass).toBe('non_retryable')
  })

  it('withCoverRetry regenerates the prompt via Holly on each retry', async () => {
    const prompts: string[] = []
    let n = 0
    const outcome = await withCoverRetry(
      'base prompt: Alderton bridge',
      async (prompt) => {
        prompts.push(prompt)
        n += 1
        if (n < 3) throw new Error('mock failed_render: image generation error (HTTP 500)')
        return { coverUrl: 'https://cdn.test/ok.jpg' }
      },
      { maxRetries: 3 },
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.attempts).toBe(3)
    expect(prompts[0]).toBe('base prompt: Alderton bridge')
    expect(prompts[1]).toContain('Holly')
    expect(buildStrategosRetryPrompt('base', 'missing_subject', 2)).toContain('focal subject')
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — cover_missing_alert', () => {
  it('fires at ≥2 failed retries, logs agent_logs shape, notifies Holly, never throws', async () => {
    expect(shouldFireCoverAlert(1)).toBe(false)
    expect(shouldFireCoverAlert(2)).toBe(true)
    expect(shouldFireCoverAlert(3)).toBe(true)
    const alert = buildCoverMissingAlert({
      seriesId: SERIES,
      storyId: 'story-ep2',
      episodeNumber: 2,
      taskKind: 'episode_cover',
      failedAttempts: 2,
      failureClass: 'failed_render',
      lastError: 'boom',
    })
    expect(alert.message).toContain('cover_missing')
    const entry = agentLogEntryForCoverAlert(alert)
    expect(entry.kind).toBe('cover_missing_alert')
    expect(entry.episode_number).toBe(2)
    let strategosNotified = false
    const fired = await fireCoverMissingAlert(alert, {
      logToAgentLogs: () => {},
      notifyStrategos: () => { strategosNotified = true },
    })
    expect(strategosNotified).toBe(true)
    expect(fired.delivered.logged).toBe(true)
    // Sinks that throw must not propagate (never halts pipeline).
    await expect(
      fireCoverMissingAlert(alert, {
        logToAgentLogs: () => { throw new Error('db down') },
        notifyStrategos: () => { throw new Error('bus down') },
      }),
    ).resolves.toBeDefined()
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — Alderton tolerant of missing covers', () => {
  it('cover_url demoted: blocking empty, warning set, COVER_MISSING flag', () => {
    // Alderton EP2/EP3 shape: ONLY cover_url missing.
    const epShape = ['cover_url']
    const part = partitionAssemblyBlockers(epShape)
    expect(part.blocking).toHaveLength(0)
    expect(part.coverMissing).toBe(true)
    expect(part.coverWarnings).toEqual(['cover_url'])
    expect(isCoverMissingOnly(epShape)).toBe(true)
    expect(COVER_MISSING_FLAG).toBe('cover_missing')
  })

  it('real blockers still block (audio/status/review gating untouched)', () => {
    const part = partitionAssemblyBlockers(['status=audio_ready', 'story_audio_url', 'cover_url'])
    expect(part.blocking).toEqual(['status=audio_ready', 'story_audio_url'])
    expect(part.coverMissing).toBe(true)
    expect(isCoverMissingOnly(['status=audio_ready', 'cover_url'])).toBe(false)
  })

  it('clean assembly has no flags', () => {
    const part = partitionAssemblyBlockers([])
    expect(part.blocking).toHaveLength(0)
    expect(part.coverMissing).toBe(false)
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — cover_post_publish_update', () => {
  it('late cover fans out to episode + series + announcement + card re-render', async () => {
    const update = buildCoverPostPublishUpdate({
      storyId: 'story-ep2',
      seriesId: SERIES,
      episodeNumber: 2,
      coverUrl: 'https://cdn.test/late-cover.jpg',
      announcementArtUrl: 'https://cdn.test/late-ann.jpg',
    })
    expect(update.updateEpisodeMetadata).toEqual({ storyId: 'story-ep2', cover_url: 'https://cdn.test/late-cover.jpg' })
    expect(update.updateSeriesMetadata).toEqual({ seriesId: SERIES, cover_url: 'https://cdn.test/late-cover.jpg' })
    expect(update.updateAnnouncementArt?.announcement_art_url).toBe('https://cdn.test/late-ann.jpg')
    expect(update.rerenderSeriesCard?.seriesId).toBe(SERIES)

    const writes: Array<{ target: string; fields: unknown }> = []
    const applied = await applyCoverPostPublishUpdate(update, {
      updateStory: async (id, fields) => { writes.push({ target: `story:${id}`, fields }) },
      updateSeries: async (id, fields) => { writes.push({ target: `series:${id}`, fields }) },
      rerenderSeriesCard: async (id, url) => { writes.push({ target: `card:${id}`, fields: { url } }) },
    })
    expect(applied.applied).toEqual({ episode: true, series: true, announcementArt: true, seriesCard: true })
    expect(writes.map((w) => w.target)).toEqual(
      expect.arrayContaining(['story:story-ep2', `series:${SERIES}`, `card:${SERIES}`]),
    )
  })

  it('never throws on persistence failure (late cover never rolls back assembly)', async () => {
    const update = buildCoverPostPublishUpdate({ storyId: 's1', coverUrl: 'https://cdn.test/x.jpg' })
    expect(update.updateSeriesMetadata).toBeNull()
    expect(update.rerenderSeriesCard).toBeNull()
    const applied = await applyCoverPostPublishUpdate(update, {
      updateStory: async () => { throw new Error('db down') },
      updateSeries: async () => {},
      rerenderSeriesCard: async () => {},
    })
    expect(applied.applied.episode).toBe(false)
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — image backend routing', () => {
  it('primary is ChatGPT → DALL·E 3; priority order fixed', () => {
    expect(IMAGE_BACKEND_PRIORITY).toEqual(['dalle3', 'claude-art', 'external-renderer'])
    const sel = selectImageBackend()
    expect(sel.backend.id).toBe('dalle3')
    expect(sel.model).toBe('dall-e-3')
  })

  it('Belle is voice-only: rejected as an image agent', () => {
    expect(() => assertNotBelleImageAgent('belle')).toThrow(/voice-only/)
    expect(() => assertNotBelleImageAgent('belle-image')).toThrow(/voice-only/)
    expect(() => selectImageBackend('belle')).toThrow(/voice-only/)
    expect(() => selectImageBackend('nope')).toThrow(/Unknown COVER_IMAGE_BACKEND/)
  })
})

describe('COVER-PIPELINE-DECOUPLE-001 — cover phase state trigger', () => {
  it('records tasks right after briefs, decoupled, with task count', () => {
    const s = buildCoverPhaseState(
      { seriesId: SERIES, seriesTitle: 'Alderton', episodes: eps(3) },
      'episode_briefs',
    )
    expect(s.triggeredAfter).toBe('episode_briefs')
    expect(s.taskCount).toBe(6)
    expect(s.decoupledFrom).toContain('series_voice_preflight')
    const kinds = ((s.tasks as CoverTask[]).map((t: CoverTask) => t.kind) as CoverTaskKind[])
    expect(kinds).toContain('series_cover')
  })
})
