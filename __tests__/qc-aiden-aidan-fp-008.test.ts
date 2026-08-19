/**
 * ATL-QC-FP-008 — "Aiden" ↔ "Aidan" character-name homophone in the transcript-QC
 * comparator (Sunset of Competition series, Story f5c26bcd, segment_0120).
 *
 * Production failure summary:
 *   Character name "Aiden" (primary character, Eps 6–26) is transcribed by
 *   Whisper as "Aidan" on isolated-name segments — 98.4% similarity, just
 *   under threshold. Audio homophone, not a content issue. The name appears
 *   throughout the series canon and will recur on every segment containing
 *   an isolated "Aiden".
 *
 * Root cause:
 *   "Aiden" and "Aidan" are acoustic homophones in English. Whisper's language
 *   model preferentially chooses the more common spelling "Aidan". There is
 *   no script phrasing that changes the spoken sound, so the fix must live in
 *   the QC comparator.
 *
 * Fix (ATL-QC-FP-008):
 *   Added to HOMOPHONE_PAIRS:
 *     ['aiden', 'aidan']   — bare token form
 *     ['aidens', 'aidans'] — possessive form ("Aiden's" → "aidens" via possessive-strip)
 *
 *   Mirrors the ATL-QC-FP-007 ['noa','noah']/['noas','noahs'] precedent.
 */

import {
  evaluateTranscriptQC,
  transcriptTokens,
  knownHomophoneMatches,
  transcriptTokenMatches,
  numericTokenSequenceMismatch,
} from '../lib/transcriptQC'

describe('ATL-QC-FP-008: HOMOPHONE_PAIRS entries', () => {
  it('bare name: knownHomophoneMatches("aiden", "aidan") is true', () => {
    expect(knownHomophoneMatches('aiden', 'aidan')).toBe(true)
  })

  it('bare name: bidirectional — knownHomophoneMatches("aidan", "aiden") is true', () => {
    expect(knownHomophoneMatches('aidan', 'aiden')).toBe(true)
  })

  it('possessive form: knownHomophoneMatches("aidens", "aidans") is true', () => {
    expect(knownHomophoneMatches('aidens', 'aidans')).toBe(true)
  })

  it('possessive form: bidirectional — knownHomophoneMatches("aidans", "aidens") is true', () => {
    expect(knownHomophoneMatches('aidans', 'aidens')).toBe(true)
  })

  it('transcriptTokenMatches uses the homophone pair (bare)', () => {
    expect(transcriptTokenMatches('aiden', 'aidan')).toBe(true)
  })

  it('transcriptTokenMatches uses the homophone pair (possessive)', () => {
    expect(transcriptTokenMatches('aidens', 'aidans')).toBe(true)
  })
})

describe('ATL-QC-FP-008: tokenisation of "Aiden" and "Aidan"', () => {
  it('"Aiden" tokenises to ["aiden"]', () => {
    expect(transcriptTokens('Aiden')).toEqual(['aiden'])
  })

  it('"Aidan" tokenises to ["aidan"]', () => {
    expect(transcriptTokens('Aidan')).toEqual(['aidan'])
  })

  it('"Aiden\'s" tokenises to ["aidens"] (possessive-strip)', () => {
    expect(transcriptTokens("Aiden's")).toEqual(['aidens'])
  })

  it('"Aidan\'s" tokenises to ["aidans"] (possessive-strip)', () => {
    expect(transcriptTokens("Aidan's")).toEqual(['aidans'])
  })

  it('no numeric tokens injected by either form', () => {
    expect(numericTokenSequenceMismatch(transcriptTokens('Aiden'), transcriptTokens('Aidan'))).toBe(false)
    expect(numericTokenSequenceMismatch(transcriptTokens("Aiden's"), transcriptTokens("Aidan's"))).toBe(false)
  })
})

describe('ATL-QC-FP-008: full evaluateTranscriptQC passes', () => {
  it('short action line with bare name', () => {
    const r = evaluateTranscriptQC(
      'Aiden turned and walked toward the door.',
      'Aidan turned and walked toward the door.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('longer segment: name mid-sentence, matches the real production failure shape', () => {
    const r = evaluateTranscriptQC(
      'Tom had sat in that courtroom and watched the whole world rise to claim his son. The whole world, in love with Aiden.',
      'Tom had sat in that courtroom and watched the whole world rise to claim his son. The whole world in love with Aidan.',
    )
    expect(r.passed).toBe(true)
  })

  it('possessive form: "Aiden\'s voice"', () => {
    const r = evaluateTranscriptQC(
      "It was Aiden's voice she heard first.",
      "It was Aidan's voice she heard first.",
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('name appears twice in segment', () => {
    const r = evaluateTranscriptQC(
      'Aiden stopped. She looked back at Aiden standing in the corridor.',
      'Aidan stopped. She looked back at Aidan standing in the corridor.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
  })

  it('isolated single-word segment (character name callout)', () => {
    const r = evaluateTranscriptQC('Aiden.', 'Aidan.')
    expect(r.passed).toBe(true)
  })

  it('coverage is full — not a normalised-fallback rescue', () => {
    const r = evaluateTranscriptQC(
      'Aiden crossed the threshold and closed the door behind her.',
      'Aidan crossed the threshold and closed the door behind her.',
    )
    expect(r.passed).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.normalizedFallbackUsed).toBe(false)
  })
})

describe('ATL-QC-FP-008: genuine content differences still hard-fail', () => {
  it('heavily wrong detected text fails (low similarity + coverage)', () => {
    const r = evaluateTranscriptQC(
      'Aiden turned and walked toward the door.',
      'The vehicle slowed to a halt on the interstate.',
    )
    expect(r.passed).toBe(false)
  })

  it('missing whole sentence fails', () => {
    const r = evaluateTranscriptQC(
      'Aiden turned and walked toward the door. He did not look back.',
      'Aidan turned and walked toward the door.',
    )
    expect(r.passed).toBe(false)
  })

  it('"aiden" does NOT homophone-match unrelated names like "aidan\'s" wildcard neighbors', () => {
    expect(knownHomophoneMatches('aiden', 'aiken')).toBe(false)
    expect(knownHomophoneMatches('aiden', 'aid')).toBe(false)
  })
})
