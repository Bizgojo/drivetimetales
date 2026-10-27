'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useOpenPlayer } from '@/components/player/PersistentPlayer'
import { ACTIVE_PLAYLIST_KEY, PLAYLIST_INDEX_KEY } from '@/lib/playlistState'

interface PlaylistItem {
  type: 'single' | 'series'
  id?: string
  title?: string
  duration_mins?: number
  series_name?: string
  total_mins?: number
  episode_count?: number
  episodes?: Array<{ id: string }>
  cover_url?: string | null
}
interface SavedPlaylist {
  id: string
  items?: PlaylistItem[]
  stories?: PlaylistItem[]
  remaining_mins: number
  completed?: number
  started?: boolean
}

function formatRemainingMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`
}

function playlistStoryIds(items: PlaylistItem[]) {
  return items.flatMap((item: any) => {
    if (item.type === 'series' && Array.isArray(item.episodes)) {
      return item.episodes.map((episode: any) => episode?.id).filter(Boolean)
    }
    return item.id ? [item.id] : []
  })
}

export default function YourPlaylist({ onIdsLoaded, sticky = false }: { onIdsLoaded?: (ids: string[]) => void; sticky?: boolean } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const openPlayer = useOpenPlayer()
  const [playlist, setPlaylist] = useState<SavedPlaylist | null>(null)

  function loadPlaylist() {
    try {
      const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
      if (!raw) {
        setPlaylist(null)
        onIdsLoaded?.([])
        return
      }
      const parsed = JSON.parse(raw)
      // Support new format (items) and legacy format (stories/array)
      const items: PlaylistItem[] = parsed.items
        ? parsed.items
        : Array.isArray(parsed)
          ? parsed.map((s: any) => ({ type: 'single', ...s }))
          : (parsed.stories || []).map((s: any) => ({ type: s.type || 'single', ...s }))
      const completed = Number(parsed.completed || 0)
      if (items.length === 0 || completed >= items.length) {
        setPlaylist(null)
        onIdsLoaded?.([])
        return
      }
      setPlaylist({
        id: parsed.id || 'legacy',
        items,
        remaining_mins: parsed.remaining_mins || items.reduce((s: number, x: any) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0),
        completed,
        started: Boolean(parsed.started)
      })
      onIdsLoaded?.(playlistStoryIds(items))
    } catch (err) {
      console.error('[YourPlaylist] failed to load saved playlist:', err)
      setPlaylist(null)
      onIdsLoaded?.([])
    }
  }

  useEffect(() => {
    loadPlaylist()


    const handleFocus = () => loadPlaylist()
    const handlePlaylistSaved = () => loadPlaylist()
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_PLAYLIST_KEY || event.key === null) loadPlaylist()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadPlaylist()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('et_playlist_saved', handlePlaylistSaved)
    window.addEventListener('et_playlist_cleared', handlePlaylistSaved)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('et_playlist_saved', handlePlaylistSaved)
      window.removeEventListener('et_playlist_cleared', handlePlaylistSaved)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  if (sticky && pathname !== '/library' && pathname !== '/library-new') return null
  if (!playlist || !playlist.items || playlist.items.length === 0) return null

  const items = playlist.items
  const completed = playlist.completed || 0
  const remaining = items.length - completed
  const calculatedMins = items.reduce((sum, item) => {
    return sum + (item.type === 'series' ? (item.total_mins || 0) : (item.duration_mins || 0))
  }, 0)
  const totalMins = Math.round(
    Number.isFinite(playlist.remaining_mins) && playlist.remaining_mins > 0
      ? playlist.remaining_mins
      : calculatedMins
  )

  function play() {
    const ids = playlistStoryIds(items)
    const savedIndex = Number.parseInt(localStorage.getItem(PLAYLIST_INDEX_KEY) || '0', 10)
    const storyId = ids[Number.isFinite(savedIndex) && savedIndex >= 0 ? savedIndex : 0] || ids[0]
    if (storyId && openPlayer) openPlayer(`/player/${storyId}?autoplay=1&playNow=1&playlist=1`)
    else router.push('/player/playlist?autoplay=1&playlist=1')
  }

  return (
    <section aria-label={sticky ? 'Playlist controls' : 'My Playlist'} style={sticky
      ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 46, padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', background: '#020617' }
      : { padding: '1.5rem 1rem 0' }}>
      <div
        style={{
          background: '#1e293b',
          borderRadius: '13px',
          border: '1px solid rgba(148,163,184,0.06)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10 }}>
          <img src="/images/playlist_icon.png" alt="" width={84} height={84} style={{ width: 84, height: 84, flexShrink: 0, objectFit: 'cover', borderRadius: 7, background: 'white' }} />
          <div style={{ flex: 1, minWidth: 0, minHeight: 84, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontWeight: 800, fontSize: 22, color: 'white', lineHeight: '24px', margin: 0 }}>My Playlist</h2>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#cbd5e1', lineHeight: '16px' }}>
              {remaining} {remaining === 1 ? 'Story' : 'Stories'} · {formatRemainingMinutes(totalMins)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
              <button type="button" onClick={play}
                style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '8px 4px', background: playlist.started ? '#22c55e' : '#f97316', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                ▶ {playlist.started ? 'Continue' : 'Play'}
              </button>
              <button type="button" onClick={() => window.location.assign('/playlist')}
                style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '8px 4px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                My Downloads
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
