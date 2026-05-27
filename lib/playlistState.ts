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
