/**
 * BELLE-REPAIR-ENTRY-GAPS-001 (P5 entry gaps) evidence suite.
 *
 * Every test drives the REAL lib entries (lib/belleRepairPersist — the exact
 * functions the run-next route calls) through the REAL @supabase/supabase-js
 * QueryBuilder with a stub fetch that captures outgoing URLs. Assertions run
 * against captured request strings (never a mirror), backed by a minimal
 * in-memory PostgREST + storage emulator.
 *
 * Cover:
 *  (a) marked job admitted / unmarked failed job refused / bound exhaustion
 *      terminal (resumePendingPinJob + getPendingResumeAdmission);
 *  (b) kill-after-persist finishes scoped DELETEs with zero rewrite calls
 *      (recoverPendingPinDrains drains a stranded pending_audio_delete);
 *  (c) concurrently-added pending entry survives the prune
 *      (identity-based prune, never index/length).
 */
import { createClient } from '@supabase/supabase-js'
import {
  drainPendingPinResync,
  getPendingResumeAdmission,
  PENDING_RESUME_MAX_ATTEMPTS,
  recoverPendingPinDrains,
  resumePendingPinJob,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import { hashScript } from '@/lib/continuityPin'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'
const JOB_ID = 'job-entry-gaps'

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ── In-memory PostgREST + storage emulator (trimmed codex pattern) ─────────

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
  return { client, requests, stories, jobs }
}

type Emu = ReturnType<typeof makeEmulator>

// ── Seeds ───────────────────────────────────────────────────────────────────

function pendingEntry(dep: string, hash: string): PendingPinResyncEntry {
  return { dependentStoryId: dep, priorStoryId: EP1_ID, newPinHash: hash }
}

function seedRepairedRow(pending: PendingPinResyncEntry[] = []) {
  return {
    id: EP1_ID,
    script: AFTER_SCRIPT,
    outro_audio_url: `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`,
    outro_with_music_url: `https://cdn.example.com/asc3/${EP1_ID}/outro_mix.mp3`,
    script_json: setPendingPinResync(
      {
        raw_script: AFTER_SCRIPT,
        series_generation: {
          generated_title: 'Ep1',
          // Repair-ownership linkage: this row's pending list belongs to
          // JOB_ID's repair (same atomic persist wrote both).
          belle_repair_audit: [
            {
              action: 'series_belle_retry_repair',
              timestamp: '2026-10-22T15:00:00.000Z',
              jobId: JOB_ID,
              storyId: EP1_ID,
              episodeNumber: 1,
              beforeHash: hashScript(BEFORE_SCRIPT),
              afterHash: hashScript(AFTER_SCRIPT),
              repairedIntro: false,
              repairedOutro: true,
            },
          ],
        },
      },
      pending
    ),
  }
}

function seedDependentRow(id: string, pinHash: string) {
  return {
    id,
    script: `script for ${id}`,
    script_json: {
      series_generation: {
        generated_title: id,
        continuity_pins_used: { [EP1_ID]: pinHash },
      },
    },
  }
}

