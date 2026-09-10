/**
 * lib/normalizeForWer.ts — Shared digit→word numeral normalization.
 *
 * ATL-NUMERAL-NORM-002: extracted from garble-detection-gate.js
 * (ATL-GARBLE-STOPLINE-001 / PR #190) so that the garble gate and the
 * generate_voices transcript QC comparator apply identical normalization.
 *
 * Apply normalizeForWer() to BOTH reference (expected) and hypothesis
 * (detected) immediately before any similarity or WER comparison to eliminate
 * false-fail mismatches on numerically equivalent but differently-formatted
 * text.
 *
 * Example: Whisper transcribes "two thousand and six" as "2006".
 * normalizeForWer("2006") → "two thousand oh six", which compares at high
 * similarity with the script form "two thousand and six".
 *
 * Pure text processing — no I/O, no network.
 */

// number-to-words ships no TypeScript declarations; require() is intentional.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const nw = require('number-to-words') as { toWords: (n: number) => string }

/**
 * Convert a 4-digit year (1100–2099) to its spoken-English word form.
 *   1987 → "nineteen eighty seven"
 *   2000 → "two thousand"
 *   2006 → "two thousand oh six"
 *   2010 → "two thousand ten"
 *
 * Mirrors yearToWords() in garble-detection-gate.js exactly.
 */
function yearToWords(n: number): string {
  if (n >= 1100 && n <= 1999) {
    const century   = Math.floor(n / 100)
    const remainder = n % 100
    if (remainder === 0) return nw.toWords(century) + ' hundred'
    if (remainder < 10)  return nw.toWords(century) + ' oh ' + nw.toWords(remainder)
    return nw.toWords(century) + ' ' + nw.toWords(remainder)
  }
  if (n >= 2000 && n <= 2099) {
    const remainder = n % 100
    if (remainder === 0) return 'two thousand'
    if (remainder < 10)  return 'two thousand oh ' + nw.toWords(remainder)
    return 'two thousand ' + nw.toWords(remainder)
  }
  return nw.toWords(n)
}

/**
 * Apply basic normalisation (lowercase, strip punctuation, collapse whitespace),
 * then convert any bare digit tokens to their spoken-English word equivalents.
 *
 * Apply to BOTH sides of a comparison so numeral surface-form differences
 * (e.g. "2000 and 2006" ↔ "two thousand and two thousand and six") do not
 * produce false mismatches in either similarity scoring or numeric-sequence
 * veto checks.
 *
 * Mirrors the normalise() + normalizeForWer() pipeline in garble-detection-gate.js
 * exactly. Hyphens emitted by number-to-words are stripped to match the
 * normalised shape of the surrounding text.
 */
export function normalizeForWer(text: string): string {
  // Basic normalise: lowercase, strip all non-alphanumeric/space, collapse spaces.
  const s = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(token => {
      if (!/^\d+$/.test(token)) return token
      const n = parseInt(token, 10)
      if (!Number.isFinite(n)) return token
      // Use spoken year form for 4-digit years in range; general word form otherwise.
      const words = (n >= 1000 && n <= 2099) ? yearToWords(n) : nw.toWords(n)
      // Strip hyphens that number-to-words emits (normalise already stripped them
      // from the input text, so we must match that shape on the output side too).
      return words.replace(/-/g, ' ')
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
