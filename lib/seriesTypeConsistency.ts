/**
 * SERIES-TYPE-CONSISTENCY-001 (Independent Recovery, 2026-10-26)
 *
 * Creek series 79ffa422: EP1 story_type='series_episode', EP2/EP3 'single'.
 * dispatch-queue then:
 *   - series path: counted only series_episode rows (1 of 3) -> skipped
 *     "series_not_fully_written" every cycle, with no durable record;
 *   - standalone path: excluded EP1, but dispatched EP2/EP3 as STANDALONE jobs
 *     (no series character guide, wrong Belle framing, no series gates).
 * Mixed typing must stop dispatch loudly (needs_attention) instead.
 */

export type SeriesTypeRow = {
  id: string
  story_type: string | null
  workflow_state: string | null
  series_id?: string | null
  series_total_episodes?: number | null
}

/** Rows in a series (cold_storage excluded) whose story_type is not series_episode. */
export function mistypedSeriesRows(rows: SeriesTypeRow[]): SeriesTypeRow[] {
  return rows.filter(
    (row) =>
      String(row.workflow_state || '').trim() !== 'cold_storage' &&
      String(row.story_type || '').trim() !== 'series_episode',
  )
}

/** A standalone-typed row that actually belongs to a multi-episode series. */
export function isSeriesMemberTypedStandalone(row: SeriesTypeRow): boolean {
  const type = String(row.story_type || '').trim()
  return (type === 'single' || type === 'standalone') && !!row.series_id && Number(row.series_total_episodes || 0) > 1
}

export function seriesTypeMismatchReason(seriesId: string, mistyped: SeriesTypeRow[]): string {
  const list = mistyped.map((row) => `${row.id.slice(0, 8)}=${row.story_type || 'null'}`).join(', ')
  return `SERIES-TYPE-CONSISTENCY-001: series ${seriesId} has episodes not typed series_episode (${list}). Dispatch blocked — mixed typing strands episodes or produces series episodes as standalones. Fix story_type on every episode, then clear needs_attention.`
}
