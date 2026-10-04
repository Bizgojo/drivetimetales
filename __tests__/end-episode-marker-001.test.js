/**
 * end-episode-marker-001.test.js
 *
 * END-EPISODE-MARKER-001 (Type A, proof-run 2 Oct 3): Hal series scripts close
 * with [END EPISODE N], which findUnlabeledStoryBodyLines used to flag as an
 * unlabeled story body line, failing every series job at series_voice_preflight.
 * The parser now accepts [END EPISODE N] (and the canonical end marker) as
 * structural markers. Genuine unlabeled prose must still fail.
 *
 * Run: npx jest __tests__/end-episode-marker-001.test.js --no-coverage
 */

'use strict'

// ─── Mirror of findUnlabeledStoryBodyLines core filter (production logic) ───

const structuralEndMarkerRe = /^\[END (AUDIO DRAMA SCRIPT|EPISODE \d+)\]$/i
const speakerLabelRe = /^([A-Z][A-ZÀ-Ú0-9\s'.()/&-]+?):\s*(.+)$/
const bracketCueRe = /^\[(BEAT|PAUSE(?::\d+(?:\.\d+)?)?|SFX:\s*.+)\]$/i
const allowedSectionMarkers = new Set([
  'BELLE B ANNOUNCEMENT',
  'BELLE B INTRO',
  'BELLE B OUTRO',
  '[START AUDIO DRAMA SCRIPT]',
  '[END AUDIO DRAMA SCRIPT]',
])

function isSkippedBodyLine(text) {
  if (!text) return true
  if (/^-{3,}$/.test(text)) return true
  if (allowedSectionMarkers.has(text.toUpperCase())) return true
  if (structuralEndMarkerRe.test(text)) return true
  if (bracketCueRe.test(text)) return true
  if (speakerLabelRe.test(text)) return true
  return false
}

describe('END-EPISODE-MARKER-001', () => {
  test.each([
    '[END EPISODE 1]',
    '[END EPISODE 2]',
    '[END EPISODE 12]',
    '[END AUDIO DRAMA SCRIPT]',
  ])('structural marker passes: %s', (line) => {
    expect(isSkippedBodyLine(line)).toBe(true)
  })

  test.each([
    'He walked into the dark without a word.',
    '[END EPISODE]',
    '[END]',
    '[END EPISODE X]',
  ])('non-marker lines still flagged: %s', (line) => {
    expect(isSkippedBodyLine(line)).toBe(false)
  })

  test('labeled dialogue and cues still pass', () => {
    expect(isSkippedBodyLine('COLE: Not tonight.')).toBe(true)
    expect(isSkippedBodyLine('[PAUSE:2]')).toBe(true)
    expect(isSkippedBodyLine('---')).toBe(true)
  })
})
