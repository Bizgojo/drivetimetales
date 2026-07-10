/**
 * ATL-FOLLOWUP-002 (ITEM A) — transcript QC number-normalization false positives.
 *
 * Incident: The Courthouse Silence, job failed 2026-07-09T14:05Z at
 * series_generate_voices, ep1 segment_0043, speaker WARREN LELAND.
 * TTS spoke the line correctly; Whisper STT normalized numbers/currency/
 * times/punctuation ("October fourteenth" → "October 14th", "Nine-forty-one
 * p.m." → "941 p.m.", "Two dollars and fourteen cents" → "$2.14").
 * Similarity 81.7% → false QC FAIL → ElevenLabs credits burned on every retry.
 *
 * Fix: QC normalization + comparison extracted to lib/transcriptQC.ts
 * (shared, testable) and extended so BOTH sides normalize decimal currency
 * (dollars-and-cents), with currency unit words stripped symmetrically after
 * all word→digit conversion.
 *
 * Unlike earlier mirror-style tests, these tests import the REAL production
 * module — the exact code path used by generate-voices segment QC.
 *
 * Run: npx jest __tests__/atl-followup-002-transcript-qc.test.ts --no-coverage
 */

import {
  evaluateTranscriptQC,
  transcriptTokens,
  normalizeForQC,
  normalizeSpokenNumberPhrases,
  stripCurrencyUnitWords,
} from '@/lib/transcriptQC'

// ─── The exact segment_0043 failure pair ────────────────────────────────────

const SEG_0043_EXPECTED =
  'Here. October fourteenth. Nine-forty-one p.m. Coffee, regular. Crackers, peanut butter. Two dollars and fourteen cents.'
const SEG_0043_DETECTED =
  'Here, October 14th, 941 p.m. Coffee, regular, crackers, peanut butter, $2.14.'

describe('ATL-FOLLOWUP-002: segment_0043 regression (The Courthouse Silence ep1)', () => {
  it('produces identical token streams for the exact failure pair', () => {
    expect(transcriptTokens(SEG_0043_EXPECTED)).toEqual(transcriptTokens(SEG_0043_DETECTED))
  })

  it('passes QC for the exact failure pair', () => {
    const r = evaluateTranscriptQC(SEG_0043_EXPECTED, SEG_0043_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.similarity).toBeGreaterThanOrEqual(0.99)
    expect(r.tailMatches).toBe(true)
  })

  it('normalizeForQC fallback also agrees on the failure pair', () => {
    expect(normalizeForQC(SEG_0043_EXPECTED)).toBe(normalizeForQC(SEG_0043_DETECTED))
  })
})

// ─── Currency (dollars-and-cents) equivalence ───────────────────────────────

describe('currency normalization: spoken form ↔ symbolic form', () => {
  const cases: Array<[string, string]> = [
    ['Two dollars and fourteen cents.', '$2.14.'],
    ['Twelve dollars and five cents.', '$12.05.'],
    ['Two dollars and seven cents.', '$2.07.'],
    ['Seventy-five cents.', '$0.75.'],
    ['One dollar and one cent.', '$1.01.'],
    // Pre-existing ATL-PIPE-011 behaviour must be preserved
    ['three hundred and forty thousand dollars', '$340,000'],
    ['Twelve hundred dollars and fifty cents.', '$1,200.50.'],
    ['Thirty-four dollars and fifty-six cents.', '$34.56.'],
  ]

  it.each(cases)('tokenizes "%s" and "%s" identically', (spoken, symbolic) => {
    expect(transcriptTokens(spoken)).toEqual(transcriptTokens(symbolic))
  })

  it('strips currency unit words only after a digit amount', () => {
    expect(stripCurrencyUnitWords('2 dollars 14 cents')).toBe('2 14')
    expect(stripCurrencyUnitWords('1 dollar 1 cent')).toBe('1 1')
    // Bare unit words in prose are untouched
    expect(stripCurrencyUnitWords('he owed her dollars, maybe cents')).toBe(
      'he owed her dollars, maybe cents'
    )
  })
})

// ─── Clock time equivalence ─────────────────────────────────────────────────

describe('time normalization: spoken form ↔ symbolic form', () => {
  const cases: Array<[string, string]> = [
    ['Nine-forty-one p.m.', '941 p.m.'],
    ['Nine-forty-one p.m.', '9:41 p.m.'],
    ['Eleven-nineteen a.m.', '11:19 a.m.'],
    ['Eight-thirty p.m.', '8:30 pm'],
  ]

  it.each(cases)('tokenizes "%s" and "%s" identically', (spoken, symbolic) => {
    expect(transcriptTokens(spoken)).toEqual(transcriptTokens(symbolic))
  })
})

