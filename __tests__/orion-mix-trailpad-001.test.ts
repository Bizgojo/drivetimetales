import fs from 'fs'
import path from 'path'

// ORION-MIX-TRAILPAD-001: minimum trailing-silence pad on voice segments in the
// final-mix step. Regression pins for the Mile Markers cut-off-dialogue defect
// (2026-07-15): hot-tail ElevenLabs segments (0–50ms trailing silence) butted
// directly against the next speaker read as cut-offs, while Whisper QC stays
// green because all words are present. The mix step must top up every voice
// segment to a minimum trailing-silence tail, and must NOT touch segments that
// already meet the minimum (preserves approved-catalog sound, e.g. Falls Park).

const CORE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'api', 'asc3', 'render-final-mix', 'core.ts'),
  'utf8'
)

describe('ORION-MIX-TRAILPAD-001: minimum trailing-silence pad at speaker turns', () => {
  it('defines a minimum trailing silence of 300ms', () => {
    expect(CORE).toMatch(/const MIN_TRAILING_SILENCE_SEC = 0\.3\b/)
  })

  it('measures trailing silence via reversed-audio silencedetect', () => {
    expect(CORE).toMatch(/areverse,silencedetect=noise=\$\{TRAILING_SILENCE_NOISE_FLOOR\}/)
    expect(CORE).toMatch(/async function getTrailingSilenceSec/)
  })

  it('pads only the deficit (conditional, never a blanket pad)', () => {
    expect(CORE).toMatch(/Math\.max\(0, MIN_TRAILING_SILENCE_SEC - trailingSilenceSec\)/)
    expect(CORE).toMatch(/if \(padDeficitSec > 0\.005\) reformatArgs\.push\('-af', `apad=pad_dur=\$\{padDeficitSec\.toFixed\(3\)\}`\)/)
  })

  it('treats measurement failure as a hot tail (pads — the safe direction)', () => {
    const helper = CORE.slice(CORE.indexOf('async function getTrailingSilenceSec'))
    const helperBody = helper.slice(0, helper.indexOf('\n}\n') + 3)
    expect(helperBody).toMatch(/return 0/)
  })

  it('applies the pad in the voice-segment reformat path (before body concat)', () => {
    const reformatIdx = CORE.indexOf('const trailingSilenceSec = await getTrailingSilenceSec(rawPath)')
    const concatIdx = CORE.indexOf('raw_concat.txt')
    expect(reformatIdx).toBeGreaterThan(-1)
    expect(concatIdx).toBeGreaterThan(reformatIdx)
  })
})
