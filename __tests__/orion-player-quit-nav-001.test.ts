import fs from 'fs'
import path from 'path'

// ORION-PLAYER-QUIT-001 (2026-07-15, Marc walk #2 FF desktop): Ep2 quit mid-play
// and navigated to /library with zero user action — the d446fd9b early-ended
// guard class recurring. Three defects pinned here:
//  1. Guard blind spot: 'ended' with UNKNOWN element duration bypassed the guard.
//  2. Guard blind spot: Firefox shrinks el.duration to the received bytes on a
//     truncated stream, so currentTime ≈ duration and early-ended passes — must
//     compare against an independent expected duration.
//  3. Natural end with auto-advance disabled auto-navigated to /library after
//     1.5s — the player must never navigate on its own initiative.
// Plus: saveProgress upsert was missing onConflict — every progress/completion
// write after row creation failed 23505 and was silently swallowed (live-confirmed).

const PLAYER = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'player', 'CanonicalPlayer.tsx'),
  'utf8'
)

describe('ORION-PLAYER-QUIT-001: mid-play quit-to-library class', () => {
  it('treats ended with unknown element duration as a stall (guard no longer bypassed)', () => {
    expect(PLAYER).toMatch(/ended with unknown element duration — treating as stall/)
    expect(PLAYER).toMatch(/elDuration === null[\s\S]{0,400}recoverFromStall\(\)/)
  })

  it('keeps the original early-ended guard (currentTime vs element duration, 2.5s tolerance)', () => {
    expect(PLAYER).toMatch(/el\.currentTime < elDuration - 2\.5/)
    expect(PLAYER).toMatch(/spurious early ended — treating as stall/)
  })

  it('detects Firefox truncated-stream endeds via independent expected duration', () => {
    expect(PLAYER).toMatch(/ended on truncated stream \(duration shortfall\) — treating as stall/)
    expect(PLAYER).toMatch(/segDursRef\.current\[queueIndex\] \|\| 0/)
    expect(PLAYER).toMatch(/duration_mins\) \* 60/)
  })

  it('never auto-navigates to /library on natural end when auto-advance is disabled', () => {
    expect(PLAYER).not.toMatch(/setTimeout\(\(\) => returnToSource\('\/library'\), 1500\)/)
    const block = PLAYER.slice(
      PLAYER.indexOf('const maybeAutoAdvanceFromNaturalEnd'),
      PLAYER.indexOf('isAdvancingRef.current = true')
    )
    expect(block).toMatch(/Never navigate on the player's[\s\S]{0,40}own initiative/)
  })

  it('saveProgress upsert carries onConflict and surfaces write errors', () => {
    const saveIdx = PLAYER.indexOf('const saveProgress = async')
    const saveBlock = PLAYER.slice(saveIdx, saveIdx + 1800)
    expect(saveBlock).toMatch(/\{ onConflict: 'user_id,story_id' \}/)
    expect(saveBlock).toMatch(/user_library progress write failed/)
  })
})
