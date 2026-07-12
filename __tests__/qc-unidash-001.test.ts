/**
 * ORION-QC-UNIDASH-001 — Unicode dash variants in QC text comparison.
 *
 * Production incident (Consciousness Protocol ep2, segment_0050, Jul 10-12):
 * cached segment expectedText contained U+2011 non-breaking hyphens
 * ("Four‑point‑seven seconds.") — visually identical to ASCII in every log.
 * SPOKEN_DECIMAL_RE separator class ([-\s]) never matched, tokens diverged
 * (["4","point","7","seconds"] vs Whisper's ["4","7","seconds"], sim 0.643),
 * and the segment false-failed REPEATED_IDENTICAL_TRUNCATION on all retries
 * across three days and four "fixes." Build-stamped error diagnostics
 * (ORION-QC-DIAG-001) identified the executing build and runtime tokens;
 * local reproduction with U+2011 matched deployed output byte-for-byte.
 */
import { transcriptTokens, transcriptSimilarity, normalizeSpokenNumberPhrases } from '../lib/transcriptQC'

const WHISPER = '4.7 seconds.'

describe('ORION-QC-UNIDASH-001: unicode dashes fold to ASCII before number normalization', () => {
  const variants: Array<[string, string]> = [
    ['ASCII hyphen', 'Four-point-seven seconds.'],
    ['U+2010 hyphen', 'Four\u2010point\u2010seven seconds.'],
    ['U+2011 non-breaking hyphen (prod incident)', 'Four\u2011point\u2011seven seconds.'],
    ['U+2013 en dash', 'Four\u2013point\u2013seven seconds.'],
    ['U+2014 em dash', 'Four\u2014point\u2014seven seconds.'],
    ['U+2212 minus sign', 'Four\u2212point\u2212seven seconds.'],
  ]

  for (const [name, text] of variants) {
    it(`${name}: tokens equal Whisper's digit form, similarity 1.0`, () => {
      const expTok = transcriptTokens(text)
      const detTok = transcriptTokens(WHISPER)
      expect(expTok).toEqual(['4', '7', 'seconds'])
      expect(transcriptSimilarity(expTok, detTok)).toBe(1)
    })
  }

  it('zero-width chars and NBSP are stripped before tokenization', () => {
    expect(transcriptTokens('Four\u200B-point-seven\u00A0seconds.')).toEqual(['4', '7', 'seconds'])
  })

  it('normalizeSpokenNumberPhrases handles unicode-dash decimal directly', () => {
    expect(normalizeSpokenNumberPhrases('Four\u2011point\u2011seven seconds.')).toBe('4.7 seconds.')
  })

  it('regular prose with em dashes is unharmed', () => {
    expect(transcriptTokens('He waited\u2014then ran.')).toEqual(['he', 'waited', 'then', 'ran'])
  })
})
