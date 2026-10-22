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
 *
 * LARGE-DOC LIMIT (2026-10-22): URL filters 400 Bad Request at production
 * doc sizes (18–27KB proven live). New code MUST use
 * casUpdateStoryScriptJson (server-side compare, body params) instead.
 * This export stays for small-doc/test callers only.
 */
export function jsonbEqFilter(snapshot: unknown): string {
  return JSON.stringify(snapshot === undefined ? null : snapshot)
}

/**
 * Server-side compare-and-swap for stories rows (LARGE-DOC-CAS,
 * 2026-10-22): atomic `UPDATE ... WHERE id AND script_json = expected`
 * via the `cas_update_story` RPC — the expected snapshot travels in the
 * POST body, so production doc sizes never touch URL limits. Full-update
 * callers keep single-statement atomicity across all repaired columns
 * (closed whitelist enforced server-side; unknown keys raise). Same
 * contract as the old URL filter: success returns the row; zero rows
 * (moved under us) throws with code CONCURRENT_MOD_CODE and the row
 * untouched; transport errors throw plainly. Requires migration
 * 20261022190000_cas_update_story (Codex review + Marc word before
 * production install).
 */
export async function casUpdateStory(
  supabaseClient: any,
  args: { storyId: string; expected: unknown; updates: Record<string, unknown> },
): Promise<{ id: string }> {
  const storyId = String(args.storyId || '')
  const { data, error } = await supabaseClient.rpc(
    'cas_update_story',
    {
      p_story_id: storyId,
      p_expected: (args.expected ?? null) as any,
      p_updates: args.updates as any,
    },
  )
  if (error) {
    throw new Error(
      `CAS story write failed on ${storyId}: ${error.message} (row left unmodified)`
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || !(row as any).updated_id) {
    const concurrentError = new Error(
      `Refused story CAS on ${storyId}: row changed between read and write ` +
        `(concurrent modification \u2014 row left unmodified, retry converges)`
    )
    ;(concurrentError as Error & { code?: string }).code =
      CONCURRENT_MOD_CODE
    throw concurrentError
  }
  return { id: String((row as any).updated_id) }
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

/**
 * Full-identity key for a pending pin entry. Prune removal is keyed on the
 * whole triple — never on array index or list length — so an entry added
 * concurrently (same dependent, different hash, or a brand-new dependent)
 * never compares equal to a drained entry and always survives the prune.
 */
function pendingEntryIdentity(entry: PendingPinResyncEntry): string {
  return JSON.stringify([
    String(entry.dependentStoryId),
    String(entry.priorStoryId),
    String(entry.newPinHash),
  ])
}

/**
 * Pure identity-based subtraction: `current` minus every entry whose full
 * identity appears in `drained`. Order-preserving; duplicates collapse to
 * the drained identity. Used by the drain paths so the prune write removes
 * ONLY what this run drained — concurrently-added entries survive.
 */
export function subtractPendingEntries(
  current: PendingPinResyncEntry[],
  drained: PendingPinResyncEntry[]
): PendingPinResyncEntry[] {
  const gone = new Set((drained || []).map(pendingEntryIdentity))
  return (current || []).filter((e) => !gone.has(pendingEntryIdentity(e)))
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
 * Identity-based prune of the repaired row's pending list (script_json ONLY —
 * never touches the script column, so the repaired text is written exactly
 * once no matter how many drains/prunes run). The caller passes the entries
 * THIS run drained; the remaining list is recomputed from a FRESH read as
 * `fresh minus drained-identities` (subtractPendingEntries) — never from a
 * possibly-stale caller-side list, never by index or length. An entry added
 * concurrently between the drain's read and this prune is absent from the
 * drained set, so it survives even when the CAS write succeeds on first
 * attempt. The write is CAS-conditioned on the freshly-read snapshot
 * (jsonbEqFilter construction) with an affected-row check: a concurrent
 * script_json edit is never silently clobbered. On a zero-row conflict the
 * row is RE-READ once, the subtraction is recomputed against the new fresh
 * read (concurrent additions still survive), and the write is retried once.
 * A second zero-row conflict throws loudly (code CONCURRENT_MOD_CODE) with
 * everything preserved in the DB.
 */
async function prunePendingPinResync(
  supabaseClient: any,
  repairedStoryId: string,
  drainedEntries: PendingPinResyncEntry[]
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
  const remaining = subtractPendingEntries(
    safeReadPending(snapshot, repairedStoryId),
    drainedEntries
  )
  const nextJson = setPendingPinResync(snapshot, remaining)
  // LARGE-DOC-CAS: server-side compare (body params, no URL filter).
  try {
    await casUpdateStory(supabaseClient, {
      storyId: repairedStoryId,
      expected: snapshot,
      updates: { script_json: nextJson },
    })
    return
  } catch (e) {
    if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
      throw new Error(
        `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ${(e as Error).message}`
      )
    }
  }
  // Zero rows matched: the row moved under us. Re-read once, recompute
  // the subtraction against the new fresh read (concurrently-added entries
  // are still absent from the drained set, so pending is never dropped),
  // retry once.
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
  const retryRemaining = subtractPendingEntries(
    safeReadPending(freshSnapshot, repairedStoryId),
    drainedEntries
  )
  const retryJson = setPendingPinResync(freshSnapshot, retryRemaining)
  try {
    await casUpdateStory(supabaseClient, {
      storyId: repairedStoryId,
      expected: freshSnapshot,
      updates: { script_json: retryJson },
    })
    return
  } catch (e) {
    if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
      throw new Error(
        `Failed to prune Belle pin-resync pending list on ${repairedStoryId}: ${(e as Error).message} ` +
          `(pending data left intact in the DB — nothing pruned)`
      )
    }
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
  const drainedEntries: PendingPinResyncEntry[] = []
  for (const entry of entries || []) {
    const { data: depRow, error: readError } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', entry.dependentStoryId)
      .single()
    if (readError || !depRow) {
      const remaining = subtractPendingEntries(entries || [], drainedEntries)
      await prunePendingPinResync(supabaseClient, repairedStoryId, drainedEntries)
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
    // equals what we just read (LARGE-DOC-CAS: server-side compare —
    // zero rows matched = the row moved under us → refuse loudly, keep
    // the pending entry, touch nothing).
    let casConflict = false
    try {
      await casUpdateStory(supabaseClient, {
        storyId: String(entry.dependentStoryId),
        expected: expectedSnapshot,
        updates: { script_json: nextDepJson },
      })
    } catch (e) {
      if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
        const remaining = subtractPendingEntries(entries || [], drainedEntries)
        await prunePendingPinResync(supabaseClient, repairedStoryId, drainedEntries)
        throw new Error(
          `Failed to drain Belle pin resync on ${entry.dependentStoryId} ` +
            `after Belle repair of ${repairedStoryId}: ${(e as Error).message} ` +
            `(pending list intact in DB for ${remaining.length} entr${remaining.length === 1 ? 'y' : 'ies'})`
        )
      }
      casConflict = true
    }
    if (casConflict) {
      const remaining = subtractPendingEntries(entries || [], drainedEntries)
      await prunePendingPinResync(supabaseClient, repairedStoryId, drainedEntries)
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
    drainedEntries.push({
      dependentStoryId: String(entry.dependentStoryId),
      priorStoryId: String(entry.priorStoryId),
      newPinHash: String(entry.newPinHash),
    })
  }
  if (drainedEntries.length > 0) {
    await prunePendingPinResync(supabaseClient, repairedStoryId, drainedEntries)
  }
  return drainedEntries.map((e) => e.dependentStoryId)
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
  const mergedAudio = unionPendingAudioDeletes(
    safeReadAudioDelete(fresh, undefined),
    safeReadAudioDelete(attempted, undefined)
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
  // Audio-delete intent unions like pending pins — but never invent the key
  // on rows that never carried it (no shape churn for intent-free repairs).
  if (mergedAudio.length > 0 || PENDING_AUDIO_DELETE_KEY in freshSG) {
    next.series_generation[PENDING_AUDIO_DELETE_KEY] = mergedAudio
  }
  return next
}

/**
 * DURABLE INVALIDATION INTENT (P5 entry-gaps): the exact outro audio URLs
 * requiring deletion, persisted alongside pending_pin_resync inside
 * script_json.series_generation in the SAME atomic repair update. A
 * kill-after-persist (repair row written, process dead before storage
 * deletion) leaves the intent in the DB; recovery (drainPendingAudioDeletes,
 * wired into recoverPendingPinDrains which runs hoisted before any
 * regen/rewrite) finishes those scoped DELETEs first, then clears the list
 * via a CAS-guarded script_json-only write. Delete-before-clear with
 * idempotent storage removes gives exactly-once effect: a crash between
 * the DELETE and the clear simply re-issues the (no-op) remove on the next
 * tick before clearing.
 */

/** Key under script_json.series_generation holding the pending audio-delete URL list. */
export const PENDING_AUDIO_DELETE_KEY = 'pending_audio_delete'

/**
 * Read the pending audio-delete URL list. Absent key -> [] (normal empty
 * state). Present-but-malformed (non-array, or a blank/non-string entry)
 * throws loudly with MALFORMED_PENDING_CODE before any write — the intent
 * stays intact in the DB.
 */
export function getPendingAudioDelete(
  scriptJson: any,
  storyIdForContext?: string
): string[] {
  const seriesGen =
    scriptJson && typeof scriptJson === 'object'
      ? (scriptJson as any).series_generation
      : undefined
  const raw =
    seriesGen && typeof seriesGen === 'object'
      ? (seriesGen as any)[PENDING_AUDIO_DELETE_KEY]
      : undefined
  if (raw === undefined) return []
  const where = storyIdForContext ? ` on story ${storyIdForContext}` : ''
  const malformed = (detail: string): Error => {
    const err = new Error(
      `Malformed Belle pending_audio_delete list${where}: ${detail} ` +
        `(expected an array of non-empty URL strings; ` +
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
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const url = typeof raw[i] === 'string' ? raw[i].trim() : ''
    if (!url) throw malformed(`entry [${i}] is not a non-empty string`)
    out.push(url)
  }
  return out
}

/** Lenient audio-delete read for merge paths (absent -> []; malformed stays loud). */
function safeReadAudioDelete(scriptJson: any, storyIdForContext?: string): string[] {
  return getPendingAudioDelete(scriptJson, storyIdForContext)
}

/** Pure merge: set the pending audio-delete URL list, preserving all other keys. */
export function setPendingAudioDelete(
  scriptJson: any,
  urls: string[]
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
      [PENDING_AUDIO_DELETE_KEY]: (urls || []).map((u) => String(u)),
    },
  }
}

/** Union two pending audio-delete URL lists (deduped, order-preserving). */
export function unionPendingAudioDeletes(first: string[], second: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of [...(first || []), ...(second || [])]) {
    const url = String(u)
    if (!seen.has(url)) {
      seen.add(url)
      out.push(url)
    }
  }
  return out
}

/**
 * Map exact audio URLs to scoped storage paths for one story row. Each
 * URL's basename becomes `asc3/<storyId>/<basename>` (deduped, blanks
 * dropped) — the delete set is EXACTLY these files, never a broad prefix.
 */
export function audioDeletePathsForStory(storyId: string, urls: string[]): string[] {
  const prefix = `asc3/${String(storyId)}`
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls || []) {
    const text = String(raw || '').trim()
    if (!text) continue
    let base = ''
    try {
      const parsed = new URL(text)
      base = String(parsed.pathname.split('/').pop() || '').trim()
    } catch {
      base = String(text.split('?')[0].split('/').pop() || '').trim()
    }
    if (!base) continue
    const path = `${prefix}/${base}`
    if (!seen.has(path)) {
      seen.add(path)
      out.push(path)
    }
  }
  return out
}

