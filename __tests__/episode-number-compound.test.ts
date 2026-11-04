/**
 * EPISODE-NUMBER-COMPOUND-001 + AUTHOR-WRITTEN-EXEMPT-001 standalone RFR gap (Nov 4, 2026).
 *
 * Pins:
 *  1. "Episode Twenty-Three" / "Twenty Three" / "Twenty-Third" name episode 23.
 *  2. Round tens ("Thirty", "Thirtieth") name episode 30.
 *  3. No false positives: "Twenty-Three" does not name 20 or 3 via the compound path,
 *     and "Twenty-Four" does not name 23.
 *  4. Old behavior kept: digits and one..twenty words still match.
 *  5. normalizeNumberWords is unchanged (freshness fingerprints stay stable).
 *  6. The standalone RFR check skips Belle position rules for author-written series.
 */

import * as fs from 'fs'
import * as path from 'path'
import { episodeNumberNamedIn, normalizeNumberWords } from '@/lib/numberWords'

describe('EPISODE-NUMBER-COMPOUND-001', () => {
  it('reads spoken compounds 21-99', () => {
    expect(episodeNumberNamedIn('"The Sunset of Competition," Episode Twenty-Three: "The Last Child."', 23)).toBe(true)
    expect(episodeNumberNamedIn('Episode Twenty Three', 23)).toBe(true)
    expect(episodeNumberNamedIn('the twenty-third episode', 23)).toBe(true)
    expect(episodeNumberNamedIn('Episode Twenty-Six: "Inheritance."', 26)).toBe(true)
    expect(episodeNumberNamedIn('Episode Thirty', 30)).toBe(true)
    expect(episodeNumberNamedIn('the thirtieth episode', 30)).toBe(true)
  })

  it('does not match the wrong number', () => {
    expect(episodeNumberNamedIn('Episode Twenty-Four', 23)).toBe(false)
    expect(episodeNumberNamedIn('Episode Twenty-Three', 3)).toBe(false)
    expect(episodeNumberNamedIn('Episode Thirty-One', 30)).toBe(false)
  })

  it('keeps old behavior for digits and one..twenty', () => {
    expect(episodeNumberNamedIn('Episode 23', 23)).toBe(true)
    expect(episodeNumberNamedIn('Episode Fourteen', 14)).toBe(true)
    expect(episodeNumberNamedIn('Episode Twenty', 20)).toBe(true)
    expect(episodeNumberNamedIn('someone', 1)).toBe(false)
  })

  it('leaves normalizeNumberWords unchanged', () => {
    expect(normalizeNumberWords('Episode Twenty-Three')).toBe('Episode 20-3')
  })

  it('standalone RFR skips Belle position rules for author-written series', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'production-jobs', 'run-next', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/rfrAuthorExempt = await isAuthorWrittenExemptSeriesId\(story\.series_id\)/)
    expect(src).toMatch(/story\.script && !rfrAuthorExempt\)/)
  })
})
