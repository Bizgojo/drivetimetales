/**
 * OPERATOR DIRECT-PUBLISH — audited direct-mode series publish
 * (Marc order 2026-10-23 05:10 EDT).
 *
 * Future direct-mode stories must reach the app without owner clicks, but
 * ONLY through this audited operator path. The autonomous runner
 * (lib/directPublish.ts) is untouched; this module is the operator-invoked
 * equivalent for series sitting in repair_queue after a completed repair.
 *
 * Publish is permitted repair_queue → ready_for_review → approved_ready →
 * published ONLY when ALL of the following hold:
 *   (a) explicit Marc decision id present AND on the allowlist below
 *       (exact match; the entry is inert until Marc records the decision —
 *       fail-closed by default);
 *   (b) every QC gate passes per episode: preflight (same
 *       runPreflightChecks validator + safeToGenerateVoices criterion as the
 *       HTTP-200 path of POST /api/admin/preflight), duration 15–20 min,
 *       music bed (background_music_url), announcement (announcement_url),
 *       covers (cover_url), continuity pins (verifyContinuityPins), plus the
 *       shared personalization guard and series contiguity/order predicate;
 *   (c) one story_workflow_audit row per transition (ORION-GOV-006), with the
 *       decision id in reason/session_context — AUDIT-FIRST: the audit row
 *       for an edge is written BEFORE its story update, and a failed audit
 *       aborts with zero story writes for the edge (P1-1: zero unaudited
 *       publishes — a story never reaches a new state without its audit);
 *   (d) Tier-1 scoping: a single explicit series_id; every episode touched
 *       must belong to it. No seriesId → refuse. Cross-series rows → refuse.
 *       There is deliberately no whole-library / multi-series mode.
 *
 * GATE PRESERVATION (not gate replacement):
 *   - The canonical matrix in lib/workflowTransitions.ts is NOT modified.
 *     There is no repair_queue → approved_ready edge (verified by test), so
 *     this path chains the three legal edges and aborts if any edge ever
 *     becomes illegal.
 *   - Every predicate is IMPORTED (publishReadiness, continuityPin,
 *     story-gates, personalization publishGuard, workflowTransitions) —
 *     nothing here is a divergent copy. The single deliberate addition is
 *     the operator QC bundle (duration band + bed + preflight wiring),
 *     which the manual publish-story route never enforced.
 *   - Repair-count doctrine (Marc 2026-07-09) is honored via the shared
 *     shouldIncrementRepairCount on the hold-bucket exit step, with the
 *     operator-supplied storyRecordChanged signal (same as content-approval).
 *
 * No migration: audit rows go to story_workflow_audit (story_id NOT NULL is
 * satisfied — we always have episode ids). story_queue_dispatch_audit is NOT
 * written: its action CHECK constraint has no direct-publish action and its
 * queue_item_id is NOT NULL (a repaired series may have no queue item).
 */

import { hashScript, verifyContinuityPins } from '@/lib/continuityPin'
import {
  evaluateSeriesPublishOrder,
  sortEpisodesForPublish,
  type PublishOrderEpisode,
} from '@/lib/story-gates'
import {
  shouldIncrementRepairCount,
  transitionAllowed,
} from '@/lib/workflowTransitions'
import { runPreflightChecks } from '@/lib/preflight/validator'
import { assertPublishAllowed, isPublicationHeld } from '@/lib/publicationHold'
import { evaluateBelleUnitForPublish } from '@/lib/publicationBelleGate'

/**
 * Columns the gates read. Every field a gate predicate touches must be
 * selected — a guard must never evaluate an unselected (undefined) field
 * (P2-6). In particular announcement_text + series_number are read by the
 * canonical publishability predicate and the ordering rank.
 */
export const DIRECT_PUBLISH_EPISODE_COLUMNS =
  'id,series_id,episode_number,series_number,series_is_finale,title,author,genre,audio_url,cover_url,description,' +
  'duration_mins,announcement_url,announcement_text,background_music_url,script,script_json,series_name,' +
  'narrator_voice_id,narrator_voice_name,author_id,workflow_state,review_status,' +
  'status,is_hidden,production_repair_count,published_on,' +
  'workflow_state_changed_by,workflow_state_changed_at,workflow_state_change_reason'

/**
 * In-process single-flight guard (P1-2): at most one direct-publish
 * execution per series at a time in this runtime. A concurrent second call
 * for the same series refuses 409 immediately instead of racing the first
 * through the same edges. Cross-process races are caught by the per-write
 * from-state row guard below.
 */
