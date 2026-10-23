/**
 * NUMBER-WORDS — single shared spoken-numeral normalizer (Marc 2026-10-23
 * 16:37 items 1: shared normalization — never regen for Two-vs-2).
 *
 * TTS speaks the digit "2" and the word "Two" identically, so a numeral-only
 * rewrite ("Episode 2" → "Episode Two") changes NO audio. Every title/episode
 * comparison in the gate path normalizes through here so such rewrites can
 * never invalidate evidence, flip identity, or force a regeneration:
 *   - lib/publicationBelleGate.ts (introNamesEpisodeNumber + title naming)
 *   - app/api/admin/production-jobs/run-next/route.ts (intro number check +
 *     brief-vs-generated title check)
 *   - lib/storyQueue/directPublish.ts (EPISODE-header fallback parse —
 *     the episode_number COLUMN always wins; identity never changes)
 *   - lib/belleFreshness.ts (fingerprint normalization — numeral-only
 *     Belle rewrites keep the fingerprint, so valid audio is never
 *     regenerated for Two-vs-2)
 *
 * Single definition: no other file may keep its own cardinal/ordinal table
 * for gate comparisons. (The TTS-side numeral preflight scan in
 * lib/numeralPreTtsScan.ts is a different concern — spoken-digit
 * pronunciation safety — and is intentionally untouched.)
 */

const CARDINALS: string[] = [
  '',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty',
]

const ORDINALS: string[] = [
  '',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth',
  'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
  'nineteenth', 'twentieth',
]

/** Spoken number-word (cardinal or ordinal, 1–20) → digit. Lowercase keys. */
export const NUMBER_WORD_TO_DIGIT: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  for (let n = 1; n <= 20; n++) {
    map[CARDINALS[n]] = n
    map[ORDINALS[n]] = n
  }
  return map
})()

const NUMBER_WORD_PATTERN = new RegExp(
  `\\b(${[...Object.keys(NUMBER_WORD_TO_DIGIT)].join('|')})\\b`,
  'gi'
)

/**
 * Map every spoken number-word (one..twenty, first..twentieth) to its
 * digit form. Word-boundary anchored so "someone" never becomes "some1".
 * Case-insensitive; surrounding text untouched.
 */
export function normalizeNumberWords(text: string): string {
  return String(text ?? '').replace(NUMBER_WORD_PATTERN, (word) => {
    const digit = NUMBER_WORD_TO_DIGIT[word.toLowerCase()]
    return typeof digit === 'number' ? String(digit) : word
  })
}

function canonicalForm(text: string): string {
  return normalizeNumberWords(String(text ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Title equality under shared normalization: "Episode 2" ≡ "Episode Two"
 * ≡ "episode two". Used for brief-vs-generated title checks — a
 * numeral-only title difference is never a mismatch.
 */
export function titlesEqualCanonical(a: string, b: string): boolean {
  const left = canonicalForm(a)
  const right = canonicalForm(b)
  return Boolean(left) && left === right
}

/**
 * Whether prose names episode n — digit form ("Episode 2") or any spoken
 * form ("Episode Two", "the second episode"). Normalizes first, then
 * requires a word-boundary digit match (no substring false-positives:
 * episode 1 does not match "someone", episode 2 does not match "12").
 */
export function episodeNumberNamedIn(text: string, n: number): boolean {
  if (!Number.isFinite(n) || n < 1) return false
  const normalized = normalizeNumberWords(String(text ?? ''))
  return new RegExp(`\\b${Math.trunc(n)}\\b`).test(normalized)
}

/**
 * Parse an episode-number token that may be a digit ("2"), a cardinal
 * ("Two"), or an ordinal ("Second"). Returns null when unparseable.
 * Identity still comes from the episode_number COLUMN — this is only the
 * script-header fallback so "EPISODE: Two" reads as 2 instead of NaN.
 */
export function parseEpisodeNumberToken(token: unknown): number | null {
  const raw = String(token ?? '').trim()
  if (!raw) return null
  // First digit run after numeral normalization, so "Two", "Second",
  // and (defensively) "Episode Two" all read as 2 — and "2abc" keeps
  // the old parseInt behavior instead of becoming NaN.
  const match = normalizeNumberWords(raw).match(/\d+/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}
