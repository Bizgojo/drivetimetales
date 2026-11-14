import { evaluateTranscriptQC } from '@/lib/transcriptQC'

describe('QC-SPACING-001', () => {
  test('"Every one" heard as "everyone" passes', () => {
    expect(evaluateTranscriptQC('Back on the walls. Every one.', 'Back on the walls, everyone.').passed).toBe(true)
  })
  test('a real number change still fails', () => {
    // Short lines where the numeric veto decides (longer lines pass on similarity alone — ATL-NUMERAL-NORM-002).
    expect(evaluateTranscriptQC('Every one.', 'Every two.').passed).toBe(false)
    expect(evaluateTranscriptQC('Room two.', 'Room five.').passed).toBe(false)
  })
})
