/**
 * HANDOFF-STALE-AUTOPLAY-001 (Marc, 2026-10-29): on an in-place episode
 * advance the autoplay effect must not call play() while the <audio> element
 * still holds the outgoing episode's source. Doing so restarted the finished
 * episode from 0:00 (its sting + "Episode N…" announcement) for a few seconds
 * before the next episode's source replaced it and played its own sting.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

function effectBody(marker: string): string {
  const start = src.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('}, [', start)
  return src.slice(start, end)
}

describe('HANDOFF-STALE-AUTOPLAY-001', () => {
  const autoplay = effectBody('if (loading || !audioRef.current || seriesContinueAutoplayAttemptedRef.current) return')

  test('autoplay effect waits until the element holds THIS story (audioStoryIdRef)', () => {
    expect(autoplay).toMatch(/if \(audioStoryIdRef\.current !== storyId\) return/)
  })

  test('the guard runs before any play() attempt', () => {
    const guardAt = autoplay.indexOf('audioStoryIdRef.current !== storyId')
    const playAt = autoplay.indexOf('audio.play()')
    expect(guardAt).toBeGreaterThan(-1)
    expect(playAt).toBeGreaterThan(guardAt)
  })

  test('init effect stamps audioStoryIdRef before loading the new source and is declared before the autoplay effect', () => {
    const initAt = src.indexOf('// Init audio once loaded')
    const stampAt = src.indexOf('audioStoryIdRef.current = storyId', initAt)
    const autoplayAt = src.indexOf('if (loading || !audioRef.current || seriesContinueAutoplayAttemptedRef.current) return')
    expect(initAt).toBeGreaterThan(-1)
    expect(stampAt).toBeGreaterThan(initAt)
    expect(stampAt).toBeLessThan(autoplayAt)
  })
})
