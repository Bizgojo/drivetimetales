import { evaluateTranscriptQC, oneWordCastNameLine } from '@/lib/transcriptQC'
describe('QC-ONE-WORD-NAME-001', () => {
  const cast = ['nora', 'gabriel', 'nell', 'maeve']
  test('a lone cast name passes when Whisper heard one short word', () => {
    expect(evaluateTranscriptQC('Nell.', 'Now.', { castNames: cast }).passed).toBe(true)
    expect(evaluateTranscriptQC('Nell.', 'Meow.', { castNames: cast }).passed).toBe(true)
  })
  test('silence still fails; non-names and longer lines are unchanged', () => {
    expect(evaluateTranscriptQC('Nell.', '', { castNames: cast }).passed).toBe(false)
    expect(oneWordCastNameLine('Yes.', 'No.', cast)).toBe(false)
    expect(oneWordCastNameLine('Nell, wait.', 'Now wait.', cast)).toBe(false)
    expect(evaluateTranscriptQC('Nell.', 'Now.').passed).toBe(false)
  })
})
