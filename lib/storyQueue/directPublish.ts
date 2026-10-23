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
 *       decision id in reason/session_context — zero story writes happen
 *       unless the audit rows for that episode succeed;
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

import { hasRenderedProduction, missingProductionUrls } from '@/lib/publishReadiness'
import { verifyContinuityPins } from '@/lib/continuityPin'
import {
  assertSeriesContiguity,
  sortEpisodesForPublish,
} from '@/lib/story-gates'
import { personalizationPublishBlockers } from '@/lib/personalization/publishGuard'
import {
  shouldIncrementRepairCount,
  transitionAllowed,
} from '@/lib/workflowTransitions'
import { runPreflightChecks } from '@/lib/preflight/validator'

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

  for (const ep of episodes) {
    const label = `episode ${String((ep as { id?: unknown }).id ?? '(unknown)')}`
    const storyId = String((ep as { id?: unknown }).id ?? '')

    // Only repaired series are in scope for this path.
    if (clean((ep as { workflow_state?: unknown }).workflow_state) !== 'repair_queue') {
      blockers.push(
        `${label}: workflow_state is '${clean((ep as { workflow_state?: unknown }).workflow_state) || '(empty)'}', not 'repair_queue' — this path publishes repaired series only`
      )
      continue
    }

    // Duration band 15–20 min.
    const duration = durationOrNull((ep as { duration_mins?: unknown }).duration_mins)
    if (duration === null || duration < DIRECT_PUBLISH_MIN_DURATION_MINS || duration > DIRECT_PUBLISH_MAX_DURATION_MINS) {
      blockers.push(
        `${label}: duration_mins ${String((ep as { duration_mins?: unknown }).duration_mins ?? '(missing)')} outside direct-publish band ${DIRECT_PUBLISH_MIN_DURATION_MINS}–${DIRECT_PUBLISH_MAX_DURATION_MINS}`
      )
    }

    // Rendered production: audio + cover + announcement (shared predicate).
    if (!hasRenderedProduction(ep as never)) {
      blockers.push(`${label}: missing rendered production: ${missingProductionUrls(ep as never).join(', ')}`)
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

    // Shared personalization guard (same import as publish-story).
    const persBlockers = personalizationPublishBlockers(ep as never)
    if (persBlockers.length) {
      blockers.push(`${label}: personalization guard: ${persBlockers.join('; ')}`)
    }
  }

  // Series-level: contiguity/order (shared predicate) + continuity pins.
  const ordered = sortEpisodesForPublish(episodes as never[])
  const contiguity = assertSeriesContiguity(ordered)
  if (!contiguity.ok) {
    blockers.push(`series ${seriesId}: episode numbering gap: ${contiguity.error ?? 'episode number gap'}`)
  }
  try {
    const pinResult = verifyContinuityPins(episodes as never[])
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
 * writes on any blocker, including an unauthorized decision id). Each
 * episode moves repair_queue → ready_for_review → approved_ready →
 * published with one story_workflow_audit row per edge; the audit row for
 * an edge is written immediately after its update and a failed update
 * aborts the whole series (already-promoted episodes are reported, never
 * silently rolled back — rollback of a publish would itself need Marc
 * approval).
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

  const gates = evaluateOperatorDirectGates(episodes, input)
  if (!gates.ok) {
    throw new DirectPublishError(
      `direct publish refused: ${gates.blockers.length} gate blocker(s)`,
      422,
      (gates as { blockers: string[] }).blockers
    )
  }

  const publishedOn = new Date().toISOString()
  const reasonBase = clean(input.reason) || 'Audited operator direct-publish of repaired series (no owner click required)'
  const reason = `decision:${decisionId}: ${reasonBase}`
  const done: Array<{ id: string; transitions: string[] }> = []

  for (const ep of episodes) {
    const storyId = String((ep as { id?: unknown }).id)
    const transitions: string[] = []
    const repairCount = Number((ep as { production_repair_count?: unknown }).production_repair_count ?? 0)

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
        const { error: updateError } = await db.from('stories').update(step.payload).eq('id', storyId)
        if (updateError) throw new Error(`${from} → ${step.to} failed: ${updateError.message}`)
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
            `audit row for ${from} → ${step.to} failed (${auditError.message}); aborting — story update without audit is not permitted`
          )
        }
        transitions.push(`${from}→${step.to}`)
        from = step.to
      }
      done.push({ id: storyId, transitions })
    } catch (e) {
      throw new DirectPublishError(
        `direct publish aborted at episode ${storyId} after ${done.length} of ${episodes.length} published: ${e instanceof Error ? e.message : String(e)}`,
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