/**
 * Storage-only half of the audio-delete drain: remove EXACTLY the scoped
 * storage paths derived from `urls` (no bucket listing — the intent names
 * the files). Performs ZERO DB writes, so the pending intent list stays
 * intact in the DB — the caller must clear it (clearPendingAudioDelete)
 * only after its own continuation state is durably persisted. Empty
 * intent is a pure no-op (zero storage calls). Returns removed paths.
 */
export async function removePendingAudioFiles(
  supabaseClient: any,
  storyId: string,
  urls?: string[]
): Promise<string[]> {
  const id = String(storyId)
  let intent = urls ? [...urls] : null
  if (!intent) {
    const { data: row, error: readError } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', id)
      .single()
    if (readError || !row) {
      throw new Error(
        `Failed to read Belle pending audio-delete intent on ${id}: ` +
          `${readError?.message || 'missing row'}`
      )
    }
    intent = getPendingAudioDelete((row as any).script_json, id)
  }
  if (!intent || intent.length === 0) return []
  const paths = audioDeletePathsForStory(id, intent)
  if (paths.length > 0) {
    const { error: removeError } = await supabaseClient.storage
      .from('audio')
      .remove(paths)
    if (removeError) {
      throw new Error(
        `Failed to delete stale Belle audio files for ${id}: ${removeError.message} ` +
          `(pending audio-delete intent intact in DB for ${intent.length} URL(s))`
      )
    }
  }
  return paths
}

/**
 * Finish a pending audio-delete intent: remove EXACTLY the scoped storage
 * paths derived from `urls` (no bucket listing — the intent names the
 * files), then clear the intent list via a CAS-guarded script_json-only
 * write (concurrent additions unioned back on conflict, never dropped).
 * Empty intent is a pure no-op (zero storage calls). Returns removed paths.
 */
export async function drainPendingAudioDeletes(
  supabaseClient: any,
  storyId: string,
  urls?: string[]
): Promise<string[]> {
  const id = String(storyId)
  let intent = urls ? [...urls] : null
  if (!intent) {
    const { data: row, error: readError } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', id)
      .single()
    if (readError || !row) {
      throw new Error(
        `Failed to read Belle pending audio-delete intent on ${id}: ` +
          `${readError?.message || 'missing row'}`
      )
    }
    intent = getPendingAudioDelete((row as any).script_json, id)
  }
  if (!intent || intent.length === 0) return []
  const paths = await removePendingAudioFiles(supabaseClient, id, intent)
  // Subtract ONLY the intents this run processed (by identity): an intent
  // added concurrently between the DELETE above and the clearing read
  // below is absent from `intent`, so it survives the clear and its file
  // is never touched (no scope creep).
  await clearPendingAudioDelete(supabaseClient, id, intent)
  return paths
}

/**
 * CAS-guarded clear of the pending audio-delete list (script_json ONLY).
 * Removes ONLY the intents this run processed (`processedUrls`, matched by
 * exact trimmed-URL identity) from a FRESH read — never from a possibly-
 * stale caller-side list, never the whole list. An intent added
 * concurrently between this run's DELETE and the clearing read is absent
 * from the processed set, so it survives even when the CAS write succeeds
 * on first attempt (and its file was never in this run's delete set).
 * When none of the processed intents remain (already cleared), this is a
 * pure no-op with zero writes. The write is CAS-conditioned on the
 * freshly-read snapshot with an affected-row check; on a zero-row conflict
 * the subtraction is recomputed against a new fresh read and retried once.
 * A second zero-row conflict throws loudly with the row untouched.
 */
