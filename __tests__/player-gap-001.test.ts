/**
 * PLAYER-GAP-001 (CANON-11 rule 25; Marc, Nov 17 2026):
 * The gap between episodes must be 2-3 seconds, measured from the audio.
 *
 * Measured gaps were 5, 24 and 41 seconds. The 2s timer (AUTO_ADVANCE_GAP_MS)
 * measured from the OLD page's natural end, while the next episode still had to
 * reset the router, remount the player, round-trip /api/asc3/story-playlist and
 * load audio. The timer was measuring a number, not the audio.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

describe('PLAYER-GAP-001: next episode audio is warmed during the last 45s', () => {
  test('prefetch window is 45 seconds', () => {
    expect(src).toMatch(/AUTO_ADVANCE_PREFETCH_SECONDS = 45/)
    expect(src).toMatch(/cumTime < total - AUTO_ADVANCE_PREFETCH_SECONDS/)
  })

  test('resolves the next episode candidate during the prefetch window', () => {
    expect(src).toMatch(/fetchDirectSeriesAutoAdvanceCandidate\(\)/)
    expect(src).toMatch(/prefetchedNextRef\.current = \{ forStoryId, candidate \}/)
  })

  test('also warms the next episode AUDIO, not just the row', () => {
    // The row lookup alone left the <audio> element to cold-load on mount,
    // which is what produced the 5/24/41s gaps.
    expect(src).toMatch(/AUTOADVANCE-2S-GAP-001/)
    expect(src).toMatch(/story_audio_url/)
    expect(src).toMatch(/rel = 'prefetch'/)
    expect(src).toMatch(/document\.head\.appendChild/)
  })

  test('warms the next episode playlist response too (sequential load() cost)', () => {
    const idx = src.indexOf('AUTOADVANCE-2S-GAP-001')
    const block = src.slice(idx, idx + 2600)
    expect(block).toMatch(/story-playlist\?\$\{pp\.toString\(\)\}/)
    expect(block).toMatch(/fetch\(`\/api\/asc3\/story-playlist/)
  })

  test('prefetch tags are replaced, not accumulated in <head>', () => {
    expect(src).toMatch(/prefetchLinkRef = useRef<HTMLLinkElement \| null>/)
    expect(src).toMatch(/prefetchLinkRef\.current\.remove\(\)/)
  })

  test('prefetch failure never affects playback', () => {
    const idx = src.indexOf('AUTOADVANCE-2S-GAP-001')
    const block = src.slice(idx, idx + 2600)
    expect(block).toMatch(/try \{/)
    expect(block).toMatch(/catch \{\}/)
  })
})
