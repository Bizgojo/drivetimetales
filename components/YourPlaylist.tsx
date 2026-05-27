'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ACTIVE_PLAYLIST_KEY, PLAYLIST_UPDATED_FLAG, clearActivePlaylist } from '@/lib/playlistState'

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
  const [showUpdated, setShowUpdated] = useState(false)

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
        clearActivePlaylist()
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
    try {
      if (sessionStorage.getItem(PLAYLIST_UPDATED_FLAG) === 'true') {
        sessionStorage.removeItem(PLAYLIST_UPDATED_FLAG)
        setShowUpdated(true)
        window.setTimeout(() => setShowUpdated(false), 1100)
      }
    } catch {}

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

  function clear() {
    clearActivePlaylist()
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: 0 }}>Your Playlist</h2>
        {showUpdated && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: '#fed7aa',
              background: 'rgba(249,115,22,0.12)',
              border: '1px solid rgba(251,146,60,0.28)',
              borderRadius: 999,
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1,
              pointerEvents: 'none',
              animation: 'playlistUpdated 1.05s ease-out forwards',
            }}
          >
            <span style={{ display: 'inline-block', animation: 'tinyClap 0.36s ease-out 2' }}>👏</span>
            ✓ Playlist Updated
          </span>
        )}
      </div>
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
      <style>{`
        @keyframes playlistUpdated {
          0% { opacity: 0; transform: translateY(3px) scale(0.98); }
          15% { opacity: 1; transform: translateY(0) scale(1); }
          78% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-2px) scale(0.99); }
        }
        @keyframes tinyClap {
          0%, 100% { transform: rotate(0deg) scale(1); }
          45% { transform: rotate(-8deg) scale(1.08); }
          70% { transform: rotate(6deg) scale(1.02); }
        }
      `}</style>
    </section>
  )
}
