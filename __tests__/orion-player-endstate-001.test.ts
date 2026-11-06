/** Completed-player UX. Pause cancellation was superseded by Marc's
 * permanent series-continuation rule (2026-11-05). */
import fs from 'fs'
import path from 'path'

const PLAYER = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'player', 'CanonicalPlayer.tsx'),
  'utf8'
)

describe('ORION-PLAYER-ENDSTATE-001: completed end-state (Play Again / Next episode)', () => {
  test('trusted natural end sets playbackEnded on every completion path (final-mix + ASC3 queue)', () => {
    // Single-file path (onEnded, after the spurious-ended guards)
    expect(PLAYER).toMatch(/setIsPlaying\(false\); setPlaybackEnded\(true\); saveProgress\(duration, true\)/)
    // ASC3 queue terminal branches (natural_ended + error_skip completion)
    const asc3Matches = PLAYER.match(/setIsPlaying\(false\); setPlaybackEnded\(true\); saveProgress\(completedSeconds, true\)/g) || []
    expect(asc3Matches.length).toBe(2)
  })

  test('end-state card renders with Play Again wired to a restart-from-0 (never resume-from-end)', () => {
    expect(PLAYER).toMatch(/data-testid="player-end-state"/)
    expect(PLAYER).toMatch(/data-testid="end-state-play-again"[\s\S]{0,120}onClick=\{restartFromBeginning\}/)
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

  test('Next-episode affordance is wired to the validated candidate fetch (display-only when disarmed)', () => {
    // Disarmed natural end fetches the candidate via the live-validated query for display
    const disarmBlock = PLAYER.slice(
      PLAYER.indexOf('const maybeAutoAdvanceFromNaturalEnd'),
      PLAYER.indexOf('isAdvancingRef.current = true')
    )
    expect(disarmBlock).toMatch(/fetchDirectSeriesAutoAdvanceCandidate\(\)/)
    expect(disarmBlock).toMatch(/setEndStateCandidate\(displayCandidate\)/)
    // Button navigates exactly like the auto-advance path (fresh mount re-arms)
    expect(PLAYER).toMatch(
      /data-testid="end-state-next-episode"[\s\S]{0,500}\/player\/\$\{endStateCandidate\.story\.id\}\?autoplay=1&playNow=1&seriesContinue=1/
    )
  })

  test('pause preserves continuation; explicit Stop still prevents navigation', () => {
    const playPauseBlock = PLAYER.slice(PLAYER.indexOf('const handlePlayPause'), PLAYER.indexOf('const saveProgress'))
    expect(playPauseBlock).not.toMatch(/disableAutoAdvanceForSession/)
    expect(PLAYER).not.toContain('REARM_AUTO_ADVANCE_ON_RESUME')
    // The disarmed natural-end branch performs NO navigation (fetch is display-only)
    const disarmBlock = PLAYER.slice(
      PLAYER.indexOf('const maybeAutoAdvanceFromNaturalEnd'),
      PLAYER.indexOf('isAdvancingRef.current = true')
    )
    expect(disarmBlock).not.toMatch(/router\.push/)
    expect(disarmBlock).not.toMatch(/returnToSource/)
    // No timer-based /library navigation reintroduced anywhere
    expect(PLAYER).not.toMatch(/setTimeout\(\(\) => returnToSource\('\/library'\), 1500\)/)
    // The end-state card itself contains no timers — both buttons are user gestures
    const endStateBlock = PLAYER.slice(
      PLAYER.indexOf('data-testid="player-end-state"'),
      PLAYER.indexOf('{catalogExhausted &&')
    )
    expect(endStateBlock).not.toMatch(/setTimeout/)
    expect(endStateBlock).not.toMatch(/setInterval/)
  })
})
