/**
 * ORION-COMPLETION-STICKY-001 — completion flag must be monotonic.
 *
 * Bug (found 2026-07-15 during soak evidence review): saveProgress upserted
 * `completed: done` unconditionally, so every non-completion write (periodic
 * 5s save, pause, unmount, re-listen) reset an earned completed=true back to
 * false. Ep1/Ep3 of the dual-engine soak showed completed=false despite
 * chromium finishing them naturally — the second engine's later unmount
 * clobbered the flag. Single-user impact: re-opening a finished episode
 * erased its completion, silently corroding the completion% A/B/C metric.
 *
 * Fix: `completed` is included in the upsert payload ONLY when done=true.
 * Updates without the column leave the stored value untouched; inserts use
 * the column default (false).
 *
 * Source pins against components/player/CanonicalPlayer.tsx.
 */
import fs from 'fs'
import path from 'path'

const PLAYER = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'player', 'CanonicalPlayer.tsx'),
  'utf8'
)

// Scope pins to the server-write function. persistLocalProgress legitimately
// passes `completed: done` — lib/playerProgress.ts saveLocalPlayerProgress is
// already monotonic (Boolean(options.completed || existing?.completed)).
const SAVE_PROGRESS = PLAYER.slice(
  PLAYER.indexOf('const saveProgress'),
  PLAYER.indexOf('const seekToClientX')
)

describe('ORION-COMPLETION-STICKY-001: completed flag is monotonic', () => {
  test('saveProgress function region extracted', () => {
    expect(SAVE_PROGRESS.length).toBeGreaterThan(100)
  })

  test('server upsert payload no longer hard-writes completed on every save', () => {
    // The old clobbering form must be gone from the server write. (Comma form
    // targets the payload literal; the explanatory comment quotes it in backticks.)
    expect(SAVE_PROGRESS).not.toMatch(/completed:\s*done\s*,/)
  })

  test('completed is set only when earning it (done=true)', () => {
    expect(SAVE_PROGRESS).toMatch(/if \(done\) progressRow\.completed = true/)
  })

  test('conditional payload feeds the user_library upsert with onConflict intact', () => {
    expect(SAVE_PROGRESS).toMatch(
      /supabase\.from\('user_library'\)\.upsert\(progressRow, \{ onConflict: 'user_id,story_id' \}\)/
    )
  })

  test('payload keeps progress + last_played on every save (resume still works)', () => {
    expect(SAVE_PROGRESS).toMatch(/user_id: user\.id, story_id: storyId, progress: Math\.floor\(t\),/)
    expect(SAVE_PROGRESS).toMatch(/last_played: new Date\(\)\.toISOString\(\)/)
  })
})
