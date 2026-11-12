/**
 * PLAY-EVENTS-SERIES-001 (Orion read-only audit, Nov 12, 2026): play_events has series_id and
 * episode_id columns, but 0 of 1,127 rows had them set. The start route received seriesId and
 * episodeNumber from the player and sent them to Meta, but never saved them. Without them,
 * "finished the series" and "started a different series" cannot be measured.
 *
 * The server now fills both from the stories table (never from the client): a series episode is
 * its own story row, so episode_id = story_id and series_id = stories.series_id. A standalone
 * story gets nulls. A lookup error never blocks recording the play.
 */

export type PlaySeriesFields = { series_id: string | null; episode_id: string | null }

export function seriesFieldsFromStory(
  storyId: string,
  story: { series_id?: unknown } | null | undefined,
): PlaySeriesFields {
  const seriesId = typeof story?.series_id === 'string' && story.series_id.trim() ? story.series_id.trim() : null
  return seriesId ? { series_id: seriesId, episode_id: storyId } : { series_id: null, episode_id: null }
}

type StoryLookupDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => PromiseLike<{ data: { series_id?: unknown } | null; error?: { message: string } | null }>
      }
    }
  }
}

export async function lookupPlaySeriesFields(db: StoryLookupDb, storyId: string): Promise<PlaySeriesFields> {
  try {
    const { data, error } = await db.from('stories').select('series_id').eq('id', storyId).maybeSingle()
    if (error) {
      console.warn('[analytics/play-event] series lookup failed:', error.message)
      return { series_id: null, episode_id: null }
    }
    return seriesFieldsFromStory(storyId, data)
  } catch (e) {
    console.warn('[analytics/play-event] series lookup threw:', e instanceof Error ? e.message : String(e))
    return { series_id: null, episode_id: null }
  }
}
