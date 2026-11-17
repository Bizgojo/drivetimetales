/**
 * PLAYER-CLOCK-001 (Marc, Nov 17 2026 — Second Rise EP2, session 2:56-3:11 PM ET):
 * audio ran about 15 minutes but position stayed at 203s, there was no end and
 * no advance.
 *
 * Root cause: the ORION-PLAYER-STALL-001 watchdog samples audio.currentTime every
 * 2s. On iOS locked/backgrounded the page is suspended — audio keeps playing but
 * timers throttle and clock reads stall. The watchdog interpreted that as a stall,
 * seeked BACKWARD to the last sample, and after 2 attempts paused the element. So
 * the episode never reached its end and never advanced.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

describe('PLAYER-CLOCK-001: watchdog must not fight a suspended page', () => {
  test('watchdog is gated on page visibility', () => {
    const idx = src.indexOf("document.visibilityState !== 'visible'")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 600)
    expect(block).toMatch(/document\.visibilityState !== 'visible'/)
    expect(block).toMatch(/stallSampleRef\.current = null/)
  })

  test('a healthy, non-seeking element is never treated as stalled', () => {
    const idx = src.indexOf('const looksHealthy')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 900)
    expect(block).toMatch(/!audio\.seeking/)
    expect(block).toMatch(/audio\.readyState >= 3/)
    // Re-basing must not silently drop Buffering UI for a long freeze.
    expect(block).toMatch(/frozenMs >= 4000\) setIsBuffering\(true\)/)
    expect(block).toMatch(/return/)
  })

  test('returning to the foreground re-reads the real audio position', () => {
    const idx = src.indexOf('after a suspension the UI clock may have stopped')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 700)
    expect(block).toMatch(/audio\.currentTime/)
    expect(block).toMatch(/setCurrentTime\(real\)/)
  })

  test('the original stall recovery still exists (not disabled outright)', () => {
    expect(src).toMatch(/recoverFromStall/)
    expect(src).toMatch(/stallRecoveryCountRef\.current < 2/)
  })
})
