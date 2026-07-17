/**
 * ATL-QC-FP-002 — regression lock for the "São Paulo class" coverage false
 * positive (Consciousness Protocol ep3 seg33, story 185f5ba8).
 *
 * Root cause: diacritics survived into the word-level normalizers, where a
 * combining/precomposed mark ('ã') acts as a regex non-word char.  The
 * \b-anchored spoken-digit rule then converted the trailing "o" of "São" to
 * the digit "0", so "São" tokenized to ["s","0"].  That (1) stalled the
 * sequential coverage cursor — coverage 0.675 despite 99.8% similarity — and
 * (2) injected a phantom digit that tripped the numericTokenSequenceMismatch
 * HARD VETO, blocking even the normalized-similarity fallback.
 *
 * Fix (mirrors QC-NUMNORM-002): foldDiacritics() runs first in the shared
 * transcriptTokens pre-normalization so BOTH sides converge before any
 * word-level rule runs.  Detection of real defects is unchanged — locked by
 * the failure cases below.
 */

import {
  evaluateTranscriptQC,
  foldDiacritics,
  transcriptTokens,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

// ── Exact production texts from SEG33-CLASSIFICATION-20260717 ──────────────

const SEG33_EXPECTED =
  'The campaigns were elegant. That was the worst part. Each one was tailored to its target population ' +
  'with a granularity that made traditional advertising look like shouting into a canyon. Artemis ' +
  "didn't just generate content\u2014it modeled individual psychological profiles, predicted emotional " +
  'responses, and adjusted its messaging in real time. A voter in S\u00e3o Paulo received a different ' +
  'version of the same story than a voter in Stockholm, calibrated to their specific fears, hopes, ' +
  'and cognitive blind spots.'

const SEG33_DETECTED =
  'The campaigns were elegant, that was the worst part. Each one was tailored to its target population ' +
  'with a granularity that made traditional advertising look like shouting into a canyon. Artemis ' +
  "didn't just generate content, it modeled individual psychological profiles, predicted emotional " +
  'responses, and adjusted its messaging in real time. A voter in Sao Paulo received a different ' +
  'version of the same story than a voter in Stockholm, calibrated to their specific fears, hopes, ' +
  'and cognitive blind spots.'

describe('ATL-QC-FP-002: São Paulo class passes (ep3 seg33 exact production pair)', () => {
  it('seg33 PASSES via the token path with full coverage (no fallback rescue)', () => {
    const r = evaluateTranscriptQC(SEG33_EXPECTED, SEG33_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95) // was 0.675 before the fix
    expect(r.tailMatches).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false) // must pass on merit, not rescue
  })

  it('"São" no longer tokenizes to a phantom digit', () => {
    const tokens = transcriptTokens('A voter in S\u00e3o Paulo received')
    expect(tokens).toContain('sao')
    expect(tokens).not.toContain('0')
    expect(tokens).not.toContain('s')
  })

  it('diacritic difference alone does not trip the numeric hard veto', () => {
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens('A voter in S\u00e3o Paulo received a letter.'),
        transcriptTokens('A voter in Sao Paulo received a letter.'),
      )
    ).toBe(false)
  })

  it('foldDiacritics handles composed forms and non-decomposable Latin letters', () => {
    expect(foldDiacritics('S\u00e3o Paulo')).toBe('Sao Paulo')
    expect(foldDiacritics('caf\u00e9 r\u00e9sum\u00e9 na\u00efve Z\u00fcrich se\u00f1or')).toBe('cafe resume naive Zurich senor')
    expect(foldDiacritics('\u00d8rsted \u00e6ther \u0153uvre stra\u00dfe \u0141\u00f3d\u017a')).toBe('Orsted aether oeuvre strasse Lodz')
  })

  it('typographic punctuation differences alone pass (em-dash→comma, period→comma)', () => {
    const r = evaluateTranscriptQC(
      'The signal was clean. That surprised her. It carried data\u2014it carried intent across the entire relay network without any measurable loss.',
      'The signal was clean, that surprised her. It carried data, it carried intent across the entire relay network without any measurable loss.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
  })
})

