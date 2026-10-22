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
 * never touches retry counts — the caller (run-next route) reserves the
 * incremented per-episode count on the job row BEFORE the paid LLM rewrite
 * (so a crash between rewrite and result cannot grant an uncounted attempt)
 * and reuses that reserved value on the success and validation-failure paths
 * (reserve once, never double-increment). A drain-only recovery run performs
 * no validation and consumes no attempt. Re-applying an already-applied pin
 * hash is a set-to-same-value no-op, so a recovery drain that repeats a
 * previously applied entry is safe.
 *
 * All functions take the supabase client as `any` and use only three query
 * chains — `.from('stories').update(values).eq('id', x)` awaited as
 * `{ error }`, `.from('stories').select(...).eq('id', x).single()` awaited
 * as `{ data, error }`, and CAS writes
 * `.from('stories').update(values).eq('id', x)
 *   .eq('script_json', jsonbEqFilter(expectedSnapshot)).select('id')`
 * awaited as `{ data, error }` where an empty `data` array means zero rows
 * matched (concurrent modification — safe refusal, never silent clobber).
 *
 * JSONB CAS ENCODING (binding): postgrest-js `.eq()` on a raw object
 * serializes to `eq.[object Object]` (verified against the real SDK:
 * `script_json=eq.%5Bobject+Object%5D` — matches nothing, silently). Every
 * whole-doc snapshot condition MUST go through `jsonbEqFilter` (explicit
 * JSON.stringify) so the SDK URL-encodes a real jsonb equality match.
 * Tests prove this through the REAL QueryBuilder with a stub fetch that
 * captures the outgoing URL — never a mirror.
 *
 * The production route passes its real client straight through
 * (no re-composed mirror: the route calls persistBelleRepair /
 * persistBelleRepairAndInvalidateAudio / drainPendingPinResync /
 * getPendingPinResync / recoverPendingPinDrains / reserveBelleRetryCount
 * directly).
 */

/** Key under script_json.series_generation holding the pending pin list. */
export const PENDING_PIN_RESYNC_KEY = 'pending_pin_resync'

/** Stable code on the structured error thrown for a malformed pending list. */
export const MALFORMED_PENDING_CODE = 'belle_pending_pin_resync_malformed'

/** Stable code on the structured error thrown for a CAS concurrent-mod refusal. */
export const CONCURRENT_MOD_CODE = 'belle_pin_resync_concurrent_modification'

/**
 * Serialize a whole-doc script_json snapshot for a PostgREST equality
 * filter. NEVER pass a raw object to `.eq('script_json', ...)` — the SDK
 * stringifies it to `[object Object]`. JSON.stringify lets the SDK
 * URL-encode a real jsonb equality match (`script_json=eq.%7B%22...`).
 */
export function jsonbEqFilter(snapshot: unknown): string {
  return JSON.stringify(snapshot === undefined ? null : snapshot)
}

/**
 * Union two pending lists by dependentStoryId. `second` wins ties (the
 * caller's drain outcome / retry intent is authoritative for ids present in
 * both). Entries outside the overlap are never dropped — pending never
 * dropped, on any path.
 */
export function unionPendingEntries(
  first: PendingPinResyncEntry[],
  second: PendingPinResyncEntry[]
): PendingPinResyncEntry[] {
  const merged = new Map<string, PendingPinResyncEntry>()
  for (const e of first || []) {
    merged.set(String(e.dependentStoryId), {
      dependentStoryId: String(e.dependentStoryId),
      priorStoryId: String(e.priorStoryId),
      newPinHash: String(e.newPinHash),
    })
  }
  for (const e of second || []) {
    merged.set(String(e.dependentStoryId), {
      dependentStoryId: String(e.dependentStoryId),
      priorStoryId: String(e.priorStoryId),
      newPinHash: String(e.newPinHash),
    })
  }
  return [...merged.values()]
}

/**
 * Lenient pending read: absent key -> [] (normal empty state). Malformed
 * stays LOUD via getPendingPinResync (fail-closed before any write).
 */
