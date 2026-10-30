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

/** Writer prompt block (every episode; the finale gets the escape rules). */
export function buildSequelHookPromptBlock(hook: string, opts: { episodeNumber: number; isFinale: boolean }): string {
  if (!hook) return ''
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
  } else if (opts.episodeNumber === 1) {
    lines.push('- Introduce the nemesis in this episode (seen, heard, or felt through what they order), without revealing everything about them.')
  }
  return lines.join('\n') + '\n'
}

/** Exception text for validators that would otherwise fail an escaped villain. */
export function sequelHookValidatorNote(hook: string): string {
  if (!hook) return ''
  return `PRODUCER-APPROVED EXCEPTION (SERIES-NEMESIS-001): by the producer's request, ONE nemesis escapes at the end of the finale so the hero can pursue them in a future series (${hook}). That single escape is NOT an unresolved series arc and NOT a tease of another episode, as long as every other thread (the case, the rescue, justice for the other antagonists) is resolved. Do not fail the script for it. Still fail an explicit "to be continued", a promised sequel, or a named next episode.`
}
