'use client'

export const ACTIVE_PLAYLIST_KEY = 'dtt_active_playlist'
export const LEGACY_PLAYLIST_KEY = 'dtt_playlist'
export const PLAYLIST_INDEX_KEY = 'dtt_playlist_index'
export const LIBRARY_PLAYLIST_KEY = 'et_current_playlist'
export const LIBRARY_SAVED_PLAYLIST_KEY = 'et_saved_playlist'
export const OFFLINE_READY_KEY = 'dtt_offline_ready'
export const PLAYLIST_UPDATED_FLAG = 'dtt_playlist_just_updated'

const PLAYLIST_EVENT_SAVED = 'et_playlist_saved'
const PLAYLIST_EVENT_CLEARED = 'et_playlist_cleared'

function emitPlaylistEvent(name: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(name))
}

function selectionKeysFromActivePlaylist(activePlaylist: any) {
  const items = activePlaylist?.items || activePlaylist?.stories || []
  if (!Array.isArray(items)) return []
  return items
    .map((item: any) => {
      if (item?.type === 'series') {
        const seriesId = item.series_id || item.id
        return seriesId ? `series-${seriesId}` : null
      }
      return item?.id ? `single-${item.id}` : null
    })
    .filter((key: string | null): key is string => Boolean(key))
}

export function saveActivePlaylist(activePlaylist: unknown, librarySelectionKeys?: string[]) {
  if (typeof window === 'undefined') return
  const selectionKeys = librarySelectionKeys || selectionKeysFromActivePlaylist(activePlaylist)
  localStorage.setItem(ACTIVE_PLAYLIST_KEY, JSON.stringify(activePlaylist))
  localStorage.setItem(LIBRARY_PLAYLIST_KEY, JSON.stringify(selectionKeys))
  localStorage.setItem(LIBRARY_SAVED_PLAYLIST_KEY, JSON.stringify(selectionKeys))
  sessionStorage.setItem(PLAYLIST_UPDATED_FLAG, 'true')
  localStorage.removeItem(LEGACY_PLAYLIST_KEY)
  localStorage.removeItem(PLAYLIST_INDEX_KEY)
  emitPlaylistEvent(PLAYLIST_EVENT_SAVED)
}

export function clearActivePlaylist() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_PLAYLIST_KEY)
  localStorage.removeItem(LEGACY_PLAYLIST_KEY)
  localStorage.removeItem(PLAYLIST_INDEX_KEY)
  localStorage.removeItem(LIBRARY_PLAYLIST_KEY)
  localStorage.removeItem(LIBRARY_SAVED_PLAYLIST_KEY)
  localStorage.removeItem(OFFLINE_READY_KEY)
  emitPlaylistEvent(PLAYLIST_EVENT_CLEARED)
  emitPlaylistEvent(PLAYLIST_EVENT_SAVED)
}

// QUEUE-OFFLINE-001 (Marc, 2026-10-04): a lightweight "has the user started
// this playlist" flag. The old `completed` counter on the saved blob is never
// incremented anywhere, so the Play/Continue button on the Your Playlist card
// needs its own signal — set once playback begins in playlist mode.
export function markPlaylistStarted() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed?.started) return
    parsed.started = true
    localStorage.setItem(ACTIVE_PLAYLIST_KEY, JSON.stringify(parsed))
    emitPlaylistEvent(PLAYLIST_EVENT_SAVED)
  } catch {}
}

// QUEUE-OFFLINE-001 (Marc, 2026-10-04): once an episode finishes playing (or
// is explicitly removed), it comes off the playlist entirely — for a single
// story that's the whole item; for a series it's just that one episode
// (removing the whole series item once its last episode is gone). Keeps the
// per-user library selection-key list in sync the same way app/playlist/page.tsx
// does, so Library/Recommended For You don't resurrect it (see UX-PLAYLIST-002).
export function removeEpisodeFromActivePlaylist(episodeId: string, userId?: string | null) {
  if (typeof window === 'undefined' || !episodeId) return
  try {
    const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const items: any[] = parsed?.items || parsed?.stories || []
    if (!Array.isArray(items) || items.length === 0) return

    let changed = false
    const nextItems = items
      .map((item: any) => {
        if (item?.type === 'series' && Array.isArray(item.episodes)) {
          if (!item.episodes.some((ep: any) => ep?.id === episodeId)) return item
          changed = true
          const remainingEpisodes = item.episodes.filter((ep: any) => ep?.id !== episodeId)
          if (remainingEpisodes.length === 0) return null
          const prevCount = item.episode_count || item.episodes.length || 1
          const avgMins = (item.total_mins || item.duration_mins || 0) / prevCount
          return {
            ...item,
            episodes: remainingEpisodes,
            episode_count: remainingEpisodes.length,
            total_mins: Math.round(avgMins * remainingEpisodes.length),
            duration_mins: Math.round(avgMins * remainingEpisodes.length),
          }
        }
        if (item?.id === episodeId) {
          changed = true
          return null
        }
        return item
      })
      .filter((item): item is any => item !== null)

    if (!changed) return

    if (nextItems.length === 0) {
      clearActivePlaylist()
      return
    }

    const nextMins = nextItems.reduce(
      (s: number, x: any) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)),
      0
    )
    const nextParsed = { ...parsed, items: nextItems, remaining_mins: nextMins }
    const nextKeys = selectionKeysFromActivePlaylist(nextParsed)
    localStorage.setItem(ACTIVE_PLAYLIST_KEY, JSON.stringify(nextParsed))
    localStorage.setItem(LIBRARY_PLAYLIST_KEY, JSON.stringify(nextKeys))
    localStorage.setItem(LIBRARY_SAVED_PLAYLIST_KEY, JSON.stringify(nextKeys))
    if (userId) {
      try {
        localStorage.setItem(`et_current_playlist_${userId}`, JSON.stringify(nextKeys))
      } catch {}
    }
    emitPlaylistEvent(PLAYLIST_EVENT_SAVED)
  } catch (err) {
    console.error('[playlistState] removeEpisodeFromActivePlaylist failed:', err)
  }
}
