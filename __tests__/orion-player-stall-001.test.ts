/**
 * ORION-PLAYER-STALL-001 (Marc walk bug, 2026-07-14): a stalled audio stream
 * must never be indistinguishable from playback. Pins the watchdog wiring in
 * CanonicalPlayer source: stall sampling, buffering UI state, recovery with
 * cache-busted reload, and the explicit stall card after retries.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

// STALL-TEST-DRIFT-001: the buffering button label no longer lives in
// CanonicalPlayer — it moved to PlayerTransport when the transport was split out.
// The behaviour the test protects is unchanged, so the source just moved with it.
const transportSrc = fs.readFileSync(
  path.join(process.cwd(), 'components/player/PlayerTransport.tsx'),
  'utf8'
)

describe('ORION-PLAYER-STALL-001: stall watchdog', () => {
  test('watchdog samples currentTime while playing (2s interval)', () => {
    expect(src).toMatch(/stallSampleRef/)
    expect(src).toMatch(/window\.setInterval\(/)
  })

  test('buffering state wired to waiting/stalled/playing events AND button label', () => {
    expect(src).toMatch(/onWaiting=\{\(\) => setIsBuffering\(true\)\}/)
    expect(src).toMatch(/onStalled=\{\(\) => setIsBuffering\(true\)\}/)
    // onPlaying clears buffering, but now only once its guards pass (the audio
    // element for THIS story has actually loaded) — the guard came later than
    // the original assertion, and is the safer behaviour.
    expect(src).toMatch(/onPlaying=\{\(\) => \{/)
    expect(src).toMatch(/setIsBuffering\(false\)/)
    // Label moved to the transport component; assert it where it now lives.
    expect(transportSrc).toMatch(/isBuffering && isPlaying \? 'Buffering…' : '⏸ Pause'/)
  })

  test('recovery reloads the SAME src cache-busted at the SAME position (max 2 attempts)', () => {
    expect(src).toMatch(/recoverFromStall/)
    expect(src).toMatch(/stallRecoveryCountRef\.current < 2/)
    expect(src).toMatch(/bustAudioUrl\(src\.replace\(/)
    expect(src).toMatch(/audio\.currentTime = pos/)
  })

  test('unrecovered stall surfaces an explicit error card instead of silent playing UI', () => {
    expect(src).toMatch(/Audio stalled — check your connection and try again\./)
  })

  test('natural advancement resets the recovery budget (no false positives on slow nets)', () => {
    expect(src).toMatch(/Math\.abs\(t - sample\.t\) > 0\.25/)
    expect(src).toMatch(/if \(stallRecoveryCountRef\.current\) stallRecoveryCountRef\.current = 0/)
  })
})
