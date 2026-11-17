/**
 * PLAYER-STING-001 (CANON-11 rules 2 and 28; Marc, Nov 17 2026):
 * Every story and every episode opens with the Endless Tales sting, right at the
 * start of Belle's intro — first play, Start Over and autoplay alike.
 *
 * The playlist route previously began each queue at announcement_url, which is
 * Belle's intro with no sting. Any path that served the raw queue (rather than a
 * pre-rendered final_mix) therefore started dry.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/api/asc3/story-playlist/route.ts'),
  'utf8'
)

describe('PLAYER-STING-001: every queue starts with the sting', () => {
  test('declares the canonical sting asset (same one the mixer uses)', () => {
    expect(src).toMatch(/ET_Signature_Sting_v7\.mp3\.mp3/)
    expect(src).toMatch(/const STING_URL = /)
  })

  test('every queue builder prepends the sting before announcement/intro', () => {
    // There are three queue builders: suppressNameOpener, personalized, liveGreeting.
    const builders = src.match(/const queue: PlaybackQueueItem\[\] = \[[\s\S]*?\]/g) || []
    expect(builders.length).toBeGreaterThanOrEqual(3)
    for (const b of builders) {
      expect(b).toMatch(/stingQueueItem\(\)/)
    }
  })

  test('sting appears before the announcement clip in each queue', () => {
    const builders = src.match(/const queue: PlaybackQueueItem\[\] = \[[\s\S]*?\]/g) || []
    for (const b of builders) {
      const stingAt = b.indexOf('stingQueueItem()')
      const annAt = Math.max(b.indexOf('announcement_url'), b.indexOf('announcementUrl'))
      expect(stingAt).toBeGreaterThanOrEqual(0)
      if (annAt >= 0) expect(stingAt).toBeLessThan(annAt)
    }
  })

  test('sting item is typed intro so it is never skipped by segment logic', () => {
    expect(src).toMatch(/function stingQueueItem\(\): PlaybackQueueItem \{[\s\S]*?type: 'intro'/)
  })
})
