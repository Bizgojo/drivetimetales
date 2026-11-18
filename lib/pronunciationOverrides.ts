/**
 * PRONUNCIATION-001 (Marc 2026-11-18): a word that every voice must say the same way.
 *
 * Rerouted must be said "re-ROWT-ed" (rhymes with "boat"), never "re-ROOT-ed"
 * (rhymes with "boot"). The live episodes, Belle's intros and outros, and the ads
 * all say "re-ROOT-ed" today because ElevenLabs reads the bare spelling as /u/.
 *
 * We do not rely on an ElevenLabs pronunciation dictionary: dictionary IDs are
 * per-account state that the code would have to fetch and can silently drift. Instead
 * we respell the word for the voice only. The script, the player, the covers and the
 * page copy keep the real spelling — this text never leaves the TTS call.
 *
 * The respelling "Rerowted" is deliberate: the "ow" digraph makes the stressed vowel
 * /oʊ/ ("row"), and keeping the capital R and the remaining letters preserves
 * ElevenLabs' handling of the word's rhythm. Verified by ear before merge.
 */

export type PronunciationOverride = {
  /** Canonical spelling as it appears in scripts and page copy. */
  word: string
  /** What we send to the voice. */
  spoken: string
  /** Why this exists, so a future reader does not "tidy" it away. */
  reason: string
}

export const PRONUNCIATION_OVERRIDES: PronunciationOverride[] = [
  {
    word: 'Rerouted',
    spoken: 'Rerowted',
    reason:
      'Marc 2026-11-18: must be re-ROWT-ed, never re-ROOT-ed, in stories, Belle intros/outros and ads.',
  },
]

/** Pre-built matcher. Word-boundary anchored so "Rerouted" never matches inside another word. */
const MATCHERS = PRONUNCIATION_OVERRIDES.map((o) => ({
  re: new RegExp(`\\b${o.word}\\b`, 'gi'),
  spoken: o.spoken,
  word: o.word,
}))

/**
 * Respell brand words for the voice. Safe to run more than once: the replacement
 * ("Rerowted") does not contain the source spelling, so a second pass is a no-op.
 */
export function applyPronunciationOverrides(text: string): string {
  let out = String(text ?? '')
  for (const m of MATCHERS) {
    out = out.replace(m.re, (hit) => {
      // Preserve ALL-CAPS usage ("REROUTED") so shouting lines still read as shouting.
      if (hit === hit.toUpperCase() && hit.length > 1) return m.spoken.toUpperCase()
      return m.spoken
    })
  }
  return out
}

/** Exposed for the regression test. */
export function pronunciationWords(): string[] {
  return PRONUNCIATION_OVERRIDES.map((o) => o.word)
}
