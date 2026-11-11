/**
 * SEASON-HOOK-001 (Marc, Nov 11 2026, canon decision 136): a series season
 * may end its finale on ONE approved Season 2 hook.
 *
 * Opt-in per series: brief_json.season_hook on any episode (normally the
 * finale) holds the approved hook in plain words. The season's own story must
 * still close. Exactly one new open question may be left for Season 2, and
 * Belle may say that Season Two is coming, but never a next episode number.
 * Hook-first series (Widow Who Watched, Second Rise, Weekend Wife in Miami).
 */

export function seasonHookOf(brief: unknown): string {
  if (!brief || typeof brief !== 'object') return ''
  return String((brief as Record<string, unknown>).season_hook || '').trim()
}

/** First season hook found on any episode of the series. */
export function seasonHookOfEpisodes(episodes: Array<{ brief_json?: unknown } | null | undefined>): string {
  for (const ep of episodes || []) {
    const hook = seasonHookOf(ep?.brief_json)
    if (hook) return hook
  }
  return ''
}

/** Exception text for validators that would otherwise fail the hook. */
export function seasonHookValidatorNote(hook: string): string {
  if (!hook) return ''
  return `PRODUCER-APPROVED SEASON 2 HOOK (canon decision 136): this finale ends Season 1. By the producer's request it closes the season's story and then ends on ONE approved Season 2 hook: ${hook}. That one new open question, and a Belle outro line saying Season Two is coming, are NOT an unresolved series arc and NOT a tease of a next episode. Do not fail the script for them. Still fail if the season's main story is left unresolved, if more than one new question is left open, or if the script or outro names a next episode number.`
}

/** Writer prompt block for the finale of a series with a season hook. */
export function buildSeasonHookPromptBlock(hook: string, opts: { isFinale: boolean }): string {
  if (!hook || !opts.isFinale) return ''
  return [
    '',
    '🌱 SEASON 2 HOOK (producer request — canon decision 136)',
    `- Approved hook: ${hook}`,
    '- First close this season\'s story completely: the main question is answered and the key relationships land.',
    '- Then end on this ONE hook as the last beat. Leave no other new question open.',
    '- The Belle B outro follows the finale rules (series title, author, narrator) and may add that Season Two is coming. Never name a next episode number.',
    '',
  ].join('\n')
}
