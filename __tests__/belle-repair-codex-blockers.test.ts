/**
 * P5 CODEX BLOCKERS (four items) evidence suite.
 *
 * Every test drives the REAL lib entries (lib/belleRepairPersist — the exact
 * functions the run-next route calls) through the REAL @supabase/supabase-js
 * QueryBuilder with a stub fetch that captures outgoing URLs. Assertions run
 * against captured request strings (never a mirror), backed by a minimal
 * in-memory PostgREST + storage emulator.
 *
 * Cover:
 *  1. admission finds a repair carrier on a third series row (series-scoped
 *     fallback) and admits audio-only recovery (pins empty, audio intent
 *     non-empty) with drain-only/audio-only scope;
 *  2. admission enforces the verified Belle recovery operation (repair
 *     ownership via audit job-id linkage, Belle-repair/package-completion
 *     failure class, allowed recovery step) — unrelated failed jobs with
 *     leftover pending metadata stay refused with ZERO writes;
 *  3. audio-intent clearing subtracts only the processed intents by
 *     identity — a concurrently-added intent survives, its file untouched;
 *  4. series packaging runs prior pending recovery first (success and
 *     exception cases) via runSeriesPackagingWithPriorRecovery.
 */
import { createClient } from '@supabase/supabase-js'
import {
  drainPendingAudioDeletes,
  getPendingResumeAdmission,
  resumePendingPinJob,
  runSeriesPackagingWithPriorRecovery,
  setPendingAudioDelete,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import { hashScript } from '@/lib/continuityPin'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'
const JOB_ID = 'job-codex-blockers'
const OTHER_JOB_ID = 'job-someone-else'

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ── In-memory PostgREST + storage emulator (trimmed entry-gaps pattern) ────

interface ReqLog {
  method: string
  url: string
  body: string | null
}

interface EmuOpts {
  afterGetSingle?: (table: string, id: string) => void
  storageFiles?: Record<string, string[]>
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

/** PostgREST eq filters from query params (object cells compare as jsonb). */
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
  opts: EmuOpts = {}
) {
  const stories = new Map<string, any>(Object.entries(clone(seedStories)))
  const jobs = new Map<string, any>(Object.entries(clone(seedJobs)))
  const bucketFiles = new Map<string, Set<string>>()
  for (const [prefix, names] of Object.entries(opts.storageFiles || {})) {
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
    const accept = (() => {
      try {
        return new Headers(init?.headers).get('accept') || ''
      } catch {
        return ''
      }
    })()
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

    // LARGE-DOC-CAS: server-side compare-and-swap RPC emulation (atomic
    // compare via canon, whitelist enforced, zero-row match = []).
    if (parsed.pathname === '/rest/v1/rpc/cas_update_story' && method === 'POST') {
      const rpcBody = JSON.parse(bodyText || '{}')
      const allowed = ['script', 'script_json', 'announcement_text', 'outro_text', 'announcement_url', 'outro_audio_url', 'outro_with_music_url']
      for (const k of Object.keys(rpcBody?.p_updates ?? {})) {
        if (!allowed.includes(k)) {
          return jsonResponse({ message: `cas_update_story: column ${k} not in whitelist`, code: 'P0001' }, 400)
        }
      }
      const row = stories.get(String(rpcBody?.p_story_id))
      if (row && canon(row.script_json ?? null) === canon(rpcBody?.p_expected ?? null)) {
        for (const [k, v] of Object.entries(rpcBody?.p_updates ?? {})) (row as any)[k] = clone(v)
        return jsonResponse([{ updated_id: row.id }])
      }
      return jsonResponse([])
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
        const out = projectRow(matched[0], select)
        const idEq = sp.get('id')
        if (idEq && idEq.startsWith('eq.') && opts.afterGetSingle) {
          opts.afterGetSingle(table, idEq.slice(3))
        }
        return jsonResponse(out)
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
  const bucketHas = (path: string) => (bucketFiles.get('audio') || new Set()).has(path)
  return { client, requests, stories, jobs, bucketHas }
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

function seedRow(id: string, sj: any) {
  return { id, script: AFTER_SCRIPT, script_json: sj }
}

function seedFailedJob(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: 'failed',
    job_type: 'SERIES_PACKAGE',
    story_id: EP1_ID,
    series_id: 'series-creek',
    current_step: 'series_generate_belle_assets',
    state_json: { storyId: EP1_ID },
    error_json: {
      kind: 'continuity_pin_mismatch',
      step: 'series_generate_belle_assets',
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

function storageRequests(emu: Emu) {
  return emu.requests.filter((r) => r.url.includes('/storage/'))
}

// ── (1) admission finds carriers beyond the job's own rows ──────────────────

describe('(1) admission: series fallback + audio-only scope', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)
  const STALE = hashScript(BEFORE_SCRIPT)

  test('carrier on a third row found via series-scoped fallback', async () => {
    const carrierPending: PendingPinResyncEntry[] = [
      { dependentStoryId: EP2_ID, priorStoryId: EP3_ID, newPinHash: NEW_HASH },
    ]
    const emu = makeEmulator(
      {
        // Job's own candidates carry nothing.
        [EP1_ID]: seedRow(EP1_ID, scriptJsonWith({ storyId: EP1_ID })),
        [EP2_ID]: seedRow(
          EP2_ID,
          { series_generation: { generated_title: EP2_ID, continuity_pins_used: { [EP3_ID]: STALE } } }
        ),
        // The repair carrier lives on a third row.
        [EP3_ID]: seedRow(
          EP3_ID,
          scriptJsonWith({ pending: carrierPending, storyId: EP3_ID })
        ),
      },
      {
        [JOB_ID]: seedFailedJob({ state_json: { storyId: EP2_ID } }),
      }
    )
    const admission = await getPendingResumeAdmission(
      emu.client,
      emu.jobs.get(JOB_ID),
      {
        loadSeriesStories: () =>
          Promise.resolve([
            clone(emu.stories.get(EP1_ID)),
            clone(emu.stories.get(EP2_ID)),
            clone(emu.stories.get(EP3_ID)),
          ]),
      }
    )
    expect(admission).toEqual({
      carrierStoryId: EP3_ID,
      pendingCount: 1,
      audioIntentCount: 0,
      scope: 'pins',
    })
    expectCleanWire(emu)
  })

  test('pins empty + audio intent non-empty: admitted with audio-only scope', async () => {
    const outroUrl = `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRow(EP1_ID, scriptJsonWith({ audio: [outroUrl] })),
      },
      { [JOB_ID]: seedFailedJob() }
    )
    const admission = await getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    expect(admission).toEqual({
      carrierStoryId: EP1_ID,
      pendingCount: 0,
      audioIntentCount: 1,
      scope: 'audio',
    })
    // …and the entry re-queues it for drain-first recovery.
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('resumed')
    if (outcome.status !== 'resumed') throw new Error('expected resumed')
    expect(outcome.resumePoint).toBe('series_generate_belle_assets')
    expectCleanWire(emu)
  })
})

// ── (2) admission restrictions enforced, refusals write-free ────────────────

describe('(2) admission restrictions: verified Belle recovery only', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)

  function stalePendingRow() {
    return seedRow(
      EP1_ID,
      scriptJsonWith({
        pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
        // Leftover from ANOTHER job's repair — not this job's.
        auditJobId: OTHER_JOB_ID,
      })
    )
  }

  test('unrelated failed job + stale pending metadata: refused, zero writes', async () => {
    const emu = makeEmulator(
      { [EP1_ID]: stalePendingRow() },
      {
        [JOB_ID]: seedFailedJob({
          current_step: 'generate_script',
          state_json: { storyId: EP1_ID },
          error_json: {
            kind: 'premise_collision',
            step: 'generate_script',
            marc_required: true,
          },
        }),
      }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('refused')
    // Refusal writes nothing: no job PATCH, no story PATCH, no storage calls.
    expect(patchRequests(emu)).toHaveLength(0)
    expect(storageRequests(emu)).toHaveLength(0)
    expectCleanWire(emu)
  })

  test('right failure class but pending links to another job: refused, zero writes', async () => {
    const emu = makeEmulator(
      { [EP1_ID]: stalePendingRow() },
      { [JOB_ID]: seedFailedJob() }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('refused')
    expect(patchRequests(emu)).toHaveLength(0)
    expect(storageRequests(emu)).toHaveLength(0)
    expectCleanWire(emu)
  })
})

// ── (3) audio-intent clearing subtracts only processed intents ──────────────

describe('(3) concurrent audio intent survives the clear', () => {
  test('intent added after delete, before clearing read: survives, its file untouched', async () => {
    const urlA = `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`
    const urlB = `https://cdn.example.com/asc3/${EP1_ID}/outro_v2.mp3`
    // The hook injects the concurrent intent when the clearing read runs
    // (i.e. after the DELETE, before the clearing read resolves).
    // Idempotent: later reads see it already there. The injection lands in
    // the store AFTER the clearing response was projected, so the first
    // CAS write conflicts and the retry recomputes fresh-minus-processed.
    let storeRef: Map<string, any> | null = null
    let injected = false
    const emu2 = makeEmulator(
      {
        [EP1_ID]: seedRow(
          EP1_ID,
          scriptJsonWith({ audio: [urlA], auditJobId: null })
        ),
      },
      { [JOB_ID]: seedFailedJob() },
      {
        storageFiles: {
          [`asc3/${EP1_ID}`]: ['outro.mp3', 'outro_v2.mp3', 'segment_003.mp3'],
        },
        afterGetSingle: (table: string, id: string) => {
          if (table !== 'stories' || id !== EP1_ID || injected || !storeRef) return
          injected = true
          const stored = storeRef.get(EP1_ID)
          const sg = stored.script_json.series_generation
          sg['pending_audio_delete'] = [...(sg['pending_audio_delete'] || []), urlB]
        },
      }
    )
    storeRef = emu2.stories
    await drainPendingAudioDeletes(emu2.client, EP1_ID, [urlA])

    // Only the processed intent's file was deleted…
    const removes = emu2.requests.filter(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    expect(removes).toHaveLength(1)
    const removedBody = JSON.parse(removes[0].body || '[]')
    const removedPaths = (Array.isArray(removedBody) ? removedBody : removedBody.prefixes || []).map(String).sort()
    expect(removedPaths).toEqual([`asc3/${EP1_ID}/outro.mp3`])
    // …the concurrent intent survives the clear…
    expect(
      emu2.stories.get(EP1_ID).script_json.series_generation.pending_audio_delete
    ).toEqual([urlB])
    // …and its file was never in any delete set (still in the bucket).
    expect(emu2.bucketHas(`asc3/${EP1_ID}/outro_v2.mp3`)).toBe(true)
    expect(emu2.bucketHas(`asc3/${EP1_ID}/segment_003.mp3`)).toBe(true)
    expect(emu2.bucketHas(`asc3/${EP1_ID}/outro.mp3`)).toBe(false)
    expectCleanWire(emu2)
  })
})

// ── (4) recovery runs before packaging ──────────────────────────────────────

describe('(4) prior recovery precedes series packaging', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)
  const STALE = hashScript(BEFORE_SCRIPT)

  function packagingSeeds() {
    return {
      [EP1_ID]: seedRow(
        EP1_ID,
        scriptJsonWith({
          pending: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: NEW_HASH }],
        })
      ),
      [EP2_ID]: seedRow(
        EP2_ID,
        { series_generation: { generated_title: EP2_ID, continuity_pins_used: { [EP1_ID]: STALE } } }
      ),
    }
  }

  test('successful packaging still runs prior recovery first', async () => {
    const emu = makeEmulator(packagingSeeds(), { [JOB_ID]: seedFailedJob() })
    const { recovery, result } = await runSeriesPackagingWithPriorRecovery(
      emu.client,
      {
        failingStoryId: EP1_ID,
        runPackage: async () => {
          // Package-request marker on the wire (stands in for the route's
          // runSeriesPackageCompletion fetch). production_jobs is never
          // touched by drains, so the marker is unambiguous.
          await emu.client.from('production_jobs').select('id').eq('id', JOB_ID).limit(1)
          return { success: true }
        },
      }
    )
    expect((result as any).success).toBe(true)
    expect(recovery).toHaveLength(1)
    expect(recovery[0].repairedStoryId).toBe(EP1_ID)
    expect(recovery[0].drainedDependentIds).toEqual([EP2_ID])
    // Drain/clear requests precede the package request on the wire.
    const markerIdx = emu.requests.findIndex(
      (r) => r.method === 'GET' && r.url.includes('/rest/v1/production_jobs')
    )
    expect(markerIdx).toBeGreaterThan(-1)
    // LARGE-DOC-CAS: drains travel as RPC calls (body params, no URL filter).
    const drainOrClearIdx = emu.requests
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          (r.method === 'PATCH' && r.url.includes('/rest/v1/stories')) ||
          (r.method === 'POST' && r.url.includes('/rest/v1/rpc/cas_update_story')) ||
          (r.method === 'DELETE' && r.url.includes('/storage/'))
      )
      .map(({ i }) => i)
    expect(drainOrClearIdx.length).toBeGreaterThan(0)
    for (const i of drainOrClearIdx) expect(i).toBeLessThan(markerIdx)
    // Recovery effects present: pin applied, pending cleared.
    expect(
      emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(NEW_HASH)
    expect(
      emu.stories.get(EP1_ID).script_json.series_generation.pending_pin_resync
    ).toEqual([])
    expectCleanWire(emu)
  })

  test('packaging exception still leaves recovery completed', async () => {
    const emu = makeEmulator(packagingSeeds(), { [JOB_ID]: seedFailedJob() })
    await expect(
      runSeriesPackagingWithPriorRecovery(emu.client, {
        failingStoryId: EP1_ID,
        runPackage: async () => {
          await emu.client.from('production_jobs').select('id').eq('id', JOB_ID).limit(1)
          throw new Error('package boom')
        },
      })
    ).rejects.toThrow('package boom')
    // Recovery effects present despite the throw.
    expect(
      emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(NEW_HASH)
    expect(
      emu.stories.get(EP1_ID).script_json.series_generation.pending_pin_resync
    ).toEqual([])
    const markerIdx = emu.requests.findIndex(
      (r) => r.method === 'GET' && r.url.includes('/rest/v1/production_jobs')
    )
    expect(markerIdx).toBeGreaterThan(-1)
    // LARGE-DOC-CAS: drains travel as RPC calls (body params, no URL filter).
    const drainIdx = emu.requests
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => (r.method === 'PATCH' && r.url.includes('/rest/v1/stories'))
        || (r.method === 'POST' && r.url.includes('/rest/v1/rpc/cas_update_story')))
      .map(({ i }) => i)
    expect(drainIdx.length).toBeGreaterThan(0)
    for (const i of drainIdx) expect(i).toBeLessThan(markerIdx)
    expectCleanWire(emu)
  })
})