// ─── Ordinal / date equivalence ─────────────────────────────────────────────

describe('ordinal normalization: spoken form ↔ symbolic form', () => {
  const cases: Array<[string, string]> = [
    ['October fourteenth', 'October 14th'],
    ['the twenty-first of June', 'the 21st of June'],
    ['third shelf on the left', '3rd shelf on the left'],
  ]

  it.each(cases)('tokenizes "%s" and "%s" identically', (spoken, symbolic) => {
    expect(transcriptTokens(spoken)).toEqual(transcriptTokens(symbolic))
  })
})

// ─── Spoken number normalization: production decimal failures ──────────────

describe('spoken number normalization: Whisper digit output equivalence', () => {
  const cases: Array<[string, string]> = [
    ['Four-point-seven seconds.', '4.7 seconds.'],
    ['The twelve-point-eight hertz stopped.', 'The 12.8 hertz stopped'],
    ['Twenty-three seconds passed.', '23 seconds passed.'],
    ['Nineteen eighty-four was written on the label.', '1984 was written on the label.'],
    ['One hundred and five doors closed.', '105 doors closed.'],
    ['Third of June.', '3rd of June.'],
    ['First of June.', '1st of June.'],
  ]

  it.each(cases)('tokenizes "%s" and "%s" identically', (spoken, digit) => {
    expect(transcriptTokens(spoken)).toEqual(transcriptTokens(digit))
  })

  it.each(cases)('passes QC for "%s" and "%s"', (spoken, digit) => {
    const r = evaluateTranscriptQC(spoken, digit)
    expect(r.passed).toBe(true)
  })

  it('normalizes the two production incidents directly', () => {
    expect(normalizeForQC('Four-point-seven seconds.')).toBe(normalizeForQC('4.7 seconds.'))
    expect(normalizeForQC('The twelve-point-eight hertz stopped.')).toBe(
      normalizeForQC('The 12.8 hertz stopped')
    )
  })

  it('keeps genuine numeric mismatches failing', () => {
    const r = evaluateTranscriptQC('Four-point-seven seconds.', '5.7 seconds.')
    expect(r.passed).toBe(false)
  })

  it('exposes deterministic phrase normalization for common compositions', () => {
    expect(normalizeSpokenNumberPhrases('four-point-seven seconds')).toBe('4.7 seconds')
    expect(normalizeSpokenNumberPhrases('twelve-point-eight hertz')).toBe('12.8 hertz')
    expect(normalizeSpokenNumberPhrases('twenty-three seconds')).toBe('23 seconds')
    expect(normalizeSpokenNumberPhrases('nineteen eighty-four')).toBe('1984')
    expect(normalizeSpokenNumberPhrases('one hundred and five')).toBe('105')
    expect(normalizeSpokenNumberPhrases('third of June')).toBe('3rd of June')
    expect(normalizeSpokenNumberPhrases('first of June')).toBe('1st of June')
  })
})

// ─── Punctuation / case collapse ────────────────────────────────────────────

describe('punctuation and case collapse', () => {
  it('treats period-separated and comma-separated lists identically', () => {
    expect(transcriptTokens('Coffee, regular. Crackers, peanut butter.')).toEqual(
      transcriptTokens('coffee, regular, crackers, peanut butter')
    )
  })
})

// ─── Negative controls: genuine failures must still fail ────────────────────

describe('genuine content mismatches still fail QC', () => {
  it('fails when the detected transcript is missing half the segment', () => {
    const r = evaluateTranscriptQC(SEG_0043_EXPECTED, 'Here, October 14th, 941 p.m.')
    expect(r.passed).toBe(false)
  })

  it('fails when the transcript is a different line entirely', () => {
    const r = evaluateTranscriptQC(
      SEG_0043_EXPECTED,
      'The courtroom emptied slowly while the bailiff locked the side doors for the night.'
    )
    expect(r.passed).toBe(false)
  })

  it('does not equate different dollar amounts', () => {
    expect(transcriptTokens('Two dollars and fourteen cents.')).not.toEqual(
      transcriptTokens('$5.99.')
    )
  })

  it('fails on blank detected text', () => {
    const r = evaluateTranscriptQC(SEG_0043_EXPECTED, '')
    expect(r.passed).toBe(false)
  })
})
