/**
 * FIRST-PLAYED-NAME-OPENER — series name-opener rule (listener history check).
 *
 * Series episodes play the personalized name opener ONLY on the listener's
 * FIRST played episode of the series (any episode number). Every later play
 * in the series uses the normal Belle intro (the baked final mix).
 * Standalone stories are untouched by this rule.
 *
 * History source is the EXISTING play_events table (user_id + story_id,
 * supabase/migrations/20260527000_create_play_events.sql) joined against the
 * series' episode ids from the EXISTING stories.series_id column — no schema
 * change, no migration.
 *
 * Safe failure mode: on lookup failure this returns false ("no prior play")
 * so the opener still plays. This matches the safe default of the
 * bell-invitation gate in app/api/asc3/story-playlist/route.ts (a transient
 * DB error must not silently strip the first-play greeting; worst case is a
 * repeated opener, which user_opener_history already rotates).
 */

type HistoryClient = {
  from: (table: string) => any
}

/** Every episode id in a series (stories.series_id is authoritative). */
export async function seriesEpisodeIds(
  client: HistoryClient,
  seriesId: string
): Promise<string[]> {
  const { data, error } = await client
    .from('stories')
    .select('id')
    .eq('series_id', seriesId)
  if (error) throw new Error('series episode lookup failed: ' + error.message)
  return ((data || []) as Array<{ id?: unknown }>)
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean)
}

/**
 * True when the listener already has at least one play_events row for ANY
 * episode of the series (the current request resolves the playlist before
 * playback starts, so the in-progress play is never counted yet — a count
 * above zero always means a genuinely earlier play).
 */
export async function hasPriorSeriesPlay(
  client: HistoryClient,
  userId: string,
  seriesId: string
): Promise<boolean> {
  try {
    const episodeIds = await seriesEpisodeIds(client, seriesId)
    if (!episodeIds.length) return false
    const { count, error } = await client
      .from('play_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('story_id', episodeIds)
      .limit(1)
    if (error) throw new Error('series play-history count failed: ' + error.message)
    return (count ?? 0) > 0
  } catch (err) {
    console.warn(
      '[story-playlist] series prior-play lookup failed; defaulting to first-play (opener plays):',
      err instanceof Error ? err.message : String(err)
    )
    return false
  }
}
