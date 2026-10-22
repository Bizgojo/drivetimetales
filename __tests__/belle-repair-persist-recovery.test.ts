/**
 * BELLE-REPAIR-PERSIST-RECOVERY-001 regression tests (hardened).
 *
 * Proves the PRODUCTION persist path (lib/belleRepairPersist, called directly
 * by the run-next route — no re-composed mirror) with a call-logging FAKE
 * supabase client and programmable per-row failures. No DB, no LLM.
 *
 * Route-order harness (routeOrderTick) mirrors the CURRENT production entry
 * order in app/api/admin/production-jobs/run-next/route.ts:
 *   1. HOISTED drain-first (before validation-class gate + allowance guard):
 *      failed episode's row carries non-empty pending_pin_resync -> drain,
 *      requeue with NO rewrite / NO audio / NO attempt consumed.
 *   2. Validation-class gate (mirror of seriesBelleRetryTarget: every issue
 *      must be a Belle-position issue, so continuity_pin_mismatch -> null).
 *   3. Allowance guard (mirror of currentRetry < MAX_SERIES_BELLE_RETRIES).
 *   4. Attempt reservation: job-row count+1 persisted BEFORE the paid regen.
 *   5. Paid regen -> validation (failure keeps the reserved count, no second
 *      increment) -> atomic persist (CAS) -> audio invalidation AFTER the
 *      persist (persist-then-delete; a failed persist never strands audio).
 *
 * (i)   dep#1 pin write succeeds + dep#2 fails -> throw, dep#1 applied,
 *       repaired row keeps pending entry for dep#2 ONLY, script text
 *       written exactly once; then a recovery tick through route order
 *       completes dep#2 with ZERO regen calls, ZERO script-column writes,
 *       ZERO audio calls, pending cleared, attempt unconsumed.
 * (ii)  drain reachability: continuity-class failure (validation gate would
 *       reject) with pending present -> drain STILL runs; exhausted rewrite
 *       allowance (count == max) with pending present -> drain STILL runs,
 *       no rewrite attempted, count unchanged.
 * (iii) CAS: concurrent modification between drain's fresh read and its
 *       write -> safe refusal (pending retained, row unmodified, loud
 *       structured error, no regen/audio); pre-read unrelated metadata ->
 *       CAS write applies and unrelated keys preserved byte-for-byte.
 * (iv)  malformed pending -> LOUD structured failure (throws with code),
 *       nothing pruned, no rewrite, no regen, no audio.
 */
import {
  applyBelleRepairAudit,
  belleRepairAudioInvalidation,
  buildBelleRepairAuditEntry,
  resyncContinuityPinsAfterRepair,
} from '@/lib/belleValidation'
import {
  CONCURRENT_MOD_CODE,
  drainPendingPinResync,
  getPendingPinResync,
  MALFORMED_PENDING_CODE,
  persistBelleRepair,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import { hashScript } from '@/lib/continuityPin'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'
const JOB_ID = 'job-123'

/** Mirrors MAX_SERIES_BELLE_RETRIES in the run-next route. */
const MAX_RETRIES = 3

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

const BELLE_POSITION_ISSUES = ['EP1: non-finale outro must tease or point toward the next episode']
const CONTINUITY_ISSUES = ['continuity_pin_mismatch: 1 pin(s) failed. ep2 pin stale.']

// ── Fake supabase ────────────────────────────────────────────────────────────
// Supports the chains lib/belleRepairPersist + the route-order harness use:
//   .from(t).update(values).eq(k,v)[.eq...][.match(obj)] awaited -> { error }
//   .from(t).update(values).eq(k,v).eq(k,v).select(cols) -> { data, error }
//     (CAS terminal: data = matched-then-updated rows; [] = zero rows matched)
//   .from(t).select(cols).eq(k,v).single() -> { data, error }
// Reads return deep clones (DB snapshot semantics). Update application uses
// deep equality for object filter values (whole-doc jsonb CAS semantics).
// Failures programmable per update/select; afterSelect fires after a read
// clone is taken (simulates a concurrent writer landing between read+write).

interface Filter {
  col: string
  val: unknown
}

interface UpdateCall {
  table: string
  values: Record<string, unknown>
  filters: Filter[]
  withSelect: boolean
}

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function tryParseJsonFilter(val: unknown): unknown {
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return val
  }
}

function rowMatches(row: any, filters: Filter[]): boolean {
  if (!row || typeof row !== 'object') return false
  return filters.every((f) => {
    const v = (row as any)[f.col]
    if (v !== null && typeof v === 'object') {
      // PostgREST jsonb equality: the production client sends the snapshot
      // JSON-stringified (jsonbEqFilter — a raw object would encode as
      // eq.[object Object] and match nothing). Parse string filters back
      // before comparing, mirroring jsonb equality.
      return deepEq(v, tryParseJsonFilter(f.val))
    }
    if (f.val !== null && typeof f.val === 'object') return false
    return v === f.val
  })
}

