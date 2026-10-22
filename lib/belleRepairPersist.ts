/**
 * lib/belleRepairPersist.ts — atomic Belle-repair persist + pin-resync drain.
 *
 * BELLE-REPAIR-PERSIST-RECOVERY-001 (P5 partial-pin-resync gap closure).
 *
 * Problem: the package-stage Belle retry persist wrote the repaired story row
 * first (script + audit + audio nulls) and then resynced dependents'
 * continuity pins in a sequential per-row loop. A failure partway through the
 * loop left a PARTIAL resync — repaired row on the new script hash, early
 * dependents resynced, later dependents stale — with NO record of what
 * remained. A retry would regenerate and rewrite (new LLM call, new script
 * text) instead of finishing the pending sync.
 *
 * Shape: the repaired row carries a `pending_pin_resync` list
 * (dependent id -> new pin hash) inside script_json.series_generation,
 * written in the SAME atomic .update() as the repaired script text. A DRAIN
 * step then applies each pending pin update to its dependent row. Drain
 * failure throws with the pending list intact in the DB (pruned of entries
 * that already applied), so a retry drains without another rewrite.
 *
 * ATTEMPT SEMANTICS (binding): drain/infra failures must NOT consume
 * validation attempts; validation failures MUST. Concretely: this module
 * never touches retry counts — the caller (run-next route) increments the
 * persisted per-episode count on validation failure (before throwing) and on
 * successful persist, but NOT on drain failure and NOT on a drain-only
 * recovery run (no validation happened, no attempt was spent). Re-applying
 * an already-applied pin hash is a set-to-same-value no-op, so a recovery
 * drain that repeats a previously applied entry is safe.
 *
 * All functions take the supabase client as `any` and use only two query
 * chains — `.from('stories').update(values).eq('id', x)` awaited as
 * `{ error }`, and `.from('stories').select(...).eq('id', x).single()`
 * awaited as `{ data, error }` — so tests can inject a call-logging fake.
 * The production route passes its real client straight through (no
 * re-composed mirror: the route calls persistBelleRepair / drain directly).
 */

/** Key under script_json.series_generation holding the pending pin list. */
export const PENDING_PIN_RESYNC_KEY = 'pending_pin_resync'

/** One pending continuity-pin update: dependent row -> new pin hash. */
export interface PendingPinResyncEntry {
  /** stories.id of the dependent episode row whose pin must move. */
  dependentStoryId: string
  /** stories.id of the repaired (prior) episode the pin refers to. */
  priorStoryId: string
  /** New script hash (sha256 of the repaired script) the pin must carry. */
  newPinHash: string
}

/**
 * Read the pending pin-resync list from a story row's script_json.
 * Defensive: missing / malformed shapes yield [] (never throws).
 */
export function getPendingPinResync(scriptJson: any): PendingPinResyncEntry[] {
  const seriesGen =
    scriptJson && typeof scriptJson === 'object'
      ? (scriptJson as any).series_generation
      : undefined
  const raw =
    seriesGen && typeof seriesGen === 'object'
      ? (seriesGen as any)[PENDING_PIN_RESYNC_KEY]
      : undefined
  if (!Array.isArray(raw)) return []
  const out: PendingPinResyncEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const dep = String((item as any).dependentStoryId || '').trim()
    const prior = String((item as any).priorStoryId || '').trim()
    const hash = String((item as any).newPinHash || '').trim()
    if (!dep || !prior || !hash) continue
    out.push({ dependentStoryId: dep, priorStoryId: prior, newPinHash: hash })
  }
  return out
}

/**
 * Pure merge: set the pending pin-resync list under
 * script_json.series_generation. Preserves every other key byte-for-byte
 * (notably continuity_pins_used, continuity_pin_recovery, belle_repair_audit,
 * and arbitrary operator keys).
 */
export function setPendingPinResync(
  scriptJson: any,
  entries: PendingPinResyncEntry[]
): Record<string, any> {
  const base =
    scriptJson && typeof scriptJson === 'object' ? { ...scriptJson } : {}
  const seriesGen =
    base.series_generation && typeof base.series_generation === 'object'
      ? { ...base.series_generation }
      : {}
  return {
    ...base,
    series_generation: {
      ...seriesGen,
      [PENDING_PIN_RESYNC_KEY]: entries.map((e) => ({
        dependentStoryId: String(e.dependentStoryId),
        priorStoryId: String(e.priorStoryId),
        newPinHash: String(e.newPinHash),
      })),
    },
  }
}

/**
 * Pure pin apply: return a dependent row's script_json with the pin for
 * `priorStoryId` set to `newPinHash`. Touches ONLY that one pin entry —
 * every unrelated key (other pins, continuity_pin_recovery, operator keys,
 * top-level keys) is preserved.
 */
export function applyPendingPinToScriptJson(
  dependentScriptJson: any,
  priorStoryId: string,
  newPinHash: string
): Record<string, any> {
  const base =
    dependentScriptJson && typeof dependentScriptJson === 'object'
      ? { ...dependentScriptJson }
      : {}
  const seriesGen =
    base.series_generation && typeof base.series_generation === 'object'
      ? { ...base.series_generation }
      : {}
  const pins =
    seriesGen.continuity_pins_used &&
    typeof seriesGen.continuity_pins_used === 'object'
      ? { ...(seriesGen.continuity_pins_used as Record<string, string>) }
      : {}
  return {
    ...base,
    series_generation: {
      ...seriesGen,
      continuity_pins_used: {
        ...pins,
        [String(priorStoryId)]: String(newPinHash),
      },
    },
  }
}

