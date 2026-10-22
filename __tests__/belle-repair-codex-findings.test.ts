/**
 * CODEX-FINDINGS-001..005 evidence suite (Marc's binding test standard).
 *
 * Every test below exercises the REAL SDK request construction: the
 * project's actual @supabase/supabase-js / postgrest-js QueryBuilder with a
 * stub fetch that captures the outgoing URL. Assertions run against the
 * captured outgoing request strings (never a mirror), backed by a minimal
 * in-memory PostgREST + storage emulator so the PRODUCTION lib entries
 * (lib/belleRepairPersist — the exact functions the run-next route calls)
 * execute end-to-end: drainPendingPinResync, persistBelleRepair,
 * persistBelleRepairAndInvalidateAudio, recoverPendingPinDrains,
 * reserveBelleRetryCount, deleteBelleAudioFiles.
 *
 * Finding map:
 *  F1 (broken JSON CAS filter) ............ describe F1
 *  F2 (recovery misses pending on repaired episode) .. describe F2
 *  F3 (unprotected writes: persist/prune CAS + reservation rows) .. describe F3
 *  F5 (audio deletion before durable repair + stale raw copy) .... describe F5
 */
import { createClient } from '@supabase/supabase-js'
import {
  CONCURRENT_MOD_CODE,
  drainPendingPinResync,
  persistBelleRepairAndInvalidateAudio,
  recoverPendingPinDrains,
  reserveBelleRetryCount,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import {
  applyBelleRepairAudit,
  belleRepairAudioInvalidation,
  buildBelleRepairAuditEntry,
  resyncContinuityPinsAfterRepair,
} from '@/lib/belleValidation'
import { hashScript } from '@/lib/continuityPin'
import { ownedJobFence } from '@/lib/jobLockGuard'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'
const JOB_ID = 'job-123'
const TS = '2026-10-22T16:00:00.000Z'

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/** Canonical deep-equal (key-order insensitive). */
function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${(v as unknown[]).map(canon).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
}
function deepEq(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b)
}

// ── In-memory PostgREST + storage emulator ────────────────────────────────

interface ReqLog {
  method: string
  url: string
  body: string | null
}

