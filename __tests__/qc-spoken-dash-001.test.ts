/**
 * QC-SPOKEN-DASH-001 — job 9d56b9a8 stopped at EP2 segment 19: the script line
 * "Four four seven dash zero zero one nine." was voiced correctly, Whisper
 * returned "447-0019.", and transcript QC failed at 66.7% similarity because
 * the spoken separator word "dash" survived as a token.
 */
import { transcriptTokens } from '@/lib/transcriptQC'

describe('QC-SPOKEN-DASH-001', () => {
  test('the failing line now tokenizes the same as Whisper\'s output', () => {
    expect(transcriptTokens('Four four seven dash zero zero one nine.')).toEqual(transcriptTokens('447-0019.'))
  })

  test('"hyphen" is treated the same way', () => {
    expect(transcriptTokens('Lane two hyphen four.')).toEqual(transcriptTokens('Lane 2-4.'))
  })

  test('"dash" in ordinary prose is kept', () => {
    expect(transcriptTokens('She made a dash for the car.')).toContain('dash')
    expect(transcriptTokens('Seven people dash across the bridge.')).toContain('dash')
  })
})