function seedFailedJob(extraState: Record<string, unknown> = {}, extraErr: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: 'failed',
    job_type: 'SERIES_PACKAGE',
    story_id: EP1_ID,
    series_id: 'series-creek',
    current_step: 'series_generate_belle_assets',
    state_json: { storyId: EP1_ID, ...extraState },
    error_json: {
      kind: 'continuity_pin_mismatch',
      step: 'series_generate_belle_assets',
      marc_required: true,
      ...extraErr,
    },
    logs: [],
    locked_at: null,
    locked_by: null,
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

function storiesScriptWrites(emu: Emu): any[] {
  return emu.requests
    .filter((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/stories'))
    .map((r) => JSON.parse(r.body || '{}'))
    .filter((b) => Object.prototype.hasOwnProperty.call(b, 'script'))
}

// ── (a) narrow revival entry ────────────────────────────────────────────────

describe('(a) narrow revival entry: pending-carrying failed jobs only', () => {
  const NEW_HASH = hashScript(AFTER_SCRIPT)
  const STALE = hashScript(BEFORE_SCRIPT)

  test('marked job admitted: non-empty pending_pin_resync on its episode row', async () => {
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRepairedRow([pendingEntry(EP2_ID, NEW_HASH)]),
        [EP2_ID]: seedDependentRow(EP2_ID, STALE),
      },
      { [JOB_ID]: seedFailedJob() }
    )
    const admission = await getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    expect(admission).not.toBeNull()
    expect(admission).toEqual({ carrierStoryId: EP1_ID, pendingCount: 1, audioIntentCount: 0, scope: 'pins' })
    expectCleanWire(emu)
  })

  test('unmarked failed job refused: empty pending list and row without the key', async () => {
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRepairedRow([]),
        [EP2_ID]: seedDependentRow(EP2_ID, STALE),
      },
      { [JOB_ID]: seedFailedJob() }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    const outcome = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(outcome.status).toBe('refused')
    // Refusal writes nothing: no job PATCH, no story PATCH.
    expect(
      emu.requests.filter((r) => r.method === 'PATCH')
    ).toHaveLength(0)
    expectCleanWire(emu)
  })

  test('non-failed job refused even with pending present', async () => {
    const emu = makeEmulator(
      { [EP1_ID]: seedRepairedRow([pendingEntry(EP2_ID, NEW_HASH)]) },
      { [JOB_ID]: { ...seedFailedJob(), status: 'queued' } }
    )
    await expect(
      getPendingResumeAdmission(emu.client, emu.jobs.get(JOB_ID))
    ).resolves.toBeNull()
    expect((await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))).status).toBe('refused')
  })

  test('admitted job re-queued with capped count; bound exhaustion re-marks terminal+marc_required', async () => {
    const emu = makeEmulator(
      {
        [EP1_ID]: seedRepairedRow([pendingEntry(EP2_ID, NEW_HASH)]),
        [EP2_ID]: seedDependentRow(EP2_ID, STALE),
      },
      {
        [JOB_ID]: seedFailedJob(
          {},
          { safe_resume_point: 'series_generate_belle_assets' }
        ),
      }
    )
    const first = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(first.status).toBe('resumed')
    if (first.status !== 'resumed') throw new Error('expected resumed')
    expect(first.resumePoint).toBe('series_generate_belle_assets')
    expect(first.resumeCount).toBe(1)
    const requeued: any = emu.jobs.get(JOB_ID)
    expect(requeued.status).toBe('queued')
    expect(requeued.current_step).toBe('series_generate_belle_assets')
    expect(requeued.error_json).toBeNull()
    expect(requeued.state_json.pendingPinResumeCount).toBe(1)

    // Second revival consumes the last attempt…
    const reFailed = { ...clone(requeued), status: 'failed', error_json: seedFailedJob().error_json }
    emu.jobs.set(JOB_ID, reFailed)
    const second = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(second.status).toBe('resumed')

    // …third tick hits the bound: terminal, marc_required, story flagged.
    const reFailed2 = {
      ...clone(emu.jobs.get(JOB_ID)),
      status: 'failed',
      error_json: seedFailedJob().error_json,
    }
    emu.jobs.set(JOB_ID, reFailed2)
    const third = await resumePendingPinJob(emu.client, emu.jobs.get(JOB_ID))
    expect(third).toEqual({ status: 'exhausted', jobId: JOB_ID })
    const terminal: any = emu.jobs.get(JOB_ID)
    expect(terminal.status).toBe('failed')
    expect(terminal.error_json.exhausted).toBe(true)
    expect(terminal.error_json.marc_required).toBe(true)
    expect(String(terminal.error_json.fixRecommendation)).toMatch(/Manual fix needed/)
    expect(emu.stories.get(EP1_ID).needs_attention).toBe(true)
    expect(PENDING_RESUME_MAX_ATTEMPTS).toBe(2)
    expectCleanWire(emu)
  })
})

// ── (b) durable invalidation intent ─────────────────────────────────────────

