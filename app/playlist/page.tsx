'use client'

// QUEUE-OFFLINE-001 (Marc, 2026-10-04): "My Downloads" destination from the
// Your Playlist card on /home — status line plus the queued list, with the
// ability to remove a story or reorder the queue. A finished episode still
// removes itself automatically (see removeEpisodeFromActivePlaylist in
// lib/playlistState.ts) — this page is for the person's own changes.

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ACTIVE_PLAYLIST_KEY, LIBRARY_PLAYLIST_KEY, clearActivePlaylist, saveActivePlaylist } from '@/lib/playlistState'
import { removeQueuedItemOffline, type QueueDownloadTarget } from '@/lib/offline/queueDownload'

interface PlaylistItem {
  type: 'single' | 'series'
  id?: string
  series_id?: string
  title?: string
  series_name?: string
  author?: string | null
  duration_mins?: number
  total_mins?: number
  episode_count?: number
  cover_url?: string | null
  episodes?: Array<{ id: string; episode_number: number }>
}
interface SavedPlaylist {
  id: string
  items: PlaylistItem[]
  remaining_mins: number
  completed?: number
}

function formatMins(mins: number) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function targetFor(item: PlaylistItem): QueueDownloadTarget {
  return item.type === 'series'
    ? { type: 'series', episodeIds: (item.episodes || []).map((e) => e.id) }
    : { type: 'single', id: item.id || '' }
}

// UX-PLAYLIST-002: Library/RecommendedForYou keep their OWN per-user
// selection-key list (localStorage `et_current_playlist_<uid>`) and treat it
// as authoritative over the richer ACTIVE_PLAYLIST_KEY blob this page edits —
// so a change here must also update that key directly, or Library's card
// would show stale state.
function selectionKeyFor(item: PlaylistItem): string | null {
  if (item.type === 'series') {
    const seriesId = item.series_id || item.id
    return seriesId ? `series-${seriesId}` : null
  }
  return item.id ? `single-${item.id}` : null
}

export default function PlaylistPage() {
  const { user } = useAuth()
  const playlistKey = user ? `et_current_playlist_${user.id}` : LIBRARY_PLAYLIST_KEY
  const [playlist, setPlaylist] = useState<SavedPlaylist | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  function load() {
    try {
      const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
      if (!raw) { setPlaylist(null); return }
      const parsed = JSON.parse(raw)
      const items: PlaylistItem[] = parsed.items || parsed.stories || []
      if (!Array.isArray(items) || items.length === 0) { setPlaylist(null); return }
      setPlaylist({ id: parsed.id || 'legacy', items, remaining_mins: parsed.remaining_mins || 0, completed: Number(parsed.completed || 0) })
    } catch {
      setPlaylist(null)
    }
  }

  useEffect(() => {
    load()
    const sync = () => load()
    window.addEventListener('et_playlist_saved', sync)
    window.addEventListener('et_playlist_cleared', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('et_playlist_saved', sync)
      window.removeEventListener('et_playlist_cleared', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const items = playlist?.items || []

  function persist(nextItems: PlaylistItem[]) {
    if (!playlist) return
    if (nextItems.length === 0) {
      localStorage.removeItem(playlistKey)
      clearActivePlaylist()
      setPlaylist(null)
      return
    }
    const nextKeys = nextItems.map(selectionKeyFor).filter((k): k is string => Boolean(k))
    const nextMins = nextItems.reduce((s, x) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0)
    const saved = { id: playlist.id, items: nextItems, remaining_mins: nextMins, completed: playlist.completed || 0 }
    localStorage.setItem(playlistKey, JSON.stringify(nextKeys))
    saveActivePlaylist(saved, nextKeys)
    setPlaylist({ ...playlist, items: nextItems, remaining_mins: nextMins })
  }

  async function removeItem(item: PlaylistItem, key: string) {
    if (!playlist) return
    setBusyKey(key)
    try {
      persist(playlist.items.filter((i) => i !== item))
      // Un-queued — it no longer needs to be saved for offline play.
      await removeQueuedItemOffline(targetFor(item))
    } finally {
      setBusyKey(null)
    }
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (!playlist) return
    const next = [...playlist.items]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  const totalMins = items.reduce((s, x) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0)
  const storyCount = items.length

  return (
    <div style={{ minHeight: '100dvh', background: '#1e1b4b', color: 'white', padding: '16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>My Downloads</h1>

        {items.length === 0 && (
          <div style={{ color: '#c7d2fe', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            Nothing queued yet. Tap <b style={{ color: 'white' }}>+ Queue</b> on a story to add it here.
          </div>
        )}

        {items.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 700 }}>
            You have downloaded {storyCount} {storyCount === 1 ? 'story' : 'stories'} to your playlist — {formatMins(totalMins)}
          </div>
        )}

        {items.map((item, i) => {
          const key = item.type === 'series' ? `series-${item.series_id || item.id}` : `single-${item.id}`
          const title = item.type === 'series' ? (item.series_name || 'Series') : (item.title || '')
          const mins = item.type === 'series' ? (item.total_mins || 0) : (item.duration_mins || 0)
          const busy = busyKey === key
          return (
            <div key={key} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              {item.cover_url
                ? <img src={item.cover_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {title}
                </div>
                <div style={{ color: '#c7d2fe', fontSize: 12, marginTop: 2 }}>
                  {item.type === 'series' ? `${item.episode_count || (item.episodes || []).length} episodes · ` : ''}{formatMins(mins)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => moveItem(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  style={{ width: 32, height: 28, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, color: 'white', fontSize: 14, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1 }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label="Move down"
                  style={{ width: 32, height: 28, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, color: 'white', fontSize: 14, cursor: i === items.length - 1 ? 'default' : 'pointer', opacity: i === items.length - 1 ? 0.35 : 1 }}
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item, key)}
                disabled={busy}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
              >
                {busy ? '…' : 'Remove'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
