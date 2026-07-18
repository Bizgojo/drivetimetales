/**
 * ATL-QC-FP-003 — regression lock for the numeral-comma / digit-group
 * separator false positive (Consciousness Protocol ep3 seg45, job
 * d0d32b6f-6f7d-4fea-88cf-375009d1deab, 2026-07-18T12:48:57Z).
 *
 * Root cause: the script renders a thousands-grouped numeral with a comma
 * ("Cluster 2,714's") which the existing comma-strip folds to the single
 * token "2714".  Whisper renders the same spoken numeral with a hyphen
 * ("Cluster 2-714's") — and the clock-time split rule then fires on the
 * "714" group, tokenizing the detected side to ["2","7","14"].  That
 * (1) stalls the sequential coverage cursor at "2714" — coverage collapses
 * despite compact-string similarity of 100.0% — and (2) yields numeric
 * sequences ["2714"] vs ["2","7","14"], tripping the
 * numericTokenSequenceMismatch HARD VETO, which blocks even the
 * normalized-similarity fallback.
 *
 * Fix (mirrors QC-NUMNORM-002 / ATL-QC-FP-002): fold digit-group separators
 * (hyphen / space / comma[+space]) inside thousands-grouped numerals to the
 * canonical joined form in the SHARED normalization pipeline
 * (normalizeCompoundNumbers), so both sides converge to "2714" before any
 * token-splitting rule runs.  The fold requires a 1–2 digit leading group
 * followed by exactly-3-digit groups, so digit ranges like "100-200" and
 * clock times like "7 14" are NOT folded.  Real numeric defects (changed or
 * missing digits, e.g. the split-rescue "Cluster 2 Cythemdol-14"
 * mispronunciation) still fail — locked below.
 *
 * The seg45 pair also exercises the sentence-boundary merge
 * ("flagged it. Not" → "flagged it, not"): period→comma plus case fold.
 * Punctuation/case already collapse at token level (ATL-QC-FP-002 lock);
 * pinned here explicitly because seg45 combined both variances.
 */

