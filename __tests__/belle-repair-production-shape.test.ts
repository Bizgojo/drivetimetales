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
 *  2. pre-packaging recovery CONTINUES (never packages same-tick): an
 *     audio-deleting recovery deletes the stale files, then persists a
 *     same-job continuation to Belle generation (step transition off
 *     complete_story_package + affected Belle/mix/package flag resets,
 *     lock HELD) and returns BEFORE any packaging call; the lock is
 *     released by a second fenced write strictly AFTER the pending prune.
 *     Unaffected episodes keep their flags, all retry counts are
 *     preserved, and a continuation-write failure leaves pending entries
 *     intact so a later tick retries the continuation (fail-closed, never
 *     half-persisted).
 *  3. HANDOFF gate: a prune failure after the continuation persisted
 *     leaves the job lock-held and unclaimable (no premature generation),
 *     and the next worker entry (recoverStrandedContinuationCleanup +
 *     release) retires the certified intent with zero storage calls — so
 *     no fresh recording at a reused path is ever deleted.
 */
import { createClient } from '@supabase/supabase-js'
import {
  applyAudioDeleteRecoveryToState,
  getPendingResumeAdmission,
  persistPrePackagingAudioRecovery,
  recoverStrandedContinuationCleanup,
  releasePrePackagingContinuationLock,
  resumePendingPinJob,
  runPrePackagingRecoveryWithContinuation,
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
  storageFiles: Record<string, string[]> = {},
  opts: { failPatch?: (table: string, values: any) => string | null } = {}
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
      const fail = opts.failPatch ? opts.failPatch(table, values) : null
      if (fail) return jsonResponse({ message: fail, code: '400' }, 400)
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
  return {
    client,
    requests,
    stories,
    jobs,
    storageAdd(prefix: string, names: string[]) {
      for (const name of names) {
        const set = bucketFiles.get('audio') || new Set<string>()
        set.add(`${prefix}/${name}`.replace(/\/+/g, '/'))
        bucketFiles.set('audio', set)
      }
    },
  }
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
      seriesCompleteStoryPackage: {
        doneByEp: { '1': true, '2': true },
        allDone: true,
        belleRetry: {
          byEpisode: {
            [EP1_ID]: { count: 2, max: 5, episodeNumber: 1 },
            [EP2_ID]: { count: 1, max: 5, episodeNumber: 2 },
          },
        },
      },
    }
  }

  function lockedPackagingJob() {
    return seedFailedJob({
      status: 'running',
      locked_by: 'holder-1',
      locked_at: '2026-10-22T16:00:00.000Z',
      state_json: packagingState(),
      error_json: null,
    })
  }

  function storageWithStaleOutro() {
    return { [`asc3/${EP1_ID}`]: ['outro.mp3'] }
  }

  test('(a) audio recovery writes the same-job continuation + makes ZERO packaging calls that tick', async () => {
    const emu = makeEmulator(audioSeeds(), { [JOB_ID]: lockedPackagingJob() }, storageWithStaleOutro())
    const job = emu.jobs.get(JOB_ID)
    // Route-glue stand-in: packaging runs ONLY when the tick did not
    // continue (mirrors the run-next branch exactly).
    let packagingCalls = 0
    const pre = await runPrePackagingRecoveryWithContinuation(emu.client, {
      failingStoryId: EP1_ID,
      job,
      fence: { id: JOB_ID, locked_by: 'holder-1', status: 'running' },
    })
    if (!pre.continued) packagingCalls += 1
    expect(pre.continued).toBe(true)
    expect(pre.affectedKeys).toEqual(['1'])
    expect(packagingCalls).toBe(0)
    const rec = pre.recovery.find((r) => r.repairedStoryId === EP1_ID)
    // The stale Belle audio file was actually deleted…
    expect(rec?.deletedAudioFiles).toEqual([`asc3/${EP1_ID}/outro.mp3`])
    expect(storageDeletes(emu)).toHaveLength(1)

    // …and the SAME job continued to Belle generation: step transition +
    // affected flag resets on the captured continuation PATCH — persisted
    // with the lock HELD (HANDOFF gate: unclaimable mid-cleanup), then
    // released by a second fenced write strictly AFTER the pending prune.
    const conts = jobPatches(emu).filter((r) =>
      String(r.body || '').includes('series_generate_belle_assets')
    )
    expect(jobPatches(emu)).toHaveLength(2)
    expect(conts).toHaveLength(1)
    const contBody = JSON.parse(conts[0].body || '{}')
    // No status change on the continuation PATCH: the job stays running.
    expect('status' in contBody).toBe(false)
    expect(contBody.current_step).toBe('series_generate_belle_assets')
    // Lock HELD through cleanup — the continuation PATCH touches only
    // state/step/logs (lock columns absent from the body), so the row
    // keeps its lock and no other worker can claim mid-cleanup.
    expect('locked_by' in contBody).toBe(false)
    expect('locked_at' in contBody).toBe(false)
    // The release is a separate fenced PATCH, after the prune: status
    // queued + lock cleared.
    const releases = jobPatches(emu).filter((r) => !conts.includes(r))
    expect(releases).toHaveLength(1)
    const releaseBody = JSON.parse(releases[0].body || '{}')
    expect(releaseBody.status).toBe('queued')
    expect(releaseBody.locked_by).toBeNull()
    expect(releaseBody.locked_at).toBeNull()
    const persisted = contBody.state_json
    for (const stage of ['seriesBelleGeneration', 'seriesRenderFinalMix', 'seriesCompleteStoryPackage']) {
      expect(persisted[stage].doneByEp['1']).toBe(false)
      expect(persisted[stage].allDone).toBe(false)
      // Unaffected episode keeps its completion flags.
      expect(persisted[stage].doneByEp['2']).toBe(true)
    }
    // All retry counts preserved; deleted files recorded on the affected
    // episode's record only.
    expect(persisted.seriesCompleteStoryPackage.belleRetry.byEpisode[EP1_ID].count).toBe(2)
    expect(persisted.seriesCompleteStoryPackage.belleRetry.byEpisode[EP2_ID].count).toBe(1)
    expect(persisted.seriesCompleteStoryPackage.belleRetry.byEpisode[EP1_ID].deletedBelleFiles).toEqual([
      `asc3/${EP1_ID}/outro.mp3`,
    ])
    expect(
      persisted.seriesCompleteStoryPackage.belleRetry.byEpisode[EP2_ID].deletedBelleFiles
    ).toBeUndefined()
    // Continuation log entry persisted on the same PATCH.
    const logs = contBody.logs
    expect(Array.isArray(logs)).toBe(true)
    expect(String(logs[logs.length - 1].message)).toMatch(/continuation/)

    // In-memory job mirrors the persisted continuation.
    expect(job.status).toBe('queued')
    expect(job.current_step).toBe('series_generate_belle_assets')
    expect(job.locked_by).toBeNull()
    expect(job.state_json.seriesCompleteStoryPackage.doneByEp).toEqual({ '1': false, '2': true })

    // Wire order: storage DELETE → continuation PATCH (lock held) →
    // stories prunes → lock release LAST (generation unblocked strictly
    // after cleanup completes).
    const deleteIdx = emu.requests.findIndex(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    const contIdx = emu.requests.indexOf(conts[0])
    const releaseIdx = emu.requests.indexOf(releases[0])
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(contIdx).toBeGreaterThan(-1)
    expect(releaseIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeLessThan(contIdx)
    const pruneIdxs = emu.requests
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.method === 'PATCH' && r.url.includes('/rest/v1/stories'))
      .map(({ i }) => i)
    expect(pruneIdxs.length).toBeGreaterThan(0)
    for (const i of pruneIdxs) expect(i).toBeGreaterThan(contIdx)
    for (const i of pruneIdxs) expect(i).toBeLessThan(releaseIdx)
    // Pending fully pruned after the continuation landed.
    expect(
      emu.stories.get(EP1_ID).script_json.series_generation.pending_audio_delete
    ).toEqual([])

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

  test('(b) subsequent ticks reach replacement Belle audio → affected mix → packaging in order', async () => {
    const emu = makeEmulator(audioSeeds(), { [JOB_ID]: lockedPackagingJob() }, storageWithStaleOutro())
    const job = emu.jobs.get(JOB_ID)
    let packagingCalls = 0
    // Tick 1: recovery deletes + continuation (zero packaging calls).
    const pre = await runPrePackagingRecoveryWithContinuation(emu.client, {
      failingStoryId: EP1_ID,
      job,
      fence: { id: JOB_ID, locked_by: 'holder-1', status: 'running' },
    })
    expect(pre.continued).toBe(true)
    if (!pre.continued) packagingCalls += 1
    expect(packagingCalls).toBe(0)
    const contIdx = emu.requests.findIndex((r) =>
      r.method === 'PATCH' &&
        r.url.includes('/rest/v1/production_jobs') &&
        String(r.body || '').includes('series_generate_belle_assets')
    )
    expect(contIdx).toBeGreaterThan(-1)

    // Tick 2: replacement Belle audio lands for the reset episode (story
    // audio write) and the Belle stage flag flips back.
    const NEW_OUTRO = `https://cdn.example.com/asc3/${EP1_ID}/outro-v2.mp3`
    await emu.client.from('stories').update({ outro_audio_url: NEW_OUTRO }).eq('id', EP1_ID).select('id')
    const belleRead = await emu.client.from('production_jobs').select('state_json').eq('id', JOB_ID).single()
    const belleState = clone((belleRead as any).data.state_json)
    belleState.seriesBelleGeneration.doneByEp['1'] = true
    await emu.client.from('production_jobs').update({ state_json: belleState }).eq('id', JOB_ID).select('id')

    // Tick 3: affected mix (story mix write + mix flag flip).
    const NEW_MIX = `https://cdn.example.com/asc3/${EP1_ID}/mix-v2.mp3`
    await emu.client.from('stories').update({ story_audio_url: NEW_MIX }).eq('id', EP1_ID).select('id')
    const mixRead = await emu.client.from('production_jobs').select('state_json').eq('id', JOB_ID).single()
    const mixState = clone((mixRead as any).data.state_json)
    mixState.seriesRenderFinalMix.doneByEp['1'] = true
    await emu.client.from('production_jobs').update({ state_json: mixState }).eq('id', JOB_ID).select('id')

    // Tick 4: packaging tick — pre-packaging recovery finds nothing
    // pending, does NOT continue, packaging runs and packs exactly the
    // reset episode (unaffected ep stays skipped on its preserved flag).
    let packaged: string[] = []
    const pre4 = await runPrePackagingRecoveryWithContinuation(emu.client, {
      failingStoryId: EP1_ID,
      job: emu.jobs.get(JOB_ID),
      fence: { id: JOB_ID },
    })
    expect(pre4.continued).toBe(false)
    expect(pre4.recovery).toEqual([])
    if (!pre4.continued) {
      packagingCalls += 1
      const live = emu.jobs.get(JOB_ID).state_json
      const doneByEp =
        (live?.seriesCompleteStoryPackage?.doneByEp as Record<string, boolean>) || {}
      packaged = ['1', '2'].filter((k) => !doneByEp[k])
      // Package-request marker on the wire.
      await emu.client.from('production_jobs').select('id').eq('id', JOB_ID).limit(1)
    }
    expect(packagingCalls).toBe(1)
    expect(packaged).toEqual(['1'])

    // Captured-request sequence: continuation → replacement Belle audio →
    // affected mix → packaging marker, in order.
    const belleAudioIdx = emu.requests.findIndex((r) => String(r.body || '').includes('outro-v2'))
    const mixAudioIdx = emu.requests.findIndex((r) => String(r.body || '').includes('mix-v2'))
    const markerIdx = emu.requests.findIndex(
      (r, i) =>
        i > mixAudioIdx && r.method === 'GET' && r.url.includes('/rest/v1/production_jobs')
    )
    expect(belleAudioIdx).toBeGreaterThan(contIdx)
    expect(mixAudioIdx).toBeGreaterThan(belleAudioIdx)
    expect(markerIdx).toBeGreaterThan(mixAudioIdx)
    // Retry counts survived every tick.
    const finalRetry = emu.jobs.get(JOB_ID).state_json.seriesCompleteStoryPackage.belleRetry.byEpisode
    expect(finalRetry[EP1_ID].count).toBe(2)
    expect(finalRetry[EP2_ID].count).toBe(1)
    expectCleanWire(emu)
  })

  test('(c) continuation-write failure leaves pending entries intact for retry', async () => {
    const NEW_HASH = hashScript(AFTER_SCRIPT)
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRow(
          EP1_ID,
          scriptJsonWith({
            pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
            audio: [`https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`],
            storyId: EP1_ID,
          }),
          1
        ),
        [EP2_ID]: seedRow(
          EP2_ID,
          { series_generation: { generated_title: EP2_ID } },
          2
        ),
      },
      { [JOB_ID]: lockedPackagingJob() },
      storageWithStaleOutro()
    )
    const job = emu.jobs.get(JOB_ID)
    // Fenced miss (lock holder mismatch): the continuation write fails.
    await expect(
      runPrePackagingRecoveryWithContinuation(emu.client, {
        failingStoryId: EP1_ID,
        job,
        fence: { id: JOB_ID, locked_by: 'someone-else', status: 'running' },
      })
    ).rejects.toThrow(/Failed to persist pre-packaging Belle audio recovery/)
    // Pending entries NOT cleared: audio intent AND pin resync survive for
    // a later tick to retry the continuation.
    const sj = emu.stories.get(EP1_ID).script_json.series_generation
    expect(sj.pending_audio_delete).toEqual([`https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`])
    expect(sj.pending_pin_resync).toHaveLength(1)
    expect(sj.pending_pin_resync[0]).toMatchObject({
      dependentStoryId: EP2_ID,
      priorStoryId: EP1_ID,
      newPinHash: NEW_HASH,
    })
    // Zero story-row writes: no prune was attempted before the
    // continuation, so no half-persisted state lost the recovery.
    expect(
      patchRequests(emu).filter((r) => r.url.includes('/rest/v1/stories'))
    ).toHaveLength(0)
    // The continuation attempt hit the wire once but changed nothing: the
    // job still sits locked at packaging for the retry tick.
    expect(jobPatches(emu)).toHaveLength(1)
    expect(emu.jobs.get(JOB_ID).status).toBe('running')
    expect(emu.jobs.get(JOB_ID).current_step).toBe('complete_story_package')
    expect(emu.jobs.get(JOB_ID).state_json).toEqual(packagingState())
    // The storage delete is idempotent — a retry re-issues the no-op
    // remove before re-attempting the continuation.
    expect(storageDeletes(emu)).toHaveLength(1)
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

// ── (3) HANDOFF: lock held until cleanup completes + stranded recovery ─────
// Failure injection AFTER the continuation persisted but BEFORE the prune,
// then the next worker/recovery entry. Proves (a) no paid generation can
// start prematurely and (b) no fresh recording is subsequently deleted.
describe('(3) HANDOFF gate: lock held until cleanup + stranded recovery', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)
  const STALE = hashScript(BEFORE_SCRIPT)
  const OUTRO_URL = `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`
  const REUSED_PATH = `asc3/${EP1_ID}/outro.mp3`

  function handoffSeeds() {
    return {
      [EP1_ID]: seedRow(
        EP1_ID,
        scriptJsonWith({
          pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
          audio: [OUTRO_URL],
          storyId: EP1_ID,
        }),
        1
      ),
      [EP2_ID]: seedRow(
        EP2_ID,
        { series_generation: { generated_title: EP2_ID, continuity_pins_used: { [EP1_ID]: STALE } } },
        2
      ),
    }
  }

  function lockedPackagingJob() {
    return seedFailedJob({
      status: 'running',
      locked_by: 'holder-1',
      locked_at: '2026-10-22T16:00:00.000Z',
      state_json: {
        storyId: EP1_ID,
        seriesBelleGeneration: { doneByEp: { '1': true, '2': true }, allDone: true },
        seriesRenderFinalMix: { doneByEp: { '1': true, '2': true }, allDone: true },
        seriesCompleteStoryPackage: {
          doneByEp: { '1': true, '2': true },
          allDone: true,
          belleRetry: {
            byEpisode: {
              [EP1_ID]: { count: 2, max: 5, episodeNumber: 1 },
              [EP2_ID]: { count: 1, max: 5, episodeNumber: 2 },
            },
          },
        },
      },
      error_json: null,
    })
  }

  function voiceCalls(emu: Emu) {
    return emu.requests.filter((r) => r.url.includes('generate-voices'))
  }

  test('prune failure: continuation durable but lock-held, unclaimable, pending intact, zero generation', async () => {
    let failStoriesPrune = true
    const emu = makeEmulator(
      handoffSeeds(),
      { [JOB_ID]: lockedPackagingJob() },
      { [`asc3/${EP1_ID}`]: ['outro.mp3'] },
      { failPatch: (table) => (table === 'stories' && failStoriesPrune ? 'boom-prune' : null) }
    )
    const job = emu.jobs.get(JOB_ID)

    // Inject the failure AFTER continuation persistence, BEFORE pruning:
    // the first stories PATCH (pin prune) throws.
    await expect(
      runPrePackagingRecoveryWithContinuation(emu.client, {
        failingStoryId: EP1_ID,
        job,
        fence: { id: JOB_ID, locked_by: 'holder-1', status: 'running' },
      })
    ).rejects.toThrow(/boom-prune/)

    // (i) The stale file was deleted, then the continuation PATCH landed —
    // the ONLY job PATCH on the wire, with the lock HELD (no release).
    expect(storageDeletes(emu)).toHaveLength(1)
    expect(jobPatches(emu)).toHaveLength(1)
    const contBody = JSON.parse(jobPatches(emu)[0].body || '{}')
    expect(contBody.current_step).toBe('series_generate_belle_assets')
    expect('status' in contBody).toBe(false)
    expect('locked_by' in contBody).toBe(false)
    expect('locked_at' in contBody).toBe(false)
    // (ii) The DB row is durable (continuation persisted) but still locked.
    const row = emu.jobs.get(JOB_ID)
    expect(row.current_step).toBe('series_generate_belle_assets')
    expect(row.status).toBe('running')
    expect(row.locked_by).toBe('holder-1')
    expect(row.state_json.seriesBelleGeneration.doneByEp).toEqual({ '1': false, '2': true })
    // (iii) Pending intact: audio intent AND pin resync survive.
    const sj = emu.stories.get(EP1_ID).script_json.series_generation
    expect(sj.pending_audio_delete).toEqual([OUTRO_URL])
    expect(sj.pending_pin_resync).toHaveLength(1)
    // (iv) (a) No premature generation: another worker's fenced claim
    // matches ZERO rows (lock held) — and the wire shows zero Belle-audio
    // generation requests before cleanup completes.
    const claim = (await emu.client
      .from('production_jobs')
      .update({ status: 'running', locked_at: '2026-10-22T17:00:00.000Z', locked_by: 'worker-2' })
      .match({ id: JOB_ID, locked_by: 'worker-2' })
      .select('id')) as any
    expect(claim.error).toBeNull()
    expect(claim.data).toEqual([])
    expect(emu.jobs.get(JOB_ID).locked_by).toBe('holder-1')
    expect(voiceCalls(emu)).toHaveLength(0)
    expectCleanWire(emu)

    // ── Next worker/recovery entry ──
    failStoriesPrune = false
    const nextJob = (await emu.client.from('production_jobs').select('*').eq('id', JOB_ID).single() as any).data
    const guard = await recoverStrandedContinuationCleanup(emu.client, {
      failingStoryId: EP1_ID,
      job: nextJob,
    })
    // (v) Guard retires the certified intent: audio cleared, pins drained.
    expect(guard.recovered).toBe(true)
    expect(guard.clearedAudioIntents).toEqual({ [EP1_ID]: [OUTRO_URL] })
    expect(guard.drainedPins[EP1_ID]).toEqual([EP2_ID])
    expect(emu.stories.get(EP1_ID).script_json.series_generation.pending_audio_delete).toEqual([])
    expect(emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(NEW_HASH)
    // (vi) Guard issued ZERO storage calls (certified — files already gone)
    // and ZERO job writes, and still zero generation requests.
    expect(storageDeletes(emu)).toHaveLength(1)
    expect(jobPatches(emu)).toHaveLength(2) // persist-hold + failed claim only
    expect(voiceCalls(emu)).toHaveLength(0)
    // (vii) Release unblocks generation — strictly after cleanup.
    await releasePrePackagingContinuationLock(emu.client, nextJob, {
      id: JOB_ID,
      locked_by: 'holder-1',
      status: 'running',
    })
    expect(jobPatches(emu)).toHaveLength(3)
    const releaseBody = JSON.parse(jobPatches(emu)[2].body || '{}')
    expect(releaseBody.status).toBe('queued')
    expect(releaseBody.locked_by).toBeNull()
    expect(releaseBody.locked_at).toBeNull()
    expect(emu.jobs.get(JOB_ID).status).toBe('queued')
    expect(emu.jobs.get(JOB_ID).locked_by).toBeNull()
    // Retry counts preserved across the whole handoff.
    const byEp = emu.jobs.get(JOB_ID).state_json.seriesCompleteStoryPackage.belleRetry.byEpisode
    expect(byEp[EP1_ID].count).toBe(2)
    expect(byEp[EP2_ID].count).toBe(1)
    expect(byEp[EP1_ID].deletedBelleFiles).toEqual([REUSED_PATH])
    expectCleanWire(emu)
  })

  test('no fresh recording at a reused path is ever deleted afterwards', async () => {
    const emu = makeEmulator(
      handoffSeeds(),
      { [JOB_ID]: lockedPackagingJob() },
      { [`asc3/${EP1_ID}`]: ['outro.mp3'] }
    )
    // Full success path: continuation (lock held) → prune → release.
    const job = emu.jobs.get(JOB_ID)
    const pre = await runPrePackagingRecoveryWithContinuation(emu.client, {
      failingStoryId: EP1_ID,
      job,
      fence: { id: JOB_ID, locked_by: 'holder-1', status: 'running' },
    })
    expect(pre.continued).toBe(true)
    const deletesAfterSuccess = storageDeletes(emu).length
    const jobPatchesAfterSuccess = jobPatches(emu).length
    expect(deletesAfterSuccess).toBe(1)

    // Simulate replacement regen: a FRESH recording lands at the reused
    // filename (same path the stale intent once named).
    emu.storageAdd(`asc3/${EP1_ID}`, ['outro.mp3'])

    // Steady-state guard tick: markers persist as audit, but with nothing
    // pending the guard clears nothing, writes nothing, deletes nothing.
    const tickJob = (await emu.client.from('production_jobs').select('*').eq('id', JOB_ID).single() as any).data
    const guard = await recoverStrandedContinuationCleanup(emu.client, {
      failingStoryId: EP1_ID,
      job: tickJob,
    })
    expect(guard.recovered).toBe(true)
    expect(guard.clearedAudioIntents).toEqual({})
    expect(guard.drainedPins).toEqual({})
    // A later packaging tick re-enters recovery and converges (no
    // continuation, no writes) instead of re-deleting.
    const later = await runPrePackagingRecoveryWithContinuation(emu.client, {
      failingStoryId: EP1_ID,
      job: tickJob,
      fence: { id: JOB_ID },
    })
    expect(later.continued).toBe(false)
    expect(later.recovery).toEqual([])
    // (b) No storage DELETE against the regenerated path; the fresh
    // recording is intact; no further job writes.
    expect(storageDeletes(emu)).toHaveLength(deletesAfterSuccess)
    expect(jobPatches(emu)).toHaveLength(jobPatchesAfterSuccess)
    expect(voiceCalls(emu)).toHaveLength(0)
    const listed = (await emu.client.storage.from('audio').list(`asc3/${EP1_ID}`) as any).data
    expect((listed || []).map((e: any) => e.name)).toContain('outro.mp3')
    expectCleanWire(emu)
  })

  test('guard is a zero-DB-call no-op for jobs without a persisted continuation', async () => {
    const emu = makeEmulator(
      handoffSeeds(),
      { [JOB_ID]: lockedPackagingJob() },
      { [`asc3/${EP1_ID}`]: ['outro.mp3'] }
    )
    const callsBefore = emu.requests.length
    // Packaging step, no markers: no reads, no writes.
    const plain = await recoverStrandedContinuationCleanup(emu.client, {
      failingStoryId: EP1_ID,
      job: emu.jobs.get(JOB_ID),
    })
    expect(plain).toEqual({ recovered: false, clearedAudioIntents: {}, drainedPins: {} })
    expect(emu.requests).toHaveLength(callsBefore)
    expectCleanWire(emu)
  })
})
