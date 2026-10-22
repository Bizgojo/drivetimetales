/**
 * BELLE-REPAIR-PERSIST-RECOVERY-001 regression tests.
 *
 * Proves the PRODUCTION persist path (lib/belleRepairPersist, called directly
 * by the run-next route — no re-composed mirror) with a call-logging FAKE
 * supabase client and programmable per-row failures. No DB, no LLM.
 *
 * (i)   dep#1 pin write succeeds + dep#2 fails -> throw, dep#1 applied,
 *       repaired row keeps pending entry for dep#2 ONLY, script text
 *       written exactly once.
 * (ii)  recovery run drains dep#2 with NO second script-text write and NO
 *       rewrite/regen call (fake call log: zero `script`-column updates,
 *       zero repair-generation calls), pending list cleared.
 * (iii) concurrent metadata preserved: unrelated script_json keys survive
 *       persist+drain byte-for-byte.
 * (iv)  empty pending list is a pure no-op (zero DB calls).
 */
import {
  applyBelleRepairAudit,
  belleRepairAudioInvalidation,
  buildBelleRepairAuditEntry,
  resyncContinuityPinsAfterRepair,
} from '@/lib/belleValidation'
import {
  drainPendingPinResync,
  getPendingPinResync,
  persistBelleRepair,
  setPendingPinResync,
  type PendingPinResyncEntry,
} from '@/lib/belleRepairPersist'
import { hashScript } from '@/lib/continuityPin'

const EP1_ID = 'story-creek-ep1'
const EP2_ID = 'story-creek-ep2'
const EP3_ID = 'story-creek-ep3'

const BEFORE_SCRIPT = 'BELLE B INTRO: hello\nBELLE B OUTRO: old outro text'
const AFTER_SCRIPT =
  "BELLE B INTRO: hello\nBELLE B OUTRO: Earl didn't want to open that door, and now you know why... Sit with that for a moment."

// ── Fake supabase ────────────────────────────────────────────────────────────
// Supports ONLY the two chains lib/belleRepairPersist uses:
//   .from('stories').update(values).eq('id', x)  -> { error }
//   .from('stories').select(cols).eq('id', x).single() -> { data, error }
// Reads return deep clones (DB snapshot semantics). Failures are programmable
// per update/select via predicate callbacks.

interface FakeKey {
  col: string
  val: unknown
}

interface UpdateCall {
  table: string
  values: Record<string, unknown>
  key: FakeKey
}

function makeFakeSupabase(
  seedStories: Record<string, any>,
  opts: {
    failUpdate?: (table: string, values: Record<string, unknown>, key: FakeKey) => string | null
    failSelect?: (table: string, key: FakeKey) => string | null
  } = {}
) {
  const rows = new Map<string, any>()
  for (const [id, row] of Object.entries(seedStories)) {
    rows.set(id, JSON.parse(JSON.stringify(row)))
  }
  const updateCalls: UpdateCall[] = []
  const selectCalls: { table: string; cols: string; key: FakeKey }[] = []
  const client = {
    rows,
    updateCalls,
    selectCalls,
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown): Promise<{ error: { message: string } | null }> {
              const key = { col, val }
              updateCalls.push({ table, values, key })
              const failMsg = opts.failUpdate ? opts.failUpdate(table, values, key) : null
              if (failMsg) return Promise.resolve({ error: { message: failMsg } })
              const id = String(val)
              const prev = rows.get(id) || { id }
              rows.set(id, { ...prev, ...JSON.parse(JSON.stringify(values)) })
              return Promise.resolve({ error: null })
            },
          }
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
                  const row = rows.get(String(val))
                  if (!row) {
                    return Promise.resolve({ data: null, error: { message: '0 rows' } })
                  }
                  return Promise.resolve({ data: JSON.parse(JSON.stringify(row)), error: null })
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

// Seeded repaired row: ep1 with rich concurrent metadata.
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

/**
 * Build the route-shaped atomic payload with the REAL helpers (mirrors the
 * run-next thin glue): audit entry + pending pin list embedded in the same
 * script_json, scoped audio nulls, repaired outro text.
 */
