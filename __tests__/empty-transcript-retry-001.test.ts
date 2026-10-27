import { readFileSync } from 'fs'
import { join } from 'path'
import { isEmptyTranscriptFailure } from '@/lib/emptyTranscriptRetry'

// Error text copied from proof job 9d56b9a8 (EP2 segment 38).
const empty = 'Error: Segment transcript QC failed for segment_0038.mp3 [REPEATED_IDENTICAL_TRUNCATION]: Whisper returned the same partial output "" across all 2 retry candidates. Retrying will not help.'
const partial = 'Error: Segment transcript QC failed for segment_0044.mp3 [REPEATED_IDENTICAL_TRUNCATION]: Whisper returned the same partial output "in this weather." across all 2 retry candidates.'

describe('EMPTY-TRANSCRIPT-RETRY-001', () => {
  test('empty transcript on every candidate is retried; a real partial (VAD) truncation is not', () => {
    expect(isEmptyTranscriptFailure(empty)).toBe(true)
    expect(isEmptyTranscriptFailure(partial)).toBe(false)
    expect(isEmptyTranscriptFailure('Error: ElevenLabs error 500')).toBe(false)
  })

  test('targeted (series) voice path makes exactly one extra attempt, only for that case', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    const block = src.slice(src.indexOf('EMPTY-TRANSCRIPT-RETRY-001 (proof job'), src.indexOf('generatedSegments.push({ index: targetLine.index, speaker: targetLine.speaker, type: targetLine.type, url })'))
    expect(block).toMatch(/if \(!isEmptyTranscriptFailure\(String\(firstErr\)\)\) throw firstErr/)
    expect((block.match(/await generateVoiceLine\(/g) || []).length).toBe(2)
  })
})

import { durationGateTranscriptConfirms } from '@/lib/emptyTranscriptRetry'
import { isAudioTooShortForText } from '@/lib/speechDuration'

describe('DURATION-GATE-CONFIRM-001', () => {
  const line = "He said it the way you say something to a person you're not sure is going to listen."

  test('the seg 38 reads (4.13-4.44 s, from the EC2 log) all trip the gate', () => {
    for (const s of [4.13, 4.26, 4.31, 4.44]) expect(isAudioTooShortForText(s, line)).toBe(true)
  })

  test('override only on a strong full transcript match with Whisper actually run', () => {
    expect(durationGateTranscriptConfirms({ passed: true, coverage: 1, similarity: 0.97 })).toBe(true)
    expect(durationGateTranscriptConfirms({ passed: true, coverage: 0.6, similarity: 0.95 })).toBe(false) // cut-off read
    expect(durationGateTranscriptConfirms({ passed: true, coverage: 1, similarity: 0.8 })).toBe(false)
    expect(durationGateTranscriptConfirms({ passed: false, coverage: 1, similarity: 1 })).toBe(false)
    expect(durationGateTranscriptConfirms({ passed: true, qcSkipped: true, coverage: 1, similarity: 1 })).toBe(false)
    expect(durationGateTranscriptConfirms(null)).toBe(false)
  })

  test('gate rejection still runs when the transcript does not confirm', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toContain('if (!durationGateConfirmedByTranscript && isAudioTooShortForText(candidateDuration, text)) {')
    expect(src).toContain('durationGateConfirmedByTranscript = durationGateTranscriptConfirms(confirm)')
  })
})
