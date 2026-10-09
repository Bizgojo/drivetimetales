/**
 * COVER-PIPELINE-DECOUPLE-001 — cover_post_publish_update (Task 8)
 *
 * Late-arriving covers update, without ever blocking assembly:
 *   1. episode metadata  (stories.cover_url for the episode)
 *   2. series metadata   (series cover reference)
 *   3. announcement art  (announcement creative)
 *   4. series card re-render (derived card compositing series + episode art)
 *
 * Pure builder + injectable applier: no DB/storage/network here, so tests
 * run with mocks and production wiring injects real persistence explicitly.
 */

export interface LateCoverInput {
  storyId: string
  seriesId?: string | null
  episodeNumber?: number | null
  /** The late-arriving episode/series cover URL. */
  coverUrl: string
  /** Optional late-arriving announcement art URL. */
  announcementArtUrl?: string | null
  /** Optional pre-rendered series card URL (when card was composited elsewhere). */
  seriesCardUrl?: string | null
}

export interface CoverPostPublishUpdate {
  storyId: string
  seriesId: string | null
  episodeNumber: number | null
  updateEpisodeMetadata: { storyId: string; cover_url: string }
  updateSeriesMetadata: { seriesId: string; cover_url: string } | null
  updateAnnouncementArt: { storyId: string; announcement_art_url: string } | null
  rerenderSeriesCard: { seriesId: string; reason: string } | null
  /** Pre-rendered card URL to persist when compositing happened upstream. */
  seriesCardUrl: string | null
  at: string
}

/** Build the late-cover update payload (pure — no side effects). */
export function buildCoverPostPublishUpdate(input: LateCoverInput): CoverPostPublishUpdate {
  const coverUrl = String(input.coverUrl || '').trim()
  if (!input.storyId || !coverUrl) {
    throw new Error('buildCoverPostPublishUpdate requires storyId and a non-empty coverUrl')
  }
  const seriesId = input.seriesId ? String(input.seriesId) : null
  return {
    storyId: String(input.storyId),
    seriesId,
    episodeNumber: input.episodeNumber ?? null,
    updateEpisodeMetadata: { storyId: String(input.storyId), cover_url: coverUrl },
    updateSeriesMetadata: seriesId ? { seriesId, cover_url: coverUrl } : null,
    updateAnnouncementArt: input.announcementArtUrl
      ? { storyId: String(input.storyId), announcement_art_url: String(input.announcementArtUrl) }
      : null,
    rerenderSeriesCard: seriesId
      ? { seriesId, reason: 'late-arriving cover — recomposite series card' }
      : null,
    seriesCardUrl: input.seriesCardUrl ? String(input.seriesCardUrl) : null,
    at: new Date().toISOString(),
  }
}

export interface CoverPostPublishPersistence {
  updateStory: (storyId: string, fields: Record<string, string>) => void | Promise<void>
  updateSeries: (seriesId: string, fields: Record<string, string>) => void | Promise<void>
  /** Re-render/persist the series card; receives the seriesCardUrl when pre-rendered. */
  rerenderSeriesCard: (seriesId: string, seriesCardUrl: string | null) => void | Promise<void>
}

export interface AppliedCoverPostPublishUpdate extends CoverPostPublishUpdate {
  applied: { episode: boolean; series: boolean; announcementArt: boolean; seriesCard: boolean }
}

/**
 * Apply a late-cover update through injected persistence.
 * Per-target results (never throws — a failed target is reported, assembly
 * and publish state are never rolled back over a late cover).
 */
export async function applyCoverPostPublishUpdate(
  update: CoverPostPublishUpdate,
  persist: CoverPostPublishPersistence,
): Promise<AppliedCoverPostPublishUpdate> {
  const applied = { episode: false, series: false, announcementArt: false, seriesCard: false }
  try {
    await persist.updateStory(update.updateEpisodeMetadata.storyId, { cover_url: update.updateEpisodeMetadata.cover_url })
    applied.episode = true
  } catch (err) {
    console.warn('[cover_post_publish_update] episode metadata update failed (non-blocking):', err instanceof Error ? err.message : String(err))
  }
  if (update.updateSeriesMetadata) {
    try {
      await persist.updateSeries(update.updateSeriesMetadata.seriesId, { cover_url: update.updateSeriesMetadata.cover_url })
      applied.series = true
    } catch (err) {
      console.warn('[cover_post_publish_update] series metadata update failed (non-blocking):', err instanceof Error ? err.message : String(err))
    }
  }
  if (update.updateAnnouncementArt) {
    try {
      await persist.updateStory(update.updateAnnouncementArt.storyId, { announcement_art_url: update.updateAnnouncementArt.announcement_art_url })
      applied.announcementArt = true
    } catch (err) {
      console.warn('[cover_post_publish_update] announcement art update failed (non-blocking):', err instanceof Error ? err.message : String(err))
    }
  }
  if (update.rerenderSeriesCard) {
    try {
      await persist.rerenderSeriesCard(update.rerenderSeriesCard.seriesId, update.seriesCardUrl)
      applied.seriesCard = true
    } catch (err) {
      console.warn('[cover_post_publish_update] series card re-render failed (non-blocking):', err instanceof Error ? err.message : String(err))
    }
  }
  return { ...update, applied }
}
