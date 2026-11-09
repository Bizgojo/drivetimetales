/**
 * EPISODE-LENGTH-001 (CANON-99 decision 4, CANON-03/09, Marc Nov 9 2026): one length rule for
 * every publish path.
 *   - Series episode: at least 12.5 minutes and at most 1.35 × the brief's target.
 *   - Standalone: within ±10% of the brief's target.
 *   - Speaking rate for estimates: 160 words per minute (SPEAKING_RATE_WPM).
 * stories.duration_mins holds the finished mix length rounded UP to whole minutes
 * (render-final-mix: Math.ceil(seconds / 60)), so a value d means the real length is in (d-1, d].
 */
export const SPEAKING_RATE_WPM = 160
export const SERIES_FLOOR_MINS = 12.5
export const SERIES_CAP_FACTOR = 1.35
export const STANDALONE_TOLERANCE = 0.10

/** The brief's target minutes: the upper number of brief_json.runtime ("12-15 minutes" → 15). */
export function briefTargetMinutes(briefJson: unknown): number | null {
  const rt = String((briefJson as any)?.runtime ?? (briefJson as any)?.target_minutes ?? '')
  const nums = (rt.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0)
  return nums.length ? Math.max(...nums) : null
}

/** Scripts written before this go-live keep the old rule (nothing in production is re-judged). */
export const EPISODE_LENGTH_FROM = '2026-11-10T00:00:00Z'

/** Null when the length is allowed, otherwise the reason. */
export function publishLengthIssue(input: { durationMins: unknown; briefJson?: unknown; isSeries: boolean; scriptUpdatedAt?: unknown }): string | null {
  if (input.scriptUpdatedAt !== undefined) {
    const t = Date.parse(String(input.scriptUpdatedAt ?? ''))
    if (!Number.isFinite(t) || t < Date.parse(EPISODE_LENGTH_FROM)) return null
  }
  const d = Number(input.durationMins)
  if (!(d > 0)) return 'length unknown (duration_mins missing)'
  const brief = briefTargetMinutes(input.briefJson)
  if (input.isSeries) {
    // d is rounded up, so d ≥ 13 is the only value that guarantees the real length can reach 12.5.
    if (d < Math.ceil(SERIES_FLOOR_MINS)) return `about ${d} minutes; a series episode must be at least ${SERIES_FLOOR_MINS} minutes (EPISODE-LENGTH-001)`
    if (brief && d - 1 > brief * SERIES_CAP_FACTOR) return `about ${d} minutes; a series episode may run at most ${(brief * SERIES_CAP_FACTOR).toFixed(1)} minutes (1.35 × the ${brief}-minute brief)`
    return null
  }
  if (!brief) return null
  const lo = brief * (1 - STANDALONE_TOLERANCE), hi = brief * (1 + STANDALONE_TOLERANCE)
  if (d < lo || d - 1 > hi) return `about ${d} minutes; a standalone must be within 10% of its ${brief}-minute brief (${lo.toFixed(1)}–${hi.toFixed(1)})`
  return null
}