describe('(b) kill-after-persist finishes scoped DELETEs with zero rewrite calls', () => {
  test('stranded pending_audio_delete: exact files removed once, intent cleared, no script/regen/job writes', async () => {
    const outroUrl = `https://cdn.example.com/asc3/${EP1_ID}/outro.mp3`
    const outroBeforeUrl = `https://cdn.example.com/asc3/${EP1_ID}/outro_before_fix.mp3?version=2`
    const ep1 = seedRepairedRow([])
    ep1.script_json = {
      ...ep1.script_json,
      series_generation: {
        ...ep1.script_json.series_generation,
        pending_audio_delete: [outroUrl, outroBeforeUrl],
      },
    }
    const emu = makeEmulator(
      { [EP1_ID]: ep1, [EP2_ID]: seedDependentRow(EP2_ID, hashScript(AFTER_SCRIPT)) },
      { [JOB_ID]: seedFailedJob() },
      {
        storageFiles: {
          [`asc3/${EP1_ID}`]: ['outro.mp3', 'outro_before_fix.mp3', 'segment_003.mp3'],
        },
      }
    )
    const jobBefore = clone(emu.jobs.get(JOB_ID))

    const resolutions = await recoverPendingPinDrains(emu.client, {
      failingStoryId: EP1_ID,
    })

    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].repairedStoryId).toBe(EP1_ID)
    expect(resolutions[0].via).toBe('failing-row')
    expect(resolutions[0].drainedDependentIds).toEqual([])
    expect(resolutions[0].deletedAudioFiles.sort()).toEqual(
      [`asc3/${EP1_ID}/outro.mp3`, `asc3/${EP1_ID}/outro_before_fix.mp3`].sort()
    )
    // Exactly one storage DELETE carrying exactly the scoped paths…
    const removes = emu.requests.filter(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    expect(removes).toHaveLength(1)
    const removedPaths = (() => {
      const body = JSON.parse(removes[0].body || '[]')
      return (Array.isArray(body) ? body : body.prefixes || []).map(String).sort()
    })()
    expect(removedPaths).toEqual(resolutions[0].deletedAudioFiles.sort())
    // …no bucket listing (intent names the files), sibling untouched…
    expect(
      emu.requests.filter((r) => r.url.includes('/storage/') && r.method !== 'DELETE')
    ).toHaveLength(0)
    // …zero rewrite calls: no script-column PATCH, no job PATCH, job byte-identical…
    expect(storiesScriptWrites(emu)).toHaveLength(0)
    expect(emu.requests.filter((r) => r.url.includes('/rest/v1/production_jobs'))).toHaveLength(0)
    expect(emu.jobs.get(JOB_ID)).toEqual(jobBefore)
    // …intent cleared, sibling audio URLs retained in the row.
    expect(emu.stories.get(EP1_ID).script_json.series_generation.pending_audio_delete).toEqual([])
    expect(emu.stories.get(EP1_ID).script).toBe(AFTER_SCRIPT)
    expectCleanWire(emu)
  })
})

// ── (c) identity-based prune ────────────────────────────────────────────────

describe('(c) concurrently-added pending entry survives the prune', () => {
  test('entry added between drain read and prune write is kept; drained entry removed', async () => {
    const NEW_HASH = hashScript(AFTER_SCRIPT)
    const STALE = hashScript(BEFORE_SCRIPT)
    const entryA = pendingEntry(EP2_ID, NEW_HASH)
    const entryB = pendingEntry(EP3_ID, 'concurrent-hash-b')
    const seedStories = {
      [EP1_ID]: seedRepairedRow([entryA]),
      [EP2_ID]: seedDependentRow(EP2_ID, STALE),
      [EP3_ID]: seedDependentRow(EP3_ID, STALE),
    }
    const emu = makeEmulator(seedStories, { [JOB_ID]: seedFailedJob() }, {
      // Concurrent writer lands between the drain's dependent read (EP2)
      // and the prune's fresh read (EP1): entry B is appended to the
      // STORED row, so the prune's fresh snapshot carries [A, B] while
      // this run only drained A.
      afterGetSingle: (table, id) => {
        if (table !== 'stories' || id !== EP2_ID) return
        const stored = emu.stories.get(EP1_ID)
        const sg = stored.script_json.series_generation
        sg.pending_pin_resync = [...sg.pending_pin_resync, clone(entryB)]
      },
    })

    // Drain off the STALE list [A] (fixed before B arrived).
    const drained = await drainPendingPinResync(emu.client, EP1_ID, [clone(entryA)])

    expect(drained).toEqual([EP2_ID])
    // A's pin applied…
    expect(
      emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(NEW_HASH)
    // …A pruned by identity, B (never drained) survives…
    expect(
      emu.stories.get(EP1_ID).script_json.series_generation.pending_pin_resync
    ).toEqual([entryB])
    // …repaired text written by the original persist only: zero script writes here.
    expect(storiesScriptWrites(emu)).toHaveLength(0)
    expectCleanWire(emu)
  })
})