/**
 * Rewrite the repaired row's pending list to `remaining` (script_json ONLY —
 * never touches the script column, so the repaired text is written exactly
 * once no matter how many drains/prunes run). Reads the row fresh so a
 * concurrent script_json edit is not clobbered beyond the pending key.
 */
async function prunePendingPinResync(
  supabaseClient: any,
  repairedStoryId: string,
  remaining: PendingPinResyncEntry[]
): Promise<void> {
  const { data: row, error: readError } = await supabaseClient
    .from('stories')
    .select('id,script_json')
    .eq('id', repairedStoryId)
    .single()
  if (readError || !row) {
    throw new Error(
      `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ` +
        `${readError?.message || 'missing row'}`
    )
  }
  const nextJson = setPendingPinResync((row as any).script_json, remaining)
  const { error: writeError } = await supabaseClient
    .from('stories')
    .update({ script_json: nextJson })
    .eq('id', repairedStoryId)
  if (writeError) {
    throw new Error(
      `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ${writeError.message}`
    )
  }
}

/**
 * Drain a pending pin-resync list: for each entry, read the dependent row
 * fresh, apply the pin (preserving concurrent metadata), and write it back.
 * Sequential and fail-closed:
 * - on a dependent read/write failure, prune the already-drained entries
 *   from the repaired row's pending list (script_json-only write) and throw
 *   with the remaining entries intact in the DB;
 * - on full success, clear the pending list on the repaired row.
 * Returns the drained dependent ids in order. Empty input is a pure no-op
 * (zero DB calls). Idempotent: re-applying an already-applied pin hash is a
 * set-to-same-value no-op, so repeating a drain after a prune failure is
 * safe.
 */
export async function drainPendingPinResync(
  supabaseClient: any,
  repairedStoryId: string,
  entries: PendingPinResyncEntry[]
): Promise<string[]> {
  const drained: string[] = []
  for (const entry of entries || []) {
    const { data: depRow, error: readError } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', entry.dependentStoryId)
      .single()
    if (readError || !depRow) {
      const remaining = (entries || []).filter(
        (e) => !drained.includes(e.dependentStoryId)
      )
      await prunePendingPinResync(supabaseClient, repairedStoryId, remaining)
      throw new Error(
        `Failed to drain Belle pin resync on ${entry.dependentStoryId} ` +
          `after Belle repair of ${repairedStoryId}: ` +
          `${readError?.message || 'missing dependent row'} ` +
          `(pending list intact in DB for ${remaining.length} entr${remaining.length === 1 ? 'y' : 'ies'})`
      )
    }
    const nextDepJson = applyPendingPinToScriptJson(
      (depRow as any).script_json,
      entry.priorStoryId,
      entry.newPinHash
    )
    const { error: writeError } = await supabaseClient
      .from('stories')
      .update({ script_json: nextDepJson })
      .eq('id', entry.dependentStoryId)
    if (writeError) {
      const remaining = (entries || []).filter(
        (e) => !drained.includes(e.dependentStoryId)
      )
      await prunePendingPinResync(supabaseClient, repairedStoryId, remaining)
      throw new Error(
        `Failed to drain Belle pin resync on ${entry.dependentStoryId} ` +
          `after Belle repair of ${repairedStoryId}: ${writeError.message} ` +
          `(pending list intact in DB for ${remaining.length} entr${remaining.length === 1 ? 'y' : 'ies'})`
      )
    }
    drained.push(entry.dependentStoryId)
  }
  if (drained.length > 0) {
    await prunePendingPinResync(supabaseClient, repairedStoryId, [])
  }
  return drained
}

/**
 * Atomic Belle-repair persist. The ROUTE builds `storyUpdates` (thin glue);
 * this function executes:
 *  1. a SINGLE atomic .update() on the repaired story row containing the
 *     repaired script + audit-bearing script_json (which already embeds the
 *     pending_pin_resync list) + scoped audio nulls;
 *  2. the DRAIN step applying each pending pin update to its dependent row.
 * A drain failure throws with the pending list intact in the DB (pruned of
 * applied entries) — the repaired script text is never rewritten by a drain.
 * Never touches retry counts (see ATTEMPT SEMANTICS above).
 */
export async function persistBelleRepair(
  supabaseClient: any,
  params: {
    repairedStoryId: string
    storyUpdates: Record<string, unknown>
    pendingEntries: PendingPinResyncEntry[]
  }
): Promise<{ drainedDependentIds: string[] }> {
  const repairedStoryId = String(params.repairedStoryId)
  const { error: repairUpdateError } = await supabaseClient
    .from('stories')
    .update(params.storyUpdates)
    .eq('id', repairedStoryId)
  if (repairUpdateError) {
    throw new Error(
      `Failed to save repaired Belle copy: ${repairUpdateError.message}`
    )
  }
  const drainedDependentIds = await drainPendingPinResync(
    supabaseClient,
    repairedStoryId,
    params.pendingEntries || []
  )
  return { drainedDependentIds }
}
