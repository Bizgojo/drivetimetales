'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PlaylistEntry {
  id: string
  title: string
  author?: string
  duration_mins?: number
  cover_url?: string | null
  series_name?: string | null
}

interface SavedPlaylist {
  id: string
  stories: PlaylistEntry[]
  remaining_mins: number
  last_played?: string
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
      const stories = Array.isArray(parsed) ? parsed : (parsed.stories || [])
      if (stories.length === 0) return
      setPlaylist(Array.isArray(parsed) ? { id: 'legacy', stories: parsed, remaining_mins: 0 } : parsed)
    } catch {}
  }, [])

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setPlaylist(null)
  }

  if (!playlist || playlist.stories.length === 0) return null

  const stories = playlist.stories
  const totalMins = playlist.remaining_mins || stories.reduce((s, x) => s + (x.duration_mins || 0), 0)

  return (
    <section style={{ padding: '1.5rem 1rem 0' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          YOUR PLAYLIST
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
            {stories.length} {stories.length === 1 ? 'story' : 'stories'} · {Math.round(totalMins)} min
          </span>
          <button
            onClick={() => router.push('/library-playlist')}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: 600, padding: '3px 8px', cursor: 'pointer' }}
          >
            Edit
          </button>
          <button
            onClick={clear}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Story covers strip */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
        {stories.slice(0, 8).map((s, i) => (
          <div key={s.id + i} style={{ flexShrink: 0, width: '56px' }}>
            {s.cover_url
              ? <img src={s.cover_url} alt={s.title} style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: 'linear-gradient(135deg,#1e293b,#334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎧</div>
            }
          </div>
        ))}
        {stories.length > 8 && (
          <div style={{ flexShrink: 0, width: '56px', height: '56px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700 }}>
            +{stories.length - 8}
          </div>
        )}
      </div>

      {/* First story label */}
      <div style={{ marginTop: '8px', marginBottom: '12px' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Up first: </span>
        <span style={{ color: 'white', fontSize: '12px', fontWeight: 600 }}>{stories[0]?.title}</span>
      </div>

      {/* Play button */}
      <button
        onClick={() => router.push('/player/playlist')}
        style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#f97316', color: 'white', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        ▶ Play Playlist
      </button>
    </section>
  )
}