function makeFakeSupabase(
  seedTables: Record<string, Record<string, any>>,
  opts: {
    failUpdate?: (table: string, values: Record<string, unknown>, filters: Filter[]) => string | null
    failSelect?: (table: string, key: Filter) => string | null
    afterSelect?: (table: string, id: string) => void
  } = {}
) {
  const tables = new Map<string, Map<string, any>>()
  for (const [table, rows] of Object.entries(seedTables || {})) {
    const store = new Map<string, any>()
    for (const [id, row] of Object.entries(rows || {})) {
      store.set(id, JSON.parse(JSON.stringify(row)))
    }
    tables.set(table, store)
  }
  const updateCalls: UpdateCall[] = []
  const selectCalls: { table: string; cols: string; key: Filter }[] = []
  const events: string[] = []
  const storeFor = (table: string): Map<string, any> => {
    let store = tables.get(table)
    if (!store) {
      store = new Map<string, any>()
      tables.set(table, store)
    }
    return store
  }
  const client = {
    tables,
    updateCalls,
    selectCalls,
    events,
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          const filters: Filter[] = []
          const apply = (withSelect: boolean): Promise<any> => {
            const key = filters.map((f) => `${f.col}=${JSON.stringify(f.val)}`).join('&')
            updateCalls.push({ table, values, filters: [...filters], withSelect })
            events.push(`update:${table}:${key}`)
            const failMsg = opts.failUpdate ? opts.failUpdate(table, values, [...filters]) : null
            if (failMsg) {
              return Promise.resolve(
                withSelect ? { data: null, error: { message: failMsg } } : { error: { message: failMsg } }
              )
            }
            const store = storeFor(table)
            const matched: any[] = []
            for (const [id, row] of store) {
              if (rowMatches(row, filters)) {
                const next = { ...row, ...JSON.parse(JSON.stringify(values)) }
                store.set(id, next)
                matched.push(JSON.parse(JSON.stringify(next)))
              }
            }
            if (withSelect) return Promise.resolve({ data: matched, error: null })
            return Promise.resolve({ error: null })
          }
          const builder: any = {
            eq(col: string, val: unknown) {
              filters.push({ col, val })
              return builder
            },
            match(obj: Record<string, unknown>) {
              for (const [col, val] of Object.entries(obj || {})) filters.push({ col, val })
              return builder
            },
            select(_cols: string) {
              return apply(true)
            },
            then(resolve: (v: any) => unknown, reject?: (e: any) => unknown) {
              return apply(false).then(resolve, reject)
            },
          }
          return builder
        },
        select(cols: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                single(): Promise<{ data: any; error: { message: string } | null }> {
                  const key = { col, val }
                  selectCalls.push({ table, cols, key })
                  const failMsg = opts.failSelect ? opts.failSelect(table, key) : null
                  if (failMsg) return Promise.resolve({ data: null, error: { message: failMsg } })
                  const row = storeFor(table).get(String(val))
                  if (!row) {
                    return Promise.resolve({ data: null, error: { message: '0 rows' } })
                  }
                  const clone = JSON.parse(JSON.stringify(row))
                  if (opts.afterSelect) opts.afterSelect(table, String(val))
                  return Promise.resolve({ data: clone, error: null })
                },
              }
            },
          }
        },
      }
    },
  }
  return client
}

type FakeClient = ReturnType<typeof makeFakeSupabase>;

// ── Seeds ────────────────────────────────────────────────────────────────────

function seedRepairedRow() {
  return {
    id: EP1_ID,
    script: BEFORE_SCRIPT,
    script_json: {
      brief: 'ep1 brief',
      top_level_qc: { checked: true },
      series_generation: {
        generated_title: 'Ep1',
        continuity_pins_used: { 'story-creek-ep0': 'abc123' },
        continuity_pin_recovery: { attempts: 2 },
        belle_repair_audit: [{ action: 'older_repair', timestamp: '2026-10-20T00:00:00.000Z' }],
        operator_note: 'do not touch',
        custom: { nested: [1, 2, { three: 3 }] },
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
        continuity_pin_recovery: { attempts: 0 },
        operator_flag: true,
      },
    },
  }
}

function seedJobRow(byEpisode: Record<string, any> = {}) {
  return {
    id: JOB_ID,
    status: 'failed',
    state_json: {
      seriesCompleteStoryPackage: {
        belleRetry: { byEpisode: JSON.parse(JSON.stringify(byEpisode)) },
      },
    },
    locked_by: 'holder-1',
  }
}

/**
 * Build the route-shaped atomic payload with the REAL helpers (mirrors the
 * run-next thin glue): audit entry + pending pin list embedded in the same
 * script_json, scoped audio nulls, repaired outro text.
 */
function buildRouteShapedParams(repairedRow: any, dependentRows: any[]) {
  const audit = buildBelleRepairAuditEntry({
    jobId: JOB_ID,
    storyId: EP1_ID,
    episodeNumber: 1,
    beforeScript: repairedRow.script,
    afterScript: AFTER_SCRIPT,
    repairedIntro: false,
    repairedOutro: true,
    at: '2026-10-22T15:30:00.000Z',
  })
  const withAudit = applyBelleRepairAudit(repairedRow.script_json, audit)
  const pendingEntries: PendingPinResyncEntry[] = resyncContinuityPinsAfterRepair(
    dependentRows,
    EP1_ID,
    audit.afterHash
  ).map((u) => ({
    dependentStoryId: String(u.id),
    priorStoryId: EP1_ID,
    newPinHash: String(audit.afterHash),
  }))
  const storyUpdates: Record<string, unknown> = {
    script: AFTER_SCRIPT,
    // Raw-script sync mirrors the production glue: top-level raw_script
    // moves with the repaired text.
    script_json: setPendingPinResync({ ...withAudit, raw_script: AFTER_SCRIPT }, pendingEntries),
    ...belleRepairAudioInvalidation(false, true),
    outro_text: 'repaired outro text',
  }
  return { audit, pendingEntries, storyUpdates }
}

