/**
 * TRUNCATION-DURATION-001 (Marc GO 2026-09-28)
 *
 * generate-voices has a rescue rule (ATL-PIPE-007 / ATL-PIPE-017): when Whisper
 * keeps hearing only the first part of a line, it assumes Whisper stopped early
 * ("VAD truncation") and ACCEPTS the audio. That assumption is sometimes wrong:
 * ElevenLabs can genuinely stop after the first sentence. Origin 2.0 EP05 line 44
 * ("But here is what makes RNA remarkable. The sequence of letters…") was
 * accepted 4 times as ~2s of audio for a ~10s line; Marc confirmed by ear that
 * the audio itself was cut off.
 *
 * Before accepting, check that the audio is physically long enough to contain
 * the whole line. Even very fast narration stays under ~3.6 words/second, so
 * audio shorter than (words / 3.6) × 0.9 cannot hold every word.
 */

/** Fastest plausible narration rate, words per second (~215 wpm). */
export const MAX_PLAUSIBLE_WORDS_PER_SECOND = 3.6
/** Extra tolerance so a genuinely fast read is never rejected. */
export const DURATION_TOLERANCE = 0.9
/** Short lines (e.g. "Yes.") keep the old rescue behaviour unchanged. */
export const MIN_WORDS_FOR_DURATION_CHECK = 8

export function spokenWordCount(text: string | null | undefined): number {
  return String(text ?? '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/** Shortest audio (seconds) that could plausibly contain every word of `text`. */
export function minPlausibleSpeechSeconds(text: string | null | undefined): number {
  return (spokenWordCount(text) / MAX_PLAUSIBLE_WORDS_PER_SECOND) * DURATION_TOLERANCE
}

/**
 * True when the audio is too short to contain the whole line — i.e. a REAL
 * cut-off, not Whisper stopping early. Unknown duration (0/NaN, probe failed)
 * returns false so behaviour falls back to the previous rule.
 */
export function isAudioTooShortForText(audioSeconds: number, text: string | null | undefined): boolean {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) return false
  if (spokenWordCount(text) < MIN_WORDS_FOR_DURATION_CHECK) return false
  return audioSeconds < minPlausibleSpeechSeconds(text)
}