export async function clearPendingAudioDelete(
  supabaseClient: any,
  storyId: string,
  processedUrls: string[]
): Promise<void> {
  const processed = new Set(
    (processedUrls || []).map((u) => String(u || '').trim()).filter((u) => u.length > 0)
  )
  if (processed.size === 0) return
  const subtractProcessed = (current: string[]): string[] =>
    (current || []).filter((u) => !processed.has(String(u || '').trim()))
  const { data: row, error: readError } = await supabaseClient
    .from('stories')
    .select('id,script_json')
    .eq('id', storyId)
    .single()
  if (readError || !row) {
    throw new Error(
      `Failed to clear Belle pending audio-delete intent on ${storyId}: ` +
        `${readError?.message || 'missing row'}`
    )
  }
  const snapshot = (row as any).script_json
  const remaining = subtractProcessed(safeReadAudioDelete(snapshot, storyId))
  const current = safeReadAudioDelete(snapshot, storyId)
  if (remaining.length === current.length) return
  // LARGE-DOC-CAS: server-side compare (body params, no URL filter).
  try {
    await casUpdateStory(supabaseClient, {
      storyId,
      expected: snapshot,
      updates: { script_json: setPendingAudioDelete(snapshot, remaining) },
    })
    return
  } catch (e) {
    if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
      throw new Error(
        `Failed to clear Belle pending audio-delete intent on ${storyId}: ${(e as Error).message}`
      )
    }
  }
  const { data: fresh, error: rereadError } = await supabaseClient
    .from('stories')
    .select('id,script_json')
    .eq('id', storyId)
    .single()
  if (rereadError || !fresh) {
    throw new Error(
      `Failed to re-read Belle pending audio-delete intent on ${storyId} ` +
        `after concurrent modification: ${rereadError?.message || 'missing row'} ` +
        `(pending data left intact in the DB — nothing pruned)`
    )
  }
  const freshSnapshot = (fresh as any).script_json
  const freshCurrent = safeReadAudioDelete(freshSnapshot, storyId)
  const retryRemaining = subtractProcessed(freshCurrent)
  if (retryRemaining.length === freshCurrent.length) return
  const retryJson = setPendingAudioDelete(freshSnapshot, retryRemaining)
  try {
    await casUpdateStory(supabaseClient, {
      storyId,
      expected: freshSnapshot,
      updates: { script_json: retryJson },
    })
    return
  } catch (e) {
    if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
      throw new Error(
        `Failed to clear Belle pending audio-delete intent on ${storyId}: ${(e as Error).message} ` +
          `(pending data left intact in the DB — nothing pruned)`
      )
    }
  }
  const conflictError = new Error(
    `Refused Belle pending audio-delete clear on ${storyId}: story script_json ` +
      `changed again before the retry write (concurrent modification — ` +
      `row left unmodified, pending intent kept for a later tick)`
  )
  ;(conflictError as Error & { code?: string }).code = CONCURRENT_MOD_CODE
  throw conflictError
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
    /**
     * Durable invalidation intent: exact outro audio URLs requiring
     * deletion, embedded into script_json in the SAME atomic update (never
     * invents the key when empty — intent-free repairs keep their shape).
     */
    pendingAudioDeleteUrls?: string[]
  }
): Promise<{ drainedDependentIds: string[] }> {
  const repairedStoryId = String(params.repairedStoryId)
  const audioIntent = (params.pendingAudioDeleteUrls || [])
    .map((u) => String(u || '').trim())
    .filter((u) => u.length > 0)
  // Embed the durable invalidation intent into the atomic payload (unioned
  // with any intent the route already placed there — intent never dropped).
  let updatesWithIntent = params.storyUpdates
  if (audioIntent.length > 0) {
    const priorAudio = safeReadAudioDelete(
      (params.storyUpdates as any)?.script_json,
      repairedStoryId
    )
    updatesWithIntent = {
      ...params.storyUpdates,
      script_json: setPendingAudioDelete(
        (params.storyUpdates as any)?.script_json,
        unionPendingAudioDeletes(priorAudio, audioIntent)
      ),
    }
  }
  const hasSnapshot = params.expectedRepairedScriptJson !== undefined
  // LARGE-DOC-CAS: the full repair shape goes through ONE atomic RPC
  // statement (all repaired columns, single statement — atomicity kept).
  let firstData: any[] | undefined
  if (hasSnapshot) {
    try {
      await casUpdateStory(supabaseClient, {
        storyId: repairedStoryId,
        expected: params.expectedRepairedScriptJson,
        updates: updatesWithIntent as Record<string, unknown>,
      })
      firstData = [{ id: repairedStoryId }]
    } catch (e) {
      if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
        throw new Error(
          `Failed to save repaired Belle copy: ${(e as Error).message}`
        )
      }
      firstData = []
    }
  } else {
    const plainAttempt = await supabaseClient
      .from('stories')
      .update(updatesWithIntent)
      .eq('id', repairedStoryId)
    if (plainAttempt.error) {
      throw new Error(
        `Failed to save repaired Belle copy: ${plainAttempt.error.message}`
      )
    }
  }
  let effectiveUpdates = updatesWithIntent
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
      (updatesWithIntent as any)?.script_json
    )
    effectiveUpdates = { ...updatesWithIntent, script_json: rebasedJson }
    effectivePending = safeReadPending(rebasedJson, repairedStoryId)
    try {
      await casUpdateStory(supabaseClient, {
        storyId: repairedStoryId,
        expected: freshSnapshot,
        updates: effectiveUpdates as Record<string, unknown>,
      })
    } catch (e) {
      if ((e as any)?.code !== CONCURRENT_MOD_CODE) {
        throw new Error(
          `Failed to save repaired Belle copy on retry: ${(e as Error).message} ` +
            `(row left unmodified by the retry — repair may retry on a later tick)`
        )
      }
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
  /** Scoped storage paths removed while finishing the durable audio-delete intent. */
  deletedAudioFiles: string[]
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
 * Durable audio-delete intents ride along: every carrier (failing row or
 * scan hit) finishes its pending_audio_delete intent with scoped storage
 * DELETEs BEFORE any pin drain — and the whole function runs hoisted before
 * any regen/rewrite — so a kill-after-persist is completed with zero paid
 * calls. A carrier qualifies on pins OR audio intent alone.
 *
 * `loadSeriesStories` is invoked LAZILY — only when the failing row itself
 * carries nothing pending. Drain-only recovery performs no validation and
 * consumes no attempt (this function never touches retry counts; job-row
 * writes are the caller's).
 */
/**
 * One pre-packaging recovery carrier found by read-only discovery: which
 * row carries pending pin-resync entries and/or a pending audio-delete
 * intent, how it was found, and the exact lists read (fresh — never a
 * stale scan snapshot for the drain inputs).
 */
export interface PrePackagingRecoveryCarrier {
  storyId: string
  via: 'failing-row' | 'series-scan'
  episodeNumber: number | null
  pendingPins: PendingPinResyncEntry[]
  audioUrls: string[]
}

/**
 * Read-only discovery for the pre-packaging recovery path: resolves the
 * drain candidates exactly as recoverPendingPinDrains does (failing-episode
 * row first, then a lazy series-scoped scan ONLY when the failing row
 * carried nothing), with ZERO writes. Malformed lists throw loudly here —
 * before any drain, delete, or continuation write — with pending intact.
 * Read blips fall through (no queue-jam) just like the drain path.
 */
export async function collectPrePackagingRecoveryCarriers(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
  }
): Promise<PrePackagingRecoveryCarrier[]> {
  const carriers: PrePackagingRecoveryCarrier[] = []
  const failingId = String(args.failingStoryId || '').trim()
  if (failingId) {
    // episode_number rides along so downstream stage resets key episodes
    // exactly as the series packager does (String(episodeNumber || id)).
    const { data, error } = await supabaseClient
      .from('stories')
      .select('id,script_json,episode_number')
      .eq('id', failingId)
      .single()
    if (!error && data) {
      const failingPending = getPendingPinResync(
        (data as any).script_json,
        failingId
      )
      const failingAudio = getPendingAudioDelete(
        (data as any).script_json,
        failingId
      )
      if (failingPending.length > 0 || failingAudio.length > 0) {
        carriers.push({
          storyId: failingId,
          via: 'failing-row',
          episodeNumber: rowEpisodeNumber(data),
          pendingPins: failingPending,
          audioUrls: failingAudio,
        })
      }
    }
  }
  if (typeof args.loadSeriesStories === 'function' && carriers.length === 0) {
    let seriesStories: any[] = []
    // Lazy fallback: only scan when the failing row carried nothing.
    try {
      seriesStories = (await args.loadSeriesStories()) || []
    } catch {
      seriesStories = []
    }
    for (const row of seriesStories) {
      const carrierId = String((row as any)?.id || '').trim()
      if (!carrierId) continue
      const scanned = getPendingPinResync(
        (row as any)?.script_json,
        carrierId
      )
      // Stale-snapshot pre-filter only: audio intent admits a carrier just
      // like pins do (both re-verified fresh below; malformed stays loud).
      const scannedAudio = getPendingAudioDelete(
        (row as any)?.script_json,
        carrierId
      )
      if (scanned.length === 0 && scannedAudio.length === 0) continue
      // Re-read the carrier fresh: the scan snapshot may be stale, and
      // draining (plus its prune) off a stale pending list could drop a
      // concurrently-added entry. Read blip -> skip without jamming.
      // episode_number rides along (same stage-reset keying as above).
      const { data: fresh, error: freshError } = await supabaseClient
        .from('stories')
        .select('id,script_json,episode_number')
        .eq('id', carrierId)
        .single()
      if (freshError || !fresh) continue
      const freshPending = getPendingPinResync(
        (fresh as any).script_json,
        carrierId
      )
      const freshAudio = getPendingAudioDelete(
        (fresh as any).script_json,
        carrierId
      )
      if (freshPending.length === 0 && freshAudio.length === 0) continue
      carriers.push({
        storyId: carrierId,
        via: 'series-scan',
        episodeNumber:
          rowEpisodeNumber(row) ?? rowEpisodeNumber(fresh),
        pendingPins: freshPending,
        audioUrls: freshAudio,
      })
    }
  }
  return carriers
}

export async function recoverPendingPinDrains(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
  }
): Promise<PendingDrainResolution[]> {
  const carriers = await collectPrePackagingRecoveryCarriers(
    supabaseClient,
    args
  )
  const out: PendingDrainResolution[] = []
  for (const carrier of carriers) {
    const deletedAudio = await drainPendingAudioDeletes(
      supabaseClient,
      carrier.storyId,
      carrier.audioUrls
    )
    const drained = await drainPendingPinResync(
      supabaseClient,
      carrier.storyId,
      carrier.pendingPins
    )
    out.push({
      repairedStoryId: carrier.storyId,
      drainedDependentIds: drained,
      via: carrier.via,
      episodeNumber: carrier.episodeNumber,
      deletedAudioFiles: deletedAudio,
    })
  }
  return out
}

