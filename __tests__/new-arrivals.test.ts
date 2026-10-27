import { selectNewestArrivals } from '@/lib/newArrivals'
const story = (id: string, published: string, extra = {}) => ({ id, title: id, series_id: null, series_name: null, series_number: null, published_on: published, ...extra })
it('always returns the two newest published stories regardless of input order', () => {
  const rows = [story('old', '2026-01-01'), story('newest', '2026-10-27'), story('second', '2026-10-26')]
  expect(selectNewestArrivals(rows).map(s => s.id)).toEqual(['newest', 'second'])
})
it('uses the latest episode publication for a complete series and displays it once', () => {
  const rows = [story('ep1', '2026-01-01', { series_id: 's', series_name: 'Series', series_number: 1, series_total: 2 }), story('ep2', '2026-10-27', { series_id: 's', series_name: 'Series', series_number: 2, series_total: 2 }), story('single', '2026-10-26'), story('old', '2026-02-01')]
  const selected = selectNewestArrivals(rows)
  expect(selected.map(s => s.id)).toEqual(['ep1', 'single'])
  expect(selected[0].episodes.map(ep => ep.id)).toEqual(['ep1', 'ep2'])
})
it('does not offer a partial series even when its published episodes are consecutive', () => {
  const rows = [story('ep1', '2026-10-27', { series_id: 's', series_number: 1, series_total: 3 }), story('ep2', '2026-10-27', { series_id: 's', series_number: 2, series_total: 3 }), story('a', '2026-10-26'), story('b', '2026-10-25')]
  expect(selectNewestArrivals(rows).map(s => s.id)).toEqual(['a', 'b'])
})
it('finds a recent complete series even when its first episode is older than 60 other rows', () => {
  const rows = Array.from({ length: 70 }, (_, n) => story('older-' + n, '2026-09-01'))
  rows.push(story('first', '2025-01-01', { series_id: 's', series_number: 1, series_total: 2 }), story('last', '2026-10-27', { series_id: 's', series_number: 2, series_total: 2 }))
  expect(selectNewestArrivals(rows)[0].episodes.map(ep => ep.id)).toEqual(['first', 'last'])
})
it('recognizes current published series that use episode_number instead of series_number', () => {
  const rows = [1, 2, 3].map(n => story('episode-' + n, '2026-10-27', { series_id: 'current-series', series_name: 'Current Series', episode_number: n }))
  rows.push(story('standalone', '2026-10-26'))
  expect(selectNewestArrivals(rows).map(s => s.id)).toEqual(['episode-1', 'standalone'])
})
