/**
 * ATL-QC-FP-007 — "Noa" ↔ "Noah" character-name homophone in the transcript-QC
 * comparator (Devi's Everling series, Story e93268f4, segment_0110).
 *
 * Production failure summary:
 *   Character name "Noa" (Devi's Everling, Eps 6–26) is transcribed by Whisper
 *   as "Noah" on isolated-name segments — 98.0–98.3% similarity, just under
 *   threshold.  Two script-side workaround attempts confirmed this is a
 *   QC-layer defect, not a content issue.  The name appears throughout the
 *   series canon and will recur on every segment containing an isolated "Noa".
 *
 * Root cause:
 *   "Noa" and "Noah" are acoustic homophones in English.  Whisper's language
 *   model preferentially chooses the far more common spelling "Noah".  There is
 *   no script phrasing that changes the spoken sound, so the fix must live in
 *   the QC comparator.
 *
 * Fix (ATL-QC-FP-007):
 *   Added to HOMOPHONE_PAIRS:
 *     ['noa', 'noah']   — bare token form
 *     ['noas', 'noahs'] — possessive form ("Noa's" → "noas" via possessive-strip)
 *
 *   Mirrors the existing ['noras', 'norris'] / ['noras', 'norahs'] precedent.
 */

import {
  evaluateTranscriptQC,
  transcriptTokens,
  knownHomophoneMatches,
  transcriptTokenMatches,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

// ── Token-level pair checks ───────────────────────────────────────────────────

describe('ATL-QC-FP-007: HOMOPHONE_PAIRS entries', () => {
  it('bare name: knownHomophoneMatches("noa", "noah") is true', () => {
    expect(knownHomophoneMatches('noa', 'noah')).toBe(true)
  })

  it('bare name: bidirectional — knownHomophoneMatches("noah", "noa") is true', () => {
    expect(knownHomophoneMatches('noah', 'noa')).toBe(true)
  })

  it('possessive form: knownHomophoneMatches("noas", "noahs") is true', () => {
    expect(knownHomophoneMatches('noas', 'noahs')).toBe(true)
  })

  it('possessive form: bidirectional — knownHomophoneMatches("noahs", "noas") is true', () => {
    expect(knownHomophoneMatches('noahs', 'noas')).toBe(true)
  })

  it('transcriptTokenMatches uses the homophone pair (bare)', () => {
    expect(transcriptTokenMatches('noa', 'noah')).toBe(true)
  })

  it('transcriptTokenMatches uses the homophone pair (possessive)', () => {
    expect(transcriptTokenMatches('noas', 'noahs')).toBe(true)
  })
})

// ── Tokenisation shape ────────────────────────────────────────────────────────

describe('ATL-QC-FP-007: tokenisation of "Noa" and "Noah"', () => {
  it('"Noa" tokenises to ["noa"]', () => {
    expect(transcriptTokens('Noa')).toEqual(['noa'])
  })

  it('"Noah" tokenises to ["noah"]', () => {
    expect(transcriptTokens('Noah')).toEqual(['noah'])
  })

  it('"Noa\'s" tokenises to ["noas"] (possessive-strip)', () => {
    expect(transcriptTokens("Noa's")).toEqual(['noas'])
  })

  it('"Noah\'s" tokenises to ["noahs"] (possessive-strip)', () => {
    expect(transcriptTokens("Noah's")).toEqual(['noahs'])
  })

  it('no numeric tokens injected by either form', () => {
    expect(numericTokenSequenceMismatch(transcriptTokens('Noa'), transcriptTokens('Noah'))).toBe(false)
    expect(numericTokenSequenceMismatch(transcriptTokens("Noa's"), transcriptTokens("Noah's"))).toBe(false)
  })
})

// ── Segment-level QC decisions ────────────────────────────────────────────────

describe('ATL-QC-FP-007: full evaluateTranscriptQC passes', () => {
  it('short action line with bare name', () => {
    const r = evaluateTranscriptQC(
      'Noa turned and walked toward the door.',
      'Noah turned and walked toward the door.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('longer segment: name mid-sentence', () => {
    const r = evaluateTranscriptQC(
      'She could see Noa waiting by the truck, watching the road, her expression unreadable.',
      'She could see Noah waiting by the truck, watching the road, her expression unreadable.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('possessive form: "Noa\'s voice"', () => {
    const r = evaluateTranscriptQC(
      "It was Noa's voice she heard first.",
      "It was Noah's voice she heard first.",
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('name appears twice in segment', () => {
    const r = evaluateTranscriptQC(
      'Noa stopped. She looked back at Noa standing in the corridor.',
      'Noah stopped. She looked back at Noah standing in the corridor.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('isolated single-word segment (character name callout)', () => {
    const r = evaluateTranscriptQC('Noa.', 'Noah.')
    expect(r.passed).toBe(true)
  })

  it('coverage is full — not a normalised-fallback rescue', () => {
    // The fix should make the token path pass, not rely on the ≥0.85 fallback.
    const r = evaluateTranscriptQC(
      'Noa crossed the threshold and closed the door behind her.',
      'Noah crossed the threshold and closed the door behind her.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.normalizedFallbackUsed).toBe(false)
  })
})

// ── Real defects still fail ───────────────────────────────────────────────────

describe('ATL-QC-FP-007: genuine content differences still hard-fail', () => {
  it('heavily wrong detected text fails (low similarity + coverage)', () => {
    // Normalized similarity falls well below 0.85 when the detected content
    // is substantially different from the expected text.
    const r = evaluateTranscriptQC(
      'Noa turned and walked toward the door.',
      'The vehicle slowed to a halt on the interstate.',
    )
    expect(r.passed).toBe(false)
  })

  it('missing whole sentence fails', () => {
    const r = evaluateTranscriptQC(
      'Noa turned and walked toward the door. She did not look back.',
      'Noah turned and walked toward the door.',
    )
    expect(r.passed).toBe(false)
  })

  it('"noa" does NOT homophone-match unrelated names like "moa" or "boa"', () => {
    expect(knownHomophoneMatches('noa', 'moa')).toBe(false)
    expect(knownHomophoneMatches('noa', 'boa')).toBe(false)
  })
})
