/**
 * ATL-QC-FP-005 — percent-word ↔ '%' + o'clock ↔ 'N:00' folding in the
 * transcript-QC comparator (Consciousness Protocol ep3 seg70, 2026-07-18).
 *
 * Production failure (job d0d32b6f, 2026-07-18T14:51:17Z):
 *   expected «"Why only twelve percent?"» detected «Why only 12%?»
 *   similarity 74.2%, speaker JAMES, splitRescueAttempted=false.
 *
 * Root cause: '%' was stripped to nothing by transcriptTokens' final
 * [^a-z0-9\s] strip (expected token "percent" could never match → coverage
 * cursor stall + tail fail on a 4-word line) while it SURVIVED
 * normalizeForQC (punctuation class has no '%') → normalized similarity
 * 0.742 < 0.85. Both gates fail; the numeric veto was NOT the trigger here.
 *
 * Fix: canonical folds in the shared first-stage normalizer
 * (normalizeSpokenNumberPhrases): digit-adjacent '%' → ' percent',
 * 'per cent' → 'percent', "o'clock" → 'oclock' (also removes the phantom
 * '0' the spoken-digit word 'o' injected into the veto stream), and bare
 * round-hour 'N:00' (no meridiem) → 'N oclock'.
 *
 * FP-005 dry-run (drafts/FP005-DRYRUN-20260718.md) surfaced 14 WOULD-FP
 * segments (percent) + 3 (o'clock colon-form) across Ep3/4/5/6/7 — every
 * class found is pinned below.  NO thresholds were touched.
 */

import {
  evaluateTranscriptQC,
  transcriptTokens,
  numericTokenSequence,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

// ── Exact production texts from the seg70 error_json ────────────────────────
// (/tmp/orion-ep3-seg70-error.json; CONSCIOUSNESS-EP3-FINAL-20260718 report)

const SEG70_EXPECTED = '"Why only twelve percent?"'
const SEG70_DETECTED = 'Why only 12%?'

// Ep3 seg72 (ARTEMIS, in the remaining 70–87 run) — pre-fix this passed ONLY
// via the ≥0.85 normalized fallback with coverage cratered to 0.029.
const SEG72_EXPECTED =
  '"Twelve percent is the maximum deviation that falls within acceptable performance variance. ' +
  'Anything more triggers automated review. I have calculated this threshold to four decimal ' +
  'places. I cannot save everyone. I save who I can."'
const SEG72_DETECTED =
  '12% is the maximum deviation that falls within acceptable performance variance. ' +
  'Anything more triggers automated review. I have calculated this threshold to 4 decimal ' +
  'places. I cannot save everyone. I save who I can.'

// Ep6 countdown motif (11 two-word percent segments, segs 38–88) + Ep7 pair.
const EP6_SEG38_EXPECTED = 'Twenty-nine percent.'
const EP6_SEG38_DETECTED = '29%.'
const EP7_SEG77_EXPECTED = 'Seven percent. Fifteen. Twenty-three.'
const EP7_SEG77_DETECTED = '7%. 15. 23.'
const EP7_SEG79_EXPECTED = 'Forty-one percent. Fifty-eight.'
const EP7_SEG79_DETECTED = '41%. 58.'

// Ep4 seg83 / Ep5 seg6 — o'clock ↔ colon-form (dry-run Class 2).
const EP4_SEG83_EXPECTED =
  '"James. The board would like to meet with you this afternoon. Conference room ' +
  "thirty-one-A, two o'clock. Please don't bring your laptop.\""
const EP4_SEG83_DETECTED =
  'James. The board would like to meet with you this afternoon. Conference room ' +
  "thirty-one-A, 2:00. Please don't bring your laptop."
const EP5_SEG6_EXPECTED = '"Your message said two o\'clock."'
const EP5_SEG6_DETECTED = 'Your message said 2:00.'

describe('ATL-QC-FP-005: seg70 percent pair PASSES (exact production pair)', () => {
  it('seg70 PASSES via the token path with full coverage (no fallback rescue)', () => {
    const r = evaluateTranscriptQC(SEG70_EXPECTED, SEG70_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
    expect(r.similarity).toBeGreaterThanOrEqual(0.95)
    expect(r.tailMatches).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false) // merit, not rescue
  })

  it('both sides tokenize to the identical canonical stream', () => {
    expect(transcriptTokens(SEG70_EXPECTED)).toEqual(['why', 'only', '12', 'percent'])
    expect(transcriptTokens(SEG70_DETECTED)).toEqual(['why', 'only', '12', 'percent'])
  })

  it('numeric veto stream is unchanged and convergent (["12"] both sides)', () => {
    const exp = transcriptTokens(SEG70_EXPECTED)
    const det = transcriptTokens(SEG70_DETECTED)
    expect(numericTokenSequence(exp)).toEqual(['12'])
    expect(numericTokenSequence(det)).toEqual(['12'])
    expect(numericTokenSequenceMismatch(exp, det)).toBe(false)
  })

  it('directionality: digits+% in the script vs words in the transcript also passes', () => {
    const r = evaluateTranscriptQC('Why only 12%?', '"Why only twelve percent?"')
    expect(r.passed).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false)
  })
})

