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

export default function YourPlaylist() {
  const router = useRouter()
  const [playlist, setPlaylist] = useState<SavedPlaylist | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      // Support new format (items) and legacy format (stories/array)
      const items: PlaylistItem[] = parsed.items
        ? parsed.items
        : Array.isArray(parsed)
          ? parsed.map((s: any) => ({ type: 'single', ...s }))
          : (parsed.stories || []).map((s: any) => ({ type: s.type || 'single', ...s }))
      if (items.length === 0) return
      setPlaylist({
        id: parsed.id || 'legacy',
        items,
        remaining_mins: parsed.remaining_mins || items.reduce((s: number, x: any) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0),
        completed: parsed.completed || 0
      })
    } catch {}
  }, [])

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setPlaylist(null)
  }

  if (!playlist || !playlist.items || playlist.items.length === 0) return null

  const items = playlist.items
  const completed = playlist.completed || 0
  const remaining = items.length - completed
  const totalMins = Math.round(playlist.remaining_mins || stories.reduce((s, x) => s + (x.duration_mins || 0), 0))
  const nextTitles = items.slice(completed, completed + 3).map(s => s.type === 'series' ? (s.series_name || 'Series') : (s.title || ''))

  return (
    <section style={{ padding: '1.5rem 1rem 0' }}>
      <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Your Playlist</h2>
      <div
        onClick={() => router.push('/player/playlist')}
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
            {remaining} {remaining === 1 ? 'Item' : 'Items'} · {totalMins} min remaining
          </div>
          {completed > 0 && (
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
              {completed} of {stories.length} completed
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