function safeReadPending(scriptJson: any, storyIdForContext?: string): PendingPinResyncEntry[] {
  return getPendingPinResync(scriptJson, storyIdForContext)
}

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
 *
 * ABSENT (no series_generation, or the pending key itself undefined) yields
 * [] — the normal "nothing pending" state, including freshly cleared rows.
 *
 * PRESENT-BUT-MALFORMED is a LOUD failure: throws a structured Error with
 * code MALFORMED_PENDING_CODE, naming the offending index/shape. Malformed
 * means: the container is present and not an array (null, string, object,
 * number…), an entry is not an object, or an entry is missing/blank
 * dependentStoryId, priorStoryId, or newPinHash. Callers must let this throw
 * BEFORE any write so the pending data stays intact in the DB (nothing
 * pruned, no rewrite attempted) and the tick fails visibly for an operator.
 */
export function getPendingPinResync(
  scriptJson: any,
  storyIdForContext?: string
): PendingPinResyncEntry[] {
  const seriesGen =
    scriptJson && typeof scriptJson === 'object'
      ? (scriptJson as any).series_generation
      : undefined
  const raw =
    seriesGen && typeof seriesGen === 'object'
      ? (seriesGen as any)[PENDING_PIN_RESYNC_KEY]
      : undefined
  // Absent key (never written, or row without script_json): nothing pending.
  if (raw === undefined) return []
  const where = storyIdForContext ? ` on story ${storyIdForContext}` : ''
  const malformed = (detail: string): Error => {
    const err = new Error(
      `Malformed Belle pending_pin_resync list${where}: ${detail} ` +
        `(expected an array of { dependentStoryId, priorStoryId, newPinHash }; ` +
        `pending data left intact in the DB — nothing pruned, no rewrite attempted)`
    )
    ;(err as Error & { code?: string }).code = MALFORMED_PENDING_CODE
    return err
  }
  if (!Array.isArray(raw)) {
    throw malformed(
      `container is ${raw === null ? 'null' : typeof raw}, not an array`
    )
  }
  const out: PendingPinResyncEntry[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      throw malformed(`entry [${i}] is ${item === null ? 'null' : typeof item}, not an object`)
    }
    const dep = String((item as any).dependentStoryId || '').trim()
    const prior = String((item as any).priorStoryId || '').trim()
    const hash = String((item as any).newPinHash || '').trim()
    if (!dep || !prior || !hash) {
      throw malformed(
        `entry [${i}] missing required field(s)` +
          `${dep ? '' : ' dependentStoryId'}${prior ? '' : ' priorStoryId'}${hash ? '' : ' newPinHash'}`
      )
    }
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
 * once no matter how many drains/prunes run). The write is CAS-conditioned
 * on the freshly-read snapshot (jsonbEqFilter construction) with an
 * affected-row check: a concurrent script_json edit is never silently
 * clobbered. On a zero-row conflict the row is RE-READ once, the pending
 * lists are unioned (pending never dropped), newer unrelated metadata keys
 * win automatically (the retry builds on the fresh read), and the write is
 * retried once. A second zero-row conflict throws loudly (code
 * CONCURRENT_MOD_CODE) with everything preserved in the DB.
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
  const snapshot = (row as any).script_json
  const nextJson = setPendingPinResync(snapshot, remaining)
  const first = await supabaseClient
    .from('stories')
    .update({ script_json: nextJson })
    .eq('id', repairedStoryId)
    .eq('script_json', jsonbEqFilter(snapshot))
    .select('id')
  if (!first.error && first.data && first.data.length > 0) return
  if (first.error) {
    throw new Error(
      `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ${first.error.message}`
    )
  }
  // Zero rows matched: the row moved under us. Re-read once, union the
  // pending lists (ours wins ties; pending never dropped), retry once.
  const { data: fresh, error: rereadError } = await supabaseClient
    .from('stories')
    .select('id,script_json')
    .eq('id', repairedStoryId)
    .single()
  if (rereadError || !fresh) {
    throw new Error(
      `Failed to re-read Belle pin-resync pending list on ${repairedStoryId} ` +
        `after concurrent modification: ${rereadError?.message || 'missing row'} ` +
        `(pending data left intact in the DB — nothing pruned)`
    )
  }
  const freshSnapshot = (fresh as any).script_json
  const merged = unionPendingEntries(
    safeReadPending(freshSnapshot, repairedStoryId),
    remaining
  )
  const retryJson = setPendingPinResync(freshSnapshot, merged)
  const second = await supabaseClient
    .from('stories')
    .update({ script_json: retryJson })
    .eq('id', repairedStoryId)
    .eq('script_json', jsonbEqFilter(freshSnapshot))
    .select('id')
  if (!second.error && second.data && second.data.length > 0) return
  if (second.error) {
    throw new Error(
      `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ${second.error.message} ` +
        `(pending data left intact in the DB — nothing pruned)`
    )
  }
  const conflictError = new Error(
    `Refused Belle pin-resync prune on ${repairedStoryId}: dependent script_json ` +
      `changed again before the retry write (concurrent modification — ` +
      `row left unmodified, pending entries kept for a later tick)`
  )
  ;(conflictError as Error & { code?: string }).code = CONCURRENT_MOD_CODE
  throw conflictError
}

