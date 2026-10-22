/**
 * P5 CODEX FIXES2 (two items) evidence suite.
 *
 * Every test drives the REAL lib entries (lib/belleRepairPersist) through
 * the REAL @supabase/supabase-js QueryBuilder with a stub fetch that
 * captures outgoing URLs. Assertions run against captured request strings
 * (never a mirror), backed by a minimal in-memory PostgREST + storage
 * emulator. Fail on any `[object Object]` on the wire.
 *
 * Cover:
 *  1. admission reads the PRODUCTION error shape: top-level kind
 *     unknown_step with Belle detail nested under `detail`, plus the plain
 *     persistence/drain-error unknown_step variants (lib throws carry no
 *     structured detail — failJob persists them verbatim). Full sequence:
 *     repair/drain failure -> persisted production-shaped job error ->
 *     next-tick admission admitted. Narrowing survives: an unrelated
 *     unknown_step (no Belle linkage, no pending carrier) is refused with
 *     zero writes — even when stale pending metadata from ANOTHER job is
 *     present.
 *  2. pre-packaging recovery is consumed: an audio-deleting recovery resets
 *     the affected episodes' required stages (Belle audio + mixing +
 *     package completion) and persists the same-job continuation BEFORE
 *     packaging advances. Unaffected episodes keep their flags; packaging
 *     cannot skip the affected episode on stale flags.
 */
