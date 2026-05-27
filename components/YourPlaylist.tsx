'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PlaylistItem {
  type: 'single' | 'series'
  id?: string
  title?: string
  duration_mins?: number
  series_name?: string
  total_mins?: number
  episode_count?: number
  cover_url?: string | null
}
interface SavedPlaylist {
  id: string
  items?: PlaylistItem[]
  stories?: PlaylistItem[]
  remaining_mins: number
  completed?: number
}

const STORAGE_KEY = 'dtt_active_playlist'

function formatRemainingMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m remaining`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m remaining` : `${hours}h remaining`
}

function playlistStoryIds(items: PlaylistItem[]) {
  return items.flatMap((item: any) => {
    if (item.type === 'series' && Array.isArray(item.episodes)) {
      return item.episodes.map((episode: any) => episode?.id).filter(Boolean)
    }
    return item.id ? [item.id] : []
  })
}

export default function YourPlaylist({ onIdsLoaded }: { onIdsLoaded?: (ids: string[]) => void } = {}) {
  const router = useRouter()
  const [playlist, setPlaylist] = useState<SavedPlaylist | null>(null)

  function loadPlaylist() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
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
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem('dtt_playlist_index')
        setPlaylist(null)
        onIdsLoaded?.([])
        return
      }
      setPlaylist({
        id: parsed.id || 'legacy',
        items,
        remaining_mins: parsed.remaining_mins || items.reduce((s: number, x: any) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0),
        completed
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
      if (event.key === STORAGE_KEY) loadPlaylist()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadPlaylist()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('et_playlist_saved', handlePlaylistSaved)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('et_playlist_saved', handlePlaylistSaved)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setPlaylist(null)
    onIdsLoaded?.([])
  }

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
  const nextTitles = items.slice(completed, completed + 3).map(s => s.type === 'series' ? (s.series_name || 'Series') : (s.title || ''))

  return (
    <section style={{ padding: '1.5rem 1rem 0' }}>
      <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Your Playlist</h2>
      <div
        onClick={() => router.push('/player/playlist?autoplay=1&playlist=1')}
        style={{
          background: '#1e293b',
          borderRadius: '13px',
          border: '1px solid rgba(148,163,184,0.06)',
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          alignItems: 'flex-start',
        }}
      >
        {/* Playlist icon */}
        <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/images/playlist_icon.png" alt="Playlist" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '9px 36px 9px 9px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'white', lineHeight: 1.2, marginBottom: 2 }}>
            {remaining} {remaining === 1 ? 'Item' : 'Items'} · {formatRemainingMinutes(totalMins)}
          </div>
          {completed > 0 && (
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
              {completed} of {items.length} completed
            </div>
          )}
          <div style={{ overflow: 'hidden', maxHeight: 36 }}>
            {nextTitles.map((title, i) => (
              <div key={i} style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
                {i === 0 ? '▶ ' : '· '}{title}
              </div>
            ))}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={e => { e.stopPropagation(); clear() }}
          style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >x</button>
      </div>
    </section>
  )
}
