/** Display and intent rules shared by the real player and its transport UI. */
export function formatPlaybackTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function shouldAutoStartPlayer(search: string): boolean {
  const params = new URLSearchParams(search)
  // A player visit is listening intent; reading, approval and onboarding are not.
  return params.get('autoplay') !== '0'
    && params.get('openReader') !== '1'
    && params.get('approvalReview') !== '1'
    && params.get('onboard') !== '1'
}

export interface PlayerGenreFields {
  genre?: unknown
  primary_genre?: unknown
  genre_secondary?: unknown
  genre_third?: unknown
  sub_genres?: unknown
}

export function getPlayerGenres(story: PlayerGenreFields | null | undefined): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  const add = (input: unknown) => {
    if (Array.isArray(input)) { input.forEach(add); return }
    if (typeof input !== 'string') return
    // Preserve compound genre names (e.g. Romantic Suspense); split explicit lists only.
    for (const part of input.split(/[,;|·]/)) {
      const label = part.trim()
      const key = label.toLocaleLowerCase('en-US')
      if (!label || seen.has(key)) continue
      seen.add(key)
      labels.push(label)
    }
  }
  add(story?.genre)
  add(story?.primary_genre)
  add(story?.genre_secondary)
  add(story?.genre_third)
  add(story?.sub_genres)
  return labels
}

export interface EpisodeLineFields {
  title?: unknown
  episode_title?: unknown
  episode_number?: unknown
  series_episode_number?: unknown
}

/**
 * PLAYER-COMPACT-001 (Marc, 2026-11-06): one line under the series title,
 * "Episode 2 - The Seventh Token". The episode title comes from episode_title,
 * else from the story title with any "<series> — Episode N:" prefix removed.
 * Returns null for standalone stories (no episode number).
 */
export function getEpisodeLine(story: EpisodeLineFields | null | undefined, seriesTitle: string): string | null {
  const num = Number(story?.series_episode_number ?? story?.episode_number)
  if (!Number.isFinite(num) || num <= 0) return null
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  let epTitle = clean(story?.episode_title)
  if (!epTitle) {
    epTitle = clean(story?.title)
    const m = epTitle.match(/episode\s+\d+\s*[:\-–—]\s*(.+)$/i)
    if (m) epTitle = m[1].trim()
    else if (/episode\s+\d+\s*$/i.test(epTitle)) epTitle = ''
  }
  const series = clean(seriesTitle)
  if (series && epTitle.toLocaleLowerCase('en-US') === series.toLocaleLowerCase('en-US')) epTitle = ''
  return epTitle ? `Episode ${num} - ${epTitle}` : `Episode ${num}`
}

/** A saved global position cannot be mapped safely from partial segment durations. */
export function waitForSegmentResume(segmented: boolean, pendingSeconds: number, completeDurations: boolean): boolean {
  return segmented && Number.isFinite(pendingSeconds) && pendingSeconds > 0 && !completeDurations
}

/** Hide only the currently represented story/series card, without changing saved progress. */
export function isActiveLibraryCard(item: { story?: { id: string }; episodePlaylist?: Array<{ id: string }> }, activeStoryId: string | null): boolean {
  return Boolean(activeStoryId && (item.story?.id === activeStoryId || item.episodePlaylist?.some(ep => ep.id === activeStoryId)))
}