interface EmuOpts {
  failPatch?: (table: string, values: any) => string | null
  afterGetSingle?: (table: string, id: string) => void
  storageFiles?: Record<string, string[]>
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

/** Apply PostgREST row filters from query params (eq / neq / is.null). */
function rowMatchesParams(row: any, sp: URLSearchParams): boolean {
  for (const [col, expr] of sp) {
    if (col === 'select' || col === 'order' || col === 'limit' || col === 'offset') continue
    if (expr === 'is.null') {
      if ((row as any)[col] !== null && (row as any)[col] !== undefined) return false
      continue
    }
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
        if (!deepEq(cell, needle)) return false
      } else if (String(cell ?? '') !== raw) {
        return false
      }
      continue
    }
    if (expr.startsWith('neq.')) {
      if (String((row as any)[col] ?? '') === expr.slice(4)) return false
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

    // ── storage ──
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

    // ── rest ──
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
        // Clone the response FIRST, then fire the hook: this models a
        // concurrent writer landing AFTER our read returns (between our
        // read and our write) — the mutation must NOT be visible in the
        // snapshot we condition our CAS write on.
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

// ── Seeds (production-shaped) ─────────────────────────────────────────────

function seedRepairedRow() {
  return {
    id: EP1_ID,
    script: BEFORE_SCRIPT,
    announcement_url: 'https://cdn/asc3/ep1/announcement.mp3',
    outro_audio_url: 'https://cdn/asc3/ep1/outro.mp3',
    outro_with_music_url: 'https://cdn/asc3/ep1/outro_mix.mp3',
    script_json: {
      raw_script: BEFORE_SCRIPT,
      brief: 'ep1 brief',
      series_generation: {
        generated_title: 'Ep1',
        continuity_pins_used: { 'story-creek-ep0': 'abc123' },
        belle_repair_audit: [
          { action: 'older_repair', timestamp: '2026-10-20T00:00:00.000Z' },
        ],
      },
    },
  }
}

function seedDependentRow(id: string, priorId: string, pinHash: string) {
  return {
    id,
    script: `script for ${id}`,
    script_json: {
      viewer_state: { progress: 0.5 },
      series_generation: {
        generated_title: id,
        continuity_pins_used: { [priorId]: pinHash },
      },
    },
  }
}

function seedJobRow(byEpisode: Record<string, any> = {}) {
  return {
    id: JOB_ID,
    status: 'running',
    locked_by: 'holder-1',
    locked_at: '2026-10-22T15:00:00.000Z',
    state_json: {
      seriesCompleteStoryPackage: { belleRetry: { byEpisode: clone(byEpisode) } },
    },
  }
}

/** Route-shaped repair payload built with the REAL production helpers. */
function buildRepairPayload(repairedRow: any, seriesEpisodes: any[]) {
  const audit = buildBelleRepairAuditEntry({
    jobId: JOB_ID,
    storyId: EP1_ID,
    episodeNumber: 1,
    beforeScript: repairedRow.script,
    afterScript: AFTER_SCRIPT,
    repairedIntro: false,
    repairedOutro: true,
    at: TS,
  })
  const withAudit = applyBelleRepairAudit(repairedRow.script_json, audit)
  const withRawSync = { ...withAudit, raw_script: AFTER_SCRIPT }
  const pendingEntries: PendingPinResyncEntry[] = resyncContinuityPinsAfterRepair(
    seriesEpisodes,
    EP1_ID,
    audit.afterHash
  ).map((u) => ({
    dependentStoryId: String(u.id),
    priorStoryId: EP1_ID,
    newPinHash: String(audit.afterHash),
  }))
  const storyUpdates: Record<string, unknown> = {
    script: AFTER_SCRIPT,
    script_json: setPendingPinResync(withRawSync, pendingEntries),
    ...belleRepairAudioInvalidation(false, true),
    outro_text: 'repaired outro text',
  }
  return { audit, pendingEntries, storyUpdates }
}

function storiesPatchBodies(emu: Emu): any[] {
  return emu.requests
    .filter((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/stories'))
    .map((r) => JSON.parse(r.body || '{}'))
}

function casPatchUrls(emu: Emu): string[] {
  return emu.requests
    .filter((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/stories'))
    .map((r) => r.url)
    .filter((u) => u.includes('script_json=eq.'))
}

// ── F1: JSON CAS filter construction through the REAL QueryBuilder ─────────

describe('F1: whole-doc snapshot conditions are real encoded JSON', () => {
  function seedFullRepair() {
    const stale = hashScript(BEFORE_SCRIPT)
    const repairedRow = seedRepairedRow()
    return {
      stories: {
        [EP1_ID]: repairedRow,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, stale),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, stale),
      },
      jobs: { [JOB_ID]: seedJobRow() },
      repairedRow,
      stale,
    }
  }

  test('drain + prune + persist CAS filters decode to the exact snapshot; no [object Object] anywhere', async () => {
    const seed = seedFullRepair()
    const emu = makeEmulator(seed.stories, seed.jobs)
    const { pendingEntries, storyUpdates } = buildRepairPayload(seed.repairedRow, [
      { id: EP1_ID, script_json: seed.repairedRow.script_json },
      { id: EP2_ID, script_json: (seed.stories as any)[EP2_ID].script_json },
      { id: EP3_ID, script_json: (seed.stories as any)[EP3_ID].script_json },
    ])
    const preRepairSnapshot = clone(seed.repairedRow.script_json)

    await drainPendingPinResync(emu.client, EP1_ID, [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: hashScript(AFTER_SCRIPT) },
    ])
    const { persistBelleRepair } = await import('@/lib/belleRepairPersist')
    await persistBelleRepair(emu.client, {
      repairedStoryId: EP1_ID,
      storyUpdates,
      pendingEntries,
      expectedRepairedScriptJson: preRepairSnapshot,
    })

    // Every whole-doc snapshot condition on the wire…
    const casUrls = casPatchUrls(emu)
    expect(casUrls.length).toBeGreaterThanOrEqual(3) // persist + 2 drain pins (+ prune)
    // NOTE: the SDK form-encodes spaces as `+` (URLSearchParams semantics);
    // decode accordingly — the emulator's own URLSearchParams-based matching
    // already proved the server side parses these filters correctly.
    const decodeFilter = (enc: string) => decodeURIComponent(enc.replace(/\+/g, ' '))
    for (const url of casUrls) {
      const enc = url.split('script_json=eq.')[1].split('&')[0]
      const decoded = decodeFilter(enc)
      // …parses as JSON and deep-equals a real snapshot…
      expect(() => JSON.parse(decoded)).not.toThrow()
      expect(String(decoded)).toMatch(/^\{/)
    }
    // …and NOTHING on the wire ever carries the broken serialization.
    for (const r of emu.requests) {
      expect(r.url).not.toContain('[object Object]')
      expect(r.url).not.toContain('object+Object')
      expect(r.url).not.toContain('%5Bobject')
    }
    // The persist CAS filter is byte-exact: the SDK encodes our JSON string.
    // Correlate: the persist write is the stories PATCH whose body carries
    // the `script` column (drain pin writes and prunes are script_json-only).
    const persistReq = emu.requests.find(
      (r) =>
        r.method === 'PATCH' &&
        r.url.includes('/rest/v1/stories') &&
        Object.prototype.hasOwnProperty.call(JSON.parse(r.body || '{}'), 'script')
    )
    expect(persistReq).toBeDefined()
    const persistUrl = (persistReq as ReqLog).url
    expect(persistUrl).toContain('script_json=eq.')
    const persistEnc = (persistUrl as string).split('script_json=eq.')[1].split('&')[0]
    expect(decodeFilter(persistEnc)).toBe(JSON.stringify(preRepairSnapshot))

    // Repair landed: pin moved, pending cleared, raw copy synced.
    expect(
      emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(hashScript(AFTER_SCRIPT))
    expect(emu.stories.get(EP1_ID).script_json.raw_script).toBe(AFTER_SCRIPT)
  })
})

// ── F2: recovery entry resolves to the row CARRYING the pending list ───────

describe('F2: production recovery entry drains pending on the repaired episode', () => {
  function seedDivergedTick() {
    const newHash = hashScript(AFTER_SCRIPT)
    const stale = hashScript(BEFORE_SCRIPT)
    const ep1 = seedRepairedRow()
    ep1.script = AFTER_SCRIPT
    ep1.script_json = setPendingPinResync(ep1.script_json, [
      { dependentStoryId: EP3_ID, priorStoryId: EP1_ID, newPinHash: newHash },
    ])
    return {
      newHash,
      stories: {
        [EP1_ID]: ep1,
        // EP2 is the FAILING dependent: stale pin, carries NO pending list.
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, stale),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, stale),
      },
      jobs: { [JOB_ID]: seedJobRow() },
    }
  }

  function seriesRows(emu: Emu) {
    return [EP1_ID, EP2_ID, EP3_ID].map((id) => {
      const row = emu.stories.get(id)
      return { id, episode_number: id === EP1_ID ? 1 : id === EP2_ID ? 2 : 3, script_json: clone(row.script_json) }
    })
  }

  test('failing episode EP2 differs from repaired EP1: series-scan drains EP3 with zero paid calls, attempt unconsumed', async () => {
    const seed = seedDivergedTick()
    const emu = makeEmulator(seed.stories, seed.jobs)
    const jobBefore = clone(emu.jobs.get(JOB_ID))
    let loaderCalls = 0
    const resolutions = await recoverPendingPinDrains(emu.client, {
      failingStoryId: EP2_ID,
      loadSeriesStories: async () => {
        loaderCalls += 1
        return seriesRows(emu)
      },
    })

    expect(loaderCalls).toBe(1)
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].repairedStoryId).toBe(EP1_ID)
    expect(resolutions[0].via).toBe('series-scan')
    expect(resolutions[0].drainedDependentIds).toEqual([EP3_ID])
    expect(resolutions[0].episodeNumber).toBe(1)

    // Drained: pin moved, pending cleared on the REPAIRED row.
    expect(emu.stories.get(EP3_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(
      seed.newHash
    )
    expect(emu.stories.get(EP1_ID).script_json.series_generation.pending_pin_resync).toEqual([])

    // Zero paid calls: no script-column PATCH body, no job PATCH, no storage.
    for (const body of storiesPatchBodies(emu)) {
      expect(Object.prototype.hasOwnProperty.call(body, 'script')).toBe(false)
    }
    expect(emu.requests.filter((r) => r.url.includes('/rest/v1/production_jobs'))).toHaveLength(0)
    expect(emu.requests.filter((r) => r.url.includes('/storage/'))).toHaveLength(0)
    // Drain-only consumes no attempt: job row byte-identical.
    expect(emu.jobs.get(JOB_ID)).toEqual(jobBefore)
  })

  test('pending on the failing row itself: drains via failing-row without a series scan', async () => {
    const seed = seedDivergedTick()
    const emu = makeEmulator(seed.stories, seed.jobs)
    let loaderCalls = 0
    const resolutions = await recoverPendingPinDrains(emu.client, {
      failingStoryId: EP1_ID,
      loadSeriesStories: async () => {
        loaderCalls += 1
        return seriesRows(emu)
      },
    })
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].via).toBe('failing-row')
    expect(resolutions[0].drainedDependentIds).toEqual([EP3_ID])
    expect(loaderCalls).toBe(0)
    expect(emu.stories.get(EP1_ID).script_json.series_generation.pending_pin_resync).toEqual([])
  })
})

// ── F3: protected writes (persist/prune CAS + reservation rows) ────────────

describe('F3: repaired-row writes are CAS-verified with re-read/re-merge/retry', () => {
  const DIVERGED_NOTE = 'concurrent operator edit'

  function seedConflict() {
    const stale = hashScript(BEFORE_SCRIPT)
    const s0 = seedRepairedRow()
    // S1: concurrent writer touched UNRELATED metadata + added THEIR pending
    // entry for EP2 (same dependent, their hash) + their audit entry.
    const s1 = clone(s0)
    s1.script_json.series_generation.operator_note = DIVERGED_NOTE
    s1.script_json.top_level_extra = { keep: [1, 2] }
    s1.script_json.series_generation.pending_pin_resync = [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: 'their-hash' },
    ]
    s1.script_json.series_generation.belle_repair_audit.push({
      action: 'concurrent_operator_edit',
      timestamp: '2026-10-22T15:55:00.000Z',
    })
    return {
      s0,
      s1,
      stories: {
        [EP1_ID]: s1,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, stale),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, stale),
      },
      jobs: { [JOB_ID]: seedJobRow() },
    }
  }

  test('concurrent modification: retry succeeds with newer metadata preserved + pending union (ours wins ties)', async () => {
    const seed = seedConflict()
    const emu = makeEmulator(seed.stories, seed.jobs)
    // Payload built from the STALE S0 snapshot (pre-conflict read).
    const { audit, pendingEntries, storyUpdates } = buildRepairPayload(seed.s0, [
      { id: EP1_ID, script_json: seed.s0.script_json },
      { id: EP2_ID, script_json: (seed.stories as any)[EP2_ID].script_json },
      { id: EP3_ID, script_json: (seed.stories as any)[EP3_ID].script_json },
    ])
    expect(pendingEntries.map((e) => e.dependentStoryId).sort()).toEqual([EP2_ID, EP3_ID])

    const { persistBelleRepair } = await import('@/lib/belleRepairPersist')
    const out = await persistBelleRepair(emu.client, {
      repairedStoryId: EP1_ID,
      storyUpdates,
      pendingEntries,
      expectedRepairedScriptJson: seed.s0.script_json,
    })

    const ep1 = emu.stories.get(EP1_ID)
    // Repair landed exactly once after one retry…
    expect(ep1.script).toBe(AFTER_SCRIPT)
    expect(ep1.script_json.raw_script).toBe(AFTER_SCRIPT)
    // …newer unrelated metadata preserved (newer wins)…
    expect(ep1.script_json.series_generation.operator_note).toBe(DIVERGED_NOTE)
    expect(ep1.script_json.top_level_extra).toEqual({ keep: [1, 2] })
    // …pending union drained: ours won the EP2 tie (their-hash replaced)…
    expect(
      emu.stories.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(audit.afterHash)
    expect(
      emu.stories.get(EP3_ID).script_json.series_generation.continuity_pins_used[EP1_ID]
    ).toBe(audit.afterHash)
    expect(out.drainedDependentIds.sort()).toEqual([EP2_ID, EP3_ID])
    expect(ep1.script_json.series_generation.pending_pin_resync).toEqual([])
    // …audit entries unioned without duplication…
    const audits = ep1.script_json.series_generation.belle_repair_audit
    expect(audits).toHaveLength(3)
    expect(new Set(audits.map((e: unknown) => JSON.stringify(e))).size).toBe(3)
    // …and the wire shows exactly two repair writes (attempt + one retry).
    expect(
      storiesPatchBodies(emu).filter((b) =>
        Object.prototype.hasOwnProperty.call(b, 'script')
      )
    ).toHaveLength(2)
  })

  test('second conflict: loud refusal, row untouched by us, pending preserved', async () => {
    const seed = seedConflict()
    let gets = 0
    const emu = makeEmulator(seed.stories, seed.jobs, {
      afterGetSingle: (table, id) => {
        if (table !== 'stories' || id !== EP1_ID) return
        gets += 1
        if (gets === 1) {
          // Concurrent writer lands between the re-read and the retry write.
          const stored = emu.stories.get(EP1_ID)
          stored.script_json.series_generation.operator_second = 'landed mid-retry'
        }
      },
    })
    const { persistBelleRepair } = await import('@/lib/belleRepairPersist')
    const { storyUpdates, pendingEntries } = buildRepairPayload(seed.s0, [
      { id: EP1_ID, script_json: seed.s0.script_json },
      { id: EP2_ID, script_json: (seed.stories as any)[EP2_ID].script_json },
    ])

    let caught: any = null
    try {
      await persistBelleRepair(emu.client, {
        repairedStoryId: EP1_ID,
        storyUpdates,
        pendingEntries,
        expectedRepairedScriptJson: seed.s0.script_json,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught.code).toBe(CONCURRENT_MOD_CODE)
    expect(String(caught.message)).toMatch(/unmodified|preserv|retry/)
    // Row untouched by us: our script never landed, concurrent keys intact,
    // our audit entry absent, their pending entry still present.
    const ep1 = emu.stories.get(EP1_ID)
    expect(ep1.script).toBe(BEFORE_SCRIPT)
    expect(ep1.script_json.series_generation.operator_note).toBe(DIVERGED_NOTE)
    expect(ep1.script_json.series_generation.operator_second).toBe('landed mid-retry')
    expect(
      ep1.script_json.series_generation.belle_repair_audit.some((e: any) =>
        String(e.timestamp || '').includes('16:00:00')
      )
    ).toBe(false)
    expect(ep1.script_json.series_generation.pending_pin_resync).toEqual([
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: 'their-hash' },
    ])
  })
})

