import { evaluateTranscriptQC } from '@/lib/transcriptQC'

describe('QC-TO-TOO-001', () => {
  test('the Second Rise EP3 segment_0058 line passes', () => {
    expect(evaluateTranscriptQC('I have batter to —', 'I have batter, too.').passed).toBe(true)
  })
  test('real number changes still fail', () => {
    expect(evaluateTranscriptQC('She paid two hundred dollars for it.', 'She paid three hundred dollars for it.').passed).toBe(false)
    expect(evaluateTranscriptQC('We have two days left.', 'We have five days left.').passed).toBe(false)
  })
})