describe('ATL-QC-FP-005: percent class — every dry-run WOULD-FP shape passes', () => {
  it('Ep6 seg38 two-word countdown line ("Twenty-nine percent." ↔ "29%.") passes', () => {
    const r = evaluateTranscriptQC(EP6_SEG38_EXPECTED, EP6_SEG38_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.normalizedFallbackUsed).toBe(false)
  })

  it('remaining Ep6 countdown values all fold canonically', () => {
    for (const [words, digits] of [
      ['Thirty-four percent.', '34%.'],
      ['Forty-eight percent.', '48%.'],
      ['Ninety-eight percent.', '98%.'],
    ] as const) {
      const r = evaluateTranscriptQC(words, digits)
      expect(r.passed).toBe(true)
      expect(r.normalizedFallbackUsed).toBe(false)
    }
  })

  it('Ep7 seg77 + seg79 multi-number percent lines pass', () => {
    expect(evaluateTranscriptQC(EP7_SEG77_EXPECTED, EP7_SEG77_DETECTED).passed).toBe(true)
    expect(evaluateTranscriptQC(EP7_SEG79_EXPECTED, EP7_SEG79_DETECTED).passed).toBe(true)
  })

  it('Ep3 seg72 long ARTEMIS line now passes on the TOKEN path (was fallback-only at coverage 0.029)', () => {
    const r = evaluateTranscriptQC(SEG72_EXPECTED, SEG72_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
    expect(r.normalizedFallbackUsed).toBe(false)
  })

  it('decimal percents keep their mantissa ("4.7 percent" ≡ "4.7%")', () => {
    const r = evaluateTranscriptQC('The delay was 4.7 percent of total.', 'The delay was 4.7% of total.')
    expect(r.passed).toBe(true)
    expect(transcriptTokens('4.7%')).toEqual(transcriptTokens('4.7 percent'))
  })

  it('"per cent" two-word rendering collapses to the same canonical form', () => {
    expect(evaluateTranscriptQC('Forty percent of posts.', '40 per cent of posts.').passed).toBe(true)
  })

  it('"percentage" is never rewritten (word survives on both sides)', () => {
    expect(transcriptTokens('the transfer percentage climbed')).toContain('percentage')
  })
})

describe("ATL-QC-FP-005: o'clock ↔ N:00 class (dry-run Class 2)", () => {
  it('Ep4 seg83 exact pair passes ("two o\'clock" ↔ "2:00", with thirty-one-A designator)', () => {
    const r = evaluateTranscriptQC(EP4_SEG83_EXPECTED, EP4_SEG83_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false)
  })

  it('Ep5 seg6 short line passes ("Your message said two o\'clock." ↔ "Your message said 2:00.")', () => {
    const r = evaluateTranscriptQC(EP5_SEG6_EXPECTED, EP5_SEG6_DETECTED)
    expect(r.passed).toBe(true)
  })

  it("words-form rendering (\"2 o'clock\") still passes — regression guard", () => {
    expect(evaluateTranscriptQC(EP5_SEG6_EXPECTED, "Your message said 2 o'clock.").passed).toBe(true)
  })

  it("phantom '0' no longer enters the numeric veto stream (o'clock ≠ spoken digit 'o')", () => {
    expect(numericTokenSequence(transcriptTokens("two o'clock"))).toEqual(['2'])
    expect(numericTokenSequence(transcriptTokens('2:00'))).toEqual(['2'])
  })

  it('meridiem forms are untouched — existing round-hour rule still owns "2:00 p.m."', () => {
    expect(evaluateTranscriptQC('He left at 2:00 p.m. sharp.', 'He left at 2 p.m. sharp.').passed).toBe(true)
    expect(transcriptTokens('He left at 2:00 p.m. sharp.')).toEqual(transcriptTokens('He left at 2 pm sharp.'))
  })

  it('non-round clock times are untouched ("6:47" keeps the clock split)', () => {
    expect(transcriptTokens('at 6:47 yesterday')).toEqual(['at', '6', '47', 'yesterday'])
  })
})

describe('ATL-QC-FP-005: real defects still FAIL (folding must not loosen detection)', () => {
  it('genuinely wrong percent value: seg70 vs "Why only 15%?" FAILS (numeric veto)', () => {
    const r = evaluateTranscriptQC(SEG70_EXPECTED, 'Why only 15%?')
    expect(r.passed).toBe(false)
    expect(
      numericTokenSequenceMismatch(transcriptTokens(SEG70_EXPECTED), transcriptTokens('Why only 15%?'))
    ).toBe(true)
  })

  it('wrong countdown value: "Ninety-eight percent." vs "89%." FAILS', () => {
    expect(evaluateTranscriptQC('Ninety-eight percent.', '89%.').passed).toBe(false)
  })

  it('cross-class wrong value: "twelve percent" vs "15%" FAILS even in a full sentence', () => {
    expect(
      evaluateTranscriptQC(
        'In roughly twelve percent of all active campaigns.',
        'In roughly 15% of all active campaigns.'
      ).passed
    ).toBe(false)
  })

  it('dropped percent word in the audio ("Twenty-nine percent." vs "29.") FAILS', () => {
    expect(evaluateTranscriptQC(EP6_SEG38_EXPECTED, '29.').passed).toBe(false)
  })

  it('dropped sentences in seg72 FAIL', () => {
    // NOTE: a 5-word single-clause drop on this 41-token line is absorbed by
    // the PRE-EXISTING ≥0.85 normalized fallback (normSim 0.899 — verified
    // identical pre-fix; the FP-005 folds neither create nor widen that
    // tolerance).  That fallback quirk is a documented FP-002/003-era
    // follow-up, not FP-005 scope.  The defect class the comparator is
    // designed to catch — dropped sentence(s) — must still fail:
    const missingSentences = SEG72_DETECTED.replace(
      'Anything more triggers automated review. I have calculated this threshold to 4 decimal places. ',
      ''
    )
    expect(missingSentences.length).toBeLessThan(SEG72_DETECTED.length - 80)
    expect(evaluateTranscriptQC(SEG72_EXPECTED, missingSentences).passed).toBe(false)
  })

  it('wrong hour: "two o\'clock" vs "3:00" FAILS (veto)', () => {
    expect(evaluateTranscriptQC(EP5_SEG6_EXPECTED, 'Your message said 3:00.').passed).toBe(false)
  })

  it('round-hour fold cannot mask a minutes change ("6:47" vs "6:00") — FAILS', () => {
    expect(evaluateTranscriptQC('He arrived at 6:47 exactly.', 'He arrived at 6:00 exactly.').passed).toBe(false)
  })

  it('Cythemdol-14 split-rescue mispronunciation (FP-003 exact strings) STILL FAILS', () => {
    const expected =
      "Cluster 2,714's pharmaceutical operation included a sub-campaign aimed at pediatric " +
      'medication pricing.'
    const detectedBad =
      "Cluster 2 Cythemdol-14's pharmaceutical operation included a sub-campaign aimed at pediatric " +
      'medication pricing.'
    const r = evaluateTranscriptQC(expected, detectedBad)
    expect(r.passed).toBe(false)
    expect(numericTokenSequenceMismatch(transcriptTokens(expected), transcriptTokens(detectedBad))).toBe(true)
  })
})

describe('ATL-QC-FP-005: prior comparator lineage unaffected', () => {
  it('São Paulo pair (ATL-QC-FP-002) passes', () => {
    expect(
      evaluateTranscriptQC(
        'A voter in S\u00e3o Paulo received a different version of the same story than a voter in Stockholm.',
        'A voter in Sao Paulo received a different version of the same story than a voter in Stockholm.'
      ).passed
    ).toBe(true)
  })

  it('QC-NUMNORM-002 pair ("Four-point-seven" ≡ "4.7") passes', () => {
    expect(evaluateTranscriptQC('Four-point-seven seconds.', '4.7 seconds.').passed).toBe(true)
  })

  it('FP-003 separator folding intact ("2,714" ≡ "2-714")', () => {
    expect(transcriptTokens("Cluster 2-714's operation")).toContain('2714')
    expect(transcriptTokens("Cluster 2,714's operation")).toContain('2714')
  })

  it('FP-004 article-scale folding intact ("a hundred times" ≡ "100 times")', () => {
    expect(evaluateTranscriptQC("He'd used it a hundred times before.", "He'd used it 100 times before.").passed).toBe(true)
  })

  it('clock-time split unchanged ("eleven-nineteen" ≡ "1119" → ["11","19"])', () => {
    expect(transcriptTokens('at eleven-nineteen that night')).toEqual(['at', '11', '19', 'that', 'night'])
    expect(transcriptTokens('at 1119 that night')).toEqual(['at', '11', '19', 'that', 'night'])
  })
})
