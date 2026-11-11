/**
 * BELLE-SERIES-TYPE-001 (Marc, Nov 10, 2026)
 *
 * One answer to "what kind of Belle outro does this story get?" for the
 * standalone production path (judge, repair, deterministic checks).
 *
 * Bug it fixes: a series episode produced by a single-story job (Don't Go
 * Home EP1) was repaired as if it were a standalone story — the repair
 * hard-coded `standalone: true` and always demanded a narrator credit, and
 * the quality judge was never told plainly which outro rule applies. The
 * judge then applied the standalone reflection / companion rule to a series
 * non-finale outro, which contradicts BELLE-OUTRO-FORWARD-001 (Nov 8:
 * one recap sentence + next episode by number). Repair could never pass.
 */

export type BelleStoryKind = 'standalone' | 'series_non_finale' | 'series_finale'

export type BelleStoryMeta = {
  story_type?: string | null
  series_id?: string | null
  series_name?: string | null
  episode_number?: number | null
  series_total_episodes?: number | null
  series_is_finale?: boolean | null
}

/** Same standalone test the validator already uses, plus finale detection. */
export function belleStoryKind(story: BelleStoryMeta): BelleStoryKind {
  const standalone =
    !String(story.series_id || '').trim() &&
    Number(story.series_total_episodes || 1) <= 1 &&
    !/^series/i.test(String(story.story_type || '').trim())
  if (standalone) return 'standalone'
  const ep = Number(story.episode_number || 0)
  const total = Number(story.series_total_episodes || 0)
  if (story.series_is_finale === true || (ep > 0 && total > 0 && ep >= total)) return 'series_finale'
  return 'series_non_finale'
}

/** Plain instruction placed above the metadata in the judge and repair prompts. */
export function belleStoryTypeInstruction(story: BelleStoryMeta): string {
  const kind = belleStoryKind(story)
  const ep = Number(story.episode_number || 0)
  const total = Number(story.series_total_episodes || 0)
  const where = ep > 0 ? ` (episode ${ep}${total > 0 ? ` of ${total}` : ''}${story.series_name ? ` of "${story.series_name}"` : ''})` : ''
  if (kind === 'series_non_finale') {
    return `STORY TYPE: SERIES NON-FINALE EPISODE${where}. Apply ONLY the series non-finale outro rule (BELLE-OUTRO-FORWARD-001): exactly two sentences, one recap sentence, then the next episode by number with the series name. Do NOT apply standalone or finale outro rules: no reflection, companion-presence, title, author, narrator, or "Endless Tales original" requirement for this outro.`
  }
  if (kind === 'series_finale') {
    return `STORY TYPE: SERIES FINALE${where}. Apply the finale outro rule: complete, never points to another episode, ends with the credit.`
  }
  return 'STORY TYPE: STANDALONE STORY. Apply the standalone intro/outro rules.'
}

/** Narrator credit belongs in standalone and finale outros only, never in a non-finale outro. */
export function belleOutroNeedsNarratorCredit(story: BelleStoryMeta): boolean {
  return belleStoryKind(story) !== 'series_non_finale'
}
