/**
 * PUBLISH-ORDERING GATE (GATE-GAPS-SPEC §1) enforcement tests.
 *
 * Covers: in-order pass; Ep2-while-Ep1-draft blocked; hidden Ep1 blocks Ep2;
 * gap numbering → contiguity error; finale-with-unpublished-Ep1 → 422;
 * single-story predicate evaluation against siblings.
 */
import {
  isEpisodePublishable,
  assertSeriesContiguity,
  evaluateSeriesPublishOrder,
  sortEpisodesForPublish,
  PublishOrderEpisode,
} from '@/lib/story-gates'

function readyEp(n: number, over: Partial<PublishOrderEpisode> = {}): PublishOrderEpisode {
  return {
    id: `ep${n}`,
    title: `Episode ${n}`,
    episode_number: n,
    status: 'approved_ready',
    workflow_state: 'approved_ready',
    author: 'A',
    genre: 'G',
    audio_url: 'https://x/a.mp3',
    cover_url: 'https://x/c.jpg',
    description: 'd',
    duration_mins: 10,
    announcement_url: 'https://x/belle.mp3',
    ...over,
  } as PublishOrderEpisode
}

function publishedEp(n: number, over: Partial<PublishOrderEpisode> = {}): PublishOrderEpisode {
  return readyEp(n, { status: 'published', is_hidden: false, ...over })
}

describe('sortEpisodesForPublish', () => {
  it('sorts by episode_number regardless of input order', () => {
    const out = sortEpisodesForPublish([readyEp(3), readyEp(1), readyEp(2)])
    expect(out.map(e => e.episode_number)).toEqual([1, 2, 3])
  })
})

describe('assertSeriesContiguity', () => {
  it('passes for 1..N', () => {
    expect(assertSeriesContiguity([readyEp(1), readyEp(2), readyEp(3)]).ok).toBe(true)
  })
  it('fails on gap (1,3)', () => {
    const r = assertSeriesContiguity([readyEp(1), readyEp(3)])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/1\.\.2|gap|duplicate/i)
  })
  it('fails on duplicates', () => {
    expect(assertSeriesContiguity([readyEp(1), readyEp(1)]).ok).toBe(false)
  })
  it('fails when an episode lacks a number', () => {
    const bad = readyEp(1, { episode_number: null, series_number: null })
    expect(assertSeriesContiguity([bad]).ok).toBe(false)
  })
})

describe('isEpisodePublishable', () => {
  it('in-order pass: Ep1 with no earlier eps and all fields ready', () => {
    const r = isEpisodePublishable(readyEp(1), [])
    expect(r.publishable).toBe(true)
    expect(r.reasons).toEqual([])
  })
  it('Ep2 blocked while Ep1 is draft', () => {
    const ep1 = readyEp(1) // approved_ready but NOT published → blocks Ep2
    const r = isEpisodePublishable(readyEp(2), [ep1])
    expect(r.publishable).toBe(false)
    expect(r.reasons.some(x => x.startsWith('earlier episode'))).toBe(true)
  })
  it('Ep2 blocked while Ep1 is published but hidden', () => {
    const ep1 = publishedEp(1, { is_hidden: true })
    const r = isEpisodePublishable(readyEp(2), [ep1])
    expect(r.publishable).toBe(false)
  })
  it('Ep2 passes when Ep1 is published + visible', () => {
    const r = isEpisodePublishable(readyEp(2), [publishedEp(1)])
    expect(r.publishable).toBe(true)
  })
  it('missing fields block regardless of order', () => {
    const r = isEpisodePublishable(readyEp(1, { audio_url: '' }), [])
    expect(r.publishable).toBe(false)
    expect(r.reasons).toContain('missing audio_url')
  })
})

describe('evaluateSeriesPublishOrder (route decision fn)', () => {
  it('all-ready series → ok (bulk UPDATE publishes atomically, order preserved)', () => {
    const r = evaluateSeriesPublishOrder([readyEp(1), readyEp(2), readyEp(3)])
    expect(r.code).toBe('ok')
    expect(r.blocked).toEqual([])
  })
  it('strict default: Ep2 blocked when Ep1 merely ready-but-unpublished (no batch set)', () => {
    // Single-story path uses the strict predicate against live DB state.
    const r = isEpisodePublishable(readyEp(2), [readyEp(1)])
    expect(r.publishable).toBe(false)
  })
  it('batch carve-out: Ep2 passes when Ep1 is publishable in the same batch', () => {
    const r = isEpisodePublishable(readyEp(2), [readyEp(1)], new Set(['ep1']))
    expect(r.publishable).toBe(true)
  })
  it('fully-published series re-publish → ok', () => {
    const r = evaluateSeriesPublishOrder([publishedEp(1), publishedEp(2)])
    expect(r.code).toBe('ok')
  })
  it('Ep1 draft blocks the series → 422 series_publish_out_of_order, zero rows written', () => {
    const eps = [readyEp(1, { workflow_state: 'draft', status: 'draft' }), readyEp(2)]
    const r = evaluateSeriesPublishOrder(eps)
    expect(r.code).toBe('series_publish_out_of_order')
    // Ep2 carries the ordering reason; route returns 422 and never runs UPDATE.
    const ep2 = r.blocked.find(b => b.episodeNumber === 2)
    expect(ep2).toBeDefined()
    expect(ep2!.reasons.some(x => x.startsWith('earlier episode'))).toBe(true)
  })
  it('finale (Ep3) with unpublished Ep1 → 422 series_publish_out_of_order', () => {
    const eps = [readyEp(1, { workflow_state: 'draft', status: 'draft' }), publishedEp(2), readyEp(3)]
    const r = evaluateSeriesPublishOrder(eps)
    expect(r.code).toBe('series_publish_out_of_order')
    const finale = r.blocked.find(b => b.episodeNumber === 3)
    expect(finale).toBeDefined()
  })
  it('gap numbering → 422 series_episode_number_gap', () => {
    const r = evaluateSeriesPublishOrder([readyEp(1), readyEp(3)])
    expect(r.code).toBe('series_episode_number_gap')
  })
  it('field-only failure (no ordering issue) → series_not_publishable (route keeps 400)', () => {
    const r = evaluateSeriesPublishOrder([readyEp(1, { audio_url: '' })])
    expect(r.code).toBe('series_not_publishable')
    expect(r.orderingBlocked).toBe(false)
  })
  it('single-story path: Ep2 blocked while sibling Ep1 draft', () => {
    const fam = sortEpisodesForPublish([
      readyEp(1, { workflow_state: 'draft', status: 'draft' }),
      readyEp(2),
    ])
    const rank = fam.findIndex(e => e.id === 'ep2')
    const r = isEpisodePublishable(fam[rank], fam.slice(0, rank))
    expect(r.publishable).toBe(false)
    expect(r.reasons.some(x => x.startsWith('earlier episode'))).toBe(true)
  })
  it('single-story path: standalone (no siblings) unaffected', () => {
    const r = isEpisodePublishable(readyEp(1), [])
    expect(r.publishable).toBe(true)
  })
})
