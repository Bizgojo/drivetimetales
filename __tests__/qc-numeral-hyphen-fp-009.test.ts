/**
 * ATL-QC-FP-009 — regression lock for the numeral-hyphen compound false positive.
 *
 * Production incident (The Deep Archaeology, series 4120c04a, series_generate_voices,
 * 2026-08-21): the series failed 3 consecutive times with a QC false positive at
 * 95.8% similarity — just under the passing threshold — causing the dispatch
 * circuit breaker to fire and move all 3 in-queue episodes to repair_queue.
 *
 * Root cause: the script contains "two-million-dollar" (hyphenated compound
 * adjective — grammatically correct for pre-nominal modifiers in English).
 * ElevenLabs renders the phrase as natural speech: "two million dollar" (no
 * hyphens).  Whisper transcribes the audio faithfully: "two million dollar".
 *
 * The divergence:
 *   Expected pipeline ("two-million-dollar"):
 *     1. SPOKEN_NUMBER_PHRASE_RE matches "two" (a CARDINAL_NUMBER_WORD) → "2".
 *        "million" is NOT in CARDINAL_NUMBER_WORD_PATTERN, so the hyphen before
 *        it is NOT absorbed; we get "2-million-dollar".
 *     2. The digit+scale fold (`\b(\d{1,3})\s+(million|billion)\b`) requires a
 *        SPACE — but "2-million" has a hyphen.  The fold does NOT fire.
 *     3. The final strip (`[^a-z0-9\s]` → ' ') converts the hyphens to spaces:
 *        "2 million dollar" → tokens ["2", "million", "dollar"].
 *
 *   Detected pipeline ("two million dollar"):
 *     1. "two" → "2" (same as above).
 *     2. "2 million" now matches the digit+scale fold (SPACE present) → "2000000".
 *     3. normalizeCompoundNumbers step 6 strips "dollar" (space-separated) → "2000000".
 *     4. tokens: ["2000000"].
 *
 *   numericTokenSequence:
 *     expected → ["2"]   vs  detected → ["2000000"]
 *     numericTokenSequenceMismatch = TRUE → HARD VETO (blocks even at 95.8% similarity).
 *
 * Fix (ATL-QC-FP-009, lib/transcriptQC.ts, normalizeSpokenNumberPhrases):
 *   Two bridge steps added between SPOKEN_NUMBER_PHRASE_RE and the digit+scale fold:
 *
 *   Part 1 (before fold):
 *     .replace(/\b(\d{1,3})-(million|billion)\b/gi, '$1 $2')
 *     "2-million" → "2 million" so the existing fold fires → "2000000".
 *
 *   Part 2 (after fold, before "too" fold):
 *     .replace(/\b(\d+)-(dollars?|cents?)\b/gi, '$1 $2')
 *     "2000000-dollar" → "2000000 dollar" so normalizeCompoundNumbers step 6
 *     strips the currency unit word.
 *
 * Both sides now converge to ["2000000"] → numericTokenSequence ["2000000"] →
 * numericTokenSequenceMismatch = false → QC passes.
 *
 * Philosophy (consistent with QC-NUMNORM-002 / FP-002 / FP-003 / FP-004 / FP-006):
 *   normalize the surface-form variance away in the SHARED pipeline; never
 *   loosen a threshold or add a threshold exemption.  Genuine content differences
 *   ("two million" vs "three million") still hard-fail: different digits in the
 *   veto stream.
 */

import {
  transcriptTokens,
  normalizeSpokenNumberPhrases,
  numericTokenSequence,
  numericTokenSequenceMismatch,
  evaluateTranscriptQC,
} from '../lib/transcriptQC'

// ── Core unit tests ─────────────────────────────────────────────────────────

describe('ATL-QC-FP-009: normalizeSpokenNumberPhrases — numeral-hyphen bridges', () => {
  it('"two-million-dollar" normalizes to "2000000" (same as "two million dollar")', () => {
    // The bridge converts "2-million" → "2 million" so the scale fold fires,
    // then "2000000-dollar" → "2000000 dollar" so the currency strip fires.
    // Note: normalizeSpokenNumberPhrases alone does not strip "dollar";
    // that step lives in normalizeCompoundNumbers. Verify the scale fold at least.
    const result = normalizeSpokenNumberPhrases('two-million-dollar')
    // After bridge+fold: "2000000-dollar" — the dollar strip is downstream.
    // We test that the scale value folded correctly.
    expect(result).toMatch(/2000000/)
  })

  it('"two million dollar" normalizes the same way as "two-million-dollar"', () => {
    const hyphenated = normalizeSpokenNumberPhrases('two-million-dollar')
    const spaced = normalizeSpokenNumberPhrases('two million dollar')
    // Both should produce "2000000..." — the remaining "-dollar"/"dollar" is
    // handled identically downstream (the part-2 bridge converts the hyphen form).
    expect(hyphenated.replace(/-/g, ' ').trim()).toBe(spaced.replace(/-/g, ' ').trim())
  })

  it('"five-billion-dollar" bridge fires correctly', () => {
    const result = normalizeSpokenNumberPhrases('five-billion-dollar')
    expect(result).toMatch(/5000000000/)
  })
})

// ── Token-level convergence ──────────────────────────────────────────────────