/**
 * Drain a pending pin-resync list: for each entry, fresh-read the dependent
 * row, then issue the pin update CONDITIONED on the full prior script_json
 * still matching what was read (compare-and-swap, not read-then-hope):
 *
 *   .update({ script_json: next }).eq('id', depId)
 *     .eq('script_json', expectedSnapshot).select('id')
 *
 * whole-doc jsonb equality is the CAS condition. Zero rows updated means the
 * dependent changed between our read and our write (a concurrent operator /
 * worker edit, even to an UNRELATED key) → safe refusal: throw a structured
 * Error (code CONCURRENT_MOD_CODE), keep the pending entry in the DB, do NOT
 * overwrite the row. The entry retries on a later tick once the row is
 * stable.
 *
 * TRADEOFF (by design): whole-doc CAS fails safe — ANY concurrent
 * unrelated-metadata change causes refusal + retry-next-tick rather than a
 * surgical merge. We accept the extra tick to guarantee we never silently
 * clobber another writer's update. A dependent that churns every tick could
 * in principle defer its pin update indefinitely; the refusal is loud (tick
 * fails visibly) so an operator sees the contention instead of silent skew.
 *
 * Sequential and fail-closed otherwise:
 * - on a dependent read/write error, prune the already-drained entries
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
    const expectedSnapshot = (depRow as any).script_json
    const nextDepJson = applyPendingPinToScriptJson(
      expectedSnapshot,
      entry.priorStoryId,
      entry.newPinHash
    )
    // CAS write: applies ONLY if the dependent's full script_json still
    // equals what we just read. Empty `data` = zero rows matched = the row
    // moved under us → refuse loudly, keep the pending entry, touch nothing.
    // The snapshot MUST be serialized via jsonbEqFilter: a raw object
    // encodes as `eq.[object Object]` (matches nothing, silently).
    const { data: casApplied, error: writeError } = await supabaseClient
      .from('stories')
      .update({ script_json: nextDepJson })
      .eq('id', entry.dependentStoryId)
      .eq('script_json', jsonbEqFilter(expectedSnapshot))
      .select('id')
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
    if (!casApplied || casApplied.length === 0) {
      const remaining = (entries || []).filter(
        (e) => !drained.includes(e.dependentStoryId)
      )
      await prunePendingPinResync(supabaseClient, repairedStoryId, remaining)
      const concurrentError = new Error(
        `Refused Belle pin resync on ${entry.dependentStoryId} ` +
          `after Belle repair of ${repairedStoryId}: dependent script_json ` +
          `changed between drain read and write (concurrent modification — ` +
          `row left unmodified, pending entry kept for a later tick)`
      )
      ;(concurrentError as Error & { code?: string }).code =
        CONCURRENT_MOD_CODE
      throw concurrentError
    }
    drained.push(entry.dependentStoryId)
  }
  if (drained.length > 0) {
    await prunePendingPinResync(supabaseClient, repairedStoryId, [])
  }
  return drained
}

/**
 * Rebase an attempted repaired-row script_json onto a freshly re-read row
 * after a CAS conflict. Newer unrelated metadata keys win (the fresh read
 * is the base; only the repair's own keys are re-applied): the repair's
 * raw_script (the repaired text), the audit entries (append-only union,
 * deduped by JSON identity so a retry never double-appends), and the
 * pending list (union of fresh + attempted, attempted wins ties — pending
 * never dropped).
 */