const inFlightDirectPublish = new Set<string>()

/** Who/what performed the promotion (ORION-GOV-006 changed_by). */
export const OPERATOR_DIRECT_PUBLISH_CHANGED_BY = 'operator-direct-publish'

/**
 * Marc decision-id allowlist. Exact match only. Entries are inert until Marc
 * records the corresponding decision — an allowlisted id with no recorded
 * decision still fails closed because the operator must supply the id AND
 * Marc must have issued it (out-of-band record, same trust model as the
 * Strategos bearer + blueprint approvals).
 */
export const OPERATOR_DIRECT_PUBLISH_DECISION_ALLOWLIST: readonly string[] = [
  'harbor-direct-publish-auth',
  // LAKE-MARION-001: fresh-series pipeline verification, inert until Marc records decision lake-marion-romantic-horror-direct-publish.
  'lake-marion-romantic-horror-direct-publish',
]

/** Product runtime band: 15-min minimum (SCRIPT-RUNTIME-PREFLIGHT-001) … 20-min brief cap. */
export const DIRECT_PUBLISH_MIN_DURATION_MINS = 15
export const DIRECT_PUBLISH_MAX_DURATION_MINS = 20

/**
 * The chained promotion edges. repair_queue → approved_ready is NOT an edge
 * (no shortcut); each of these is validated with transitionAllowed() at
 * gate time AND re-validated immediately before its write.
 */
export const OPERATOR_DIRECT_PUBLISH_EDGES: ReadonlyArray<readonly [string, string]> = [
  ['repair_queue', 'ready_for_review'],
  ['ready_for_review', 'approved_ready'],
  ['approved_ready', 'published'],
]

/** Exact-match allowlist check. Empty/whitespace input is never authorized. */
export function isDirectPublishDecisionAuthorized(decisionId: unknown): boolean {
  const id = String(decisionId ?? '').trim()
  if (!id) return false
  return (OPERATOR_DIRECT_PUBLISH_DECISION_ALLOWLIST as readonly string[]).includes(id)
}

export type PreflightGateResult = { ok: boolean; blockers: string[] }

export type OperatorDirectGateInput = {
  seriesId: string
  /** Per-episode preflight outcomes, keyed by story id. Built by the route via runEpisodePreflight. */
  preflight: Map<string, PreflightGateResult> | Record<string, PreflightGateResult>
}

export type OperatorDirectGateVerdict =
  | { ok: true; warnings: string[] }
  | { ok: false; blockers: string[]; warnings: string[] }

