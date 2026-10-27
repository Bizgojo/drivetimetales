/**
 * VOICE-BATCH-001 — how many series voice segments one run-next call makes.
 * The step used to make exactly one segment per call; with the EC2 loop's
 * idle wait that meant ~17 s median per line (~45 min per 145-line episode).
 *
 * Stop after: any hard failure, the end of an episode (per-episode bookkeeping
 * runs on the next call), the end of the series, MAX segments, or once the
 * time budget is spent (no new segment STARTS after the budget, so a call
 * stays well inside the 90 s runner abort and the 10 min lock staleness).
 */
export const VOICE_BATCH_MAX_SEGMENTS = 6
export const VOICE_BATCH_BUDGET_MS = 30_000

export function shouldContinueSeriesVoiceBatch(
  result: { complete?: boolean; hardFailure?: boolean; episodeComplete?: boolean },
  segmentsDone: number,
  elapsedMs: number,
): boolean {
  if (result.hardFailure || result.complete || result.episodeComplete) return false
  if (segmentsDone >= VOICE_BATCH_MAX_SEGMENTS) return false
  return elapsedMs < VOICE_BATCH_BUDGET_MS
}