export function rebaseRepairedScriptJson(
  freshScriptJson: any,
  attemptedScriptJson: any
): Record<string, any> {
  const fresh =
    freshScriptJson && typeof freshScriptJson === 'object'
      ? JSON.parse(JSON.stringify(freshScriptJson))
      : {}
  const attempted =
    attemptedScriptJson && typeof attemptedScriptJson === 'object'
      ? attemptedScriptJson
      : {}
  const freshSG =
    fresh.series_generation && typeof fresh.series_generation === 'object'
      ? fresh.series_generation
      : {}
  const attemptedSG =
    attempted.series_generation && typeof attempted.series_generation === 'object'
      ? attempted.series_generation
      : {}
  const freshAudit = Array.isArray(freshSG.belle_repair_audit)
    ? freshSG.belle_repair_audit
    : []
  const attemptedAudit = Array.isArray(attemptedSG.belle_repair_audit)
    ? attemptedSG.belle_repair_audit
    : []
  const seen = new Set(freshAudit.map((e: unknown) => JSON.stringify(e)))
  const mergedAudit = [
    ...freshAudit,
    ...attemptedAudit.filter((e: unknown) => !seen.has(JSON.stringify(e))),
  ]
  const mergedPending = unionPendingEntries(
    safeReadPending(fresh, undefined),
    safeReadPending(attempted, undefined)
  )
  const next: Record<string, any> = { ...fresh }
  if (attempted.raw_script !== undefined) next.raw_script = attempted.raw_script
  next.series_generation = {
    ...freshSG,
    belle_repair_audit: mergedAudit,
    [PENDING_PIN_RESYNC_KEY]: mergedPending.map((e) => ({
      dependentStoryId: String(e.dependentStoryId),
      priorStoryId: String(e.priorStoryId),
      newPinHash: String(e.newPinHash),
    })),
  }
  return next
}

/**
 * Atomic Belle-repair persist. The ROUTE builds `storyUpdates` (thin glue);
 * this function executes:
 *  1. a SINGLE atomic .update() on the repaired story row containing the
 *     repaired script + audit-bearing script_json (which already embeds the
 *     pending_pin_resync list AND the synchronized top-level raw_script)
 *     + scoped audio nulls;
 *  2. the DRAIN step applying each pending pin update to its dependent row
 *     via CAS-conditioned writes (see drainPendingPinResync).
 *
 * When `expectedRepairedScriptJson` (the pre-repair snapshot) is provided,
 * step 1 is CAS-conditioned on it (jsonbEqFilter construction) with an
 * affected-row check: a concurrent repair-row edit is never silently
 * clobbered. On a zero-row conflict the row is RE-READ once, the payload
 * is rebased (rebaseRepairedScriptJson: newer unrelated keys win, pending
 * unioned, audit deduped), and the write is retried once. A second
 * zero-row conflict throws loudly (code CONCURRENT_MOD_CODE) with the row
 * untouched by us — everything preserved for a later tick.
 *
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
    expectedRepairedScriptJson?: unknown
  }
): Promise<{ drainedDependentIds: string[] }> {
  const repairedStoryId = String(params.repairedStoryId)
  const hasSnapshot = params.expectedRepairedScriptJson !== undefined
  const firstAttempt = hasSnapshot
    ? await supabaseClient
        .from('stories')
        .update(params.storyUpdates)
        .eq('id', repairedStoryId)
        .eq('script_json', jsonbEqFilter(params.expectedRepairedScriptJson))
        .select('id')
    : await supabaseClient
        .from('stories')
        .update(params.storyUpdates)
        .eq('id', repairedStoryId)
  const firstData = hasSnapshot ? firstAttempt.data : undefined
  const firstError = firstAttempt.error
  if (firstError) {
    throw new Error(
      `Failed to save repaired Belle copy: ${firstError.message}`
    )
  }
  let effectiveUpdates = params.storyUpdates
  let effectivePending = params.pendingEntries || []
  if (hasSnapshot && (!firstData || firstData.length === 0)) {
    // Zero rows matched: the repaired row moved under us. Re-read once,
    // rebase, retry once.
    const { data: freshRow, error: rereadError } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', repairedStoryId)
      .single()
    if (rereadError || !freshRow) {
      throw new Error(
        `Refused Belle repair persist on ${repairedStoryId}: repaired row changed ` +
          `between read and write and the re-read failed ` +
          `(${rereadError?.message || 'missing row'}) — row left unmodified, ` +
          `no rewrite applied, repair may retry on a later tick`
      )
    }
    const freshSnapshot = (freshRow as any).script_json
    const rebasedJson = rebaseRepairedScriptJson(
      freshSnapshot,
      (params.storyUpdates as any)?.script_json
    )
    effectiveUpdates = { ...params.storyUpdates, script_json: rebasedJson }
    effectivePending = safeReadPending(rebasedJson, repairedStoryId)
    const secondAttempt = await supabaseClient
      .from('stories')
      .update(effectiveUpdates)
      .eq('id', repairedStoryId)
      .eq('script_json', jsonbEqFilter(freshSnapshot))
      .select('id')
    if (secondAttempt.error) {
      throw new Error(
        `Failed to save repaired Belle copy on retry: ${secondAttempt.error.message} ` +
          `(row left unmodified by the retry — repair may retry on a later tick)`
      )
    }
    if (!secondAttempt.data || secondAttempt.data.length === 0) {
      const conflictError = new Error(
        `Refused Belle repair persist on ${repairedStoryId}: repaired row changed ` +
          `again before the retry write (concurrent modification — row left ` +
          `unmodified, no rewrite applied, repair may retry on a later tick)`
      )
      ;(conflictError as Error & { code?: string }).code = CONCURRENT_MOD_CODE
      throw conflictError
    }
  }
  const drainedDependentIds = await drainPendingPinResync(
    supabaseClient,
    repairedStoryId,
    effectivePending
  )
  return { drainedDependentIds }
}

/**
 * Reserve the incremented Belle-retry attempt on the production_jobs row
 * BEFORE the paid LLM rewrite (BELLE-RETRY-ATTEMPT-RESERVATION-001). The
 * write is fenced AND affected-row verified: it MUST match exactly the
 * owned job row. A lost lock (zero rows matched) throws BEFORE
 * regenerateSeriesBelleFromFeedback runs — a zero-row reservation can
 * never silently proceed to the paid rewrite.
 */