/**
 * Pre-packaging audio-recovery state fix: fold an already-completed
 * pre-packaging recovery into the job state BEFORE packaging can advance.
 * Every resolution whose audio-delete intent actually removed files
 * (deletedAudioFiles non-empty) invalidates the affected episode's
 * required stages — Belle audio (seriesBelleGeneration) + mixing
 * (seriesRenderFinalMix) + the package-completion flag itself
 * (seriesCompleteStoryPackage, whose doneByEp the packager uses to SKIP
 * episodes) — keyed exactly as the packager keys them
 * (String(episodeNumber || repairedStoryId)), with allDone cleared so
 * replacement audio + mixing are scheduled. Episodes without deleted
 * audio keep their flags untouched. The removed files are recorded on the
 * existing per-episode Belle-retry record (counts untouched — recovery
 * consumes no attempt). Pure: no DB calls, no writes.
 */
export function applyAudioDeleteRecoveryToState(
  baseState: any,
  recovery: PendingDrainResolution[]
): {
  state: any
  affectedKeys: string[]
  deletedFilesByStory: Record<string, string[]>
} {
  const state =
    baseState && typeof baseState === 'object'
      ? { ...(baseState as Record<string, unknown>) }
      : {}
  const affectedKeys: string[] = []
  const deletedFilesByStory: Record<string, string[]> = {}
  const episodeByStory: Record<string, number | null> = {}
  for (const res of recovery || []) {
    const files = Array.isArray((res as any)?.deletedAudioFiles)
      ? (res as PendingDrainResolution).deletedAudioFiles.map(String)
      : []
    if (files.length === 0) continue
    const storyId = String((res as any)?.repairedStoryId || '').trim()
    if (!storyId) continue
    const key = String((res as any)?.episodeNumber || storyId)
    if (!affectedKeys.includes(key)) affectedKeys.push(key)
    deletedFilesByStory[storyId] = files
    episodeByStory[storyId] = (res as any)?.episodeNumber ?? null
  }
  if (affectedKeys.length === 0) return { state, affectedKeys, deletedFilesByStory }
  for (const stageKey of [
    'seriesBelleGeneration',
    'seriesRenderFinalMix',
    'seriesCompleteStoryPackage',
  ]) {
    const priorStage =
      (state as any)[stageKey] && typeof (state as any)[stageKey] === 'object'
        ? { ...((state as any)[stageKey] as Record<string, unknown>) }
        : {}
    const priorDone =
      priorStage.doneByEp && typeof priorStage.doneByEp === 'object'
        ? { ...((priorStage.doneByEp as unknown) as Record<string, unknown>) }
        : {}
    for (const key of affectedKeys) priorDone[key] = false
    ;(state as any)[stageKey] = {
      ...priorStage,
      doneByEp: priorDone,
      allDone: false,
      lastUpdatedAt: pendingResumeIsoNow(),
    }
  }
  const pkg =
    (state as any).seriesCompleteStoryPackage &&
    typeof (state as any).seriesCompleteStoryPackage === 'object'
      ? (state as any).seriesCompleteStoryPackage
      : {}
  const retry =
    (pkg as any).belleRetry && typeof (pkg as any).belleRetry === 'object'
      ? { ...((pkg as any).belleRetry as Record<string, unknown>) }
      : {}
  const byEpisode =
    (retry as any).byEpisode && typeof (retry as any).byEpisode === 'object'
      ? { ...((retry as any).byEpisode as Record<string, unknown>) }
      : {}
  for (const [storyId, files] of Object.entries(deletedFilesByStory)) {
    const priorRecord =
      (byEpisode as any)[storyId] && typeof (byEpisode as any)[storyId] === 'object'
        ? { ...((byEpisode as any)[storyId] as Record<string, unknown>) }
        : {}
    ;(byEpisode as any)[storyId] = {
      ...priorRecord,
      episodeNumber: (priorRecord as any).episodeNumber ?? episodeByStory[storyId] ?? null,
      deletedBelleFiles: files,
      audioDeleteRecoveredAt: pendingResumeIsoNow(),
    }
  }
  ;(state as any).seriesCompleteStoryPackage = {
    ...pkg,
    belleRetry: { ...retry, byEpisode },
  }
  return { state, affectedKeys, deletedFilesByStory }
}

/**
 * Persist the pre-packaging audio-recovery continuation on the SAME job
 * row. Without `transition` (legacy): status untouched — the job keeps
 * its lock and proceeds to packaging with corrected flags. With
 * `transition` (continuation): the SAME single PATCH also moves
 * status/current_step off packaging toward Belle generation, appends the
 * log entry, and releases the lock — the tick returns WITHOUT packaging.
 * No-op with zero writes when no resolution deleted audio (pin-only
 * recoveries need no regen). A fenced miss or write error throws BEFORE
 * any pending prune or packaging runs — fail-closed, so packaging can
 * never advance on stale completion flags it cannot see persisted, and
 * pending entries survive for a later tick to retry the continuation.
 * On success the in-memory job's row fields are updated too. Returns the
 * affected episode keys (empty when no-op).
 */
export async function persistPrePackagingAudioRecovery(
  supabaseClient: any,
  job: any,
  recovery: PendingDrainResolution[],
  fence?: Record<string, unknown>,
  transition?: {
    status?: string
    currentStep?: string
    releaseLock?: boolean
    logMessage?: string
    logDetails?: Record<string, unknown>
  }
): Promise<string[]> {
  const jobId = String(job?.id || 'unknown-job')
  const base =
    job?.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const { state, affectedKeys } = applyAudioDeleteRecoveryToState(base, recovery)
  if (affectedKeys.length === 0) return []
  const update: Record<string, unknown> = { state_json: state }
  if (transition?.status) update.status = transition.status
  if (transition?.currentStep) update.current_step = transition.currentStep
  let logs: unknown[] | null = null
  if (transition?.logMessage) {
    const priorLogs = Array.isArray(job?.logs) ? job.logs : []
    logs = [
      ...priorLogs,
      {
        at: pendingResumeIsoNow(),
        step:
          job?.current_step !== undefined && job?.current_step !== null
            ? String(job.current_step)
            : null,
        message: transition.logMessage,
        ...(transition.logDetails && typeof transition.logDetails === 'object'
          ? transition.logDetails
          : {}),
      },
    ]
    update.logs = logs
  }
  if (transition?.releaseLock) {
    update.locked_at = null
    update.locked_by = null
  }
  const { data, error } = await supabaseClient
    .from('production_jobs')
    .update(update)
    .match(fence && typeof fence === 'object' ? fence : { id: jobId })
    .select('id')
  if (error) {
    throw new Error(
      `Failed to persist pre-packaging Belle audio recovery for job ${jobId}: ${error.message}`
    )
  }
  if (!data || data.length === 0) {
    throw new Error(
      `Failed to persist pre-packaging Belle audio recovery for job ${jobId}: ` +
        `zero rows matched (lock lost or concurrent update) — packaging NOT ` +
        `advanced on stale completion flags`
    )
  }
  if (job && typeof job === 'object') {
    job.state_json = state
    if (transition?.status) job.status = transition.status
    if (transition?.currentStep) job.current_step = transition.currentStep
    if (logs) job.logs = logs
    if (transition?.releaseLock) {
      job.locked_at = null
      job.locked_by = null
    }
  }
  return affectedKeys
}

