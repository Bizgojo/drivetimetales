/**
 * AUTHOR-WRITTEN-RELEASE-001 (Nov 4, 2026) — Sunset manual series release.
 *
 * Real state on Nov 4: 24 Sunset episodes sit at workflow_state 'published'
 * but hidden (status audio_ready), 2 at ready_for_review. The strict rule
 * blocks ALL of them (none is approved_ready). The manual release of an
 * author-written series counts as Marc's approval.
 *
 * Pins:
 *  1. Default (strict) rule unchanged: Sunset-shaped rows are blocked.
 *  2. With releaseCountsAsApproval, the same rows pass.
 *  3. The option never waives missing audio, the personalization announcement, cold_storage,
 *     repair states, or numbering gaps.
 *  4. Route: option only on the series release, Belle copy gate skipped only when author-written,
 *     freshness gate still runs.
 */

import * as fs from 'fs'
import * as path from 'path'
import { evaluateSeriesPublishOrder } from '@/lib/story-gates'

function ep(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `ep-${n}`,
    title: `Episode ${n}`,
    author: 'Marc Postlewaite',
    genre: 'Sci-Fi',
    audio_url: `https://example.test/${n}/final_mix.mp3`,
    cover_url: `https://example.test/${n}/cover.jpg`,
    description: 'desc',
    duration_mins: 14,
    status: 'audio_ready',
    is_hidden: true,
    review_status: 'pending',
    workflow_state: 'published',
    episode_number: n,
    announcement_url: `https://example.test/${n}/announcement.mp3`,
    announcement_text: null,
    script: null,
    ...over,
  } as any
}

function sunsetLike() {
  return Array.from({ length: 26 }, (_, i) => {
    const n = i + 1
    return n === 3 || n === 23 ? ep(n, { workflow_state: 'ready_for_review' }) : ep(n)
  })
}

describe('AUTHOR-WRITTEN-RELEASE-001', () => {
  it('strict rule (default) still blocks Sunset-shaped rows', () => {
    const r = evaluateSeriesPublishOrder(sunsetLike())
    expect(r.code).not.toBe('ok')
  })

  it('manual author-written release passes the same rows', () => {
    const r = evaluateSeriesPublishOrder(sunsetLike(), { releaseCountsAsApproval: true })
    expect(r.code).toBe('ok')
    expect(r.blocked).toEqual([])
  })

  it('never waives missing audio', () => {
    const eps = sunsetLike()
    eps[13] = ep(14, { audio_url: null })
    const r = evaluateSeriesPublishOrder(eps, { releaseCountsAsApproval: true })
    expect(r.code).not.toBe('ok')
    expect(r.blocked.some((b) => b.episodeNumber === 14 && b.reasons.includes('missing audio_url'))).toBe(true)
  })

  it('never waives cold_storage or repair states', () => {
    for (const ws of ['cold_storage', 'repair_queue', 'being_repaired']) {
      const eps = sunsetLike()
      eps[4] = ep(5, { workflow_state: ws })
      const r = evaluateSeriesPublishOrder(eps, { releaseCountsAsApproval: true })
      expect(r.code).not.toBe('ok')
    }
  })

  it('never waives the personalization announcement check', () => {
    const eps = sunsetLike()
    eps[0] = ep(1, { announcement_url: null })
    const r = evaluateSeriesPublishOrder(eps, { releaseCountsAsApproval: true })
    expect(r.code).not.toBe('ok')
    expect(r.blocked.some((b) => b.episodeNumber === 1 && b.reasons.some((x) => x.startsWith('announcement_url is missing')))).toBe(true)
  })

  it('never waives a numbering gap', () => {
    const eps = sunsetLike().filter((e) => e.episode_number !== 10)
    const r = evaluateSeriesPublishOrder(eps, { releaseCountsAsApproval: true })
    expect(r.code).toBe('series_episode_number_gap')
  })

  it('route scopes both skips to author-written series release', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'admin', 'publish-story', 'route.ts'), 'utf8')
    expect(src).toMatch(/evaluateSeriesPublishOrder\(episodes as any\[\], \{ releaseCountsAsApproval: authorWrittenRelease \}\)/)
    expect(src).toMatch(/const belleVerdict = authorWrittenRelease\s*\n\s*\? \(\{ ok: true \} as const\)\s*\n\s*: evaluateBelleUnitForPublish\(episodes as any\[\]\)/)
    expect(src).toMatch(/const freshnessVerdict = evaluateBelleFreshnessForPublish\(episodes as any\[\]\)/)
    // single-story path untouched (no option passed)
    expect(src).toMatch(/isEpisodePublishable\(_ordered\[_rank\] as any, _ordered\.slice\(0, _rank\) as any\[\]\)/)
  })
})
