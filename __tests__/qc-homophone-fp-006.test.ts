/**
 * ATL-QC-FP-006 — "too" ↔ "two" homophone folding in the transcript-QC
 * comparator (Sunset Ep4 "The Shell" segment_0019, TOM, 2026-07-20).
 *
 * Production failure (story 1582a8bd, job log tmp/ep4-monitor.log,
 * 2026-07-20T21:05:11Z):
 *   expected «…if the substrate's running two under on one side for a year…»
 *   detected «…if the substrate's running too under on one side for a year…»
 *   similarity 98.4%, speaker TOM, splitRescueAttempted=false.
 *
 * Root cause: "two" and "too" are homophones — identical audio, spelling
 * chosen by Whisper's language model.  The spoken-number phrase parser folds
 * the EXPECTED side's "two" → "2" (expTok showed "…running 2 under on 1…"),
 * while the DETECTED side's "too" stayed a word.  numericTokenSequence then
 * saw ["2","1"] vs ["1"] → numericTokenSequenceMismatch HARD VETO, which the
 * ≥0.85 normalized-similarity fallback (0.984) cannot override.  The retry
 * pass then hit REPEATED_IDENTICAL_TRUNCATION and stopped the run.
 *
 * Fix (same pattern as ATL-QC-FP-004/FP-005): canonical fold in the shared
 * first-stage normalizer (normalizeSpokenNumberPhrases) — standalone "too"
 * → "2" on BOTH sides of BOTH pipelines, placed at the END of the chain so
 * it can never join an adjacent genuine number phrase.  "to" is deliberately
 * EXCLUDED (reduced /tə/ vowel; Whisper drops it at clip boundaries —
 * SAFE_TERMINAL_FUNCTION_WORDS / isSafeTerminalTailDrop key on the literal
 * token, and a digit fold would turn those documented soft drops into
 * numeric hard vetoes).  NO thresholds touched; genuine wrong-value defects
 * still hard-fail.
 *
 * Also locked below (checked while here, per the FP-006 brief): homophone
 * classes the comparator ALREADY handles, so nobody re-adds them —
 * its ↔ it's (possessive-strip) and their ↔ there ↔ they're (ATL-PIPE-008/A8
 * fuzzy short-token rule).
 */

import {
  evaluateTranscriptQC,
  transcriptTokens,
  numericTokenSequenceMismatch,
  transcriptTokenMatches,
  knownHomophoneMatches,
} from '../lib/transcriptQC'

// ── Exact production texts from the segment_0019 error_json ─────────────────
// (tmp/ep4-monitor.log, 2026-07-20T21:05:37Z entry — first, untruncated attempt)

const SEG19_EXPECTED =
  "It's a substrate I'm describing, and if the substrate's running two under on one side " +
  "for a year, the substrate's going to have a problem, and then your person moves into a " +
  'house with a bad wall.'
const SEG19_DETECTED =
  "Yes, a substrate, I'm describing, and if the substrate's running too under on one side " +
  "for a year, the substrate's going to have a problem, and then your person moves into a " +
  'house with a bad wall.'

// Retry candidates (21:06Z entry) returned this truncated output — a GENUINE
// defect (missing back half) that must keep failing after the fold.
const SEG19_TRUNCATED =
  "It's a substrate I'm describing, and if the substrate's running too under on one"

describe('ATL-QC-FP-006: segment_0019 production pair PASSES', () => {
  it('seg19 PASSES (exact production texts, first attempt)', () => {
    const r = evaluateTranscriptQC(SEG19_EXPECTED, SEG19_DETECTED)
    expect(r.passed).toBe(true)
    // The head also carries a real ASR word substitution ("It's" → "Yes"),
    // which stalls the sequential coverage cursor — so the pass legitimately
    // routes through the ≥0.85 normalized-similarity fallback.
    expect(r.normalizedSimilarity).toBeGreaterThanOrEqual(0.98)
    expect(r.tailMatches).toBe(true)
  })

  it('the numeric hard veto no longer fires on the production pair', () => {
    expect(
      numericTokenSequenceMismatch(transcriptTokens(SEG19_EXPECTED), transcriptTokens(SEG19_DETECTED))
    ).toBe(false)
  })

  it('a pure two↔too substitution passes on the token path with full coverage', () => {
    const detectedSpellingOnly = SEG19_EXPECTED.replace('running two under', 'running too under')
    const r = evaluateTranscriptQC(SEG19_EXPECTED, detectedSpellingOnly)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.normalizedFallbackUsed).toBe(false) // merit, not rescue
  })

  it('the truncated retry output still FAILS (genuine missing content)', () => {
    expect(evaluateTranscriptQC(SEG19_EXPECTED, SEG19_TRUNCATED).passed).toBe(false)
  })
})

