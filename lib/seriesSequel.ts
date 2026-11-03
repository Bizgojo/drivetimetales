/**
 * SERIES-NEMESIS-001 (Marc 2026-10-30 00:10 EDT, Chicago rewrite): "there
 * needs to be one evil nemesis that eludes Nick so that we can go after the
 * nemesis in the next series with Nick."
 *
 * Opt-in per series: queueItem.sequelHook (free text) → brief_json.sequel_hook.
 * The series still closes its own story completely; ONE named villain is the
 * only thread left open, and every checker is told that this escape is the
 * producer's request, not an unresolved arc or a tease of another episode.
 */

export function sequelHookOf(brief: unknown): string {
  if (!brief || typeof brief !== 'object') return ''
  return String((brief as Record<string, unknown>).sequel_hook || '').trim()
}

/**
 * ATLAS NEMESIS-001 3-THREAD EXCEPTION (Marc commission altar30-setup-20261103
 * step 2): "The Man I Left at the Altar" carries THREE open threads into its
 * Ep30 finale (switched DNA result, Vivian, Danny). Every other series keeps
 * the SERIES-NEMESIS-001 default of exactly ONE open thread. Branch-only;
 * no deploy, no writing/voicing change — this only widens validation.
 */
export const ALTAR_THREE_THREAD_SERIES_TITLE = 'The Man I Left at the Altar'

/** Allowed count of unresolved (resolved_in 0) threads for a series. Default 1. */
export function nemesisOpenThreadLimit(seriesTitle: unknown): number {
  if (String(seriesTitle || '').trim().toLowerCase() === ALTAR_THREE_THREAD_SERIES_TITLE.toLowerCase()) return 3
  return 1
}

/** Writer prompt block (every episode; the finale gets the escape rules). */
export function buildSequelHookPromptBlock(hook: string, opts: { episodeNumber: number; isFinale: boolean; seriesTitle?: unknown }): string {
  if (!hook) return ''
  const threeThreads = nemesisOpenThreadLimit(opts.seriesTitle) === 3
  const lines = [
    '',
    '🦂 THE NEMESIS (producer request — non-negotiable)',
    `- ${hook}`,
    '- There is exactly ONE nemesis: a named, truly evil, clever villain, separate from the other antagonists. Give them one fixed full name and speaker label, used in every episode.',
    '- Build the nemesis through the series: their hand is behind the worst events, the hero gets close, and the nemesis stays one step ahead.',
  ]
  if (opts.isFinale) {
    lines.push(
      '- FINALE: resolve every other thread completely (the case, the rescue, justice for the other antagonists). The nemesis alone ESCAPES, in a concrete onstage moment, after a direct confrontation or near-capture. The hero knows exactly who the nemesis is and that this is not over.',
      '- Do NOT say "to be continued", do not promise a sequel, and do not mention a next episode. The escape is the last sting of the story itself. The Belle B outro still follows the finale rules.',
    )
  if (threeThreads) lines.push('- ATLAS NEMESIS-001 3-THREAD EXCEPTION: this series leaves exactly THREE threads open (resolved_in 0), carried into a future series — not one. Every other thread is resolved.');
  } else if (opts.episodeNumber === 1) {
    lines.push('- Introduce the nemesis in this episode (seen, heard, or felt through what they order), without revealing everything about them.')
  }
  return lines.join('\n') + '\n'
}

/** Exception text for validators that would otherwise fail an escaped villain. */
export function sequelHookValidatorNote(hook: string, seriesTitle?: unknown): string {
  if (!hook) return ''
  if (nemesisOpenThreadLimit(seriesTitle) === 3) return `PRODUCER-APPROVED EXCEPTION (SERIES-NEMESIS-001 + ATLAS NEMESIS-001 3-THREAD EXCEPTION for "The Man I Left at the Altar"): by the producer's request, exactly THREE threads stay open at the Ep30 finale (the switched DNA result, Vivian, Danny) so the hero can pursue them in a future series (${hook}). Those three open threads are NOT unresolved series arcs and NOT a tease of another episode, as long as every other thread is resolved. Do not fail the script for them. Still fail an explicit "to be continued", a promised sequel, or a named next episode.`
  return `PRODUCER-APPROVED EXCEPTION (SERIES-NEMESIS-001): by the producer's request, ONE nemesis escapes at the end of the finale so the hero can pursue them in a future series (${hook}). That single escape is NOT an unresolved series arc and NOT a tease of another episode, as long as every other thread (the case, the rescue, justice for the other antagonists) is resolved. Do not fail the script for it. Still fail an explicit "to be continued", a promised sequel, or a named next episode.`
}
