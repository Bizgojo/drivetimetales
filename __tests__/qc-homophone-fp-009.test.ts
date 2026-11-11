/**
 * ATL-QC-FP-009 — "suite" ↔ "sweet" (Weekend Wife in Miami EP2, job 275b773b,
 * segment_0057, JESS MARLOWE, Nov 11 2026): expected "It's one suite.",
 * detected "It's one sweet." (83.3%). Same audio; Whisper picks the common word.
 */
import { evaluateTranscriptQC, knownHomophoneMatches } from '../lib/transcriptQC'

describe('ATL-QC-FP-009 suite/sweet', () => {
  it('the exact production line now passes', () => {
    expect(evaluateTranscriptQC("It's one suite.", "It's one sweet.").passed).toBe(true)
  })
  it('the pair is symmetric and covers the plural', () => {
    expect(knownHomophoneMatches('suite', 'sweet')).toBe(true)
    expect(knownHomophoneMatches('sweet', 'suite')).toBe(true)
    expect(knownHomophoneMatches('suites', 'sweets')).toBe(true)
  })
  it('a genuinely different word still fails', () => {
    expect(evaluateTranscriptQC("It's one suite.", "It's one street.").passed).toBe(false)
  })
})
