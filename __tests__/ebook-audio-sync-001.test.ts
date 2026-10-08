/**
 * EBOOK-AUDIO-SYNC-001 Phase 1: pure audio-time ↔ paragraph mapping over the
 * content bounds persisted by PR #307 (content_start_ms/content_end_ms).
 * No UI — this pins the math so the reader/player UI can consume it next.
 */
import {
  normalizeContentBounds,
  audioTimeToContentFraction,
  contentFractionToAudioTime,
  contentFractionToParagraph,
  paragraphToContentFraction,
  audioTimeToParagraph,
  paragraphToAudioTime,
} from '@/lib/audioTextSync'

// Fixture: 30s Belle B intro/sting, 600s story body, 20s outro → 650s file.
const BOUNDS = { contentStartMs: 30000, contentEndMs: 630000 }
const DURATION = 650
const PARAS = 100

describe('EBOOK-AUDIO-SYNC-001: bounds normalization', () => {
  test('valid bounds convert ms to seconds', () => {
    expect(normalizeContentBounds(BOUNDS, DURATION)).toEqual({ startSecs: 30, endSecs: 630 })
  })

  test('null/missing bounds return null (back-catalog rows stay on legacy behavior)', () => {
    expect(normalizeContentBounds(null, DURATION)).toBeNull()
    expect(normalizeContentBounds({ contentStartMs: null, contentEndMs: null }, DURATION)).toBeNull()
    expect(normalizeContentBounds({ contentStartMs: 30000, contentEndMs: null }, DURATION)).toBeNull()
    expect(normalizeContentBounds(BOUNDS, null)).toBeNull()
    expect(normalizeContentBounds(BOUNDS, 0)).toBeNull()
  })

  test('inverted or zero-width bounds return null', () => {
    expect(normalizeContentBounds({ contentStartMs: 630000, contentEndMs: 30000 }, DURATION)).toBeNull()
    expect(normalizeContentBounds({ contentStartMs: 30000, contentEndMs: 30000 }, DURATION)).toBeNull()
    expect(normalizeContentBounds({ contentStartMs: -5000, contentEndMs: 630000 }, DURATION)).toBeNull()
  })

  test('end beyond file duration is clamped, not rejected', () => {
    expect(normalizeContentBounds({ contentStartMs: 30000, contentEndMs: 9999000 }, DURATION)).toEqual({
      startSecs: 30,
      endSecs: 650,
    })
  })
})

describe('EBOOK-AUDIO-SYNC-001: audio time to content fraction', () => {
  test('body midpoint maps to ~0.5 (intro/outro excluded)', () => {
    expect(audioTimeToContentFraction(330, BOUNDS, DURATION)).toBeCloseTo(0.5, 5)
  })

  test('body start/end map to 0/1 exactly', () => {
    expect(audioTimeToContentFraction(30, BOUNDS, DURATION)).toBe(0)
    expect(audioTimeToContentFraction(630, BOUNDS, DURATION)).toBe(1)
  })

  test('intro/outro regions clamp to 0/1 (reader parks at start/end)', () => {
    expect(audioTimeToContentFraction(0, BOUNDS, DURATION)).toBe(0)
    expect(audioTimeToContentFraction(10, BOUNDS, DURATION)).toBe(0)
    expect(audioTimeToContentFraction(649, BOUNDS, DURATION)).toBe(1)
  })

  test('naive whole-file percent would be wrong — bounds shift it', () => {
    // At body midpoint (330s of 650s) naive percent is 50.8%; content
    // fraction must be exactly 0.5 — the intro offset is the whole point.
    const naive = 330 / DURATION
    const synced = audioTimeToContentFraction(330, BOUNDS, DURATION)
    expect(synced).toBeCloseTo(0.5, 5)
    expect(Math.abs((naive as number) - 0.5)).toBeGreaterThan(0)
  })

  test('missing bounds return null', () => {
    expect(audioTimeToContentFraction(330, null, DURATION)).toBeNull()
  })
})

describe('EBOOK-AUDIO-SYNC-001: content fraction to audio time', () => {
  test('round-trips with the forward mapping', () => {
    expect(contentFractionToAudioTime(0, BOUNDS, DURATION)).toBe(30)
    expect(contentFractionToAudioTime(1, BOUNDS, DURATION)).toBe(630)
    expect(contentFractionToAudioTime(0.5, BOUNDS, DURATION)).toBe(330)
  })

  test('out-of-range fractions clamp', () => {
    expect(contentFractionToAudioTime(-0.5, BOUNDS, DURATION)).toBe(30)
    expect(contentFractionToAudioTime(1.5, BOUNDS, DURATION)).toBe(630)
  })

  test('missing bounds return null', () => {
    expect(contentFractionToAudioTime(0.5, null, DURATION)).toBeNull()
  })
})

describe('EBOOK-AUDIO-SYNC-001: paragraph mapping', () => {
  test('fraction edges map to first/last paragraph', () => {
    expect(contentFractionToParagraph(0, PARAS)).toBe(0)
    expect(contentFractionToParagraph(1, PARAS)).toBe(PARAS - 1)
    expect(contentFractionToParagraph(0.5, PARAS)).toBe(50)
  })

  test('paragraph edges map back to fractions', () => {
    expect(paragraphToContentFraction(0, PARAS)).toBe(0)
    expect(paragraphToContentFraction(PARAS - 1, PARAS)).toBeCloseTo(0.99, 5)
  })

  test('zero paragraphs return null (no divide by zero)', () => {
    expect(contentFractionToParagraph(0.5, 0)).toBeNull()
    expect(paragraphToContentFraction(0, 0)).toBeNull()
  })
})

describe('EBOOK-AUDIO-SYNC-001: end-to-end audio to paragraph', () => {
  test('body midpoint lands mid-book', () => {
    expect(audioTimeToParagraph(330, BOUNDS, DURATION, PARAS)).toBe(50)
  })

  test('intro time lands on paragraph 0, outro on last', () => {
    expect(audioTimeToParagraph(5, BOUNDS, DURATION, PARAS)).toBe(0)
    expect(audioTimeToParagraph(645, BOUNDS, DURATION, PARAS)).toBe(PARAS - 1)
  })

  test('paragraph midpoint seeks to body midpoint clock time', () => {
    expect(paragraphToAudioTime(50, PARAS, BOUNDS, DURATION)).toBe(330)
  })

  test('missing bounds propagate null end to end', () => {
    expect(audioTimeToParagraph(330, null, DURATION, PARAS)).toBeNull()
    expect(paragraphToAudioTime(50, PARAS, null, DURATION)).toBeNull()
  })
})
