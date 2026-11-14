// lib/adReport.ts — AD-REPORT-001 (Marc, Nov 14, 2026: "build the tracking")
//
// Per-ad quality report: for every ad (utm_campaign / utm_term / utm_content,
// which Meta fills with the campaign, ad set and ad ids), how many signups it
// brought and how far those listeners went: listened 60 seconds, finished an
// Episode 1, reached Episode 3, finished a series, started a trial, paid.
//
// Pure functions only (unit-tested in __tests__/ad-report-001.test.ts). The
// API route loads users, play_events and stories and passes them in. Nothing
// here needs new database columns: plays already carry seconds_played,
// progress_pct and series/episode (PLAY-EVENTS-SERIES-001).

export type AdUserRow = {
  id: string
  created_at: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  trial_started_at: string | null
  first_paid_date: string | null
  is_test_account?: boolean | null
}

export type AdPlayRow = {
  user_id: string
  series_id: string | null
  episode_number: number | null
  seconds_played: number | null
  progress_pct: number | null
}

export type AdRow = {
  key: string
  source: string
  campaign: string
  adSet: string
  ad: string
  signups: number
  listened60: number
  finishedEp1: number
  reachedEp3: number
  finishedSeries: number
  trials: number
  paid: number
  topSeries: string | null
}

/** A play counts as finished at 90% (same bar as the player's "finished"). */
export const FINISHED_PCT = 90
export const LISTENED_SECONDS = 60
export const NO_TAG = '(no ad tag)'

function tag(v: string | null | undefined): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || '—'
}

export function adKey(u: Pick<AdUserRow, 'utm_source' | 'utm_campaign' | 'utm_term' | 'utm_content'>): string {
  const anyTag = [u.utm_source, u.utm_campaign, u.utm_term, u.utm_content].some((v) => typeof v === 'string' && v.trim())
  if (!anyTag) return NO_TAG
  return [tag(u.utm_source), tag(u.utm_campaign), tag(u.utm_term), tag(u.utm_content)].join(' | ')
}

/**
 * Build one row per ad. `seriesEpisodes` maps series_id → total episodes;
 * `seriesTitles` maps series_id → title (for the "most played series" column).
 */
export function buildAdReport(
  users: AdUserRow[],
  plays: AdPlayRow[],
  seriesEpisodes: Record<string, number>,
  seriesTitles: Record<string, string> = {},
): AdRow[] {
  const real = users.filter((u) => u && u.id && u.is_test_account !== true)
  const playsByUser = new Map<string, AdPlayRow[]>()
  for (const p of plays) {
    if (!p || !p.user_id) continue
    const list = playsByUser.get(p.user_id) || []
    list.push(p)
    playsByUser.set(p.user_id, list)
  }

  const rows = new Map<string, AdRow & { seriesCounts: Map<string, number> }>()
  for (const u of real) {
    const key = adKey(u)
    let row = rows.get(key)
    if (!row) {
      row = {
        key,
        source: key === NO_TAG ? NO_TAG : tag(u.utm_source),
        campaign: key === NO_TAG ? '' : tag(u.utm_campaign),
        adSet: key === NO_TAG ? '' : tag(u.utm_term),
        ad: key === NO_TAG ? '' : tag(u.utm_content),
        signups: 0, listened60: 0, finishedEp1: 0, reachedEp3: 0, finishedSeries: 0, trials: 0, paid: 0,
        topSeries: null,
        seriesCounts: new Map(),
      }
      rows.set(key, row)
    }
    row.signups += 1
    if (u.trial_started_at) row.trials += 1
    if (u.first_paid_date) row.paid += 1

    const mine = playsByUser.get(u.id) || []
    if (mine.some((p) => Number(p.seconds_played || 0) >= LISTENED_SECONDS)) row.listened60 += 1
    if (mine.some((p) => Number(p.episode_number) === 1 && Number(p.progress_pct || 0) >= FINISHED_PCT)) row.finishedEp1 += 1
    if (mine.some((p) => Number(p.episode_number) >= 3)) row.reachedEp3 += 1
    const finishedSeries = mine.some((p) => {
      const total = p.series_id ? Number(seriesEpisodes[p.series_id] || 0) : 0
      return total > 1 && Number(p.episode_number) === total && Number(p.progress_pct || 0) >= FINISHED_PCT
    })
    if (finishedSeries) row.finishedSeries += 1
    const userSeries = new Set(mine.map((p) => p.series_id).filter(Boolean) as string[])
    for (const sid of Array.from(userSeries)) row.seriesCounts.set(sid, (row.seriesCounts.get(sid) || 0) + 1)
  }

  const out: AdRow[] = []
  for (const row of Array.from(rows.values())) {
    let best: string | null = null
    let bestN = 0
    for (const [sid, n] of Array.from(row.seriesCounts.entries())) {
      if (n > bestN) { best = sid; bestN = n }
    }
    const { seriesCounts, ...rest } = row
    void seriesCounts
    out.push({ ...rest, topSeries: best ? (seriesTitles[best] || best) : null })
  }
  // Ads first (most signups first), the untagged group last.
  return out.sort((a, b) => (a.key === NO_TAG ? 1 : b.key === NO_TAG ? -1 : b.signups - a.signups))
}

export function rate(n: number, d: number): number | null {
  return d > 0 ? n / d : null
}

/** Server side: read the ad tags a signup form sent (short strings only). */
export function adTagFields(body: unknown): { utmMedium: string | null; utmTerm: string | null; utmContent: string | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const short = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().length <= 200 ? v.trim() : null)
  return { utmMedium: short(b.utmMedium), utmTerm: short(b.utmTerm), utmContent: short(b.utmContent) }
}