export async function reserveBelleRetryCount(
  supabaseClient: any,
  args: {
    jobId: string
    fence: Record<string, unknown>
    stateJson: unknown
  }
): Promise<void> {
  const jobId = String(args.jobId || 'unknown-job')
  const { data, error } = await supabaseClient
    .from('production_jobs')
    .update({ state_json: args.stateJson })
    .match(args.fence || {})
    .select('id')
  if (error) {
    throw new Error(
      `Failed to reserve Belle retry attempt count: ${error.message}`
    )
  }
  if (!data || data.length === 0) {
    throw new Error(
      `Failed to reserve Belle retry attempt count for job ${jobId}: zero rows ` +
        `matched (lock lost or concurrent update) — paid rewrite NOT attempted, ` +
        `no attempt consumed`
    )
  }
}

/** One recovered pending drain: which repaired row carried the list, what drained, how it was found. */
export interface PendingDrainResolution {
  repairedStoryId: string
  drainedDependentIds: string[]
  via: 'failing-row' | 'series-scan'
  episodeNumber: number | null
}

function rowEpisodeNumber(row: any): number | null {
  const n = Number(
    row?.episode_number ?? row?.series_episode_number ?? NaN
  )
  return Number.isFinite(n) ? n : null
}

/**
 * PRODUCTION recovery entry for Belle pin-resync drains (the exact function
 * the run-next route calls on a failed series package tick — the route is
 * thin glue around it). Resolves the drain candidate to the row CARRYING
 * the pending list:
 *
 *  1. failing-episode row first (result.episode.storyId). Read miss falls
 *     through (no queue-jam on a read blip); present-but-malformed throws
 *     loudly via getPendingPinResync before any write.
 *  2. fallback: series-scoped scan. The pending list lives on the REPAIRED
 *     episode, which may differ from the failing dependent — every series
 *     row with a non-empty pending list is drained (carrier re-read fresh
 *     before draining so a stale scan snapshot can never clobber a
 *     concurrent pending addition; malformed stays loud).
 *
 * `loadSeriesStories` is invoked LAZILY — only when the failing row itself
 * carries nothing pending. Drain-only recovery performs no validation and
 * consumes no attempt (this function never touches retry counts; job-row
 * writes are the caller's).
 */