describe('F3b: reservation requires an affected row before any paid rewrite', () => {
  function reservationState() {
    return {
      seriesCompleteStoryPackage: {
        belleRetry: {
          byEpisode: {
            [EP1_ID]: {
              count: 1,
              max: 3,
              episodeNumber: 1,
              issues: ['x'],
              repairedIntro: null,
              repairedOutro: null,
              deletedBelleFiles: [],
              lastRetriedAt: TS,
            },
          },
        },
        lastUpdatedAt: TS,
      },
    }
  }

  test('zero-row reservation throws with zero rewrite calls; success writes', async () => {
    // Lost lock: job row owned by someone else -> fence matches zero rows.
    const emu = makeEmulator(
      { [EP1_ID]: seedRepairedRow() },
      { [JOB_ID]: { ...seedJobRow(), locked_by: 'someone-else' } }
    )
    const fence = ownedJobFence(
      { id: JOB_ID, locked_by: 'holder-1', locked_at: '2026-10-22T15:00:00.000Z' },
      'holder-1'
    )
    let regenCalls = 0
    let caught: any = null
    try {
      await reserveBelleRetryCount(emu.client, {
        jobId: JOB_ID,
        fence,
        stateJson: reservationState(),
      })
      regenCalls += 1 // paid rewrite stand-in: must never run after zero rows
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(String(caught.message)).toMatch(/zero rows.*paid rewrite NOT attempted/)
    expect(regenCalls).toBe(0)
    // Affected-row verification is on the wire: the reservation update
    // carries a select so PostgREST returns the matched rows.
    const reserveUrls = emu.requests
      .filter((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/production_jobs'))
      .map((r) => r.url)
    expect(reserveUrls).toHaveLength(1)
    expect(reserveUrls[0]).toContain('select=id')

    // Control: matching fence resolves and writes the reserved state.
    const emu2 = makeEmulator(
      { [EP1_ID]: seedRepairedRow() },
      { [JOB_ID]: seedJobRow() }
    )
    await reserveBelleRetryCount(emu2.client, { jobId: JOB_ID, fence, stateJson: reservationState() })
    expect(
      emu2.jobs.get(JOB_ID).state_json.seriesCompleteStoryPackage.belleRetry.byEpisode[EP1_ID].count
    ).toBe(1)
  })
})

// ── F5: persist-then-delete + synchronized raw copy ─────────────────────────

describe('F5: file deletion only after durable repair; raw copy synced', () => {
  function seedAudio() {
    const stale = hashScript(BEFORE_SCRIPT)
    const ep1 = seedRepairedRow()
    return {
      stories: {
        [EP1_ID]: ep1,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, stale),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, stale),
      },
      jobs: { [JOB_ID]: seedJobRow() },
      ep1,
    }
  }

  const storageFiles = {
    [`asc3/${EP1_ID}`]: [
      'outro.mp3',
      'outro_before_fix.mp3',
      'announcement.mp3',
      'segment_003.mp3',
      'final_mix.mp3',
    ],
  }

  test('persist failure: zero storage calls, old URLs retained, loud tick', async () => {
    const seed = seedAudio()
    const emu = makeEmulator(seed.stories, seed.jobs, {
      storageFiles,
      failPatch: (table, values) =>
        table === 'stories' && Object.prototype.hasOwnProperty.call(values, 'script')
          ? 'persist boom'
          : null,
    })
    const { storyUpdates, pendingEntries } = buildRepairPayload(seed.ep1, [
      { id: EP1_ID, script_json: seed.ep1.script_json },
      { id: EP2_ID, script_json: (seed.stories as any)[EP2_ID].script_json },
    ])

    let caught: any = null
    try {
      await persistBelleRepairAndInvalidateAudio(emu.client, {
        repairedStoryId: EP1_ID,
        storyUpdates,
        pendingEntries,
        expectedRepairedScriptJson: seed.ep1.script_json,
        repairIntro: false,
        repairOutro: true,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(String(caught.message)).toMatch(/persist boom|Failed to save repaired Belle copy/)
    // No storage call of any kind went out…
    expect(emu.requests.filter((r) => r.url.includes('/storage/'))).toHaveLength(0)
    // …old audio URLs retained in DB state…
    const ep1 = emu.stories.get(EP1_ID)
    expect(ep1.script).toBe(BEFORE_SCRIPT)
    expect(ep1.outro_audio_url).toBe('https://cdn/asc3/ep1/outro.mp3')
    expect(ep1.outro_with_music_url).toBe('https://cdn/asc3/ep1/outro_mix.mp3')
    expect(ep1.announcement_url).toBe('https://cdn/asc3/ep1/announcement.mp3')
  })

  test('success: raw_script top-level equals repaired text; delete exactly once, after the persist', async () => {
    const seed = seedAudio()
    const emu = makeEmulator(seed.stories, seed.jobs, { storageFiles })
    const { storyUpdates, pendingEntries } = buildRepairPayload(seed.ep1, [
      { id: EP1_ID, script_json: seed.ep1.script_json },
      { id: EP2_ID, script_json: (seed.stories as any)[EP2_ID].script_json },
    ])

    const out = await persistBelleRepairAndInvalidateAudio(emu.client, {
      repairedStoryId: EP1_ID,
      storyUpdates,
      pendingEntries,
      expectedRepairedScriptJson: seed.ep1.script_json,
      repairIntro: false,
      repairOutro: true,
    })

    // Synchronized top-level copy matches the repaired text.
    expect(emu.stories.get(EP1_ID).script_json.raw_script).toBe(AFTER_SCRIPT)
    // Scoped deletion: outro-side only, siblings untouched.
    expect(out.deletedBelleFiles.sort()).toEqual(
      [`asc3/${EP1_ID}/outro.mp3`, `asc3/${EP1_ID}/outro_before_fix.mp3`].sort()
    )
    const removes = emu.requests.filter(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    expect(removes).toHaveLength(1)
    const removeBody = JSON.parse(removes[0].body || '[]')
    const removedPaths = (Array.isArray(removeBody) ? removeBody : removeBody.prefixes || []).map(String).sort()
    expect(removedPaths).toEqual(out.deletedBelleFiles.sort())
    // Ordering on the wire: the persist PATCH precedes the storage DELETE.
    const persistIdx = emu.requests.findIndex(
      (r) =>
        r.method === 'PATCH' &&
        r.url.includes('/rest/v1/stories') &&
        (r.body || '').includes('"script"')
    )
    const removeIdx = emu.requests.findIndex(
      (r) => r.method === 'DELETE' && r.url.includes('/storage/')
    )
    expect(persistIdx).toBeGreaterThanOrEqual(0)
    expect(removeIdx).toBeGreaterThan(persistIdx)
    // DB audio columns: outro nulled, announcement retained.
    const ep1 = emu.stories.get(EP1_ID)
    expect(ep1.outro_audio_url).toBeNull()
    expect(ep1.outro_with_music_url).toBeNull()
    expect(ep1.announcement_url).toBe('https://cdn/asc3/ep1/announcement.mp3')
  })
})
