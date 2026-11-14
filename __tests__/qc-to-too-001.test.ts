import { evaluateTranscriptQC } from '@/lib/transcriptQC'

describe('QC-TO-TOO-001', () => {
  test('the Second Rise EP3 segment_0058 line passes', () => {
    expect(evaluateTranscriptQC('I have batter to —', 'I have batter, too.').passed).toBe(true)
  })
  test('real number changes still fail', () => {
    // Fixed Nov 14: the old cases are long enough to pass on similarity alone (ATL-NUMERAL-NORM-002,
    // older than this fix), so they never tested the veto. These short lines do.
    expect(evaluateTranscriptQC('Room two.', 'Room five.').passed).toBe(false)
    expect(evaluateTranscriptQC('Seven days.', 'Eleven days.').passed).toBe(false)
  })
})
