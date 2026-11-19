/**
 * POST-CHECKOUT-DESTINATION-002 (Marc, 2026-11-19)
 *
 * Find a series' episode 1 — the story row a listener should actually open.
 *
 * Why this exists: `UTM_CAMPAIGN_TO_SERIES` maps an ad campaign to a SERIES id.
 * The first cut pushed `/player/<series-id>`, which is not an episode. The
 * player mounted with nothing to play: Marc heard Belle say "now back to your
 * story" on the 2026-11-19 phone test and then silence.
 *
 * What it looks up, and why in this order:
 *
 *   1. `episode_number = 1` — the real ordering column. `series_number` is NULL
 *      on every episode of every live series (verified 2026-11-19), so any
 *      query keyed on it returns nothing.
 *   2. Fall back to the lowest `episode_number` if no row has exactly 1. A
 *      series with odd numbering should still open at its beginning rather
 *      than at a broken player.
 *
 * Filtered to published, non-hidden stories so an unpublished episode 1 can
 * never be the destination (canon 09: no ad traffic to a story that is not
 * live). Returns null when the series has nothing playable — the caller then
 * goes to /home rather than to an empty player.
 */

export interface EpisodeOneLookupRow {
  id: string
  episode_number?: number | null
}

export interface EpisodeOneQueryable {
  from: (table: string) => any
}

/**
 * Pure selection: given rows for one series, pick episode 1 (or the lowest
 * numbered episode if there is no episode 1).
 */
export function pickEpisodeOne(rows: EpisodeOneLookupRow[] | null | undefined): string | null {
  if (!rows || rows.length === 0) return null
  const numbered = rows.filter(
    (r) => r && typeof r.id === 'string' && Number.isFinite(Number(r.episode_number))
  ) as Array<{ id: string; episode_number: number }>

  const exact = numbered.find((r) => Number(r.episode_number) === 1)
  if (exact) return exact.id

  if (numbered.length === 0) {
    // No usable numbering at all: if the series has exactly one row, that is
    // unambiguously its first episode. More than one and we cannot tell —
    // return null rather than guess a start point.
    return rows.length === 1 && typeof rows[0]?.id === 'string' ? rows[0].id : null
  }

  numbered.sort((a, b) => Number(a.episode_number) - Number(b.episode_number))
  return numbered[0].id
}

/**
 * Look up a series' episode 1 in Supabase. Browser/server safe; swallows
 * errors and returns null so a lookup failure degrades to /home, never to a
 * broken player.
 */
export async function resolveSeriesEpisodeOne(
  seriesId: string | null | undefined,
  client: EpisodeOneQueryable,
  opts?: { log?: (msg: string, detail?: unknown) => void }
): Promise<string | null> {
  if (!seriesId) return null
  try {
    const { data, error } = await client
      .from('stories')
      .select('id, episode_number')
      .eq('series_id', seriesId)
      .eq('status', 'published')
      .eq('is_hidden', false)

    if (error) {
      opts?.log?.('resolveSeriesEpisodeOne: query failed', error)
      return null
    }
    return pickEpisodeOne(data as EpisodeOneLookupRow[])
  } catch (err) {
    opts?.log?.('resolveSeriesEpisodeOne: threw', err)
    return null
  }
}