describe('ATL-QC-FP-006: canonical fold shape', () => {
  it('both spellings tokenize to the identical canonical stream', () => {
    expect(transcriptTokens("running two under on one side")).toEqual(['running', '2', 'under', 'on', '1', 'side'])
    expect(transcriptTokens("running too under on one side")).toEqual(['running', '2', 'under', 'on', '1', 'side'])
  })

  it('fold is bidirectional: script "too" ↔ Whisper "two" (the mirror FP)', () => {
    const r = evaluateTranscriptQC('He wanted the house, and he wanted the garden too.',
                                   'He wanted the house and he wanted the garden two.')
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('punctuation variance around "too" stays symmetric ("Me too." ≡ "Me, too.")', () => {
    expect(transcriptTokens('Me too.')).toEqual(transcriptTokens('Me, too.'))
  })

  it('placement after the phrase parser: "too" never fuses with adjacent numbers', () => {
    // "five too many" must become "5 2 many" — NOT a joined "52".
    expect(transcriptTokens('I want five too many.')).toEqual(['i', 'want', '5', '2', 'many'])
    expect(transcriptTokens('I want five, too many.')).toEqual(['i', 'want', '5', '2', 'many'])
  })

  it('does NOT touch "to" — boundary-drop rescue depends on the literal token', () => {
    expect(transcriptTokens('went to the store')).toEqual(['went', 'to', 'the', 'store'])
    // Terminal "to" drop keeps passing via isSafeTerminalTailDrop (needs a
    // ≥21-token segment so coverage with one dropped token stays ≥ 0.95).
    const r = evaluateTranscriptQC(
      'She said the whole family could come down the hill in the morning and watch the boats when they wanted to',
      'She said the whole family could come down the hill in the morning and watch the boats when they wanted',
    )
    expect(r.passed).toBe(true)
    expect(r.safeTerminalTailDrop).toBe(true)
  })

  it('genuine number phrases are untouched ("twenty-two" → "22", "two hundred" ≡ "200")', () => {
    expect(transcriptTokens('twenty-two ships')).toEqual(['22', 'ships'])
    // "200" is clock-split to ["2","00"] by the pre-existing time rule — the
    // invariant that matters is that word and digit forms stay CANONICAL-EQUAL.
    expect(transcriptTokens('two hundred ships')).toEqual(transcriptTokens('200 ships'))
  })
})

describe('ATL-QC-FP-006: real defects still hard-fail', () => {
  it('wrong value ("two" vs "three") still fails the numeric veto', () => {
    const r = evaluateTranscriptQC(
      "the substrate's running two under on one side",
      "the substrate's running three under on one side",
    )
    expect(r.passed).toBe(false)
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens("the substrate's running two under on one side"),
        transcriptTokens("the substrate's running three under on one side"),
      )
    ).toBe(true)
  })

  it('dropped number ("two under" vs "under") still fails the numeric veto', () => {
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens("running two under on the left"),
        transcriptTokens("running under on the left"),
      )
    ).toBe(true)
  })

  it('"too" vs a different digit still fails ("too" vs "ten")', () => {
    expect(
      numericTokenSequenceMismatch(
        transcriptTokens('running too under'),
        transcriptTokens('running ten under'),
      )
    ).toBe(true)
  })
})

describe('ATL-QC-FP-006: homophone classes already covered elsewhere (locked)', () => {
  it("its ↔ it's converge via the possessive-strip step", () => {
    expect(transcriptTokens("it's")).toEqual(['its'])
    expect(transcriptTokens('its')).toEqual(['its'])
  })

  it("their ↔ there match via the ATL-PIPE-008/A8 fuzzy rule; they're tokenizes apart", () => {
    expect(transcriptTokenMatches('their', 'there')).toBe(true)
    // "they're" splits at the apostrophe → ['they','re']; 'they' fuzzy-matches
    // both 'their' and 'there' (distance ≤ 2, same first letter).
    expect(transcriptTokens("they're")).toEqual(['they', 're'])
    expect(transcriptTokenMatches('their', 'they')).toBe(true)
    expect(transcriptTokenMatches('there', 'they')).toBe(true)
    // …and therefore their/there intentionally does NOT need a HOMOPHONE_PAIRS entry.
    expect(knownHomophoneMatches('their', 'there')).toBe(false)
  })

  it('full-sentence their/there substitution passes', () => {
    const r = evaluateTranscriptQC(
      'They left their coats over there by the door.',
      'They left there coats over their by the door.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })
})
