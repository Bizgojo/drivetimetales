/**
 * QC-NUMNORM-002 — production regression lock for Consciousness Protocol ep2 seg50.
 *
 * Incident: 2026-07-11T13:52Z (and 2026-07-10T16:31–16:39Z) production_jobs failed
 * step=series_generate_voices, storyId=06745c1b-0024-45b9-8f89-3c8f6cdd403d,
 * segment_0050.mp3 with:
 *   [REPEATED_IDENTICAL_TRUNCATION]: Whisper returned the same partial output
 *   "4.7 seconds." across all 8 retry candidates ... expected "Four-point-seven seconds."
 *
 * Root cause was NOT a code gap: the fix from 3f612fb4/fb1a16e2 lives in
 * lib/transcriptQC.ts#evaluateTranscriptQC, which IS the exact function used in the
 * failing path (app/api/admin/generate-voices/route.ts → validateSegmentTranscript).
 * The failing production runs executed on a STALE Vercel production deployment that
 * predated the merge (deploys are manual, merge ≠ deploy).
 *
 * This suite pins the byte-exact strings recovered from production error_json
 * (job 9fc44a1c-dea8-45dc-8bd6-fdc48e0e8157, verified plain ASCII, U+002D hyphens)
 * through the exact production decision function, so any future regression in this
 * path fails CI rather than burning 8 ElevenLabs retry candidates per attempt.
 */

import { evaluateTranscriptQC, transcriptTokens } from '@/lib/transcriptQC'

// Byte-exact strings from production error_json (verified codepoints: plain ASCII).
const PROD_EXPECTED = 'Four-point-seven seconds.'
const PROD_DETECTED = '4.7 seconds.'

describe('QC-NUMNORM-002: ep2 seg50 production pair through the exact failing-path function', () => {
  it('evaluateTranscriptQC passes the byte-exact production pair', () => {
    const r = evaluateTranscriptQC(PROD_EXPECTED, PROD_DETECTED)
    expect(r.passed).toBe(true)
  })

  it('tokenizes both sides to the identical sequence', () => {
    expect(transcriptTokens(PROD_EXPECTED)).toEqual(transcriptTokens(PROD_DETECTED))
    expect(transcriptTokens(PROD_EXPECTED)).toEqual(['4', '7', 'seconds'])
  })

  it('passes Whisper punctuation/case variants of the detected text', () => {
    for (const detected of ['4.7 seconds', '4.7 Seconds.', ' 4.7 seconds. ']) {
      const r = evaluateTranscriptQC(PROD_EXPECTED, detected)
      expect(r.passed).toBe(true)
    }
  })

  it('passes the space-separated spoken form too ("Four point seven seconds.")', () => {
    const r = evaluateTranscriptQC('Four point seven seconds.', PROD_DETECTED)
    expect(r.passed).toBe(true)
  })

  it('negative control: genuinely different decimals still hard-fail', () => {
    expect(evaluateTranscriptQC(PROD_EXPECTED, '5.7 seconds.').passed).toBe(false)
    expect(evaluateTranscriptQC(PROD_EXPECTED, '4.2 seconds.').passed).toBe(false)
  })
})
