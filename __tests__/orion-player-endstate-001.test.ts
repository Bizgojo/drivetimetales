/** Completed-player UX. Pause cancellation was superseded by Marc's
 * permanent series-continuation rule (2026-11-05). */
import fs from 'fs'
import path from 'path'

const PLAYER = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'player', 'CanonicalPlayer.tsx'),
  'utf8'
)

describe('ORION-PLAYER-ENDSTATE-001: completed end-state', () => {
  test('trusted natural end sets playbackEnded on every completion path (final-mix + ASC3 queue)', () => {
    // Single-file path (onEnded, after the spurious-ended guards)
    expect(PLAYER).toMatch(/setIsPlaying\(false\); setPlaybackEnded\(true\); saveProgress\(duration, true\)/)
    // ASC3 queue terminal branches (natural_ended + error_skip completion)
    const asc3Matches = PLAYER.match(/setIsPlaying\(false\); setPlaybackEnded\(true\); saveProgress\(completedSeconds, true\)/g) || []
    expect(asc3Matches.length).toBe(2)
  })

  test('Start Over / Play Again on the transport restarts from 0 (never resume-from-end)', () => {
    const restartIdx = PLAYER.indexOf('const restartFromBeginning')
    expect(restartIdx).toBeGreaterThan(-1)
    const restartBlock = PLAYER.slice(restartIdx, PLAYER.indexOf('const handlePlayPause'))
    expect(restartBlock).toMatch(/a\.currentTime = 0/)          // final-mix restart position
    expect(restartBlock).toMatch(/resumeRef\.current = 0/)      // stale resume intent cleared
    expect(restartBlock).toMatch(/setPlaybackEnded\(false\)/)
  })

  test('CTA label: at-end state renders Play Again, never Continue at 0.0 min left', () => {
    expect(PLAYER).toMatch(
      /isAtNaturalEnd\(\) \? '▶ Play Again' : hasProgress \? '▶ Continue' : '▶ Play'/
    )
    // The at-end predicate covers both the trusted-ended flag and the ≥ duration-2s position
    const predIdx = PLAYER.indexOf('const isAtNaturalEnd')
    expect(predIdx).toBeGreaterThan(-1)
    const predBlock = PLAYER.slice(predIdx, predIdx + 500)
    expect(predBlock).toMatch(/if \(playbackEnded\) return true/)
    expect(predBlock).toMatch(/cur >= total - 2/)
    // Pressing play at the end restarts instead of resuming into the tail
    const playPauseBlock = PLAYER.slice(PLAYER.indexOf('const handlePlayPause'), PLAYER.indexOf('const saveProgress'))
    expect(playPauseBlock).toMatch(/if \(isAtNaturalEnd\(\)\) \{\s*restartFromBeginning\(\)\s*return\s*\}/)
  })

  // STORY-END-LIBRARY-001 (Marc, Nov 10, 2026): no "Story complete" card, no
  // Play Again / Next episode / countdown boxes. The player still never navigates
  // on a timer, and the disarmed branch (another episode chosen) never navigates.
  test('no end card or countdown box; no timer navigation', () => {
    expect(PLAYER).not.toMatch(/data-testid="player-end-state"/)
    expect(PLAYER).not.toMatch(/data-testid="end-state-play-again"/)
    expect(PLAYER).not.toMatch(/Still listening\?/)
    expect(PLAYER).not.toMatch(/Starting in a moment/)
    const playPauseBlock = PLAYER.slice(PLAYER.indexOf('const handlePlayPause'), PLAYER.indexOf('const saveProgress'))
    expect(playPauseBlock).not.toMatch(/disableAutoAdvanceForSession/)
    const disarmBlock = PLAYER.slice(
      PLAYER.indexOf('const maybeAutoAdvanceFromNaturalEnd'),
      PLAYER.indexOf('isAdvancingRef.current = true')
    )
    expect(disarmBlock).not.toMatch(/router\.push/)
    expect(disarmBlock).not.toMatch(/returnToSource/)
    expect(PLAYER).not.toMatch(/setTimeout\(\(\) => returnToSource\('\/library'\), 1500\)/)
  })
})
