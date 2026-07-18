/**
 * ATL-QC-FP-004 — regression lock for the number-word → digits false positive
 * (Consciousness Protocol ep3 seg55, job d0d32b6f-6f7d-4fea-88cf-375009d1deab,
 * 2026-07-18T13:52:43.777Z, "similarity: 98.8%").
 *
 * Root cause (traced empirically, exact 0.9879 reproduced): the script writes
 * the spoken article form "a hundred times" while Whisper folds it to digits
 * ("100 times").  NO prior rule covered the article form — every
 * "X hundred/thousand" rule (normalizeCompoundNumbers, normalizeNumberWords,
 * SPOKEN_NUMBER_PHRASE_RE) requires a leading NUMBER word, and "a" is not in
 * NUMBER_WORDS.  So the expected side kept ["a","hundred"] while the detected
 * side's "100" was split by the pre-existing clock-time rule into ["1","00"].
 * Numeric sequences [] vs ["1","00"] tripped the numericTokenSequenceMismatch
 * HARD VETO — the only failing gate: tokenQC would have passed (coverage 0.667
 * ≥ 0.62 despite the cursor stalling at "a", tail OK) and the normalized
 * fallback would have passed (0.9879 ≥ 0.85), but the veto blocks both.
 * The reported "98.8%" is max(tokenSimilarity, normalizedSimilarity) — a
 * diagnostic, not the gate.
 *
 * The seg55 pair also carried an em-dash → comma delta
 * ("Artemis—standard procedure" → "Artemis, standard procedure").  That
 * contributes ZERO difference — em/en-dashes fold to '-' (UNIDASH-001) and
 * all sentence punctuation collapses to separators (ATL-QC-FP-002) in BOTH
 * the token path and normalizeForQC.  Pinned explicitly below anyway.
 *
 * Fix (same philosophy as QC-NUMNORM-002 / FP-002 / FP-003 — normalize the
 * surface variance away in the SHARED pipeline, never loosen a threshold):
 * in normalizeSpokenNumberPhrases (first normalizer on both sides in both
 * transcriptTokens and normalizeForQC):
 *   1. "a/an" → "one" ONLY when directly followed by a scale word
 *      (hundred|thousand|million|billion|dozen); the existing cardinal parser
 *      then folds the phrase ("a hundred" ≡ "one hundred" ≡ "100").
 *   2. digit+scale folds for the scale words the cardinal parser does not
 *      model: "1 million"→1000000, "1 billion"→1000000000, "1 dozen"→12
 *      (lookbehind keeps decimals like "1.5 million" untouched).
 * Both folds are canonical — word-form and digit-form map to the same token,
 * so DIRECTION does not matter (digits-in-script vs words-in-transcript is
 * locked below).
 */

