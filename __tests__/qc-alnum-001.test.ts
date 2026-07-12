// ORION-QC-ALNUM-001 (2026-07-12): hyphenated alphanumeric designators.
//
// Production failure (Consciousness Protocol ep2 seg64, jobs a4d731fa/282a0d10,
// 2026-07-12 14:28-14:30Z): expected "James opened OD-7.", Whisper detected
// "James opened OD7." — similarity 100.0%, coverage 1.0, BOTH QC paths passed,
// yet the segment hard-failed because numericTokenSequence saw ["7"] vs []
// (script side tokenizes OD-7 → ["od","7"]; Whisper fuses to "od7").
// Fix: extract embedded digit runs from every token so fusion is symmetric.

import { evaluateTranscriptQC, numericTokenSequence, numericTokenSequenceMismatch, transcriptTokens } from '@/lib/transcriptQC'

describe('ORION-QC-ALNUM-001: fused alphanumeric numeric-veto false positive', () => {
  test('exact prod pair passes: OD-7 vs OD7 (seg64)', () => {
    const r = evaluateTranscriptQC('James opened OD-7.', 'James opened OD7.')
    expect(r.passed).toBe(true)
  })

  test('reverse direction passes too: OD7 vs OD-7', () => {
    const r = evaluateTranscriptQC('James opened OD7.', 'James opened OD-7.')
    expect(r.passed).toBe(true)
  })

  test('genuine digit change still vetoed: OD-7 vs OD-8', () => {
    const r = evaluateTranscriptQC('James opened OD-7.', 'James opened OD-8.')
    expect(r.passed).toBe(false)
  })

  test('genuine numeric change still vetoed: 340 vs 34', () => {
    const r = evaluateTranscriptQC('It cost 340 dollars.', 'It cost 34 dollars.')
    expect(r.passed).toBe(false)
  })

  test('numericTokenSequence extracts embedded digit runs symmetrically', () => {
    expect(numericTokenSequence(transcriptTokens('James opened OD-7.'))).toEqual(['7'])
    expect(numericTokenSequence(transcriptTokens('James opened OD7.'))).toEqual(['7'])
    expect(
      numericTokenSequenceMismatch(transcriptTokens('OD-7 clearance'), transcriptTokens('OD7 clearance'))
    ).toBe(false)
  })

  test('seg50 class unaffected: spelled decimal vs digits still passes', () => {
    const r = evaluateTranscriptQC('Four-point-seven seconds.', '4.7 seconds.')
    expect(r.passed).toBe(true)
  })
})
