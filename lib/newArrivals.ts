export type Arrival = { id: string; title: string; series_id: string | null; series_name: string | null; series_number: number | null; episode_number?: number | null; series_total?: number | null; published_on?: string | null }
export function episodeNumber(story: Arrival) { return Number(story.series_number || story.episode_number || 0) }
const publicationTime = (story: Arrival) => Date.parse(story.published_on || '') || 0
/** One card per standalone or complete series, independent of listening history. */
export function selectNewestArrivals<T extends Arrival>(rows: T[]): Array<T & { episodes: T[] }> {
  const candidates: Array<{ story: T; episodes: T[]; published: number }> = []
  const series = new Map<string, T[]>()
  for (const row of rows) {
    if (/\b(test|sample|draft)\b/i.test(`${row.title} ${row.series_name || ''}`)) continue
    if (row.series_id) series.set(row.series_id, [...(series.get(row.series_id) || []), row])
    else candidates.push({ story: row, episodes: [row], published: publicationTime(row) })
  }
  for (const episodes of Array.from(series.values())) {
    const ordered = episodes.slice().sort((a, b) => episodeNumber(a) - episodeNumber(b))
    const numbers = new Set(ordered.map(episodeNumber))
    const expected = Math.max(...ordered.map(ep => Number(ep.series_total || 0)), ...Array.from(numbers))
    if (expected < 2 || numbers.size !== expected || ordered.length !== expected) continue
    if (!Array.from({ length: expected }, (_, i) => i + 1).every(n => numbers.has(n))) continue
    candidates.push({ story: ordered[0], episodes: ordered, published: Math.max(...ordered.map(publicationTime)) })
  }
  return candidates.sort((a, b) => b.published - a.published || a.story.id.localeCompare(b.story.id)).slice(0, 2).map(({ story, episodes }) => ({ ...story, episodes }))
}