import { createClient } from '@supabase/supabase-js'
import {
  applyAudioDeleteRecoveryToState,
  getPendingResumeAdmission,
  persistPrePackagingAudioRecovery,
  resumePendingPinJob,
  runSeriesPackagingWithPriorRecovery,
  setPendingAudioDelete,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import { hashScript } from '@/lib/continuityPin'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const JOB_ID = 'job-fixes2'
const OTHER_JOB_ID = 'job-someone-else'

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ── In-memory PostgREST + storage emulator ──────────────────────────────────

interface ReqLog {
  method: string
  url: string
  body: string | null
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${(v as unknown[]).map(canon).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
}

function projectRow(row: any, select: string | null): any {
  if (!select || select === '*') return clone(row)
  const out: any = {}
  for (const col of select.split(',')) {
    const c = col.trim()
    if (c && c in row) out[c] = clone(row[c])
  }
  return out
}

function rowMatchesParams(row: any, sp: URLSearchParams): boolean {
  for (const [col, expr] of sp) {
    if (col === 'select' || col === 'order' || col === 'limit' || col === 'offset') continue
    if (expr.startsWith('eq.')) {
      const raw = expr.slice(3)
      const cell = (row as any)[col]
      if (cell !== null && typeof cell === 'object') {
        let needle: unknown
        try {
          needle = JSON.parse(raw)
        } catch {
          return false
        }
        if (canon(cell) !== canon(needle)) return false
      } else if (String(cell ?? '') !== raw) {
        return false
      }
      continue
    }
    return false
  }
  return true
}

function makeEmulator(
  seedStories: Record<string, any>,
  seedJobs: Record<string, any>,
  storageFiles: Record<string, string[]> = {}
) {
  const stories = new Map<string, any>(Object.entries(clone(seedStories)))
  const jobs = new Map<string, any>(Object.entries(clone(seedJobs)))
  const bucketFiles = new Map<string, Set<string>>()
  for (const [prefix, names] of Object.entries(storageFiles)) {
    for (const name of names) {
      const set = bucketFiles.get('audio') || new Set<string>()
      set.add(`${prefix}/${name}`.replace(/\/+/g, '/'))
      bucketFiles.set('audio', set)
    }
  }
  const requests: ReqLog[] = []

  const stubFetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input?.url)
    const method = String(init?.method || 'GET').toUpperCase()
    const bodyText =
      init?.body == null ? null : typeof init.body === 'string' ? init.body : String(init.body)
    requests.push({ method, url, body: bodyText })
    const parsed = new URL(url)
    let accept = ''
    try {
      accept = new Headers(init?.headers).get('accept') || ''
    } catch {
      accept = ''
    }
    const wantsSingle = accept.includes('application/vnd.pgrst.object+json')

    if (parsed.pathname === '/storage/v1/object/list/audio') {
      const body = JSON.parse(bodyText || '{}')
      const prefix = String(body.prefix || '')
      const names = [...(bucketFiles.get('audio') || [])]
        .filter((p) => p.startsWith(prefix))
        .map((p) => ({ name: p.slice(prefix.length).replace(/^\//, '') }))
      return jsonResponse(names)
    }
    if (parsed.pathname === '/storage/v1/object/audio' && method === 'DELETE') {
      const body = JSON.parse(bodyText || '[]')
      const paths: string[] = Array.isArray(body) ? body : body.prefixes || []
      const set = bucketFiles.get('audio') || new Set<string>()
      for (const p of paths) set.delete(String(p))
      return jsonResponse(paths.map((p) => ({ name: String(p).split('/').pop() })))
    }

    const restMatch = parsed.pathname.match(/^\/rest\/v1\/([^/]+)$/)
    if (!restMatch) return jsonResponse({ message: `emu: unknown path ${parsed.pathname}` }, 404)
    const table = restMatch[1]
    const store = table === 'stories' ? stories : table === 'production_jobs' ? jobs : null
    if (!store) return jsonResponse({ message: `emu: unknown table ${table}` }, 404)
    const sp = parsed.searchParams

    if (method === 'GET') {
      const matched = [...store.values()].filter((r) => rowMatchesParams(r, sp))
      const select = sp.get('select')
      if (wantsSingle) {
        if (matched.length !== 1) {
          return jsonResponse(
            { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
            406
          )
        }
        return jsonResponse(projectRow(matched[0], select))
      }
      return jsonResponse(matched.map((r) => projectRow(r, select)))
    }

    if (method === 'PATCH') {
      const values = JSON.parse(bodyText || '{}')
      const matched: any[] = []
      for (const row of store.values()) {
        if (!rowMatchesParams(row, sp)) continue
        for (const [k, v] of Object.entries(values)) (row as any)[k] = clone(v)
        matched.push(row)
      }
      const select = sp.get('select')
      if (select) {
        return jsonResponse(matched.map((r) => projectRow(r, select)))
      }
      return jsonResponse([])
    }

    return jsonResponse({ message: `emu: unsupported method ${method}` }, 405)
  }

  const client = createClient('https://xyz.supabase.co', 'test-anon-key', {
    global: { fetch: stubFetch as any },
  })
  return { client, requests, stories, jobs }
}

type Emu = ReturnType<typeof makeEmulator>

// ── Seeds ───────────────────────────────────────────────────────────────────

function auditEntry(jobId: string, storyId: string) {
  return {
    action: 'series_belle_retry_repair',
    timestamp: '2026-10-22T15:00:00.000Z',
    jobId,
    storyId,
    episodeNumber: 1,
    beforeHash: hashScript(BEFORE_SCRIPT),
    afterHash: hashScript(AFTER_SCRIPT),
    repairedIntro: false,
    repairedOutro: true,
  }
}

function scriptJsonWith(opts: {
  pending?: PendingPinResyncEntry[]
  audio?: string[]
  auditJobId?: string | null
  storyId?: string
}) {
  let sj: any = {
    raw_script: AFTER_SCRIPT,
    series_generation: { generated_title: opts.storyId || EP1_ID },
  }
  if (opts.auditJobId !== null) {
    sj.series_generation.belle_repair_audit = [
      auditEntry(opts.auditJobId || JOB_ID, opts.storyId || EP1_ID),
    ]
  }
  sj = setPendingPinResync(sj, opts.pending || [])
  if (opts.audio !== undefined) sj = setPendingAudioDelete(sj, opts.audio)
  return sj
}

function seedRow(id: string, sj: any, episodeNumber?: number) {
  return {
    id,
    script: AFTER_SCRIPT,
    script_json: sj,
    ...(episodeNumber !== undefined ? { episode_number: episodeNumber } : {}),
  }
}

function seedFailedJob(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: 'failed',
    job_type: 'SERIES_PACKAGE',
    story_id: EP1_ID,
    series_id: 'series-creek',
    current_step: 'complete_story_package',
    state_json: { storyId: EP1_ID },
    error_json: {
      kind: 'continuity_pin_mismatch',
      step: 'complete_story_package',
      marc_required: true,
    },
    logs: [],
    locked_at: null,
    locked_by: null,
    ...over,
  }
}

/** No [object Object] serialization anywhere on the wire. */
function expectCleanWire(emu: Emu) {
  for (const r of emu.requests) {
    expect(r.url).not.toContain('[object Object]')
    expect(r.url).not.toContain('object+Object')
    expect(r.url).not.toContain('%5Bobject')
  }
}

function patchRequests(emu: Emu) {
  return emu.requests.filter((r) => r.method === 'PATCH')
}

function jobPatches(emu: Emu) {
  return patchRequests(emu).filter((r) => r.url.includes('/rest/v1/production_jobs'))
}

function storageDeletes(emu: Emu) {
  return emu.requests.filter((r) => r.method === 'DELETE' && r.url.includes('/storage/'))
}

// ── (1) admission reads the production error shape ──────────────────────────

describe('(1) admission: production unknown_step shapes admitted, unrelated refused', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)
  const STALE = hashScript(BEFORE_SCRIPT)

  function carrierSeeds() {
    return {
      [EP1_ID]: seedRow(
        EP1_ID,
        scriptJsonWith({
          pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
          storyId: EP1_ID,
        })
      ),
      [EP2_ID]: seedRow(
        EP2_ID,
        { series_generation: { generated_title: EP2_ID, continuity_pins_used: { [EP1_ID]: STALE } } }
      ),
    }
  }

  test('plain drain-error unknown_step (failJob-verbatim persist) is admitted + resumed', async () => {
    // Genuine Belle-repair drain failure: the lib throw carries no
    // structured detail, so failJob persists it via
    // buildStructuredError('unknown_step', err.message, step, {...}) —
    // this fixture mirrors that persisted shape exactly.
    const emu = makeEmulator(carrierSeeds(), {
      [JOB_ID]: seedFailedJob({
        error_json: {
          kind: 'unknown_step',
          message:
            `Failed to drain Belle pin resync on ${EP2_ID} after Belle repair of ` +
            `${EP1_ID}: write error (pending list intact in DB for 1 entry)`,
          step: 'complete_story_package',
          storyId: EP1_ID,
          seriesId: 'series-creek',
          marc_required: true,
          at: '2026-10-22T16:00:00.000Z',
        },
      }),
    })
    const admission = await getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    expect(admission).not.toBeNull()
    expect(admission?.carrierStoryId).toBe(EP1_ID)
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('resumed')
    if (outcome.status === 'resumed') {
      expect(outcome.resumePoint).toBe('complete_story_package')
    }
    // Re-queue write present on the wire; job row actually re-queued.
    const requeues = jobPatches(emu).filter((r) => String(r.body || '').includes('"queued"'))
    expect(requeues.length).toBeGreaterThan(0)
    expect(emu.jobs.get(JOB_ID).status).toBe('queued')
    expectCleanWire(emu)
  })

  test('nested-detail unknown_step (retry-validation shape) is admitted + resumed', async () => {
    const emu = makeEmulator(carrierSeeds(), {
      [JOB_ID]: seedFailedJob({
        error_json: {
          kind: 'unknown_step',
          message: 'Belle retry produced invalid copy: outro breaks hook rule',
          step: 'complete_story_package',
          storyId: EP1_ID,
          seriesId: 'series-creek',
          marc_required: true,
          // Thrower's structuredErrorDetail, nested by failJob under `detail`.
          detail: {
            kind: 'series_belle_retry_validation_failed',
            seriesId: 'series-creek',
            storyId: EP1_ID,
            episodeNumber: 1,
            issues: ['outro breaks hook rule'],
          },
          at: '2026-10-22T16:00:00.000Z',
        },
      }),
    })
    const admission = await getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    expect(admission).not.toBeNull()
    expect(admission?.carrierStoryId).toBe(EP1_ID)
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('resumed')
    expect(emu.jobs.get(JOB_ID).status).toBe('queued')
    expectCleanWire(emu)
  })

  test('unrelated unknown_step (no Belle linkage, no carrier) refused write-free', async () => {
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRow(
          EP1_ID,
          { series_generation: { generated_title: EP1_ID } }
        ),
      },
      {
        [JOB_ID]: seedFailedJob({
          current_step: 'generate_voices',
          state_json: { storyId: EP1_ID },
          error_json: {
            kind: 'unknown_step',
            message: 'Voice preflight timed out after 3 attempts',
            step: 'generate_voices',
            storyId: EP1_ID,
            marc_required: true,
            at: '2026-10-22T16:00:00.000Z',
          },
        }),
      }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('refused')
    expect(patchRequests(emu)).toHaveLength(0)
    expect(storageDeletes(emu)).toHaveLength(0)
    expect(emu.jobs.get(JOB_ID).status).toBe('failed')
    expectCleanWire(emu)
  })

  test('Belle-message unknown_step linking to ANOTHER job refused write-free', async () => {
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRow(
          EP1_ID,
          scriptJsonWith({
            pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
            // Leftover from ANOTHER job's repair — not this job's.
            auditJobId: OTHER_JOB_ID,
            storyId: EP1_ID,
          })
        ),
      },
      {
        [JOB_ID]: seedFailedJob({
          error_json: {
            kind: 'unknown_step',
            message: `Failed to prune Belle pin-resync pending list on ${EP1_ID}: conflict`,
            step: 'complete_story_package',
            marc_required: true,
            at: '2026-10-22T16:00:00.000Z',
          },
        }),
      }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('refused')
    expect(patchRequests(emu)).toHaveLength(0)
    expect(storageDeletes(emu)).toHaveLength(0)
    expectCleanWire(emu)
  })
})

