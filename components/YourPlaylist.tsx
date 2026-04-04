'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PlaylistEntry {
  id: string
  title: string
  duration_mins?: number
}

interface SavedPlaylist {
  id: string
  stories: PlaylistEntry[]
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
      const stories = Array.isArray(parsed) ? parsed : (parsed.stories || [])
      if (stories.length === 0) return
      setPlaylist(Array.isArray(parsed)
        ? { id: 'legacy', stories: parsed, remaining_mins: parsed.reduce((s: number, x: any) => s + (x.duration_mins || 0), 0), completed: 0 }
        : parsed)
    } catch {}
  }, [])

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setPlaylist(null)
  }

  if (!playlist || playlist.stories.length === 0) return null

  const stories = playlist.stories
  const completed = playlist.completed || 0
  const remaining = stories.length - completed
  const totalMins = Math.round(playlist.remaining_mins || stories.reduce((s, x) => s + (x.duration_mins || 0), 0))
  const nextTitles = stories.slice(completed, completed + 3).map(s => s.title)

  return (
    <section style={{ padding: '1rem 1rem 0' }}>
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
        <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, background: 'linear-gradient(135deg, #1e3a5f, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
          🎧
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '9px 36px 9px 9px', minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f97316', marginBottom: 2 }}>Your Playlist</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'white', lineHeight: 1.2, marginBottom: 2 }}>
            {remaining} {remaining === 1 ? 'Story' : 'Stories'} · {totalMins} min remaining
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
          style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}
        >
          ✕
        </button>
      </div>
    </section>
  )
}