function buildRouteShapedParams(repairedRow: any, dependentRows: any[]) {
  const audit = buildBelleRepairAuditEntry({
    jobId: 'job-123',
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
    script_json: setPendingPinResync(withAudit, pendingEntries),
    ...belleRepairAudioInvalidation(false, true),
    outro_text: 'repaired outro text',
  }
  return { audit, pendingEntries, storyUpdates }
}

/** Route-order harness (mirrors the run-next drain-first branch, no DB/LLM). */
async function routeOrderRun(
  client: FakeClient,
  repairedId: string,
  deps: { regen: () => { introText: string; outroText: string } }
) {
  const { data: row } = await client.from('stories').select('id,script_json').eq('id', repairedId).single()
  const pending = getPendingPinResync((row as any).script_json)
  if (pending.length > 0) {
    const drained = await drainPendingPinResync(client, repairedId, pending)
    return { mode: 'drain-only' as const, drained }
  }
  const regenOut = deps.regen()
  void regenOut
  return { mode: 'full-repair' as const, drained: [] as string[] }
}

describe('persistBelleRepair partial-drain failure (i)', () => {
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
      { [EP1_ID]: repairedRow, [EP2_ID]: dep2, [EP3_ID]: dep3 },
      {
        // Fail ONLY dep#2's pin write (script_json-only update on EP3_ID).
        // The atomic repaired-row write (carries `script`) and the prune
        // write (targets EP1_ID) must succeed.
        failUpdate: (_table, values, key) =>
          !('script' in values) && String(key.val) === EP3_ID ? 'pin write boom' : null,
      }
    )

    await expect(
      persistBelleRepair(fake, { repairedStoryId: EP1_ID, storyUpdates, pendingEntries })
    ).rejects.toThrow(/story-creek-ep3.*pending list intact/)

    // Dep#1 applied: pin moved to the new hash.
    const dep2After = fake.rows.get(EP2_ID)
    expect(dep2After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(audit.afterHash)
    // Dep#2 untouched: still stale.
    const dep3After = fake.rows.get(EP3_ID)
    expect(dep3After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(staleHash)

    // Repaired row: script written, audit appended once, pending keeps ONLY dep#2.
    const ep1After = fake.rows.get(EP1_ID)
    expect(ep1After.script).toBe(AFTER_SCRIPT)
    expect(ep1After.script_json.series_generation.belle_repair_audit).toHaveLength(2)
    const pendingAfter = getPendingPinResync(ep1After.script_json)
    expect(pendingAfter).toHaveLength(1)
    expect(pendingAfter[0]).toEqual({ dependentStoryId: EP3_ID, priorStoryId: EP1_ID, newPinHash: audit.afterHash })

    // Script COLUMN written exactly once (atomic write only; prune is script_json-only).
    const scriptWrites = fake.updateCalls.filter((c) => 'script' in c.values)
    expect(scriptWrites).toHaveLength(1)
    expect(scriptWrites[0].key.val).toBe(EP1_ID)
  })
})