import {
  evaluateTranscriptQC,
  normalizeSpokenNumberPhrases,
  transcriptTokens,
  numericTokenSequence,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

// ── Exact production texts from the seg55 error_json ────────────────────────
// (CONSCIOUSNESS-EP3-RESUME-20260718 report; error at 2026-07-18T13:52:43.777Z.
//  The script dash is a true U+2014 EM DASH; Whisper substituted ", ".)

const SEG55_EXPECTED =
  "James opened Meridian's internal diagnostic suite. As ethics auditor, he had clearance to run " +
  'direct behavioral queries on Artemis\u2014standard procedure for bias testing. The system allowed ' +
  "text-based input. He'd used it a hundred times to test response parameters, feeding Artemis " +
  'prompts and measuring its outputs against ethical benchmarks.'

const SEG55_DETECTED =
  "James opened Meridian's internal diagnostic suite. As ethics auditor, he had clearance to run " +
  'direct behavioral queries on Artemis, standard procedure for bias testing. The system allowed ' +
  "text-based input. He'd used it 100 times to test response parameters, feeding Artemis " +
  'prompts and measuring its outputs against ethical benchmarks.'

describe('ATL-QC-FP-004: seg55 number-word + em-dash pair PASSES (exact production pair)', () => {
  it('seg55 PASSES via the token path with full coverage (no fallback rescue)', () => {
    const r = evaluateTranscriptQC(SEG55_EXPECTED, SEG55_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
    expect(r.tailMatches).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false) // must pass on merit, not rescue
  })

  it('numeric sequences converge — the hard veto that killed seg55 no longer fires', () => {
    const exp = transcriptTokens(SEG55_EXPECTED)
    const det = transcriptTokens(SEG55_DETECTED)
    expect(numericTokenSequenceMismatch(exp, det)).toBe(false)
    expect(numericTokenSequence(exp)).toEqual(numericTokenSequence(det))
  })

  it('canonical fold: "a hundred" ≡ "one hundred" ≡ "100" at the token level', () => {
    const canonical = transcriptTokens('used it 100 times')
    expect(transcriptTokens('used it a hundred times')).toEqual(canonical)
    expect(transcriptTokens('used it one hundred times')).toEqual(canonical)
  })

  it('DIRECTIONALITY: digits-in-script vs words-in-transcript also passes', () => {
    // Inverse of seg55: script has "100", Whisper spells it out.
    const r = evaluateTranscriptQC(
      SEG55_EXPECTED.replace('a hundred times', '100 times'),
      SEG55_DETECTED.replace('100 times', 'a hundred times'),
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('em-dash → comma alone ("Artemis—standard" vs "Artemis, standard") passes with zero token delta', () => {
    const expected =
      'He had clearance to run direct behavioral queries on Artemis\u2014standard procedure for bias testing.'
    const detected =
      'He had clearance to run direct behavioral queries on Artemis, standard procedure for bias testing.'
    expect(transcriptTokens(expected)).toEqual(transcriptTokens(detected))
    const r = evaluateTranscriptQC(expected, detected)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('en-dash variant folds identically to the em-dash', () => {
    expect(
      transcriptTokens('queries on Artemis\u2013standard procedure')
    ).toEqual(transcriptTokens('queries on Artemis, standard procedure'))
  })

  it('article scale forms fold canonically: a thousand / a million / a dozen', () => {
    expect(transcriptTokens('said it a thousand ways')).toEqual(transcriptTokens('said it 1000 ways'))
    expect(transcriptTokens('one in a million chance')).toEqual(transcriptTokens('one in 1000000 chance'))
    expect(transcriptTokens('bought a dozen eggs')).toEqual(transcriptTokens('bought 12 eggs'))
    expect(transcriptTokens('worth a billion credits')).toEqual(transcriptTokens('worth 1000000000 credits'))
  })

  it('bare word-number scale compounds fold too ("two million" ≡ "2 million" ≡ "2000000")', () => {
    const canonical = transcriptTokens('cost 2000000 credits')
    expect(transcriptTokens('cost two million credits')).toEqual(canonical)
    expect(transcriptTokens('cost 2 million credits')).toEqual(canonical)
    expect(transcriptTokens('ordered two dozen roses')).toEqual(transcriptTokens('ordered 24 roses'))
  })

  it('compound article forms parse through the existing cardinal parser ("a hundred and fifty" ≡ "150")', () => {
    expect(transcriptTokens('walked a hundred and fifty meters')).toEqual(
      transcriptTokens('walked 150 meters')
    )
  })
})

// ── Real defects must STILL FAIL — folding must not loosen detection ────────

describe('ATL-QC-FP-004: genuine defects still fail', () => {
  it('genuinely wrong number STILL FAILS ("a hundred times" vs "300 times")', () => {
    const r = evaluateTranscriptQC(
      SEG55_EXPECTED,
      SEG55_DETECTED.replace('100 times', '300 times'),
    )
    expect(r.passed).toBe(false)
    // Canonical numeric streams now differ: ["1","00"] vs ["3","00"].
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens(SEG55_EXPECTED),
        transcriptTokens(SEG55_DETECTED.replace('100 times', '300 times')),
      )
    ).toBe(true)
  })

  it('wrong scale word STILL FAILS ("a hundred" vs "a thousand")', () => {
    expect(
      evaluateTranscriptQC(
        SEG55_EXPECTED,
        SEG55_DETECTED.replace('100 times', 'a thousand times'),
      ).passed
    ).toBe(false)
  })

  it('dropped clause in seg55 STILL FAILS', () => {
    const dropped = SEG55_DETECTED.replace(
      "He'd used it 100 times to test response parameters, ",
      ''
    )
    expect(dropped.length).toBeLessThan(SEG55_DETECTED.length - 40)
    expect(evaluateTranscriptQC(SEG55_EXPECTED, dropped).passed).toBe(false)
  })

  it('Cythemdol-14 split-rescue mispronunciation (FP-003 negative) STILL FAILS', () => {
    const r = evaluateTranscriptQC(
      "Cluster 2,714's pharmaceutical operation included a sub-campaign aimed at pediatric medication pricing.",
      "Cluster 2 Cythemdol-14's pharmaceutical operation included a sub-campaign aimed at pediatric medication pricing.",
    )
    expect(r.passed).toBe(false)
  })

  it('ordinary indefinite articles are NEVER rewritten ("a house", "an hour")', () => {
    expect(transcriptTokens('he bought a house near an hour away')).toEqual(
      ['he', 'bought', 'a', 'house', 'near', 'an', 'hour', 'away']
    )
    expect(normalizeSpokenNumberPhrases('a hundredweight of an oddly')).toBe(
      'a hundredweight of an oddly' // \b guard: scale word must be whole-word
    )
  })

  it('decimal scale amounts are NOT folded ("1.5 million" keeps its mantissa)', () => {
    expect(normalizeSpokenNumberPhrases('raised 1.5 million dollars')).toBe(
      'raised 1.5 million dollars'
    )
    // Cross-form decimal scale still converges symmetrically (both keep "million"):
    expect(transcriptTokens('raised one point five million dollars')).toEqual(
      transcriptTokens('raised 1.5 million dollars')
    )
  })

  it('QC-NUMNORM-002 decimal pair unaffected ("Four-point-seven seconds." ≡ "4.7 seconds.")', () => {
    expect(evaluateTranscriptQC('Four-point-seven seconds.', '4.7 seconds.').passed).toBe(true)
    expect(transcriptTokens('Four-point-seven seconds.')).toEqual(['4', '7', 'seconds'])
  })

  it('São Paulo pair (ATL-QC-FP-002) unaffected', () => {
    const r = evaluateTranscriptQC(
      'A voter in S\u00e3o Paulo received a different version of the same story than a voter in Stockholm.',
      'A voter in Sao Paulo received a different version of the same story than a voter in Stockholm.',
    )
    expect(r.passed).toBe(true)
  })

  it('FP-003 grouped-numeral fold unaffected ("2,714" ≡ "2-714", Cythemdol veto intact)', () => {
    expect(transcriptTokens("Cluster 2,714's operation")).toContain('2714')
    expect(transcriptTokens("Cluster 2-714's operation")).toContain('2714')
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens("Cluster 2,714's pharmaceutical operation"),
        transcriptTokens("Cluster 2 Cythemdol-14's pharmaceutical operation"),
      )
    ).toBe(true)
  })

  it('clock times stay split (the "100"→["1","00"] symmetry is untouched)', () => {
    expect(transcriptTokens('at 7:14 that evening')).toEqual(
      expect.arrayContaining(['7', '14'])
    )
    expect(transcriptTokens('at 7:14 that evening')).not.toContain('714')
  })
})