describe('ATL-QC-FP-009: transcriptTokens — hyphenated vs spaced produce identical token streams', () => {
  it('"two-million-dollar" tokens === "two million dollar" tokens', () => {
    expect(transcriptTokens('two-million-dollar')).toEqual(transcriptTokens('two million dollar'))
  })

  it('"a two-million-dollar grant" tokens === "a two million dollar grant" tokens', () => {
    expect(transcriptTokens('a two-million-dollar grant')).toEqual(
      transcriptTokens('a two million dollar grant')
    )
  })

  it('"five-billion-dollar" tokens === "five billion dollar" tokens', () => {
    expect(transcriptTokens('five-billion-dollar')).toEqual(transcriptTokens('five billion dollar'))
  })

  it('tokens for the compound form resolve to the full numeric value', () => {
    // "two-million-dollar" should resolve to the single token "2000000"
    expect(transcriptTokens('two-million-dollar')).toEqual(['2000000'])
  })

  it('"a two-million-dollar grant" resolves to ["a", "2000000", "grant"]', () => {
    expect(transcriptTokens('a two-million-dollar grant')).toEqual(['a', '2000000', 'grant'])
  })

  it('"a two million dollar grant" resolves to ["a", "2000000", "grant"]', () => {
    expect(transcriptTokens('a two million dollar grant')).toEqual(['a', '2000000', 'grant'])
  })
})

// ── Numeric veto stream ──────────────────────────────────────────────────────

describe('ATL-QC-FP-009: numericTokenSequence — hyphenated and spaced forms agree', () => {
  it('numeric sequences match: "two-million-dollar" vs "two million dollar"', () => {
    const expToks = transcriptTokens('two-million-dollar')
    const detToks = transcriptTokens('two million dollar')
    expect(numericTokenSequenceMismatch(expToks, detToks)).toBe(false)
    expect(numericTokenSequence(expToks)).toEqual(numericTokenSequence(detToks))
  })

  it('numeric sequences match in sentence context', () => {
    const expToks = transcriptTokens('The agency secured a two-million-dollar grant for the project.')
    const detToks = transcriptTokens('The agency secured a two million dollar grant for the project.')
    expect(numericTokenSequenceMismatch(expToks, detToks)).toBe(false)
  })

  it('genuine value mismatch still hard-fails: "two-million" vs "three million"', () => {
    const expToks = transcriptTokens('two-million-dollar grant')
    const detToks = transcriptTokens('three million dollar grant')
    expect(numericTokenSequenceMismatch(expToks, detToks)).toBe(true)
  })
})

// ── End-to-end QC evaluation ─────────────────────────────────────────────────

describe('ATL-QC-FP-009: evaluateTranscriptQC — production-style segment pairs PASS', () => {
  it('single compound: "two-million-dollar" vs "two million dollar" PASSES', () => {
    const r = evaluateTranscriptQC('two-million-dollar', 'two million dollar')
    expect(r.passed).toBe(true)
    expect(r.normalizedFallbackUsed).toBe(false) // must pass on token merit, not rescue
  })

  it('sentence context: compound adjective before noun PASSES', () => {
    const expected = 'The agency secured a two-million-dollar grant for the excavation project.'
    const detected = 'The agency secured a two million dollar grant for the excavation project.'
    const r = evaluateTranscriptQC(expected, detected)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
    expect(r.tailMatches).toBe(true)
  })

  it('"five-billion-dollar" compound PASSES against "five billion dollar"', () => {
    const expected = 'It was a five-billion-dollar infrastructure deal.'
    const detected = 'It was a five billion dollar infrastructure deal.'
    const r = evaluateTranscriptQC(expected, detected)
    expect(r.passed).toBe(true)
  })

  it('production incident framing: Deep Archaeology series voice segment PASSES', () => {
    // Reconstructed from the failing 95.8% similarity incident.
    // The script spelled the amount as a compound adjective; Whisper reproduced
    // the spoken form with spaces.  The exact segment text is not preserved here
    // but the compound pattern is validated.
    const expected = 'The site had uncovered what could be a two-million-dollar find.'
    const detected = 'The site had uncovered what could be a two million dollar find.'
    const r = evaluateTranscriptQC(expected, detected)
    expect(r.passed).toBe(true)
    expect(r.coverage).toBeGreaterThanOrEqual(0.92)
  })
})

// ── Safety checks — existing normalization unharmed ──────────────────────────

describe('ATL-QC-FP-009 safety: existing rules are not disturbed', () => {
  it('forty-five still normalizes correctly (two-digit hyphenated number)', () => {
    expect(transcriptTokens('forty-five')).toEqual(['45'])
  })

  it('"1.5 million" (decimal scale) is not folded — lookbehind guard intact', () => {
    // The lookbehind /(?<![\d.,])/ on the million fold blocks decimal forms.
    // "1.5 million" should NOT fold to a single integer.
    const toks = transcriptTokens('1.5 million')
    expect(toks.join(' ')).not.toBe('1500000')
  })

  it('range expression "100-200" is NOT treated as a numeral compound', () => {
    // "100-200" has a 3-digit leading group; the part-1 bridge targets
    // digit-scale (million|billion) on the right — "200" is not a scale word,
    // so the range survives as-is into the final strip.
    const toks = transcriptTokens('between 100-200 artifacts')
    // Should NOT produce a collapsed "100200" token.
    const joined = toks.join(' ')
    expect(joined).not.toContain('100200')
  })

  it('"fire-loss" prose hyphen still collapses to two tokens (final strip)', () => {
    const toks = transcriptTokens('fire-loss')
    expect(toks).toEqual(['fire', 'loss'])
  })

  it('"too" → "2" homophone fold still fires (unchanged)', () => {
    const toks = transcriptTokens('running too under')
    expect(toks).toContain('2')
  })

  it('"two" → "2" canonical conversion still fires', () => {
    expect(transcriptTokens('two')).toEqual(['2'])
  })

  it('"a hundred" ↔ "100" equivalence (ATL-QC-FP-004) still works', () => {
    expect(transcriptTokens('a hundred times')).toEqual(transcriptTokens('100 times'))
  })
})