// ── Route-order harness ──────────────────────────────────────────────────────
// Mirrors the CURRENT run-next entry order (hoisted drain-first -> validation
// gate -> allowance guard -> reserve-before-regen -> validate -> audio ->
// persist). Uses the REAL lib functions (getPendingPinResync,
// drainPendingPinResync, persistBelleRepair) with the fake client; regen /
// validation / audio are injected counters (paid-work stand-ins) so the test
// can assert ZERO paid calls on drain-only paths and reserve-before-regen
// ordering on full-repair paths.

function stripEpisodeIssuePrefixMirror(issue: string) {
  return String(issue || '').replace(/^EP\d+:\s*/i, '').trim()
}

/** Verbatim-subset mirror of isBellePositionIssue in the run-next route. */
function isBellePositionMirror(issue: string) {
  const text = stripEpisodeIssuePrefixMirror(issue).toLowerCase()
  return (
    /^intro text is missing/.test(text) ||
    /^outro text is missing/.test(text) ||
    /^intro must /.test(text) ||
    /^standalone intro /.test(text) ||
    /^series intro /.test(text) ||
    /^standalone outro /.test(text) ||
    /^non-finale outro /.test(text) ||
    /^finale outro /.test(text)
  )
}

interface TickPackageResult {
  success: false
  seriesId: string
  episode: { storyId: string; episodeNumber: number; title: string }
  contentIssues: string[]
}

function readJobCount(client: FakeClient, jobId: string, storyId: string): number {
  const job = client.tables.get('production_jobs')?.get(jobId)
  const byEp = job?.state_json?.seriesCompleteStoryPackage?.belleRetry?.byEpisode || {}
  return Number(byEp[storyId]?.count || 0)
}

function readJobEntry(client: FakeClient, jobId: string, storyId: string): any {
  const job = client.tables.get('production_jobs')?.get(jobId)
  return job?.state_json?.seriesCompleteStoryPackage?.belleRetry?.byEpisode?.[storyId]
}

async function writeJobEntry(client: FakeClient, jobId: string, storyId: string, entry: any): Promise<void> {
  const job = client.tables.get('production_jobs')?.get(jobId)
  if (!job) throw new Error(`harness: job ${jobId} missing`)
  const pkg =
    job.state_json.seriesCompleteStoryPackage ||
    (job.state_json.seriesCompleteStoryPackage = {})
  const br = pkg.belleRetry || (pkg.belleRetry = {})
  const byEp = br.byEpisode || (br.byEpisode = {})
  byEp[storyId] = JSON.parse(JSON.stringify(entry))
  await client
    .from('production_jobs')
    .update({ state_json: JSON.parse(JSON.stringify(job.state_json)) })
    .eq('id', jobId)
  client.events.push('reserve-write')
}

function countScriptWrites(client: FakeClient): number {
  return client.updateCalls.filter((c) => c.table === 'stories' && 'script' in (c.values as any)).length
}

interface TickOutcome {
  mode: 'drain-only' | 'full-repair' | 'no-retry' | 'exhausted'
  drained: string[]
  regenCalls: number
  audioCalls: number
  scriptWrites: number
  jobCount: number | null
}