export async function recoverPendingPinDrains(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
  }
): Promise<PendingDrainResolution[]> {
  const out: PendingDrainResolution[] = []
  const drainedCarriers = new Set<string>()
  const failingId = String(args.failingStoryId || '').trim()
  if (failingId) {
    const { data, error } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', failingId)
      .single()
    if (!error && data) {
      const failingPending = getPendingPinResync(
        (data as any).script_json,
        failingId
      )
      if (failingPending.length > 0) {
        const drained = await drainPendingPinResync(
          supabaseClient,
          failingId,
          failingPending
        )
        drainedCarriers.add(failingId)
        out.push({
          repairedStoryId: failingId,
          drainedDependentIds: drained,
          via: 'failing-row',
          episodeNumber: rowEpisodeNumber(data),
        })
      }
    }
  }
  if (typeof args.loadSeriesStories === 'function') {
    let seriesStories: any[] = []
    // Lazy fallback: only scan when the failing row carried nothing.
    if (drainedCarriers.size === 0) {
      try {
        seriesStories = (await args.loadSeriesStories()) || []
      } catch {
        seriesStories = []
      }
    }
    for (const row of seriesStories) {
      const carrierId = String((row as any)?.id || '').trim()
      if (!carrierId || drainedCarriers.has(carrierId)) continue
      const scanned = getPendingPinResync(
        (row as any)?.script_json,
        carrierId
      )
      if (scanned.length === 0) continue
      // Re-read the carrier fresh: the scan snapshot may be stale, and
      // draining (plus its prune) off a stale pending list could drop a
      // concurrently-added entry. Read blip -> skip without jamming.
      const { data: fresh, error: freshError } = await supabaseClient
        .from('stories')
        .select('id,script_json')
        .eq('id', carrierId)
        .single()
      if (freshError || !fresh) continue
      const freshPending = getPendingPinResync(
        (fresh as any).script_json,
        carrierId
      )
      if (freshPending.length === 0) continue
      const drained = await drainPendingPinResync(
        supabaseClient,
        carrierId,
        freshPending
      )
      drainedCarriers.add(carrierId)
      out.push({
        repairedStoryId: carrierId,
        drainedDependentIds: drained,
        via: 'series-scan',
        episodeNumber:
          rowEpisodeNumber(row) ?? rowEpisodeNumber(fresh),
      })
    }
  }
  return out
}

/**
 * Scoped Belle audio invalidation through the passed client (moved here
 * from the run-next route so the persist-then-delete order is unit-testable
 * through the REAL client). Lists `asc3/<storyId>` and removes ONLY the
 * repaired side's files: intro repair -> announcement and intro names,
 * outro repair -> outro names. Never siblings/segments/mixes.
 */
export async function deleteBelleAudioFiles(
  supabaseClient: any,
  storyId: string,
  repairIntro: boolean,
  repairOutro: boolean
): Promise<string[]> {
  const { data: files, error } = await supabaseClient.storage
    .from('audio')
    .list(`asc3/${storyId}`, { limit: 500 })
  if (error)
    throw new Error(
      `Failed to list Belle audio files for invalidation: ${error.message}`
    )
  const stalePaths = (files || [])
    .map((file: any) => String(file.name || ''))
    .filter(
      (name: string) =>
        (repairIntro &&
          (name === 'announcement.mp3' ||
            name.startsWith('announcement_') ||
            name === 'intro.mp3' ||
            name.startsWith('intro_') ||
            name.startsWith('intro_before_') ||
            name.startsWith('intro_after_'))) ||
        (repairOutro && (name === 'outro.mp3' || name.startsWith('outro_')))
    )
    .map((name: string) => `asc3/${storyId}/${name}`)
  if (stalePaths.length > 0) {
    const { error: removeError } = await supabaseClient.storage
      .from('audio')
      .remove(stalePaths)
    if (removeError)
      throw new Error(
        `Failed to delete stale Belle audio files: ${removeError.message}`
      )
  }
  return stalePaths
}

/**
 * Full repair write in the PRODUCTION order: persist FIRST, file deletion
 * only AFTER the persist succeeds (the exact function the route calls —
 * the route is thin glue around it). A failed persist can never strand
 * deleted audio: on persist failure no storage call is made, the old audio
 * URLs stay in the DB row, and the tick fails loudly.
 */
export async function persistBelleRepairAndInvalidateAudio(
  supabaseClient: any,
  params: {
    repairedStoryId: string
    storyUpdates: Record<string, unknown>
    pendingEntries: PendingPinResyncEntry[]
    expectedRepairedScriptJson?: unknown
    repairIntro: boolean
    repairOutro: boolean
  }
): Promise<{ drainedDependentIds: string[]; deletedBelleFiles: string[] }> {
  const { drainedDependentIds } = await persistBelleRepair(
    supabaseClient,
    params
  )
  const deletedBelleFiles = await deleteBelleAudioFiles(
    supabaseClient,
    String(params.repairedStoryId),
    Boolean(params.repairIntro),
    Boolean(params.repairOutro)
  )
  return { drainedDependentIds, deletedBelleFiles }
}