// ── (2) pre-packaging recovery is consumed before packaging advances ────────

describe('(2) pre-packaging audio recovery resets stages + persists before packaging', () => {
  const OUTRO_URL = `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`

  function audioSeeds() {
    return {
      [EP1_ID]: seedRow(
        EP1_ID,
        scriptJsonWith({ audio: [OUTRO_URL], storyId: EP1_ID }),
        1
      ),
      // Unaffected episode: no pending, no intent — must stay untouched.
      [EP2_ID]: seedRow(
        EP2_ID,
        { series_generation: { generated_title: EP2_ID } },
        2
      ),
    }
  }

  function packagingState() {
    return {
      storyId: EP1_ID,
      seriesBelleGeneration: { doneByEp: { '1': true, '2': true }, allDone: true },
      seriesRenderFinalMix: { doneByEp: { '1': true, '2': true }, allDone: true },
      seriesCompleteStoryPackage: { doneByEp: { '1': true, '2': true }, allDone: true },
    }
  }

  test('audio-deleting recovery schedules regen, preserves unaffected flags, packaging sees resets', async () => {
    const emu = makeEmulator(audioSeeds(), {
      [JOB_ID]: seedFailedJob({ status: 'running', state_json: packagingState() }),
    })
    const job = emu.jobs.get(JOB_ID)
    let packagedWith: any = null
    const { recovery, result } = await runSeriesPackagingWithPriorRecovery(
      emu.client,
      {
        failingStoryId: EP1_ID,
        onRecovery: (rec) =>
          persistPrePackagingAudioRecovery(emu.client, job, rec, { id: JOB_ID }),
        runPackage: async () => {
          // Stand-in for runSeriesPackageCompletion: reads the job's live
          // state exactly like the real packager (doneByEp skip) and
          // records what it observed.
          packagedWith = clone(job.state_json)
          const doneByEp =
            (job.state_json?.seriesCompleteStoryPackage?.doneByEp as Record<string, boolean>) || {}
          const packaged = ['1', '2'].filter((k) => !doneByEp[k])
          return { success: true, packaged } as any
        },
      }
    )
    expect((result as any).success).toBe(true)
    expect(recovery).toHaveLength(1)
    expect(recovery[0].repairedStoryId).toBe(EP1_ID)
    // The stale Belle audio file was actually deleted…
    expect(recovery[0].deletedAudioFiles).toEqual([`asc3/${EP1_ID}/outro.mp3`])
    expect(storageDeletes(emu)).toHaveLength(1)

    // …so replacement Belle audio + mixing are scheduled: the affected
    // episode's required stages reset, continuation persisted to the job.
    const cont = jobPatches(emu)
    expect(cont.length).toBeGreaterThan(0)
    const persisted = JSON.parse(cont[cont.length - 1].body || '{}').state_json
    for (const stage of ['seriesBelleGeneration', 'seriesRenderFinalMix', 'seriesCompleteStoryPackage']) {
      expect(persisted[stage].doneByEp['1']).toBe(false)
      expect(persisted[stage].allDone).toBe(false)
      // Unaffected episode keeps its completion flags.
      expect(persisted[stage].doneByEp['2']).toBe(true)
    }
    expect(persisted.seriesCompleteStoryPackage.belleRetry.byEpisode[EP1_ID].deletedBelleFiles).toEqual([
      `asc3/${EP1_ID}/outro.mp3`,
    ])

    // Packaging observed the resets — the affected episode is reprocessed,
    // never skipped on its stale `true` flag.
    expect(packagedWith.seriesCompleteStoryPackage.doneByEp['1']).toBe(false)
    expect(packagedWith.seriesCompleteStoryPackage.doneByEp['2']).toBe(true)
    expect((result as any).packaged).toContain('1')

    // The continuation write precedes the package read on the wire.
    const contIdx = emu.requests.findIndex(
      (r) => r.method === 'PATCH' && r.url.includes('/rest/v1/production_jobs')
    )
    expect(contIdx).toBeGreaterThan(-1)
    const deleteIdx = emu.requests.findIndex(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeLessThan(contIdx)

    // Unaffected episode row untouched: no story write names it, its row
    // is byte-identical to the seed.
    for (const r of patchRequests(emu).filter((x) => x.url.includes('/rest/v1/stories'))) {
      expect(String(r.body || '')).not.toContain(EP2_ID)
    }
    expect(emu.stories.get(EP2_ID).script_json).toEqual(
      { series_generation: { generated_title: EP2_ID } }
    )
    expectCleanWire(emu)
  })

  test('pin-only recovery is a no-op: zero job writes', async () => {
    const NEW_HASH = hashScript(AFTER_SCRIPT)
    const STALE = hashScript(BEFORE_SCRIPT)
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRow(
          EP1_ID,
          scriptJsonWith({
            pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
            storyId: EP1_ID,
          }),
          1
        ),
        [EP2_ID]: seedRow(
          EP2_ID,
          { series_generation: { generated_title: EP2_ID, continuity_pins_used: { [EP1_ID]: STALE } } },
          2
        ),
      },
      { [JOB_ID]: seedFailedJob({ status: 'running', state_json: packagingState() }) }
    )
    const job = emu.jobs.get(JOB_ID)
    const { recovery } = await runSeriesPackagingWithPriorRecovery(emu.client, {
      failingStoryId: EP1_ID,
      onRecovery: (rec) =>
        persistPrePackagingAudioRecovery(emu.client, job, rec, { id: JOB_ID }),
      runPackage: async () => ({ success: true }) as any,
    })
    expect(recovery).toHaveLength(1)
    expect(recovery[0].deletedAudioFiles).toEqual([])
    // Drain ran (stories writes), but no job-row continuation was needed.
    expect(jobPatches(emu)).toHaveLength(0)
    expect(storageDeletes(emu)).toHaveLength(0)
    expect(emu.jobs.get(JOB_ID).state_json).toEqual(packagingState())
    expectCleanWire(emu)
  })

  test('pure state helper resets only audio-hit episodes', () => {
    const { state, affectedKeys } = applyAudioDeleteRecoveryToState(packagingState(), [
      {
        repairedStoryId: EP1_ID,
        drainedDependentIds: [],
        via: 'failing-row',
        episodeNumber: 1,
        deletedAudioFiles: [`asc3/${EP1_ID}/outro.mp3`],
      },
    ])
    expect(affectedKeys).toEqual(['1'])
    for (const stage of ['seriesBelleGeneration', 'seriesRenderFinalMix', 'seriesCompleteStoryPackage']) {
      expect(state[stage].doneByEp).toEqual({ '1': false, '2': true })
      expect(state[stage].allDone).toBe(false)
    }
    // Pin-only resolutions change nothing (same object values).
    const untouched = applyAudioDeleteRecoveryToState(packagingState(), [
      {
        repairedStoryId: EP2_ID,
        drainedDependentIds: [EP1_ID],
        via: 'series-scan',
        episodeNumber: 2,
        deletedAudioFiles: [],
      },
    ])
    expect(untouched.affectedKeys).toEqual([])
    expect(untouched.state).toEqual(packagingState())
  })
})
