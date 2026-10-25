/**
 * SEG57-TRANSCRIPT-FLAKE-001 — bounded extra candidates for transcript-only
 * failures on loudness-passing audio.
 *
 * Demonstrated: EP3 seg_0057, jobs d418b3f2 (detected "He said nothing.",
 * 45.2%) and 0823c072 (detected "You had nothing.", 38.1%). Varying
 * fragments across re-renders = transcription-side flake, not a bad render.
 *
 * These tests import the REAL production module (lib/transcriptQC).
 * Run: npx jest __tests__/seg57-transcript-flake.test.ts --no-coverage
 */
import {
  transcriptFlakeWarrantsExtraCandidate,
  TRANSCRIPT_FLAKE_EXTRA_CANDIDATES,
} from '../lib/transcriptQC'

const EXPECTED = 'He said nothing, which was its own kind of comment.'

describe('transcriptFlakeWarrantsExtraCandidate', () => {
  test('cap constant is 2', () => {
    expect(TRANSCRIPT_FLAKE_EXTRA_CANDIDATES).toBe(2)
  })
  test('clean-prefix flake (job d418b3f2 shape) warrants extra candidate', () => {
    expect(
      transcriptFlakeWarrantsExtraCandidate(
        { expectedText: EXPECTED, detectedText: 'He said nothing.', tailMatches: false },
        0,
      ),
    ).toBe(true)
  })
  test('cap respected: used=2 blocks', () => {
    expect(
      transcriptFlakeWarrantsExtraCandidate(
        { expectedText: EXPECTED, detectedText: 'He said nothing.', tailMatches: false },
        2,
      ),
    ).toBe(false)
  })
  test('non-prefix mismatch (job 0823c072 shape) NOT covered', () => {
    expect(
      transcriptFlakeWarrantsExtraCandidate(
        { expectedText: EXPECTED, detectedText: 'You had nothing.', tailMatches: false },
        0,
      ),
    ).toBe(false)
  })
  test('ambiguous outputs rejected', () => {
    for (const d of ['?', '??', '', '   ']) {
      expect(
        transcriptFlakeWarrantsExtraCandidate(
          { expectedText: EXPECTED, detectedText: d, tailMatches: false },
          0,
        ),
      ).toBe(false)
    }
  })
  test('tail-verified and null inputs rejected', () => {
    expect(
      transcriptFlakeWarrantsExtraCandidate(
        { expectedText: EXPECTED, detectedText: 'He said nothing.', tailMatches: true },
        0,
      ),
    ).toBe(false)
    expect(transcriptFlakeWarrantsExtraCandidate(null, 0)).toBe(false)
    expect(transcriptFlakeWarrantsExtraCandidate(undefined, 0)).toBe(false)
  })
  test('nothing missing (identical) rejected', () => {
    expect(
      transcriptFlakeWarrantsExtraCandidate(
        { expectedText: EXPECTED, detectedText: EXPECTED, tailMatches: true },
        0,
      ),
    ).toBe(false)
  })
})
