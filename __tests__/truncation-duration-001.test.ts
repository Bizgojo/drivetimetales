/**
 * TRUNCATION-DURATION-001 (Marc GO 2026-09-28)
 *
 * The "Whisper stopped early" rescue must not accept audio that is physically
 * too short to contain the whole line. Regression: Origin 2.0 EP05 line 44 was
 * accepted 4× as ~2s of audio for a ~34-word line; Marc heard it cut off.
 */

import {
  MAX_PLAUSIBLE_WORDS_PER_SECOND,
  MIN_WORDS_FOR_DURATION_CHECK,
  isAudioTooShortForText,
  minPlausibleSpeechSeconds,
  spokenWordCount,
} from '@/lib/speechDuration'

const EP05_LINE_44 =
  'But here is what makes RNA remarkable. The sequence of letters determines how the molecule folds. ' +
  'Nucleotides pair with each other, and the folded shape decides what the molecule can do.'

describe('spokenWordCount', () => {
  test('counts words, ignores punctuation-only tokens', () => {
    expect(spokenWordCount('And critically — they can take up molecules.')).toBe(7)
    expect(spokenWordCount('')).toBe(0)
    expect(spokenWordCount('— — —')).toBe(0)
  })
})

describe('isAudioTooShortForText — the EP05 line 44 case', () => {
  test('~2s of audio for a ~30-word line is a REAL cut-off', () => {
    expect(spokenWordCount(EP05_LINE_44)).toBeGreaterThanOrEqual(25)
    expect(isAudioTooShortForText(2.0, EP05_LINE_44)).toBe(true)
  })

  test('a complete read at normal pace is NOT flagged (Whisper-stopped-early stays accepted)', () => {
    const words = spokenWordCount(EP05_LINE_44)
    const normalPaceSeconds = words / 2.6 // typical narration ~155 wpm
    expect(isAudioTooShortForText(normalPaceSeconds, EP05_LINE_44)).toBe(false)
  })

  test('even a very fast complete read is NOT flagged', () => {
    const words = spokenWordCount(EP05_LINE_44)
    const veryFastSeconds = words / MAX_PLAUSIBLE_WORDS_PER_SECOND // ~215 wpm
    expect(isAudioTooShortForText(veryFastSeconds, EP05_LINE_44)).toBe(false)
  })

  test('short lines keep the old behaviour (never flagged)', () => {
    const short = 'Yes. It is.' // < MIN_WORDS_FOR_DURATION_CHECK words
    expect(spokenWordCount(short)).toBeLessThan(MIN_WORDS_FOR_DURATION_CHECK)
    expect(isAudioTooShortForText(0.2, short)).toBe(false)
  })

  test('unknown duration (probe failed → 0 or NaN) falls back to old behaviour', () => {
    expect(isAudioTooShortForText(0, EP05_LINE_44)).toBe(false)
    expect(isAudioTooShortForText(Number.NaN, EP05_LINE_44)).toBe(false)
  })

  test('threshold is words / 3.6 × 0.9', () => {
    expect(minPlausibleSpeechSeconds('one two three four five six seven eight nine')).toBeCloseTo((9 / 3.6) * 0.9, 5)
  })
})
