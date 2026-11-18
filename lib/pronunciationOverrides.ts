/**
 * PRONUNCIATION-001 (Marc 2026-11-18): a word that every voice must say the same way.
 *
 * "Rerouted" is said re-ROUT-ed — the stressed vowel rhymes with "out" and "shout"
 * (/aʊ/), NOT with "boat" (/oʊ/) and NOT with "boot" (/u/).
 *
 * This is the one thing to get right before touching this file. An earlier revision of
 * this comment said "boat", which sent the first test batch down the wrong vowel. The
 * target is the same vowel as "route" in "the route home" and "shout".
 *
 * The live audio is currently split: Belle's intros and outros say /u/ ("re-ROOT-ed",
 * wrong) while the EP4 script line reads correctly. That split is about spelling, not
 * generation — ElevenLabs reads the bare "ou" as /u/ in some contexts.
 *
 * We do not rely on an ElevenLabs pronunciation dictionary: dictionary IDs are
 * per-account state the code would have to fetch and can silently drift. Instead we
 * respell the word for the voice only. The script, the player, the covers and the page
 * copy keep the real spelling — this text never leaves the TTS call.
 *
 * The exact respelling below is PENDING Marc's pick from three test clips. Do not treat
 * it as settled; change `spoken` when he chooses.
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
    // TODO(PRONUNCIATION-001): swap to Marc's chosen respelling. Target vowel is /aʊ/
    // as in "out" / "shout". Awaiting his pick from the three test clips.
    spoken: 'Rerowted',
    reason:
      'Marc 2026-11-18: must be re-ROUT-ed (rhymes with "out"/"shout", /aʊ/), never re-ROOT-ed (/u/) and never "boat" (/oʊ/), in stories, Belle intros/outros and ads.',
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