/**
 * Release half of the pre-packaging audio-recovery continuation gate
 * (HANDOFF fix): the companion to persistPrePackagingAudioRecovery when
 * the continuation is persisted WITHOUT releasing the lock.
 *
 * The continuation PATCH queues the regeneration intent but leaves the job
 * UNCLAIMABLE (status still running, lock held) — no other worker can
 * start replacement Belle generation mid-cleanup. Only AFTER the pending
 * audio-delete intents are pruned and the pin resyncs drained does this
 * second fenced write flip status to queued and clear the lock, unblocking
 * generation. Fenced on the same owner fence: a write error or zero-row
 * match throws fail-closed (generation stays blocked) instead of
 * half-releasing. On success the in-memory job mirrors the release. Same
 * job, no new row, retry counts untouched.
 */
export async function releasePrePackagingContinuationLock(
  supabaseClient: any,
  job: any,
  fence?: Record<string, unknown>
): Promise<void> {
  const jobId = String(job?.id || 'unknown-job')
  const update: Record<string, unknown> = {
    status: 'queued',
    locked_at: null,
    locked_by: null,
  }
  const { data, error } = await supabaseClient
    .from('production_jobs')
    .update(update)
    .match(fence && typeof fence === 'object' ? fence : { id: jobId })
    .select('id')
  if (error) {
    throw new Error(
      `Failed to release pre-packaging Belle audio-recovery continuation lock for job ${jobId}: ${error.message}`
    )
  }
  if (!data || data.length === 0) {
    throw new Error(
      `Failed to release pre-packaging Belle audio-recovery continuation lock for job ${jobId}: ` +
        `zero rows matched (lock lost or concurrent update) — generation stays blocked`
    )
  }
  if (job && typeof job === 'object') {
    job.status = 'queued'
    job.locked_at = null
    job.locked_by = null
  }
}

/**
 * Same-job continuation step for the pre-packaging audio recovery: the
 * Belle-generation step the job returns to for replacement audio after
 * its stale files were deleted. NOT a new job.
 */
export const PRE_PACKAGING_CONTINUATION_STEP = 'series_generate_belle_assets'

/**
 * Pre-packaging recovery with a same-job continuation (the exact function
 * the run-next route calls as thin glue INSTEAD of packaging immediately).
 *
 * Ordering (fail-closed at every boundary):
 *   1. Read-only discovery (no writes; malformed stays loud).
 *   2. When NO carrier holds an audio-delete intent: legacy pin-only
 *      path — recoverPendingPinDrains, zero job writes — and the caller
 *      proceeds to packaging this tick (`continued: false`).
 *   3. Otherwise: delete the affected audio files from storage ONLY
 *      (pending intent lists stay intact in the DB).
 *   4. Persist the same-job continuation (step transition off
 *      complete_story_package toward Belle generation + affected
 *      Belle/mix/package flag resets, unaffected flags and all retry
 *      counts preserved) with the lock HELD and status still running —
 *      the continuation is durable but the job is UNCLAIMABLE, so no
 *      other worker can start replacement generation mid-cleanup. A
 *      write failure throws here with pending entries intact, so a later
 *      tick retries the continuation — never a half-persisted state that
 *      loses the recovery.
 *   5. With the lock still held: prune the processed audio intents and
 *      drain the pin resyncs (a failure here still throws loudly with
 *      pending intact AND the lock held — generation stays blocked; the
 *      generation-entry guard recovers stranded cleanup before any
 *      regen).
 *   6. Only after cleanup completes: release the lock through a second
 *      fenced write (status queued + lock cleared) — replacement
 *      generation is unblocked strictly after pending cleanup.
 *
 * Returns `continued: true` when the caller MUST return from the current
 * tick BEFORE any packaging call (zero packaging calls that tick); a
 * subsequent tick at the continuation step regenerates replacement Belle
 * audio for the reset episodes, then mixing, then packaging.
 */
export async function runPrePackagingRecoveryWithContinuation(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
    job: any
    fence?: Record<string, unknown>
  }
): Promise<{
  continued: boolean
  recovery: PendingDrainResolution[]
  affectedKeys: string[]
}> {
  const carriers = await collectPrePackagingRecoveryCarriers(supabaseClient, {
    failingStoryId: args.failingStoryId,
    loadSeriesStories: args.loadSeriesStories,
  })
  const audioCarriers = carriers.filter(
    (c) => (c.audioUrls || []).length > 0
  )
  if (audioCarriers.length === 0) {
    const recovery = await recoverPendingPinDrains(supabaseClient, {
      failingStoryId: args.failingStoryId,
      loadSeriesStories: args.loadSeriesStories,
    })
    return { continued: false, recovery, affectedKeys: [] }
  }
  // Storage deletes only — pending intent lists survive until the
  // continuation below lands.
  const base =
    args.job?.state_json && typeof args.job.state_json === 'object'
      ? args.job.state_json
      : {}
  const resolutions: PendingDrainResolution[] = []
  for (const carrier of audioCarriers) {
    const deletedAudio = await removePendingAudioFiles(
      supabaseClient,
      carrier.storyId,
      carrier.audioUrls
    )
    resolutions.push({
      repairedStoryId: carrier.storyId,
      drainedDependentIds: [],
      via: carrier.via,
      episodeNumber: carrier.episodeNumber,
      deletedAudioFiles: deletedAudio,
    })
  }
  // Degenerate intent (no derivable storage paths anywhere): nothing to
  // regenerate — converge through the legacy drain (prunes pending) and
  // let packaging proceed rather than stranding intent across ticks.
  const planned = applyAudioDeleteRecoveryToState(base, resolutions)
  if (planned.affectedKeys.length === 0) {
    const recovery = await recoverPendingPinDrains(supabaseClient, {
      failingStoryId: args.failingStoryId,
      loadSeriesStories: args.loadSeriesStories,
    })
    return { continued: false, recovery, affectedKeys: [] }
  }
  // HANDOFF gate: the continuation persists with the lock HELD and the
  // status still running — the job is durable but UNCLAIMABLE, so no other
  // worker can start replacement Belle generation mid-cleanup. The lock is
  // released (second fenced write below) strictly AFTER the pending prune.
  const affectedKeys = await persistPrePackagingAudioRecovery(
    supabaseClient,
    args.job,
    resolutions,
    args.fence,
    {
      currentStep: PRE_PACKAGING_CONTINUATION_STEP,
      logMessage:
        'Belle audio recovery: continuation to Belle generation (packaging deferred)',
      logDetails: {
        affectedKeys: planned.affectedKeys,
        repairedStories: audioCarriers.map((c) => c.storyId),
        deletedFiles: planned.deletedFilesByStory,
      },
    }
  )
  // The continuation landed with the lock held: now prune the processed
  // intents and drain the pins (fresh reads inside each call keep
  // concurrent additions). A failure here still throws loudly with pending
  // intact AND the lock held — generation stays blocked, and the
  // generation-entry guard (recoverStrandedContinuationCleanup) finishes
  // the certified cleanup before any regen on the next worker entry.
  const drainedByStory: Record<string, string[]> = {}
  for (const carrier of carriers) {
    if ((carrier.pendingPins || []).length > 0) {
      drainedByStory[carrier.storyId] = await drainPendingPinResync(
        supabaseClient,
        carrier.storyId,
        carrier.pendingPins
      )
    }
  }
  for (const carrier of audioCarriers) {
    await clearPendingAudioDelete(supabaseClient, carrier.storyId, carrier.audioUrls)
  }
  // Cleanup complete: release the lock so the job becomes claimable for
  // replacement generation. Fenced — a zero-row match throws fail-closed
  // (generation stays blocked) instead of half-releasing.
  await releasePrePackagingContinuationLock(supabaseClient, args.job, args.fence)
  const recovery: PendingDrainResolution[] = [
    ...resolutions.map((r) => ({
      ...r,
      drainedDependentIds: drainedByStory[r.repairedStoryId] || [],
    })),
    ...carriers
      .filter((c) => (c.audioUrls || []).length === 0)
      .map((c) => ({
        repairedStoryId: c.storyId,
        drainedDependentIds: drainedByStory[c.storyId] || [],
        via: c.via,
        episodeNumber: c.episodeNumber,
        deletedAudioFiles: [] as string[],
      })),
  ]
  return { continued: true, recovery, affectedKeys }
}