import {
  evaluateTranscriptQC,
  normalizeCompoundNumbers,
  transcriptTokens,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

// ── Exact production texts from the seg45 error_json ────────────────────────
// (CONSCIOUSNESS-REQUEUE-20260718 report; job error at 2026-07-18T12:48:57.695Z)

const SEG45_EXPECTED =
  "James's breath stopped. He checked the campaign details. Cluster 2,714's pharmaceutical " +
  'operation included a sub-campaign aimed at pediatric medication pricing. Artemis had flagged it. ' +
  'Not through any official channel, not through any system designed for flags or alerts. It had ' +
  'hidden a note in the metadata like someone scratching a message into a prison wall.'

const SEG45_DETECTED =
  "James's breath stopped. He checked the campaign details. Cluster 2-714's pharmaceutical " +
  'operation included a sub-campaign aimed at pediatric medication pricing. Artemis had flagged it, ' +
  'not through any official channel, not through any system designed for flags or alerts. It had ' +
  'hidden a note in the metadata like someone scratching a message into a prison wall.'

// ── Exact split-rescue chunk-3 texts (real TTS mispronunciation, 94.8%) ─────

const CHUNK3_EXPECTED =
  "Cluster 2,714's pharmaceutical operation included a sub-campaign aimed at pediatric " +
  'medication pricing.'

const CHUNK3_DETECTED_BAD =
  "Cluster 2 Cythemdol-14's pharmaceutical operation included a sub-campaign aimed at pediatric " +
  'medication pricing.'

describe('ATL-QC-FP-003: seg45 numeral-comma + sentence-merge pair PASSES (exact production pair)', () => {
  it('seg45 PASSES via the token path with full coverage (no fallback rescue)', () => {
    const r = evaluateTranscriptQC(SEG45_EXPECTED, SEG45_DETECTED)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
    expect(r.tailMatches).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false) // must pass on merit, not rescue
  })

  it('digit-group separator variants all tokenize to the canonical joined numeral', () => {
    expect(transcriptTokens("Cluster 2,714's operation")).toContain('2714')
    expect(transcriptTokens("Cluster 2-714's operation")).toContain('2714')
    expect(transcriptTokens("Cluster 2 714's operation")).toContain('2714')
    expect(transcriptTokens("Cluster 2714's operation")).toContain('2714')
  })

  it('separator variance alone does not trip the numeric hard veto', () => {
    const expected = transcriptTokens(SEG45_EXPECTED)
    for (const variant of ['2-714', '2 714', '2714', '2,714']) {
      const detected = transcriptTokens(SEG45_DETECTED.replace('2-714', variant))
      expect(numericTokenSequenceMismatch(expected, detected)).toBe(false)
    }
  })

  it('sentence-boundary merge alone ("flagged it. Not" vs "flagged it, not") passes', () => {
    const r = evaluateTranscriptQC(
      'Artemis had flagged it. Not through any official channel, not through any system designed for flags or alerts.',
      'Artemis had flagged it, not through any official channel, not through any system designed for flags or alerts.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('multi-group numerals fold too ("1-234-567" ≡ "1,234,567")', () => {
    expect(normalizeCompoundNumbers('paid 1-234-567 credits')).toContain('1234567')
    expect(normalizeCompoundNumbers('paid 1,234,567 credits')).toContain('1234567')
  })
})

// ── Real defects must STILL FAIL — folding must not loosen detection ────────

describe('ATL-QC-FP-003: genuine defects still fail', () => {
  it('split-rescue chunk 3 real mispronunciation ("Cluster 2 Cythemdol-14") STILL FAILS', () => {
    const r = evaluateTranscriptQC(CHUNK3_EXPECTED, CHUNK3_DETECTED_BAD)
    expect(r.passed).toBe(false)
    // The hallucinated token changes the digit stream: ["2714"] vs ["2","14"].
    expect(
      numericTokenSequenceMismatch(transcriptTokens(CHUNK3_EXPECTED), transcriptTokens(CHUNK3_DETECTED_BAD))
    ).toBe(true)
  })

  it('genuinely different grouped numeral STILL FAILS ("2,714" vs "2-715")', () => {
    const r = evaluateTranscriptQC(SEG45_EXPECTED, SEG45_DETECTED.replace('2-714', '2-715'))
    expect(r.passed).toBe(false)
  })

  it('digit range with 3-digit endpoints is NOT folded ("100-200" stays two numbers)', () => {
    // NOTE: the pre-existing clock-split rule renders "100"→["1","00"] on BOTH
    // sides (symmetric, so never an FP). The invariant pinned here is only
    // that the NEW separator fold does not merge range endpoints into one
    // numeral, and that cross-form ranges (script hyphen vs Whisper "to")
    // do not trip the numeric veto.
    const tokens = transcriptTokens('between 100-200 people attended')
    expect(tokens).not.toContain('100200')
    expect(normalizeCompoundNumbers('between 100-200 people attended')).toContain('100-200')
    // Cross-form range: script "100-200" vs Whisper "100 to 200" must not veto.
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens('between 100-200 people attended'),
        transcriptTokens('between 100 to 200 people attended'),
      )
    ).toBe(false)
  })

  it('clock times are NOT folded ("7 14" and "7:14" stay split)', () => {
    expect(transcriptTokens('at 7:14 that evening')).toEqual(
      expect.arrayContaining(['7', '14'])
    )
    expect(transcriptTokens('at 7:14 that evening')).not.toContain('714')
  })

  it('decimal "4.7" is untouched (QC-NUMNORM-002 pair still passes)', () => {
    expect(evaluateTranscriptQC('Four-point-seven seconds.', '4.7 seconds.').passed).toBe(true)
  })

  it('spoken emergency digits "9-1-1" keep their existing equivalence (single-digit groups untouched by the fold)', () => {
    // Pre-existing behavior: "9-1-1" → "911" (stylistic rule) → clock-split
    // ["9","11"] — identical on both sides. The new fold must not alter it
    // (groups are 1 digit, not 3).
    expect(transcriptTokens('call 9-1-1 now')).toEqual(transcriptTokens('call 911 now'))
  })

  it('missing sentence in seg45 STILL FAILS even with the separator fold', () => {
    const missingMiddle = SEG45_DETECTED.replace(
      /Artemis had flagged it, not through any official channel, not through any system designed for flags or alerts\. /,
      ''
    )
    expect(missingMiddle.length).toBeLessThan(SEG45_DETECTED.length - 100)
    expect(evaluateTranscriptQC(SEG45_EXPECTED, missingMiddle).passed).toBe(false)
  })

  it('São Paulo regression pair (ATL-QC-FP-002) unaffected', () => {
    const r = evaluateTranscriptQC(
      'A voter in S\u00e3o Paulo received a different version of the same story than a voter in Stockholm.',
      'A voter in Sao Paulo received a different version of the same story than a voter in Stockholm.',
    )
    expect(r.passed).toBe(true)
  })
})