async function routeOrderTick(
  client: FakeClient,
  jobId: string,
  result: TickPackageResult,
  deps: {
    regen: () => { introText: string; outroText: string }
    validate: (repairedScript: string) => { passed: boolean; issues: string[] }
    deleteAudio: () => string[]
    seriesEpisodes: any[]
  }
): Promise<TickOutcome> {
  let regenCalls = 0
  let audioCalls = 0
  const zeroes = () => ({
    drained: [] as string[],
    regenCalls,
    audioCalls,
    scriptWrites: countScriptWrites(client),
    jobCount: null as number | null,
  })

  // 1. HOISTED drain-first: before validation gate + allowance guard.
  const candidate = String(result?.episode?.storyId || '').trim()
  if (candidate) {
    const { data } = await client.from('stories').select('id,script_json').eq('id', candidate).single()
    if (data) {
      // Throws loudly (structured) on malformed pending — before any write.
      const pending = getPendingPinResync((data as any).script_json, candidate)
      if (pending.length > 0) {
        const drained = await drainPendingPinResync(client, candidate, pending)
        return {
          mode: 'drain-only',
          drained,
          regenCalls,
          audioCalls,
          scriptWrites: countScriptWrites(client),
          jobCount: readJobCount(client, jobId, candidate),
        }
      }
    }
  }

  // 2. Validation-class gate (mirror of seriesBelleRetryTarget).
  const issues = Array.isArray(result?.contentIssues) ? result.contentIssues.map(String) : []
  const storyId = String(result?.episode?.storyId || '').trim()
  const target =
    storyId && issues.length > 0 && issues.every(isBellePositionMirror)
      ? { storyId, episodeNumber: result.episode?.episodeNumber ?? null, issues }
      : null
  if (!target) return { mode: 'no-retry', ...zeroes() }

  // 3. Allowance guard.
  const currentRetry = readJobCount(client, jobId, target.storyId)
  if (!(currentRetry < MAX_RETRIES)) {
    return { mode: 'exhausted', ...zeroes(), jobCount: currentRetry }
  }

  // 4. Attempt reservation BEFORE paid work (mirrors the production_jobs
  // state_json write that precedes regenerateSeriesBelleFromFeedback).
  const reserved = currentRetry + 1
  await writeJobEntry(client, jobId, target.storyId, {
    count: reserved,
    max: MAX_RETRIES,
    episodeNumber: target.episodeNumber,
    issues: target.issues,
    repairedIntro: null,
    repairedOutro: null,
    deletedBelleFiles: [],
    lastRetriedAt: '2026-10-22T15:30:00.000Z',
  })

  // 5. Paid rewrite.
  const regenOut = deps.regen()
  regenCalls += 1
  client.events.push('regen')

  // 6. Validation of the repaired text (keeps the reserved count on failure).
  const { data: targetStory } = await client
    .from('stories')
    .select('id,script,script_json')
    .eq('id', target.storyId)
    .single()
  let repairedScript = String((targetStory as any)?.script || '')
  if (regenOut.outroText) {
    repairedScript = repairedScript.replace(/BELLE B OUTRO:.*$/s, `BELLE B OUTRO: ${regenOut.outroText}`)
  }
  const validation = deps.validate(repairedScript)
  if (!validation.passed) {
    await writeJobEntry(client, jobId, target.storyId, {
      count: reserved,
      max: MAX_RETRIES,
      episodeNumber: target.episodeNumber,
      issues: validation.issues,
      repairedIntro: null,
      repairedOutro: null,
      deletedBelleFiles: [],
      lastRetriedAt: '2026-10-22T15:30:00.000Z',
    })
    const err = new Error(`Belle retry produced invalid copy: ${validation.issues.join('; ')}`)
    ;(err as Error & { tickMode?: string }).tickMode = 'validation-failed'
    throw err
  }

  // 7. Atomic persist (CAS on the pre-repair snapshot) THEN audio
  // invalidation (thin glue, real lib). Production order is
  // persist-then-delete: a failed persist never strands deleted audio.
  const audit = buildBelleRepairAuditEntry({
    jobId,
    storyId: target.storyId,
    episodeNumber: Number(target.episodeNumber ?? 1),
    beforeScript: String((targetStory as any)?.script || ''),
    afterScript: repairedScript,
    repairedIntro: false,
    repairedOutro: true,
    at: '2026-10-22T15:30:00.000Z',
  })
  const withAudit = applyBelleRepairAudit((targetStory as any)?.script_json, audit)
  const withRawSync = { ...withAudit, raw_script: repairedScript }
  const pendingEntries: PendingPinResyncEntry[] = resyncContinuityPinsAfterRepair(
    deps.seriesEpisodes,
    target.storyId,
    audit.afterHash
  ).map((u) => ({
    dependentStoryId: String(u.id),
    priorStoryId: target.storyId,
    newPinHash: String(audit.afterHash),
  }))
  const preRepairSnapshot = JSON.parse(JSON.stringify((targetStory as any)?.script_json))
  await persistBelleRepair(client, {
    repairedStoryId: target.storyId,
    storyUpdates: {
      script: repairedScript,
      script_json: setPendingPinResync(withRawSync, pendingEntries),
      ...belleRepairAudioInvalidation(false, true),
    },
    pendingEntries,
    expectedRepairedScriptJson: preRepairSnapshot,
  })
  const deleted = deps.deleteAudio()
  audioCalls += 1
  client.events.push('audio')
  await writeJobEntry(client, jobId, target.storyId, {
    count: reserved,
    max: MAX_RETRIES,
    episodeNumber: target.episodeNumber,
    issues: target.issues,
    repairedIntro: null,
    repairedOutro: 'repaired outro text',
    deletedBelleFiles: deleted,
    lastRetriedAt: '2026-10-22T15:30:00.000Z',
  })
  return {
    mode: 'full-repair',
    drained: pendingEntries.map((e) => e.dependentStoryId),
    regenCalls,
    audioCalls,
    scriptWrites: countScriptWrites(client),
    jobCount: readJobCount(client, jobId, target.storyId),
  }
}

