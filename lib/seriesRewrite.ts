/**
 * SERIES-REWRITE-001 (hands-off test, Two Bids on Main Street EP1, Oct 29):
 * the series validator failed an episode for story content ("personal stakes
 * never established in the script body") and the job simply stopped — every
 * content failure needed a human to order a rewrite (Saturday Repair Shop
 * EP4/EP5 the day before). Only DESCRIPTION-only failures were auto-repaired.
 *
 * Now: a content failure re-writes the failed episode with the validator's
 * fix list in the prompt, plus every LATER episode (they were written from
 * the old one, so their continuity would no longer match). Bounded:
 * MAX_SERIES_EPISODE_REWRITES per episode, then the job stops for a human.
 * No audio exists at this point, so a rewrite costs only writer tokens.
 */

export const MAX_SERIES_EPISODE_REWRITES = 2
export const REWRITE_FEEDBACK_MAX_CHARS = 3000

/** The validator's own fix list (the part after "VALIDATOR RESULT: FAIL"), else the report's tail. */
export function extractValidatorFixList(report: string): string {
  const text = String(report || '')
  const m = text.match(/VALIDATOR RESULT:\s*FAIL\**\s*([\s\S]*)$/i)
  const body = (m ? m[1] : text.slice(-REWRITE_FEEDBACK_MAX_CHARS)).trim()
  return body.length > REWRITE_FEEDBACK_MAX_CHARS ? body.slice(0, REWRITE_FEEDBACK_MAX_CHARS) : body
}

export type RewritePlanInput = {
  failedEpisodeNumber: number
  episodes: Array<{ id: string; episodeNumber: number; hasScript: boolean }>
  rewriteCounts: Record<string, number>
}

export type RewritePlan =
  | { action: 'rewrite'; attempt: number; failedEpisodeNumber: number; clearStoryIds: string[] }
  | { action: 'exhausted'; attempts: number }
  | { action: 'none'; reason: string }

/** Which episodes to clear and re-write, or why not. */
export function planSeriesEpisodeRewrite(input: RewritePlanInput): RewritePlan {
  const n = Number(input.failedEpisodeNumber)
  if (!Number.isFinite(n) || n < 1) return { action: 'none', reason: 'failed episode number unknown' }
  const done = Number(input.rewriteCounts[String(n)] || 0)
  if (done >= MAX_SERIES_EPISODE_REWRITES) return { action: 'exhausted', attempts: done }
  const clearStoryIds = input.episodes
    .filter((ep) => ep.episodeNumber >= n && ep.hasScript)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((ep) => ep.id)
  if (!clearStoryIds.length) return { action: 'none', reason: 'no scripts to rewrite' }
  return { action: 'rewrite', attempt: done + 1, failedEpisodeNumber: n, clearStoryIds }
}

/** Prompt block appended for the episode the validator failed. */
export function buildRewriteFeedbackBlock(feedback: string | null | undefined, attempt: number): string {
  const f = String(feedback || '').trim()
  if (!f) return ''
  return (
    `\n\nREWRITE ${attempt} — THE PREVIOUS DRAFT OF THIS EPISODE FAILED THE QUALITY REVIEW.\n` +
    `Write a fresh draft that fixes every point below. Keep everything else that was working (premise, characters, names, arc).\n` +
    `--- REVIEWER FIX LIST ---\n${f}\n--- END FIX LIST ---\n`
  )
}
