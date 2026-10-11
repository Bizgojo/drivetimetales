/**
 * RUNTIME-GATE-001 — runtime-vs-brief tolerance check
 *
 * Verifies the rendered final mix is within ±10% of the briefed target
 * runtime before a story advances from complete_story_package toward
 * ready_for_review. Wired BETWEEN HOOK-GATE-001 and QUALITY-GATE-001 in
 * the complete_story_package block of run-next/route.ts.
 *
 * Decisions (authoritative):
 *   gap2-runtime-tolerance-oct11-1408 — ±10%, between HOOK-GATE-001 and
 *     QUALITY-GATE-001, fail → job failed + error_json.kind =
 *     'runtime_brief_mismatch' + park for attention (no autonomous repair:
 *     a length mismatch needs editorial judgment, not a rewrite loop).
 *   gap2-deferred-oct11-1408 — LUFS / post-mix garble / cover-required
 *     explicitly NOT in scope. Do not extend this file for those.
 *
 * Source fields (verified live 2026-10-11):
 *   Brief target — stories.duration_mins (numeric, set at create_story_row
 *     from the queue item `duration`, e.g. '15 min' → 15) with fallback to
 *     parsing stories.brief_json.runtime (same '15 min' string shape).
 *   Actual — state_json.renderFinalMix.durationSecs, written by
 *     runStandaloneRenderFinalMix from the runRenderFinalMix report
 *     (run-next/route.ts). No ffprobe at gate time: the gate runs on
 *     Vercel serverless where the build-time ffprobe binary is absent.
 *
 * ASSUMPTION (flagged for Lyra/Marc): duration_mins is taken as the
 * brief-of-record when present; brief_json.runtime is fallback only.
 * If a future flow writes conflicting values, duration_mins wins.
 *
 * Unmeasured inputs (actual null/brief null) do NOT block: the gate
 * records a persistent skipped marker (state_json.runtimeGate +
 * console.warn + pipeline log) and continues. Rationale: blocking on
 * missing telemetry would strand in-flight jobs that rendered before
 * durationSecs was recorded; a measured mismatch still fails closed.
 * This mirrors the Lyra-accepted missing-scan-report pattern (warn +
 * continue) with the Lyra-required persistent marker (not a silent skip).
 */

export const RUNTIME_GATE_ID = 'RUNTIME-GATE-001'

/** Single constants block — all thresholds live here. */
export const RUNTIME_GATE = {
  /** ±10% tolerance around the briefed runtime. */
  TOLERANCE: 0.10,
  /** error_json.kind for a measured out-of-tolerance mix. */
  MISMATCH_KIND: 'runtime_brief_mismatch',
  /** error_json.kind / state marker for unmeasurable inputs. */
  UNMEASURED_KIND: 'runtime_brief_unmeasured',
} as const

export interface RuntimeGateResult {
  pass: boolean
  actualSecs: number | null
  briefSecs: number | null
  /** Signed deviation, e.g. +0.12 = 12% over brief. Null when unmeasured. */
  deviationPct: number | null
  tolerance: number
  skipped: boolean
  skipReason?: string
}

/**
 * Resolve the briefed target runtime in seconds.
 * Prefers numeric duration_mins; falls back to parsing the '15 min'-style
 * brief_json.runtime string. Returns null when neither yields a value.
 */
export function parseBriefRuntimeToSecs(
  durationMins: unknown,
  briefRuntime: unknown,
): number | null {
  const mins = Number(durationMins)
  if (Number.isFinite(mins) && mins > 0) return mins * 60
  const match = String(briefRuntime ?? '').match(/(\d+(?:\.\d+)?)/)
  if (match) {
    const parsed = Number(match[1])
    if (Number.isFinite(parsed) && parsed > 0) return parsed * 60
  }
  return null
}

/**
 * Pure tolerance check. Returns pass=false ONLY on a measured
 * out-of-tolerance deviation; null inputs yield skipped (not a pass,
 * not a block — the caller records the persistent marker and continues).
 */
export function checkRuntimeVsBrief(
  actualSecs: unknown,
  briefSecs: unknown,
  tolerance: number = RUNTIME_GATE.TOLERANCE,
): RuntimeGateResult {
  const actual = Number(actualSecs)
  const brief = Number(briefSecs)
  const actualOk = Number.isFinite(actual) && actual > 0
  const briefOk = Number.isFinite(brief) && brief > 0

  if (!actualOk || !briefOk) {
    return {
      pass: false,
      actualSecs: actualOk ? actual : null,
      briefSecs: briefOk ? brief : null,
      deviationPct: null,
      tolerance,
      skipped: true,
      skipReason: !actualOk && !briefOk
        ? 'both actual and brief runtime unmeasured'
        : !actualOk
          ? 'actual mix duration unmeasured (renderFinalMix.durationSecs null)'
          : 'brief target runtime unmeasured (duration_mins + brief_json.runtime both empty)',
    }
  }

  const deviationPct = (actual - brief) / brief
  return {
    pass: Math.abs(deviationPct) <= tolerance,
    actualSecs: actual,
    briefSecs: brief,
    deviationPct,
    tolerance,
    skipped: false,
  }
}