describe('partial resync + recovery through route order (i)', () => {
  test('dep#2 write failure throws; dep#1 applied; pending keeps dep#2 ONLY; script written once', async () => {
    const staleHash = hashScript(BEFORE_SCRIPT)
    const repairedRow = seedRepairedRow()
    const dep2 = seedDependentRow(EP2_ID, EP1_ID, staleHash)
    const dep3 = seedDependentRow(EP3_ID, EP1_ID, staleHash)
    const { audit, pendingEntries, storyUpdates } = buildRouteShapedParams(repairedRow, [
      { id: EP1_ID, script_json: repairedRow.script_json },
      dep2,
      dep3,
    ])
    expect(pendingEntries.map((e) => e.dependentStoryId).sort()).toEqual([EP2_ID, EP3_ID])

    const fake = makeFakeSupabase(
      { stories: { [EP1_ID]: repairedRow, [EP2_ID]: dep2, [EP3_ID]: dep3 } },
      {
        // Fail ONLY dep#2's CAS pin write (script_json-only update on EP3_ID).
        // The atomic repaired-row write (carries `script`) and the prune
        // write (targets EP1_ID) must succeed.
        failUpdate: (_table, values, filters) =>
          !('script' in values) && filters.some((f) => f.col === 'id' && f.val === EP3_ID)
            ? 'pin write boom'
            : null,
      }
    )

    await expect(
      persistBelleRepair(fake, {
        repairedStoryId: EP1_ID,
        storyUpdates,
        pendingEntries,
        expectedRepairedScriptJson: repairedRow.script_json,
      })
    ).rejects.toThrow(/story-creek-ep3.*pending list intact/)

    // Dep#1 applied: pin moved to the new hash (CAS matched, row written).
    const dep2After = fake.tables.get('stories')!.get(EP2_ID)
    expect(dep2After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(audit.afterHash)
    // Dep#2 untouched: still stale.
    const dep3After = fake.tables.get('stories')!.get(EP3_ID)
    expect(dep3After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(staleHash)

    // Repaired row: script written, audit appended once, pending keeps ONLY dep#2.
    const ep1After = fake.tables.get('stories')!.get(EP1_ID)
    expect(ep1After.script).toBe(AFTER_SCRIPT)
    expect(ep1After.script_json.raw_script).toBe(AFTER_SCRIPT)
    expect(ep1After.script_json.series_generation.belle_repair_audit).toHaveLength(2)
    const pendingAfter = getPendingPinResync(ep1After.script_json, EP1_ID)
    expect(pendingAfter).toHaveLength(1)
    expect(pendingAfter[0]).toEqual({ dependentStoryId: EP3_ID, priorStoryId: EP1_ID, newPinHash: audit.afterHash })

    // Script COLUMN written exactly once (atomic write only; CAS pin writes
    // and prune are script_json-only).
    expect(countScriptWrites(fake)).toBe(1)
  })

  test('recovery tick completes dep#2 with ZERO regen / rewrite / audio calls; pending cleared; attempt unconsumed', async () => {
    const staleHash = hashScript(BEFORE_SCRIPT)
    const newHash = hashScript(AFTER_SCRIPT)
    // Post-failure DB state: ep1 repaired + pending [dep3], dep#1 resynced.
    const repairedRow = seedRepairedRow()
    repairedRow.script = AFTER_SCRIPT
    const auditEntry = buildBelleRepairAuditEntry({
      jobId: JOB_ID,
      storyId: EP1_ID,
      episodeNumber: 1,
      beforeScript: BEFORE_SCRIPT,
      afterScript: AFTER_SCRIPT,
      repairedIntro: false,
      repairedOutro: true,
      at: '2026-10-22T15:30:00.000Z',
    })
    repairedRow.script_json = setPendingPinResync(applyBelleRepairAudit(repairedRow.script_json, auditEntry), [
      { dependentStoryId: EP3_ID, priorStoryId: EP1_ID, newPinHash: newHash },
    ])
    const dep2 = seedDependentRow(EP2_ID, EP1_ID, newHash)
    const dep3 = seedDependentRow(EP3_ID, EP1_ID, staleHash)

    const fake = makeFakeSupabase({
      stories: { [EP1_ID]: repairedRow, [EP2_ID]: dep2, [EP3_ID]: dep3 },
      production_jobs: { [JOB_ID]: seedJobRow() },
    })
    let regenCalls = 0
    let audioCalls = 0
    const out = await routeOrderTick(
      fake,
      JOB_ID,
      { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
      {
        regen: () => {
          regenCalls += 1
          return { introText: '', outroText: 'must never be used' }
        },
        validate: () => ({ passed: true, issues: [] }),
        deleteAudio: () => {
          audioCalls += 1
          return ['asc3/' + EP1_ID + '/outro.mp3']
        },
        seriesEpisodes: [],
      }
    )

    expect(out.mode).toBe('drain-only')
    expect(out.drained).toEqual([EP3_ID])
    // NO rewrite/LLM-equivalent call on the recovery path.
    expect(regenCalls).toBe(0)
    expect(out.regenCalls).toBe(0)
    // NO audio regeneration on the recovery path.
    expect(audioCalls).toBe(0)
    expect(out.audioCalls).toBe(0)
    // NO second script-text write: zero `script`-column updates during recovery.
    expect(out.scriptWrites).toBe(0)
    // Audit NOT appended a second time.
    const ep1After = fake.tables.get('stories')!.get(EP1_ID)
    expect(ep1After.script_json.series_generation.belle_repair_audit).toHaveLength(2)
    // Dep#2 drained, pending cleared, attempt NOT consumed.
    expect(fake.tables.get('stories')!.get(EP3_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(newHash)
    expect(getPendingPinResync(ep1After.script_json, EP1_ID)).toEqual([])
    expect(out.jobCount).toBe(0)
  })
})

describe('drain reachability: failure class + allowance independence (ii)', () => {
  function seedPendingDb() {
    const newHash = hashScript(AFTER_SCRIPT)
    const repairedRow = seedRepairedRow()
    repairedRow.script = AFTER_SCRIPT
    repairedRow.script_json = setPendingPinResync(repairedRow.script_json, [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: newHash },
    ])
    const staleHash = hashScript(BEFORE_SCRIPT)
    return {
      newHash,
      tables: {
        stories: {
          [EP1_ID]: repairedRow,
          [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, staleHash),
          [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, staleHash),
        },
      },
    }
  }

  test('continuity_pin_mismatch failure (validation gate rejects) with pending present -> drain STILL runs, no rewrite', async () => {
    const { newHash, tables } = seedPendingDb()
    const fake = makeFakeSupabase({
      ...tables,
      production_jobs: { [JOB_ID]: seedJobRow() },
    })
    let regenCalls = 0
    let audioCalls = 0
    const out = await routeOrderTick(
      fake,
      JOB_ID,
      { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: CONTINUITY_ISSUES },
      {
        regen: () => {
          regenCalls += 1
          return { introText: '', outroText: 'x' }
        },
        validate: () => ({ passed: true, issues: [] }),
        deleteAudio: () => {
          audioCalls += 1
          return []
        },
        seriesEpisodes: [],
      }
    )
    // The validation-class gate would reject this failure (not Belle-position)
    // yet the hoisted drain runs first and completes.
    expect(out.mode).toBe('drain-only')
    expect(out.drained).toEqual([EP2_ID])
    expect(regenCalls).toBe(0)
    expect(audioCalls).toBe(0)
    expect(out.scriptWrites).toBe(0)
    expect(fake.tables.get('stories')!.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(newHash)
    expect(getPendingPinResync(fake.tables.get('stories')!.get(EP1_ID).script_json, EP1_ID)).toEqual([])
    expect(out.jobCount).toBe(0)
  })

  test('exhausted rewrite allowance (count == max) with pending present -> drain STILL runs, no rewrite, count unchanged', async () => {
    const { newHash, tables } = seedPendingDb()
    const fake = makeFakeSupabase({
      ...tables,
      production_jobs: { [JOB_ID]: seedJobRow({ [EP1_ID]: { count: MAX_RETRIES, max: MAX_RETRIES } }) },
    })
    let regenCalls = 0
    let audioCalls = 0
    const out = await routeOrderTick(
      fake,
      JOB_ID,
      { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
      {
        regen: () => {
          regenCalls += 1
          return { introText: '', outroText: 'x' }
        },
        validate: () => ({ passed: true, issues: [] }),
        deleteAudio: () => {
          audioCalls += 1
          return []
        },
        seriesEpisodes: [],
      }
    )
    // The allowance guard would refuse another rewrite (count == max) yet the
    // hoisted drain-first block runs outside that guard.
    expect(out.mode).toBe('drain-only')
    expect(out.drained).toEqual([EP2_ID])
    expect(regenCalls).toBe(0)
    expect(audioCalls).toBe(0)
    expect(out.scriptWrites).toBe(0)
    expect(fake.tables.get('stories')!.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(newHash)
    expect(getPendingPinResync(fake.tables.get('stories')!.get(EP1_ID).script_json, EP1_ID)).toEqual([])
    expect(out.jobCount).toBe(MAX_RETRIES)
  })
})

describe('attempt reservation before paid work', () => {
  function seedCleanDb() {
    const staleHash = hashScript(BEFORE_SCRIPT)
    return {
      stories: {
        [EP1_ID]: seedRepairedRow(),
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, staleHash),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, staleHash),
      },
      production_jobs: { [JOB_ID]: seedJobRow() },
    }
  }

  function fullRepairDeps() {
    return {
      regen: () => ({ introText: '', outroText: 'repaired outro text' }),
      validate: () => ({ passed: true, issues: [] as string[] }),
      deleteAudio: () => ['asc3/' + EP1_ID + '/outro.mp3'],
      seriesEpisodes: [] as any[],
    }
  }

  test('reservation write precedes regen; success keeps the reserved count (no double increment)', async () => {
    const seed = seedCleanDb()
    const fake = makeFakeSupabase(seed)
    const deps = fullRepairDeps()
    deps.seriesEpisodes = [
      { id: EP1_ID, script_json: seed.stories[EP1_ID].script_json },
      { id: EP2_ID, script_json: seed.stories[EP2_ID].script_json },
      { id: EP3_ID, script_json: seed.stories[EP3_ID].script_json },
    ]
    const out = await routeOrderTick(
      fake,
      JOB_ID,
      { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
      deps
    )
    expect(out.mode).toBe('full-repair')
    // Reserve-before-regen ordering on the shared event log.
    const reserveIdx = fake.events.indexOf('reserve-write')
    const regenIdx = fake.events.indexOf('regen')
    expect(reserveIdx).toBeGreaterThanOrEqual(0)
    expect(regenIdx).toBeGreaterThanOrEqual(0)
    expect(reserveIdx).toBeLessThan(regenIdx)
    // Success keeps the reserved count exactly once: 0 -> 1, never 2.
    expect(out.jobCount).toBe(1)
    expect(readJobCount(fake, JOB_ID, EP1_ID)).toBe(1)
    expect(out.regenCalls).toBe(1)
    expect(out.audioCalls).toBe(1)
    expect(out.scriptWrites).toBe(1)
    expect(getPendingPinResync(fake.tables.get('stories')!.get(EP1_ID).script_json, EP1_ID)).toEqual([])
  })

  test('validation failure keeps the reserved count (no second increment); no persist, no audio', async () => {
    const seed = seedCleanDb()
    const fake = makeFakeSupabase(seed)
    const deps = fullRepairDeps()
    deps.seriesEpisodes = [
      { id: EP1_ID, script_json: seed.stories[EP1_ID].script_json },
      { id: EP2_ID, script_json: seed.stories[EP2_ID].script_json },
    ]
    deps.validate = () => ({ passed: false, issues: ['repaired outro still flat'] })
    await expect(
      routeOrderTick(
        fake,
        JOB_ID,
        { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
        deps
      )
    ).rejects.toThrow(/Belle retry produced invalid copy/)
    // Reserved once before regen; validation failure reuses it (still 1).
    const entry = readJobEntry(fake, JOB_ID, EP1_ID)
    expect(entry.count).toBe(1)
    expect(entry.issues).toEqual(['repaired outro still flat'])
    // Paid regen ran once; persist + audio never ran.
    expect(fake.events.filter((e) => e === 'regen')).toHaveLength(1)
    expect(fake.events.filter((e) => e === 'audio')).toHaveLength(0)
    expect(countScriptWrites(fake)).toBe(0)
    expect(fake.tables.get('stories')!.get(EP1_ID).script).toBe(BEFORE_SCRIPT)
  })
})

describe('CAS concurrent modification (iii)', () => {
  function seedPendingTwoDeps() {
    const newHash = hashScript(AFTER_SCRIPT)
    const staleHash = hashScript(BEFORE_SCRIPT)
    const repairedRow = seedRepairedRow()
    repairedRow.script = AFTER_SCRIPT
    repairedRow.script_json = setPendingPinResync(repairedRow.script_json, [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: newHash },
      { dependentStoryId: EP3_ID, priorStoryId: EP1_ID, newPinHash: newHash },
    ])
    return {
      newHash,
      staleHash,
      stories: {
        [EP1_ID]: repairedRow,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, staleHash),
        [EP3_ID]: seedDependentRow(EP3_ID, EP1_ID, staleHash),
      },
      production_jobs: { [JOB_ID]: seedJobRow() },
    }
  }

  function drainOnlyDeps() {
    return {
      regen: () => {
        throw new Error('harness: regen must not run on a drain path')
      },
      validate: () => ({ passed: true, issues: [] as string[] }),
      deleteAudio: () => {
        throw new Error('harness: audio must not run on a drain path')
      },
      seriesEpisodes: [] as any[],
    }
  }

  test('row changed between drain read and write -> safe refusal: pending retained, row unmodified, loud error, no paid calls', async () => {
    const { staleHash, stories, production_jobs } = seedPendingTwoDeps()
    const holder: { fake?: FakeClient } = {}
    let mutated = false
    const fake = makeFakeSupabase(
      { stories, production_jobs },
      {
        // Concurrent writer lands AFTER the drain's fresh read of EP2 but
        // BEFORE its CAS write (touches an UNRELATED key only).
        afterSelect: (table, id) => {
          if (!mutated && table === 'stories' && id === EP2_ID) {
            mutated = true
            const stored = holder.fake!.tables.get('stories')!.get(EP2_ID)
            stored.script_json.series_generation.operator_note = 'concurrent edit'
          }
        },
      }
    )
    holder.fake = fake

    let caught: any = null
    try {
      await routeOrderTick(
        fake,
        JOB_ID,
        { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
        drainOnlyDeps()
      )
    } catch (err) {
      caught = err
    }
    expect(mutated).toBe(true)
    expect(caught).not.toBeNull()
    expect(String(caught.message)).toMatch(/concurrent modification|Refused Belle pin resync/)
    expect(caught.code).toBe(CONCURRENT_MOD_CODE)

    // Pending entry RETAINED (both: refused EP2 + not-yet-drained EP3).
    const pendingAfter = getPendingPinResync(fake.tables.get('stories')!.get(EP1_ID).script_json, EP1_ID)
    expect(pendingAfter.map((e) => e.dependentStoryId).sort()).toEqual([EP2_ID, EP3_ID])
    // Dependent row UNMODIFIED by the drain: pin still stale, and the
    // concurrent writer's unrelated key was NOT clobbered.
    const dep2After = fake.tables.get('stories')!.get(EP2_ID)
    expect(dep2After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(staleHash)
    expect(dep2After.script_json.series_generation.operator_note).toBe('concurrent edit')
    // Repaired row untouched; no rewrite, no regen, no audio, no attempt.
    expect(fake.tables.get('stories')!.get(EP1_ID).script).toBe(AFTER_SCRIPT)
    expect(countScriptWrites(fake)).toBe(0)
    expect(fake.events.filter((e) => e === 'regen')).toHaveLength(0)
    expect(fake.events.filter((e) => e === 'audio')).toHaveLength(0)
    expect(readJobCount(fake, JOB_ID, EP1_ID)).toBe(0)
  })

  test('stable row with pre-existing unrelated metadata -> CAS applies; unrelated keys preserved byte-for-byte', async () => {
    const { newHash, stories, production_jobs } = seedPendingTwoDeps()
    // Unrelated concurrent metadata present BEFORE the drain's fresh read.
    stories[EP2_ID].script_json.series_generation.operator_note = 'operator was here'
    stories[EP2_ID].script_json.extra_top_level = { keep: [1, 2, 3] }
    const beforeUnrelated = JSON.parse(
      JSON.stringify({
        note: stories[EP2_ID].script_json.series_generation.operator_note,
        extra: stories[EP2_ID].script_json.extra_top_level,
        viewer: stories[EP2_ID].script_json.viewer_state,
        recovery: stories[EP2_ID].script_json.series_generation.continuity_pin_recovery,
      })
    )
    const fake = makeFakeSupabase({ stories, production_jobs })
    const out = await routeOrderTick(
      fake,
      JOB_ID,
      { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
      drainOnlyDeps()
    )
    expect(out.mode).toBe('drain-only')
    expect(out.drained.sort()).toEqual([EP2_ID, EP3_ID])
    const dep2After = fake.tables.get('stories')!.get(EP2_ID)
    expect(dep2After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(newHash)
    expect(dep2After.script_json.series_generation.operator_note).toEqual(beforeUnrelated.note)
    expect(dep2After.script_json.extra_top_level).toEqual(beforeUnrelated.extra)
    expect(dep2After.script_json.viewer_state).toEqual(beforeUnrelated.viewer)
    expect(dep2After.script_json.series_generation.continuity_pin_recovery).toEqual(beforeUnrelated.recovery)
    expect(getPendingPinResync(fake.tables.get('stories')!.get(EP1_ID).script_json, EP1_ID)).toEqual([])
    expect(out.regenCalls).toBe(0)
    expect(out.audioCalls).toBe(0)
    expect(out.scriptWrites).toBe(0)
  })
})

describe('malformed pending is a loud failure (iv)', () => {
  test('getPendingPinResync throws a structured error on malformed shapes', async () => {
    // Absent -> [] (normal empty state, never throws).
    expect(getPendingPinResync(null)).toEqual([])
    expect(getPendingPinResync(undefined)).toEqual([])
    expect(getPendingPinResync({})).toEqual([])
    expect(getPendingPinResync({ series_generation: {} })).toEqual([])
    expect(getPendingPinResync({ series_generation: { pending_pin_resync: undefined } })).toEqual([])
    expect(getPendingPinResync({ series_generation: { pending_pin_resync: [] } })).toEqual([])

    // Present-but-malformed -> LOUD structured throw.
    const badContainers = ['oops', 42, { not: 'an array' }, null, true]
    for (const container of badContainers) {
      let caught: any = null
      try {
        getPendingPinResync({ series_generation: { pending_pin_resync: container } }, EP1_ID)
      } catch (err) {
        caught = err
      }
      expect(caught).not.toBeNull()
      expect(caught.code).toBe(MALFORMED_PENDING_CODE)
      expect(String(caught.message)).toMatch(/Malformed Belle pending_pin_resync.*story-creek-ep1/)
    }
    const badEntries: any[] = [
      [{ dependentStoryId: EP2_ID }],
      [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID }],
      [{ dependentStoryId: '', priorStoryId: EP1_ID, newPinHash: 'h' }],
      [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: '   ' }],
      ['not-an-object'],
      [null],
    ]
    for (const entries of badEntries) {
      let caught: any = null
      try {
        getPendingPinResync({ series_generation: { pending_pin_resync: entries } }, EP1_ID)
      } catch (err) {
        caught = err
      }
      expect(caught).not.toBeNull()
      expect(caught.code).toBe(MALFORMED_PENDING_CODE)
    }
    // Well-formed still reads.
    expect(
      getPendingPinResync(
        { series_generation: { pending_pin_resync: [{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: 'h' }] } },
        EP1_ID
      )
    ).toEqual([{ dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: 'h' }])
  })

  test('route-order tick with malformed pending fails loudly: nothing pruned, no rewrite, no regen, no audio', async () => {
    const repairedRow = seedRepairedRow()
    repairedRow.script = AFTER_SCRIPT
    const beforeJson = JSON.parse(
      JSON.stringify({
        ...repairedRow.script_json,
        series_generation: {
          ...repairedRow.script_json.series_generation,
          pending_pin_resync: 'oops',
        },
      })
    )
    repairedRow.script_json = beforeJson
    const staleHash = hashScript(BEFORE_SCRIPT)
    const fake = makeFakeSupabase({
      stories: {
        [EP1_ID]: repairedRow,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, staleHash),
      },
      production_jobs: { [JOB_ID]: seedJobRow() },
    })
    let regenCalls = 0
    let audioCalls = 0
    let caught: any = null
    try {
      await routeOrderTick(
        fake,
        JOB_ID,
        { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: BELLE_POSITION_ISSUES },
        {
          regen: () => {
            regenCalls += 1
            return { introText: '', outroText: 'x' }
          },
          validate: () => ({ passed: true, issues: [] }),
          deleteAudio: () => {
            audioCalls += 1
            return []
          },
          seriesEpisodes: [],
        }
      )
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught.code).toBe(MALFORMED_PENDING_CODE)
    // Pending data PRESERVED byte-for-byte (nothing pruned).
    expect(fake.tables.get('stories')!.get(EP1_ID).script_json).toEqual(beforeJson)
    // No rewrite attempted: zero script-column writes, zero regen, zero audio.
    expect(countScriptWrites(fake)).toBe(0)
    expect(regenCalls).toBe(0)
    expect(audioCalls).toBe(0)
    // Dependent untouched.
    expect(fake.tables.get('stories')!.get(EP2_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(staleHash)
  })

  test('route-order tick with entry missing newPinHash fails loudly with pending intact', async () => {
    const repairedRow = seedRepairedRow()
    repairedRow.script_json = setPendingPinResync(repairedRow.script_json, [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID, newPinHash: '' },
    ]) as any
    // Corrupt one entry past the pure setter (missing newPinHash entirely).
    repairedRow.script_json.series_generation.pending_pin_resync = [
      { dependentStoryId: EP2_ID, priorStoryId: EP1_ID },
    ]
    const beforeJson = JSON.parse(JSON.stringify(repairedRow.script_json))
    const staleHash = hashScript(BEFORE_SCRIPT)
    const fake = makeFakeSupabase({
      stories: {
        [EP1_ID]: repairedRow,
        [EP2_ID]: seedDependentRow(EP2_ID, EP1_ID, staleHash),
      },
      production_jobs: { [JOB_ID]: seedJobRow() },
    })
    let caught: any = null
    try {
      await routeOrderTick(
        fake,
        JOB_ID,
        { success: false, seriesId: 'series-creek', episode: { storyId: EP1_ID, episodeNumber: 1, title: 'Ep1' }, contentIssues: CONTINUITY_ISSUES },
        {
          regen: () => ({ introText: '', outroText: 'x' }),
          validate: () => ({ passed: true, issues: [] }),
          deleteAudio: () => [],
          seriesEpisodes: [],
        }
      )
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught.code).toBe(MALFORMED_PENDING_CODE)
    expect(String(caught.message)).toMatch(/entry \[0\].*newPinHash/)
    expect(fake.tables.get('stories')!.get(EP1_ID).script_json).toEqual(beforeJson)
    expect(countScriptWrites(fake)).toBe(0)
  })
})

describe('empty pending drain', () => {
  test('zero entries means zero DB calls', async () => {
    const fake = makeFakeSupabase({ stories: { [EP1_ID]: seedRepairedRow() } })
    const drained = await drainPendingPinResync(fake, EP1_ID, [])
    expect(drained).toEqual([])
    expect(fake.updateCalls).toHaveLength(0)
    expect(fake.selectCalls).toHaveLength(0)
  })
})