function preflightFor(
  preflight: OperatorDirectGateInput['preflight'],
  storyId: string
): PreflightGateResult | undefined {
  if (preflight instanceof Map) return preflight.get(storyId)
  return (preflight as Record<string, PreflightGateResult>)[storyId]
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function durationOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Pure gate evaluation. Zero writes. Returns every blocker found (not just
 * the first) so one operator call surfaces the full repair list.
 */
export function evaluateOperatorDirectGates(
  episodes: Array<Record<string, unknown>>,
  input: OperatorDirectGateInput
): OperatorDirectGateVerdict {
  const blockers: string[] = []
  const warnings: string[] = []
  const seriesId = clean(input.seriesId)

  if (!seriesId) {
    return { ok: false, blockers: ['seriesId required (Tier-1 scoping: single series only)'], warnings }
  }
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return { ok: false, blockers: [`no episodes found for series ${seriesId}`], warnings }
  }

  // Tier-1 scoping: every row must belong to the requested series.
  for (const ep of episodes) {
    const epSeries = clean((ep as { series_id?: unknown }).series_id)
    if (epSeries !== seriesId) {
      blockers.push(
        `Tier-1 scope violation: episode ${String((ep as { id?: unknown }).id)} belongs to series ${epSeries || '(none)'}, not ${seriesId}`
      )
    }
  }

  // Matrix legality, checked BEFORE any write (re-validated per write).
  for (const [from, to] of OPERATOR_DIRECT_PUBLISH_EDGES) {
    if (!transitionAllowed(from, to)) {
      blockers.push(`transition ${from} → ${to} not allowed by canonical matrix; refusing (matrix is never modified by this path)`)
    }
  }

  // Canonical publish-order: lowest episode_number first (P1-4). Every
  // per-episode check AND the promotion loop below run in this order, so EP2
  // can never go live before EP1 regardless of DB row order.
  const ordered = sortEpisodesForPublish(episodes as never[]) as Array<Record<string, unknown>>

  // Entry-state gate with idempotent resume: each episode is either
  // repair_queue (to publish now) or already LIVE by this path (published +
  // visible + this path's marker — the executor fresh-reads every skip and
  // re-verifies live state + the 3-edge audit chain before any write, and
  // refuses unverified or delisted skips). Resume skips must form a strict
  // prefix of the publish order: a published episode after an unreleased
  // one means order was violated — reconcile. Any other intermediate state
  // refuses (no mid-chain starts).
  const entryOk = new Set<string>()
  let seenTodo = false
  for (const ep of ordered) {
    const id = String((ep as { id?: unknown }).id ?? '(unknown)')
    const label = `episode ${id}`
    const ws = clean((ep as { workflow_state?: unknown }).workflow_state)
    if (ws === 'repair_queue') {
      seenTodo = true
      entryOk.add(String((ep as { id?: unknown }).id))
    } else if (
      ws === 'published' &&
      clean((ep as { status?: unknown }).status) === 'published' &&
      (ep as { is_hidden?: unknown }).is_hidden === false &&
      clean((ep as { workflow_state_changed_by?: unknown }).workflow_state_changed_by) === OPERATOR_DIRECT_PUBLISH_CHANGED_BY
    ) {
      if (seenTodo) {
        blockers.push(
          `${label}: already published but an earlier episode is still unreleased — publish order violated; operator must reconcile before retry`
        )
      }
    } else if (ws === 'published') {
      blockers.push(
        `${label}: published but not verifiably live-by-this-path (status='${clean((ep as { status?: unknown }).status) || '(empty)'}', is_hidden=${String((ep as { is_hidden?: unknown }).is_hidden)}, marker='${clean((ep as { workflow_state_changed_by?: unknown }).workflow_state_changed_by) || '(empty)'}') — resume skips must be published+visible with the operator-direct-publish marker; operator must reconcile before retry`
      )
    } else {
      blockers.push(
        `${label}: workflow_state is '${ws || '(empty)'}', not 'repair_queue' — this path publishes repaired series only (intermediate states need operator reconcile; see resume rule)`
      )
    }
  }

  // CANONICAL publishability (P1-3): the SAME evaluateSeriesPublishOrder
  // predicate as POST /api/admin/publish-story — imported, not copied.
  // Episodes are projected to their end-of-path state (approved_ready) so the
  // predicate answers "would this series be publishable once promoted";
  // the entry-state gate above pins the actual start at repair_queue, and
  // in-order atomic promotion (P1-4) satisfies the earlier-episode ordering
  // the predicate models with its batch carve-out. This covers missing
  // fields (title/author/genre/audio/cover/description/duration),
  // the shared personalization guard (incl. announcement_url), and
  // series contiguity — no divergent local copies of any of them.
  const projected = ordered.map((ep) => ({
    ...(ep as object),
    workflow_state: 'approved_ready',
    review_status: 'approved',
  })) as PublishOrderEpisode[]
  const canonicalEval = evaluateSeriesPublishOrder(projected)
  if (canonicalEval.code === 'series_episode_number_gap') {
    const detail = canonicalEval.blocked[0]?.reasons.join('; ') ?? 'episode number gap'
    blockers.push(`series ${seriesId}: episode numbering gap: ${detail}`)
  } else {
    for (const b of canonicalEval.blocked) {
      blockers.push(
        `episode ${b.storyId} (${b.title}): canonical publishability: ${b.reasons.join('; ')}`
      )
    }
  }

  // Operator QC bundle (deliberate additions over the manual publish path):
  // duration band, music bed, and a real preflight verdict per episode.
  for (const ep of ordered) {
    const label = `episode ${String((ep as { id?: unknown }).id ?? '(unknown)')}`
    const storyId = String((ep as { id?: unknown }).id ?? '')
    if (!entryOk.has(storyId)) continue

    // Duration band 15–20 min.
    const duration = durationOrNull((ep as { duration_mins?: unknown }).duration_mins)
    if (duration === null || duration < DIRECT_PUBLISH_MIN_DURATION_MINS || duration > DIRECT_PUBLISH_MAX_DURATION_MINS) {
      blockers.push(
        `${label}: duration_mins ${String((ep as { duration_mins?: unknown }).duration_mins ?? '(missing)')} outside direct-publish band ${DIRECT_PUBLISH_MIN_DURATION_MINS}–${DIRECT_PUBLISH_MAX_DURATION_MINS}`
      )
    }

    // Music bed.
    if (!clean((ep as { background_music_url?: unknown }).background_music_url)) {
      blockers.push(`${label}: missing music bed (background_music_url)`)
    }

    // Preflight: same pass criterion as the HTTP-200 path of /api/admin/preflight.
    const pf = storyId ? preflightFor(input.preflight, storyId) : undefined
    if (!pf) {
      blockers.push(`${label}: no preflight result supplied — refusing without a preflight verdict`)
    } else if (!pf.ok) {
      blockers.push(`${label}: preflight failed: ${pf.blockers.join('; ') || 'no details'}`)
    }
  }

  // Series-level continuity pins (shared predicate, evaluated in publish order).
  try {
    const pinResult = verifyContinuityPins(ordered as never[])
    if (!pinResult.ok) {
      const first = pinResult.mismatches[0]
      blockers.push(
        `series ${seriesId}: continuity pin mismatch on episode ${first?.storyId ?? '(unknown)'} ` +
        `(prior ${first?.priorStoryId ?? '(unknown)'} changed after consumption) — ${pinResult.mismatches.length} pin(s) failed`
      )
    } else if (pinResult.pins_absent) {
      // Module semantics: legacy pin absence warns, never fails. Surfaced so
      // the operator sees it; it does not block.
      warnings.push(
        `series ${seriesId}: continuity pins absent for episode(s) ${pinResult.pinsAbsentEpisodes.join(', ')} (legacy, pre-landing) — warn only, not blocking`
      )
    }
  } catch (e) {
    blockers.push(`series ${seriesId}: continuity pin verification threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  // PUBLICATION-HOLD-001: Belle copy gate — every episode's Belle copy must
  // pass the deployed predicates. No waiver path; feeds the same blockers
  // list so one operator call surfaces the full repair list.
  const belleVerdict = evaluateBelleUnitForPublish(ordered as Array<Record<string, unknown>>)
  if (!belleVerdict.ok) {
    blockers.push(...(belleVerdict as { blockers: string[] }).blockers)
  }

  return blockers.length ? { ok: false, blockers, warnings } : { ok: true, warnings }
}

/** Supabase-js surface used by the executor (subset; keeps tests mockable). */
export type DirectPublishDb = {
  from: (table: string) => any
}

export class DirectPublishError extends Error {
  status: number
  blockers?: string[]
  constructor(message: string, status = 422, blockers?: string[]) {
    super(message)
    this.status = status
    this.blockers = blockers
  }
}

export type ExecuteOperatorDirectPublishInput = OperatorDirectGateInput & {
  decisionId: string
  reason?: string
  /** Operator signal for repair-count doctrine (same semantics as content-approval). */
  storyRecordChanged?: boolean | null
}

export type ExecuteOperatorDirectPublishResult = {
  seriesId: string
  decisionId: string
  publishedOn: string
  episodes: Array<{ id: string; transitions: string[] }>
  warnings: string[]
}

/**
 * Gate + promote. Re-runs the gates inside (fail-closed: throws with zero
 * writes on any blocker, including an unauthorized decision id). Episodes
 * promote repair_queue → ready_for_review → approved_ready → published in
 * canonical episode_number order (P1-4) with one story_workflow_audit row
 * per edge.
 *
 * Concurrency (P1-2): an in-process single-flight guard refuses a second
 * concurrent execution for the same series (409); every episode is re-read
 * fresh immediately before promotion and must match its gated snapshot on
 * all gate-critical fields (series, number, state, assets, script hash) —
 * drift aborts 409 with zero writes; and EVERY story update carries
 * from-state + series + episode row guards with a read-after-write row
 * check (P2-5: exactly one row must come back from `.select('id')`).
 *
 * Audit-first (P1-1): the audit row for an edge is written BEFORE its story
 * update. A failed audit aborts with zero story writes for the edge — a
 * story is never left in a new state without its audit row (zero unaudited
 * publishes). Already-promoted episodes keep their (audited) transitions
 * and are reported, never silently rolled back.
 *
 * Resume: an interrupted series retries cleanly — already-published
 * episodes (this path's marker) are audit-chain-verified and skipped, and
 * only repair_queue episodes promote, in order.
 */
export async function executeOperatorDirectPublish(
  db: DirectPublishDb,
  episodes: Array<Record<string, unknown>>,
  input: ExecuteOperatorDirectPublishInput
): Promise<ExecuteOperatorDirectPublishResult> {
  const seriesId = clean(input.seriesId)
  const decisionId = clean(input.decisionId)

  if (!isDirectPublishDecisionAuthorized(decisionId)) {
    throw new DirectPublishError(
      'direct publish refused: missing or unauthorized Marc decision id (allowlist exact-match required)',
      403
    )
  }

  if (inFlightDirectPublish.has(seriesId)) {
    throw new DirectPublishError(
      `direct publish refused: series ${seriesId} already has a direct-publish in flight (single-flight guard — the concurrent attempt is refused so exactly one publish proceeds)`,
      409
    )
  }
  inFlightDirectPublish.add(seriesId)
  try {
    return await runOperatorDirectPublish(db, episodes, { ...input, seriesId, decisionId })
  } finally {
    inFlightDirectPublish.delete(seriesId)
  }
}

/**
 * Freshness digest: re-verified on a fresh row read immediately before an
 * episode promotes. Covers EVERY selected column (stable key order) — title,
 * author, genre, description, narrator fields, script_json pins included —
 * so any concurrent edit to any gate input aborts with 409 before any
 * write for that episode. The script body is compared by hash (same digest
 * class as the continuity pins) to keep the comparison value-stable.
 */
function freshnessFingerprint(ep: Record<string, unknown>): string {
  const entries = Object.keys(ep)
    .sort()
    .map((k) => {
      const v = (ep as Record<string, unknown>)[k]
      const norm = k === 'script' ? hashScript(String(v ?? '')) : v ?? null
      return [k, norm] as const
    })
  return JSON.stringify(entries)
}

async function fetchFreshEpisode(db: DirectPublishDb, storyId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('stories')
    .select(DIRECT_PUBLISH_EPISODE_COLUMNS)
    .eq('id', storyId)
  if (error) throw new Error(`fresh row read for episode ${storyId} failed: ${error.message}`)
  if (!Array.isArray(data) || data.length !== 1) return null
  return data[0] as Record<string, unknown>
}

/**
 * Resume verification: every already-published skip is FRESH-READ and must
 * still be live (published + visible + this path's marker) AND carry the
 * complete 3-edge audit chain by this path's marker. Runs BEFORE any write;
 * a delisted skip or a chain gap refuses the whole retry so an unverified
 * or no-longer-visible publish is never claimed as a predecessor.
 */
async function verifyResumeAuditChains(
  db: DirectPublishDb,
  gatedSkips: Array<Record<string, unknown>>
): Promise<void> {
  for (const gated of gatedSkips) {
    const storyId = String((gated as { id?: unknown }).id)
    const fresh = await fetchFreshEpisode(db, storyId)
    // Full freshness fingerprint on skips too: a script/series/numbering
    // change after gate evaluation refuses before any write, so later
    // episodes never publish against stale continuity pins or scope.
    if (!fresh || freshnessFingerprint(fresh) !== freshnessFingerprint(gated)) {
      throw new DirectPublishError(
        `resume refused: already-published episode ${storyId} changed since gate evaluation (freshness mismatch); operator must reconcile before retry`,
        409,
        [`episode ${storyId} changed since gate evaluation`]
      )
    }
    const live =
      !!fresh &&
      clean((fresh as { workflow_state?: unknown }).workflow_state) === 'published' &&
      clean((fresh as { status?: unknown }).status) === 'published' &&
      (fresh as { is_hidden?: unknown }).is_hidden === false &&
      clean((fresh as { workflow_state_changed_by?: unknown }).workflow_state_changed_by) ===
        OPERATOR_DIRECT_PUBLISH_CHANGED_BY
    if (!live) {
      throw new DirectPublishError(
        `resume refused: already-published episode ${storyId} is no longer verifiably live (fresh read: state/visibility/marker changed); operator must reconcile before retry`,
        422,
        [`episode ${storyId} no longer live`]
      )
    }
    const { data, error } = await db
      .from('story_workflow_audit')
      .select('story_id,from_state,to_state,changed_by')
      .eq('story_id', storyId)
      .eq('changed_by', OPERATOR_DIRECT_PUBLISH_CHANGED_BY)
    if (error) {
      throw new DirectPublishError(
        `resume refused: audit-chain read for already-published episode ${storyId} failed (${error.message}); operator must reconcile before retry`,
        500,
        [error.message]
      )
    }
    const edges = new Set(
      (Array.isArray(data) ? data : []).map((r: any) => `${r.from_state}→${r.to_state}`)
    )
    const missing = OPERATOR_DIRECT_PUBLISH_EDGES.map(([f, t]) => `${f}→${t}`).filter((e) => !edges.has(e))
    if (missing.length) {
      throw new DirectPublishError(
        `resume refused: episode ${storyId} is published but its audit chain is incomplete (missing ${missing.join(', ')}); operator must reconcile before retry — the gap is claimed, never silently skipped`,
        422,
        missing
      )
    }
  }
}

async function runOperatorDirectPublish(
  db: DirectPublishDb,
  episodes: Array<Record<string, unknown>>,
  input: ExecuteOperatorDirectPublishInput & { seriesId: string; decisionId: string }
): Promise<ExecuteOperatorDirectPublishResult> {
  const { seriesId, decisionId } = input
  const gates = evaluateOperatorDirectGates(episodes, input)
  if (!gates.ok) {
    throw new DirectPublishError(
      `direct publish refused: ${gates.blockers.length} gate blocker(s)`,
      422,
      (gates as { blockers: string[] }).blockers
    )
  }
  // PUBLICATION-HOLD-001: durable global hold — checked here (after gates,
  // before ANY write) AND re-read per episode below, so a hold that takes
  // effect mid-series still blocks the remaining episodes.
  if (await isPublicationHeld(db)) {
    throw new DirectPublishError(
      'direct publish refused: global publication hold is ACTIVE. Clear the hold before publishing.',
      409,
      ['global publication hold is ACTIVE']
    )
  }
  const publishedOn = new Date().toISOString()
  const reasonBase = clean(input.reason) || 'Audited operator direct-publish of repaired series (no owner click required)'
  const reason = `decision:${decisionId}: ${reasonBase}`
  const done: Array<{ id: string; transitions: string[] }> = []

  // Canonical publish order (P1-4): lowest episode_number first, regardless
  // of the row order the caller supplied.
  const ordered = sortEpisodesForPublish(episodes as never[]) as Array<Record<string, unknown>>

  // Resume: verify the audit chains of already-published skips BEFORE any
  // write, then carry them in the result as verified (never re-published).
  const gatedSkips = ordered.filter(
    (ep) => clean((ep as { workflow_state?: unknown }).workflow_state) === 'published'
  )
  await verifyResumeAuditChains(db, gatedSkips)
  for (const ep of gatedSkips) {
    done.push({
      id: String((ep as { id?: unknown }).id),
      transitions: ['resumed: verified already-published (3-edge audit chain complete)'],
    })
  }

  const todo = ordered.filter(
    (ep) => clean((ep as { workflow_state?: unknown }).workflow_state) === 'repair_queue'
  )
  for (const ep of todo) {
    const storyId = String((ep as { id?: unknown }).id)
    const transitions: string[] = []

    // Freshness re-read: the row must still match its gated snapshot on
    // every gate-critical field. Drift (concurrent edit that kept the
    // workflow state) aborts here with 409 — zero writes for this episode.
    // Residual: a change racing the single update statement itself needs a
    // row-version column (migration, out of scope); the from-state guard
    // below covers every state-changing race.
    let fresh: Record<string, unknown> | null
    try {
      fresh = await fetchFreshEpisode(db, storyId)
    } catch (e) {
      throw new DirectPublishError(
        `direct publish aborted at episode ${storyId}: ${e instanceof Error ? e.message : String(e)}`,
        500,
        [e instanceof Error ? e.message : String(e)]
      )
    }
    if (!fresh || freshnessFingerprint(fresh) !== freshnessFingerprint(ep)) {
      throw new DirectPublishError(
        `direct publish conflict at episode ${storyId}: row changed since gate evaluation (freshness mismatch); refusing with zero writes for this episode — re-run gates and retry`,
        409,
        [`episode ${storyId} changed since gate evaluation`]
      )
    }
    // PUBLICATION-HOLD-001: hold RE-READ per episode immediately before its
    // promotion steps — the atomicity point. A hold set after gate time
    // blocks every remaining episode with zero further writes.
    try {
      await assertPublishAllowed(db)
    } catch (e) {
      throw new DirectPublishError(
        `direct publish refused at episode ${storyId}: ${e instanceof Error ? e.message : String(e)}`,
        409,
        [e instanceof Error ? e.message : String(e)]
      )
    }
    const epNum = Number(fresh.episode_number)
    const repairCount = Number((fresh as { production_repair_count?: unknown }).production_repair_count ?? 0)

    const steps: Array<{ to: string; payload: Record<string, unknown> }> = [
      {
        to: 'ready_for_review',
        payload: {
          workflow_state: 'ready_for_review',
          review_status: 'pending',
          workflow_state_changed_by: OPERATOR_DIRECT_PUBLISH_CHANGED_BY,
          workflow_state_changed_at: publishedOn,
          workflow_state_change_reason: reason,
          // Repair-count doctrine on the hold-bucket exit (shared predicate).
          ...(shouldIncrementRepairCount({ from: 'repair_queue', to: 'ready_for_review', storyRecordChanged: input.storyRecordChanged ?? null })
            ? { production_repair_count: (Number.isFinite(repairCount) ? repairCount : 0) + 1 }
            : {}),
        },
      },
      {
        to: 'approved_ready',
        payload: {
          workflow_state: 'approved_ready',
          review_status: 'approved',
          workflow_state_changed_by: OPERATOR_DIRECT_PUBLISH_CHANGED_BY,
          workflow_state_changed_at: publishedOn,
          workflow_state_change_reason: reason,
        },
      },
      {
        to: 'published',
        payload: {
          status: 'published',
          workflow_state: 'published',
          is_hidden: false,
          published_on: publishedOn,
          workflow_state_changed_by: OPERATOR_DIRECT_PUBLISH_CHANGED_BY,
          workflow_state_changed_at: publishedOn,
          workflow_state_change_reason: reason,
        },
      },
    ]

    let from = 'repair_queue'
    try {
      for (const step of steps) {
        // Re-validate the edge immediately before its write: if the matrix
        // ever drops the edge, abort rather than invent a transition.
        if (!transitionAllowed(from, step.to)) {
          throw new Error(`transition ${from} → ${step.to} not allowed; aborting series at episode ${storyId}`)
        }
        // AUDIT-FIRST (P1-1): the audit row for an edge is written BEFORE
        // its story update. A failed audit aborts with ZERO story writes
        // for the edge — nothing to compensate in stories, and a story can
        // never reach a new state without its audit row already recorded.
        // (Single-statement atomicity would need a DB function/migration —
        // out of scope; the ordering guarantees the gap can only occur in
        // the fail-closed direction: an audit row without a matching story
        // transition, which aborts loudly below and is claimed, never live
        // and unaudited.)
        const { error: auditError } = await db.from('story_workflow_audit').insert({
          story_id: storyId,
          from_state: from,
          to_state: step.to,
          changed_by: OPERATOR_DIRECT_PUBLISH_CHANGED_BY,
          changed_at: publishedOn,
          reason,
          session_context: `decision:${decisionId}`,
        })
        if (auditError) {
          throw new Error(
            `audit row for ${from} → ${step.to} failed (${auditError.message}); aborting with zero story writes for this edge — publish fails because audit failed`
          )
        }
        // From-state + series + episode row guards with read-after-write
        // (P1-2/P2-5): the update only matches while the row is still in
        // `from`, in this series, at this episode number. Zero rows back =
        // a concurrent mover got there first — refuse 409. If the update
        // itself errors AFTER the audit row was written, the audit over-
        // claims a transition that never happened: abort loudly naming the
        // exact edge for operator reconcile (fail-closed — nothing is live).
        const { data: updated, error: updateError } = await db
          .from('stories')
          .update(step.payload)
          .eq('id', storyId)
          .eq('workflow_state', from)
          .eq('series_id', seriesId)
          .eq('episode_number', epNum)
          .select('id')
        if (updateError) {
          throw new Error(
            `story update ${from} → ${step.to} failed AFTER its audit row was written (${updateError.message}); audit over-claims — operator must reconcile episode ${storyId} before retry`
          )
        }
        if (!Array.isArray(updated) || updated.length !== 1) {
          const conflict = new DirectPublishError(
            `direct publish conflict at episode ${storyId}: expected exactly 1 row in '${from}' for ${from} → ${step.to}, got ${Array.isArray(updated) ? updated.length : 'no rows'} — audit row for the edge was written but the story was NOT updated; row moved concurrently; operator must reconcile before retry (exactly one publish proceeds)`,
            409
          )
          ;(conflict as { blockers?: string[] }).blockers = [conflict.message]
          throw conflict
        }
        transitions.push(`${from}→${step.to}`)
        from = step.to
      }
      done.push({ id: storyId, transitions })
    } catch (e) {
      if (e instanceof DirectPublishError) throw e
      throw new DirectPublishError(
        `direct publish aborted at episode ${storyId} after ${done.length} of ${ordered.length} published: ${e instanceof Error ? e.message : String(e)}`,
        500,
        [e instanceof Error ? e.message : String(e)]
      )
    }
  }

  return { seriesId, decisionId, publishedOn, episodes: done, warnings: gates.warnings }
}

/**
 * Script-input extraction — parity with parseCharacterGuide /
 * extractIntroOutro / parseScriptMetadata in app/api/admin/preflight/route.ts.
 * Same regexes, same precedence (script metadata first, DB row as fallback).
 */
function extractPreflightCharacters(script: string): string[] {
  const section = String(script ?? '').match(/CHARACTER GUIDE\s*-{3,}([\s\S]*?)(?:\n---|\[START|$)/)
  if (!section) return []
  const names: string[] = []
  const namePattern = /^([A-Z][A-Za-z\s']+?)\s*(?:—|--|\|)(.*?)$/gm
  let match: RegExpExecArray | null
  while ((match = namePattern.exec(section[1])) !== null) {
    names.push(match[1].trim())
  }
  return names
}

function extractPreflightIntroOutro(script: string): { intro?: string; outro?: string } {
  const text = String(script ?? '')
  const introMatch = text.match(/BELLE B INTRO[\s\S]*?BELLE B:\s*(.+?)(?:\n---|\n\n)/i)
  const outroMatch = text.match(/BELLE B(?:\s+OUTRO)?[\s\S]*?BELLE B:\s*(.+?)(?:\n[A-Z]:|$)/i)
  return {
    intro: introMatch ? introMatch[1].trim() : undefined,
    outro: outroMatch ? outroMatch[1].trim() : undefined,
  }
}

function parsePreflightScriptMetadata(script: string): Record<string, string> {
  const metadata: Record<string, string> = {}
  for (const field of ['AUTHOR', 'GENRE', 'TITLE', 'SERIES', 'EPISODE', 'EPISODE_TITLE', 'NARRATOR']) {
    const match = String(script ?? '').match(new RegExp(`^${field}:\\s*(.+?)$`, 'im'))
    if (match) metadata[field.toLowerCase()] = match[1].trim()
  }
  return metadata
}

/**
 * Runs the REAL preflight validator for one episode row (same
 * runPreflightChecks + safeToGenerateVoices criterion as the HTTP-200 path
 * of POST /api/admin/preflight). voiceCodeAssignments omitted → that check
 * reports "skipped", identical to the endpoint default.
 */
export async function runEpisodePreflight(
  episode: Record<string, unknown>,
  knownNarratorVoices: Array<{ name: string; voice_id: string }> = []
): Promise<PreflightGateResult> {
  const storyId = String((episode as { id?: unknown }).id ?? '')
  const script = String((episode as { script?: unknown }).script ?? '')
  const meta = parsePreflightScriptMetadata(script)
  const { intro, outro } = extractPreflightIntroOutro(script)
  const epNum = Number((episode as { episode_number?: unknown }).episode_number) || parseInt(meta.episode, 10) || undefined
  try {
    const report = await runPreflightChecks({
      storyId,
      script,
      characters: extractPreflightCharacters(script),
      intro,
      outro,
      seriesMetadata: {
        seriesName: clean((episode as { series_name?: unknown }).series_name) || meta.series || undefined,
        episodeTitle: meta.episode_title || clean((episode as { title?: unknown }).title) || undefined,
        episodeNumber: epNum,
        author: clean((episode as { author?: unknown }).author) || meta.author || undefined,
        narrator: meta.narrator || clean((episode as { narrator_voice_name?: unknown }).narrator_voice_name) || undefined,
        genre: clean((episode as { genre?: unknown }).genre) || meta.genre || undefined,
        durationMins: durationOrNull((episode as { duration_mins?: unknown }).duration_mins) ?? undefined,
      },
      knownNarratorVoices,
      dbNarratorVoiceName: clean((episode as { narrator_voice_name?: unknown }).narrator_voice_name) || null,
    })
    if (report.safeToGenerateVoices) return { ok: true, blockers: [] }
    return { ok: false, blockers: report.blockers.length ? report.blockers : ['preflight did not pass (non-200 equivalent)'] }
  } catch (e) {
    return { ok: false, blockers: [`preflight threw: ${e instanceof Error ? e.message : String(e)}`] }
  }
}