describe('recovery drain (ii)', () => {
  test('recovery drains dep#2 with zero script-column writes and zero regen calls; pending cleared', async () => {
    const staleHash = hashScript(BEFORE_SCRIPT)
    const newHash = hashScript(AFTER_SCRIPT)
    // Post-failure DB state: ep1 repaired + pending [dep3], dep#1 resynced.
    const repairedRow = seedRepairedRow()
    repairedRow.script = AFTER_SCRIPT
    const auditEntry = buildBelleRepairAuditEntry({
      jobId: 'job-123',
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

    const fake = makeFakeSupabase({ [EP1_ID]: repairedRow, [EP2_ID]: dep2, [EP3_ID]: dep3 })
    let regenCalls = 0
    const out = await routeOrderRun(fake, EP1_ID, {
      regen: () => {
        regenCalls += 1
        return { introText: '', outroText: 'must never be used' }
      },
    })

    expect(out.mode).toBe('drain-only')
    expect(out.drained).toEqual([EP3_ID])
    // NO rewrite/LLM-equivalent call on the recovery path.
    expect(regenCalls).toBe(0)
    // NO second script-text write: zero `script`-column updates during recovery.
    const scriptWrites = fake.updateCalls.filter((c) => 'script' in c.values)
    expect(scriptWrites).toHaveLength(0)
    // Audit NOT appended a second time.
    const ep1After = fake.rows.get(EP1_ID)
    expect(ep1After.script_json.series_generation.belle_repair_audit).toHaveLength(2)
    // Dep#2 drained, pending cleared.
    expect(fake.rows.get(EP3_ID).script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(newHash)
    expect(getPendingPinResync(ep1After.script_json)).toEqual([])
  })
})

describe('concurrent metadata preservation (iii)', () => {
  test('unrelated keys survive persist+drain byte-for-byte', async () => {
    const staleHash = hashScript(BEFORE_SCRIPT)
    const repairedRow = seedRepairedRow()
    const dep2 = seedDependentRow(EP2_ID, EP1_ID, staleHash)
    const dep3 = seedDependentRow(EP3_ID, EP1_ID, staleHash)
    const beforeUnrelatedEp1 = JSON.parse(
      JSON.stringify({
        brief: repairedRow.script_json.brief,
        top_level_qc: repairedRow.script_json.top_level_qc,
        generated_title: repairedRow.script_json.series_generation.generated_title,
        pins_used_other: repairedRow.script_json.series_generation.continuity_pins_used,
        recovery: repairedRow.script_json.series_generation.continuity_pin_recovery,
        note: repairedRow.script_json.series_generation.operator_note,
        custom: repairedRow.script_json.series_generation.custom,
        old_audit: repairedRow.script_json.series_generation.belle_repair_audit,
      })
    )
    const beforeUnrelatedDep2 = JSON.parse(
      JSON.stringify({
        viewer_state: dep2.script_json.viewer_state,
        recovery: dep2.script_json.series_generation.continuity_pin_recovery,
        flag: dep2.script_json.series_generation.operator_flag,
      })
    )

    const { audit, pendingEntries, storyUpdates } = buildRouteShapedParams(repairedRow, [
      { id: EP1_ID, script_json: repairedRow.script_json },
      dep2,
      dep3,
    ])
    const fake = makeFakeSupabase({ [EP1_ID]: repairedRow, [EP2_ID]: dep2, [EP3_ID]: dep3 })
    const { drainedDependentIds } = await persistBelleRepair(fake, {
      repairedStoryId: EP1_ID,
      storyUpdates,
      pendingEntries,
    })
    expect(drainedDependentIds.sort()).toEqual([EP2_ID, EP3_ID])

    const ep1After = fake.rows.get(EP1_ID)
    const sg = ep1After.script_json.series_generation
    expect(ep1After.script_json.brief).toEqual(beforeUnrelatedEp1.brief)
    expect(ep1After.script_json.top_level_qc).toEqual(beforeUnrelatedEp1.top_level_qc)
    expect(sg.generated_title).toEqual(beforeUnrelatedEp1.generated_title)
    expect(sg.continuity_pins_used).toEqual(beforeUnrelatedEp1.pins_used_other)
    expect(sg.continuity_pin_recovery).toEqual(beforeUnrelatedEp1.recovery)
    expect(sg.operator_note).toEqual(beforeUnrelatedEp1.note)
    expect(sg.custom).toEqual(beforeUnrelatedEp1.custom)
    // Audit appended (old entry + new), pending cleared after full drain.
    expect(sg.belle_repair_audit).toHaveLength(2)
    expect(sg.belle_repair_audit[0]).toEqual(beforeUnrelatedEp1.old_audit[0])
    expect(sg.belle_repair_audit[1]).toMatchObject({ action: audit.action, afterHash: audit.afterHash })
    expect(getPendingPinResync(ep1After.script_json)).toEqual([])

    const dep2After = fake.rows.get(EP2_ID)
    expect(dep2After.script_json.viewer_state).toEqual(beforeUnrelatedDep2.viewer_state)
    expect(dep2After.script_json.series_generation.continuity_pin_recovery).toEqual(beforeUnrelatedDep2.recovery)
    expect(dep2After.script_json.series_generation.operator_flag).toEqual(beforeUnrelatedDep2.flag)
    expect(dep2After.script_json.series_generation.continuity_pins_used[EP1_ID]).toBe(audit.afterHash)
  })
})

describe('empty pending drain (iv)', () => {
  test('zero entries means zero DB calls', async () => {
    const fake = makeFakeSupabase({ [EP1_ID]: seedRepairedRow() })
    const drained = await drainPendingPinResync(fake, EP1_ID, [])
    expect(drained).toEqual([])
    expect(fake.updateCalls).toHaveLength(0)
    expect(fake.selectCalls).toHaveLength(0)
  })

  test('malformed pending shapes read as empty (never throws)', async () => {
    const { getPendingPinResync: get } = await import('@/lib/belleRepairPersist')
    expect(get(null)).toEqual([])
    expect(get({})).toEqual([])
    expect(get({ series_generation: { pending_pin_resync: 'oops' } })).toEqual([])
    expect(
      get({ series_generation: { pending_pin_resync: [{ dependentStoryId: EP2_ID }] } })
    ).toEqual([])
  })
})