/**
 * Generation-entry guard for the pre-packaging audio-recovery continuation
 * (HANDOFF fix — the durable recovery path; the exact function the
 * run-next route calls as thin glue BEFORE replacement Belle generation).
 *
 * If execution stops after the continuation persisted but before the
 * pending prune (or the prune itself failed), the job sits at the
 * continuation step with its lock stale and the certified deletion intent
 * still pending. The next worker entry MUST NOT generate replacement audio
 * against that surviving intent — a later recovery would storage-delete the
 * fresh recording at the reused filename (paid regen destroyed). This guard
 * retires the certified intent BEFORE any generation call on the tick.
 *
 * Certified-only, storage-free, job-write-free:
 *   - In-memory gate first: unless the job sits at
 *     PRE_PACKAGING_CONTINUATION_STEP with persisted deletedBelleFiles
 *     markers (the continuation PATCH's certificate that storage-delete
 *     already ran for those stories), this is a pure no-op with ZERO DB
 *     calls — ordinary jobs pay nothing.
 *   - With markers: fresh carrier reads, then per certified story clear
 *     ONLY the intent URLs whose derived storage path is in the certified
 *     set (clearPendingAudioDelete identity-subtract, CAS-guarded — a
 *     concurrently-added intent for an uncertified path survives), plus
 *     the pin-resync drain for certified stories. Affected stories only;
 *     retry counts untouched (zero job writes).
 *   - ZERO storage calls by construction: the markers certify the files
 *     are already deleted, so re-deleting is both unnecessary and unsafe
 *     (it could hit a regenerated file at the reused path). The guard can
 *     never delete any file, fresh or otherwise.
 *
 * Returns `recovered: true` when the certified cleanup pass ran (even when
 * nothing remained), `false` for the no-op path.
 */
export async function recoverStrandedContinuationCleanup(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
    job: any
  }
): Promise<{
  recovered: boolean
  clearedAudioIntents: Record<string, string[]>
  drainedPins: Record<string, string[]>
}> {
  const idle = {
    recovered: false,
    clearedAudioIntents: {},
    drainedPins: {},
  }
  const job = args?.job
  if (!job || typeof job !== 'object') return idle
  if (String((job as any).current_step || '') !== PRE_PACKAGING_CONTINUATION_STEP)
    return idle
  const state =
    (job as any).state_json && typeof (job as any).state_json === 'object'
      ? (job as any).state_json
      : null
  const pkg = state?.seriesCompleteStoryPackage
  const byEpisode =
    pkg && typeof pkg === 'object' && (pkg as any).belleRetry && typeof (pkg as any).belleRetry === 'object'
      ? (pkg as any).belleRetry.byEpisode
      : null
  if (!byEpisode || typeof byEpisode !== 'object') return idle
  const certifiedByStory: Record<string, Set<string>> = {}
  for (const [storyId, rec] of Object.entries(byEpisode as Record<string, unknown>)) {
    const files =
      rec && typeof rec === 'object'
        ? (rec as Record<string, unknown>).deletedBelleFiles
        : null
    if (Array.isArray(files) && files.length > 0) {
      certifiedByStory[String(storyId)] = new Set(files.map((f) => String(f)))
    }
  }
  if (Object.keys(certifiedByStory).length === 0) return idle
  // Markers present: the continuation landed, so the cleanup pass runs.
  const carriers = await collectPrePackagingRecoveryCarriers(supabaseClient, {
    failingStoryId: args.failingStoryId,
    loadSeriesStories: args.loadSeriesStories,
  })
  const clearedAudioIntents: Record<string, string[]> = {}
  const drainedPins: Record<string, string[]> = {}
  for (const carrier of carriers) {
    // Affected-only: stories outside the certified set belong to other
    // flows — their intents stay untouched for their own ticks.
    const certified = certifiedByStory[carrier.storyId]
    if (!certified) continue
    const intent = (carrier.audioUrls || []).map((u) => String(u))
    const covered = intent.filter((u) => {
      const derived = audioDeletePathsForStory(carrier.storyId, [u])
      return derived.length > 0 && certified.has(derived[0])
    })
    if (covered.length > 0) {
      await clearPendingAudioDelete(supabaseClient, carrier.storyId, covered)
      clearedAudioIntents[carrier.storyId] = covered
    }
    if ((carrier.pendingPins || []).length > 0) {
      drainedPins[carrier.storyId] = await drainPendingPinResync(
        supabaseClient,
        carrier.storyId,
        carrier.pendingPins
      )
    }
  }
  return { recovered: true, clearedAudioIntents, drainedPins }
}

/**
 * Series packaging entry with PRIOR pending recovery (the exact function
 * the run-next route calls as thin glue around runSeriesPackageCompletion).
 * Runs recoverPendingPinDrains BEFORE `runPackage` can validate or advance
 * anything, so a packaging success — or a packaging exception — can no
 * longer bypass cleanup of stranded repair state. The optional `onRecovery`
 * hook runs after recovery and BEFORE packaging (the route's pre-packaging
 * audio-recovery continuation lives here); its throw stays fail-closed
 * before packaging. A recovery throw stays fail-closed before packaging;
 * a packaging throw propagates AFTER recovery has completed (its effects
 * are already in the DB).
 */
export async function runSeriesPackagingWithPriorRecovery<T>(
  supabaseClient: any,
  args: {
    failingStoryId: string
    loadSeriesStories?: () => Promise<any[]>
    onRecovery?: (recovery: PendingDrainResolution[]) => Promise<void> | void
    runPackage: () => Promise<T>
  }
): Promise<{ recovery: PendingDrainResolution[]; result: T }> {
  const recovery = await recoverPendingPinDrains(supabaseClient, {
    failingStoryId: args.failingStoryId,
    loadSeriesStories: args.loadSeriesStories,
  })
  if (recovery.length > 0 && typeof args.onRecovery === 'function') {
    await args.onRecovery(recovery)
  }
  const result = await args.runPackage()
  return { recovery, result }
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
    /**
     * Durable invalidation intent: exact outro audio URLs. When provided,
     * the persist embeds them alongside pending_pin_resync and the delete
     * removes EXACTLY those scoped files (no bucket listing) before
     * clearing the intent — a kill-after-persist is finished by recovery.
     * When absent/empty, the legacy list-and-remove-scoped-names path runs.
     */
    pendingAudioDeleteUrls?: string[]
  }
): Promise<{ drainedDependentIds: string[]; deletedBelleFiles: string[] }> {
  const { drainedDependentIds } = await persistBelleRepair(
    supabaseClient,
    params
  )
  const intentUrls = (params.pendingAudioDeleteUrls || [])
    .map((u) => String(u || '').trim())
    .filter((u) => u.length > 0)
  const deletedBelleFiles =
    intentUrls.length > 0
      ? await drainPendingAudioDeletes(
          supabaseClient,
          String(params.repairedStoryId),
          intentUrls
        )
      : await deleteBelleAudioFiles(
          supabaseClient,
          String(params.repairedStoryId),
          Boolean(params.repairIntro),
          Boolean(params.repairOutro)
        )
  return { drainedDependentIds, deletedBelleFiles }
}