// ── Prior-art false-positive classes must STAY green (do not re-break) ──────

describe('ATL-QC-FP-002: numeral-token FP classes still pass (QC-NUMNORM-002 / QC-ALNUM-001 pins)', () => {
  it('ep2 seg50 pair: "Four-point-seven seconds." vs "4.7 seconds." PASSES', () => {
    expect(evaluateTranscriptQC('Four-point-seven seconds.', '4.7 seconds.').passed).toBe(true)
  })

  it('ep2 seg64 pair: "OD-7" fused to "OD7" PASSES', () => {
    expect(evaluateTranscriptQC('James opened OD-7.', 'James opened OD7.').passed).toBe(true)
  })

  it('spoken decimal inside a sentence still passes', () => {
    expect(
      evaluateTranscriptQC(
        'The delay was four-point-seven seconds before the relay engaged.',
        'The delay was 4.7 seconds before the relay engaged.',
      ).passed
    ).toBe(true)
  })
})

// ── Real defects must STILL FAIL — folding must not loosen detection ────────

describe('ATL-QC-FP-002: genuine defects still fail', () => {
  const LONG_EXPECTED =
    'The reactor hummed at a frequency Mira could feel in her teeth. She checked the manifold pressure ' +
    'twice before opening the valve, because the last technician who rushed this step had spent a month ' +
    'in the burn ward. Steam hissed through the release channel and the gauges settled into the green. ' +
    'Only then did she allow herself to exhale, log the reading, and radio the control room that the ' +
    'primary loop was stable again.'

  it('truncation loop: repeated identical short fragment of a long segment FAILS', () => {
    // Models REPEATED_IDENTICAL_TRUNCATION: every retry candidate returns only
    // the opening clause of a long paragraph.
    const truncated = 'The reactor hummed at a frequency Mira could feel in her teeth.'
    const r = evaluateTranscriptQC(LONG_EXPECTED, truncated)
    expect(r.passed).toBe(false)
  })

  it('missing sentence in the middle of a segment FAILS', () => {
    const missingMiddle =
      'The reactor hummed at a frequency Mira could feel in her teeth. ' +
      'Steam hissed through the release channel and the gauges settled into the green. ' +
      'Only then did she allow herself to exhale, log the reading, and radio the control room that the ' +
      'primary loop was stable again.'
    const r = evaluateTranscriptQC(LONG_EXPECTED, missingMiddle)
    expect(r.passed).toBe(false)
  })

  it('hallucinated expansion (ep2 seg63 class): "OD-7" → "OD7, Operational Directive 7" FAILS', () => {
    const r = evaluateTranscriptQC('OD-7', 'OD7, Operational Directive 7')
    expect(r.passed).toBe(false)
  })

  it('diacritic folding does not mask a real defect in the same segment', () => {
    // Same São→Sao rendering PLUS genuinely missing middle sentences: must fail.
    // (Note: a ≥50%-length clean PREFIX truncation passes the normalized
    // fallback via stringSimilarity's calibrated substring rule on MAIN today
    // for diacritic-free text — pre-existing behavior, out of scope here and
    // deliberately not changed; see ATL-QC-FP-002 report, follow-up item.)
    const detectedMissingMiddle = SEG33_DETECTED.replace(
      /Each one was tailored[\s\S]*?in real time\. /,
      ''
    )
    expect(detectedMissingMiddle.length).toBeLessThan(SEG33_DETECTED.length - 200) // guard: chunk really removed
    const r = evaluateTranscriptQC(SEG33_EXPECTED, detectedMissingMiddle)
    expect(r.passed).toBe(false)
  })

  it('genuine numeric change still trips the numeric hard veto', () => {
    const r = evaluateTranscriptQC('James opened OD-7.', 'James opened OD-8.')
    expect(r.passed).toBe(false)
  })

  it('blank transcript still fails', () => {
    expect(evaluateTranscriptQC(SEG33_EXPECTED, '').passed).toBe(false)
  })
})
