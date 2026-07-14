/**
 * ORION-PLAYER-SEEK-001 (Marc walk addendum, 2026-07-14): resume seek and the
 * drag-to-seek bar both gate on ASC3 segment duration probes. The old probes
 * had no timeout — one hung metadata fetch (Firefox private repro) left
 * Promise.all pending forever: dead seek bar, dead resume, playable only from
 * 0:00. Pins the hardened probe design.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

describe('ORION-PLAYER-SEEK-001: duration probe hardening', () => {
  test('every probe settles within a timeout (no forever-pending Promise.all)', () => {
    expect(src).toMatch(/PROBE_TIMEOUT_MS = 4000/)
    expect(src).toMatch(/duration probe timeout/)
  })

  test('zero-duration probes get exactly one retry', () => {
    expect(src).toMatch(/if \(d <= 0 && !cancelled\) d = await probeSegmentDuration\(segment\.url\) \/\/ one retry/)
  })

  test('partial probe results still produce a usable total (seek not all-or-nothing)', () => {
    expect(src).toMatch(/duration probes incomplete — seeking uses partial totals/)
  })

  test('late-arriving durations never yank position from a listener already playing', () => {
    expect(src).toMatch(/if \(isPlaying\) \{ resumeRef\.current = 0; return \}/)
  })

  test('probe cleanup releases the media element (src cleared, handlers nulled)', () => {
    expect(src).toMatch(/probe\.onloadedmetadata = null/)
    expect(src).toMatch(/try \{ probe\.src = '' \} catch \(_\) \{\}/)
  })
})