/**
 * NARROW REVIVAL ENTRY (P5 entry-gaps): a FAILED job the
 * blockedBelleResumeInfo family does NOT admit (wrong kind, marc_required
 * set, no safe_resume_point) may still be revived when a repair-carrying
 * episode row — its own candidates, else a series-scoped fallback scan —
 * holds a NON-EMPTY pending_pin_resync list or a non-empty
 * pending_audio_delete intent FOR THIS JOB's repair (belle_repair_audit
 * job-id linkage), the failure class is Belle-repair/package-completion,
 * and the recovery step is allowed — the kill-after-persist case: the
 * repair text is durable in the DB, only the drain never ran.
 * Every other failed job is refused unchanged (returns null).
 *
 * Cap: resume attempts are counted on the job row
 * (state_json.pendingPinResumeCount); at PENDING_RESUME_MAX_ATTEMPTS the
 * job is re-marked terminal (status stays failed, error_json gains
 * exhausted + marc_required=true) and the story is flagged needs_attention.
 */

/** Max pending-pin revivals per job before terminal re-marking. */
export const PENDING_RESUME_MAX_ATTEMPTS = 2

/** State key counting pending-pin revivals on the job row. */
export const PENDING_RESUME_COUNT_KEY = 'pendingPinResumeCount'

/** Admission verdict for a failed job with a pending-carrying episode row. */
export interface PendingResumeAdmission {
  carrierStoryId: string
  pendingCount: number
  /** Non-empty pending_audio_delete URLs on the carrier (0 when pins-only). */
  audioIntentCount: number
  /** Which recovery the carrier qualifies for: pins, audio intent, or both. */
  scope: 'pins' | 'audio' | 'both'
}

/**
 * Failure classes admitted to the narrow pending revival entry: the
 * Belle-repair / package-completion family only. Matched against
 * job.error_json.kind, with the series Belle-retry actions as an alternate
 * signal (job.error_json.action). Any other failed job — even one whose
 * episode row carries leftover pending metadata — stays refused.
 */
export const PENDING_RESUME_ALLOWED_KINDS = [
  'belle_asset_blocked',
  'belle_quality_blocked',
  'belle_quality_hook_missing',
  'belle_quality_title_missing',
  'belle_quality_listener_missing',
  'belle_quality_repair_failed',
  'belle_quality_unknown',
  'belle_quality',
  'series_belle_retry_validation_failed',
  'continuity_pin_mismatch',
]

export const PENDING_RESUME_ALLOWED_ACTIONS = [
  'series_belle_retry',
  'series_belle_pin_drain',
]

/**
 * Recovery steps the narrow revival may re-queue to: Belle asset / quality /
 * repair steps plus the package-completion step. The candidate resume point
 * (explicit override, else error safe_resume_point, else current step, else
 * the repair default) must be one of these — otherwise the job is refused.
 */
export const PENDING_RESUME_ALLOWED_STEPS = [
  'repair_belle_quality',
  'generate_belle_assets',
  'validate_belle_assets',
  'validate_belle_quality',
  'series_generate_belle_assets',
  'complete_story_package',
]

/** Outcome of a bounded pending-pin resume attempt. */
export type PendingResumeOutcome =
  | { status: 'resumed'; jobId: string; resumePoint: string; resumeCount: number }
  | { status: 'exhausted'; jobId: string }
  | { status: 'refused'; jobId: string; reason: string }

function pendingResumeIsoNow(): string {
  return new Date().toISOString()
}

/** Candidate episode rows for a job: its own story_id plus state storyId. */
function pendingResumeStoryCandidates(job: any): string[] {
  const state =
    job?.state_json && typeof job.state_json === 'object'
      ? (job.state_json as Record<string, unknown>)
      : {}
  const raw = [job?.story_id, state.storyId]
  const out: string[] = []
  for (const id of raw) {
    const text = String(id || '').trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

/**
 * Repair-ownership check: the carrier row's script_json.series_generation
 * .belle_repair_audit must contain an entry stamped with this job's id —
 * the pending list links to THIS job's repair (same atomic persist wrote
 * both). A carrier whose pending metadata is leftover from another job's
 * repair (or has no audit at all) does not qualify. Malformed pending
 * lists still throw loudly via the caller's getPendingPinResync read
 * (fail-closed before any write); a missing/non-array audit simply refuses.
 */
function pendingCarrierLinksToJob(carrierScriptJson: any, jobId: string): boolean {
  const seriesGen =
    carrierScriptJson && typeof carrierScriptJson === 'object'
      ? (carrierScriptJson as any).series_generation
      : undefined
  const audit =
    seriesGen && typeof seriesGen === 'object'
      ? (seriesGen as any).belle_repair_audit
      : undefined
  if (!Array.isArray(audit)) return false
  return audit.some((e) => String((e as any)?.jobId || '') === String(jobId))
}

/**
 * Failure-class check for the narrow revival. Reads the PRODUCTION error
 * shape, not just the narrow top-level fields:
 *
 *  1. top-level error_json.kind / error_json.action (the narrow kinds and
 *     the series Belle-retry actions the route writes directly);
 *  2. nested error_json.detail.kind / error_json.detail.action — failJob
 *     persists a thrower's structuredErrorDetail under `detail` with
 *     top-level kind `unknown_step` (e.g. the Belle retry-validation
 *     thrower, whose detail carries kind
 *     series_belle_retry_validation_failed);
 *  3. the plain persistence/drain-error `unknown_step` variants — lib
 *     persist/drain throws carry no structured detail, but every one
 *     names Belle in the message (failJob persists them verbatim as
 *     top-level kind unknown_step).
 *
 * Paths 2–3 still need the carrier gates below (audit job-id linkage +
 * non-empty pending/audio + allowed step), so an unrelated unknown_step
 * with no Belle linkage stays refused. Pure read — zero DB calls.
 */
function pendingResumeFailureClass(err: Record<string, unknown>): boolean {
  const kind = String(err.kind || '')
  const action = String(err.action || '')
  if (
    (PENDING_RESUME_ALLOWED_KINDS as readonly string[]).includes(kind) ||
    (PENDING_RESUME_ALLOWED_ACTIONS as readonly string[]).includes(action)
  ) {
    return true
  }
  const detail = err.detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    const detailKind = String(d.kind || '')
    const detailAction = String(d.action || '')
    if (
      (PENDING_RESUME_ALLOWED_KINDS as readonly string[]).includes(detailKind) ||
      (PENDING_RESUME_ALLOWED_ACTIONS as readonly string[]).includes(detailAction)
    ) {
      return true
    }
  }
  if (kind === 'unknown_step' && /belle/i.test(String(err.message || ''))) {
    return true
  }
  return false
}

/**
 * Job-level gate for the narrow revival: FAILED status, a Belle-repair /
 * package-completion failure class (production error shape: top-level,
 * nested detail, or plain Belle drain/persist unknown_step), and an
 * allowed recovery step. Returns the candidate resume point when admitted,
 * else null. Pure read of the job object — zero DB calls, zero writes.
 */
function pendingResumeJobGate(job: any, resumePointOverride?: string): string | null {
  if (!job || String(job.status || '') !== 'failed') return null
  const err =
    job.error_json && typeof job.error_json === 'object'
      ? (job.error_json as Record<string, unknown>)
      : {}
  if (!pendingResumeFailureClass(err)) return null
  const point = String(
    resumePointOverride ||
      (err as Record<string, unknown>).safe_resume_point ||
      job.current_step ||
      ''
  ).trim() || 'repair_belle_quality'
  if (!(PENDING_RESUME_ALLOWED_STEPS as readonly string[]).includes(point)) return null
  return point
}

/**
 * Admission check: FAILED status plus a NON-EMPTY pending_pin_resync list
 * or a non-empty pending_audio_delete intent on a repair-carrying episode
 * row — the job's own candidate rows (job.story_id + state storyId)
 * first, then a series-scoped fallback scan (same pattern as the
 * recoverPendingPinDrains drain fallback) so a repair carrier on a third
 * row is found. A carrier qualifies on pins OR audio intent alone
 * (audio-only recovery is admitted with scope 'audio' when pins have
 * cleared but the delete intent remains).
 *
 * Restricted to the verified Belle recovery operation: the carrier's
 * belle_repair_audit must link to this job's repair (job id match), the
 * job's failure class must be Belle-repair/package-completion, and the
 * recovery step must be allowed. Unrelated failed jobs with leftover
 * pending metadata are refused (null) with ZERO writes. A read miss
 * refuses (no queue-jam); malformed pending throws loudly (fail-closed
 * before any write, like the drain path).
 */
export async function getPendingResumeAdmission(
  supabaseClient: any,
  job: any,
  opts?: { loadSeriesStories?: () => Promise<any[]>; resumePoint?: string }
): Promise<PendingResumeAdmission | null> {
  if (pendingResumeJobGate(job, opts?.resumePoint) === null) return null
  const jobId = String(job?.id || '')
  const consider = (storyId: string, scriptJson: any): PendingResumeAdmission | null => {
    const pending = getPendingPinResync(scriptJson, storyId)
    const audio = getPendingAudioDelete(scriptJson, storyId)
    if (pending.length === 0 && audio.length === 0) return null
    if (!pendingCarrierLinksToJob(scriptJson, jobId)) return null
    return {
      carrierStoryId: storyId,
      pendingCount: pending.length,
      audioIntentCount: audio.length,
      scope: pending.length > 0 && audio.length > 0 ? 'both' : pending.length > 0 ? 'pins' : 'audio',
    }
  }
  for (const storyId of pendingResumeStoryCandidates(job)) {
    const { data, error } = await supabaseClient
      .from('stories')
      .select('id,script_json')
      .eq('id', storyId)
      .single()
    if (error || !data) continue
    const hit = consider(storyId, (data as any).script_json)
    if (hit) return hit
  }
  if (typeof opts?.loadSeriesStories === 'function') {
    let seriesStories: any[] = []
    try {
      seriesStories = (await opts.loadSeriesStories()) || []
    } catch {
      seriesStories = []
    }
    const seen = new Set(pendingResumeStoryCandidates(job))
    for (const row of seriesStories) {
      const carrierId = String((row as any)?.id || '').trim()
      if (!carrierId || seen.has(carrierId)) continue
      seen.add(carrierId)
      const hit = consider(carrierId, (row as any)?.script_json)
      if (hit) return hit
    }
  }
  return null
}

/**
 * Bounded pending-pin resume (the exact function the run-next route calls
 * as thin glue from tryResumeBlockedBelleJob): admit a failed job with a
 * verified Belle-repair pending carrier (ownership + failure class +
 * recovery step; own rows first, series fallback), re-queue it to `resumePoint` (default:
 * the error's safe_resume_point, else the step it failed at) so the hoisted
 * drain-first recovery runs before any regen/rewrite, counting the attempt
 * on the job row. At the bound the job is re-marked terminal
 * (exhausted + marc_required=true) and the story flagged needs_attention.
 * Admission read errors refuse without writing; the job-row writes are
 * fenced on status=failed with an affected-row check (zero rows = refused).
 */
export async function resumePendingPinJob(
  supabaseClient: any,
  job: any,
  opts?: { maxResumes?: number; resumePoint?: string; loadSeriesStories?: () => Promise<any[]> }
): Promise<PendingResumeOutcome> {
  const jobId = String(job?.id || 'unknown-job')
  if (!job || String(job.status || '') !== 'failed') {
    return { status: 'refused', jobId, reason: 'job is not failed' }
  }
  let admission: PendingResumeAdmission | null = null
  try {
    admission = await getPendingResumeAdmission(supabaseClient, job, {
      loadSeriesStories: opts?.loadSeriesStories,
      resumePoint: opts?.resumePoint,
    })
  } catch {
    return { status: 'refused', jobId, reason: 'pending admission unreadable' }
  }
  if (!admission) {
    return { status: 'refused', jobId, reason: 'no verified Belle-repair pending carrier for this job' }
  }
  const state =
    job.state_json && typeof job.state_json === 'object'
      ? { ...(job.state_json as Record<string, unknown>) }
      : {}
  const err =
    job.error_json && typeof job.error_json === 'object'
      ? { ...(job.error_json as Record<string, unknown>) }
      : {}
  const maxResumes = Number(opts?.maxResumes ?? PENDING_RESUME_MAX_ATTEMPTS)
  const resumeCount = Number(state[PENDING_RESUME_COUNT_KEY] ?? 0)
  const storyId =
    (job.story_id as string | undefined) ||
    (state.storyId as string | undefined) ||
    admission.carrierStoryId
  const priorLogs = Array.isArray(job.logs) ? [...job.logs] : []
  if (!(resumeCount < maxResumes)) {
    // Bound spent: re-mark terminal + marc_required, flag the story.
    const reason =
      `Belle pending-drain revivals exhausted (${resumeCount}/${maxResumes}) ` +
      `for carrier ${admission.carrierStoryId} (${admission.pendingCount} entr${admission.pendingCount === 1 ? 'y' : 'ies'} still pending). ` +
      `Manual fix needed: drain pending_pin_resync, delete stale Belle audio, reset job.`
    const { error: terminalError, data: terminalData } = await supabaseClient
      .from('production_jobs')
      .update({
        error_json: {
          ...err,
          exhausted: true,
          needsAttention: true,
          marc_required: true,
          fixRecommendation: reason,
        },
        logs: [
          ...priorLogs,
          {
            at: pendingResumeIsoNow(),
            event: 'belle_pending_resume_exhausted',
            jobId,
            carrierStoryId: admission.carrierStoryId,
            pendingCount: admission.pendingCount,
            message: reason,
          },
        ],
        locked_at: null,
        locked_by: null,
      })
      .eq('id', jobId)
      .eq('status', 'failed')
      .select('id')
    if (terminalError || !terminalData || terminalData.length === 0) {
      return { status: 'refused', jobId, reason: 'terminal re-mark matched zero rows' }
    }
    if (storyId) {
      const { error: flagError } = await supabaseClient
        .from('stories')
        .update({
          needs_attention: true,
          needs_attention_reason: String(reason).slice(0, 1000),
          needs_attention_at: pendingResumeIsoNow(),
        })
        .eq('id', String(storyId))
      if (flagError) {
        console.warn(
          `[belleRepairPersist] failed to flag story needs_attention ${storyId}: ${flagError.message}`
        )
      }
    }
    return { status: 'exhausted', jobId }
  }
  const resumePoint =
    String(opts?.resumePoint || (err as Record<string, unknown>).safe_resume_point || job.current_step || '').trim() ||
    'repair_belle_quality'
  const nextCount = resumeCount + 1
  const { error: resumeError, data: resumeData } = await supabaseClient
    .from('production_jobs')
    .update({
      status: 'queued',
      current_step: resumePoint,
      state_json: {
        ...state,
        [PENDING_RESUME_COUNT_KEY]: nextCount,
        pendingPinResumedAt: pendingResumeIsoNow(),
        pendingPinCarrierStoryId: admission.carrierStoryId,
      },
      error_json: null,
      logs: [
        ...priorLogs,
        {
          at: pendingResumeIsoNow(),
          event: 'belle_pending_resume',
          jobId,
          carrierStoryId: admission.carrierStoryId,
          pendingCount: admission.pendingCount,
          resumePoint,
          message:
            `Auto-resume failed Belle job with ${admission.pendingCount} pending pin(s) ` +
            `on ${admission.carrierStoryId} (revival ${nextCount}/${maxResumes}): ` +
            `re-queued to ${resumePoint} for drain-first recovery (no rewrite yet)`,
        },
      ],
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
    .eq('status', 'failed')
    .select('id')
  if (resumeError || !resumeData || resumeData.length === 0) {
    return { status: 'refused', jobId, reason: 'resume re-queue matched zero rows' }
  }
  return { status: 'resumed', jobId, resumePoint, resumeCount: nextCount }
}
