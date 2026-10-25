'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CanonicalPlayer from './CanonicalPlayer'
import type { PlayerMode } from './playerTypes'
import { formatPlaybackTime } from '@/lib/playerControls'

export interface PlaybackSelection {
  storyId: string
  resumeParam?: string | null
  mode?: PlayerMode
  navigationKey?: string
}
export interface PlaybackSnapshot {
  storyId: string
  title: string
  isPlaying: boolean
  currentTime: number
  duration: number
  toggle: () => void
}
const PlayerContext = createContext<((selection: PlaybackSelection) => void) | null>(null)

// Lives inside the root layout, outside changing page segments. Hiding the
// full controls never unmounts the existing audio engine or creates new audio.
export default function PersistentPlayer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const [selection, setSelection] = useState<PlaybackSelection | null>(null)
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)
  const identity = useRef<string | null>(null)
  const playerPage = pathname?.startsWith('/player/') === true
  const clearForRoute = pathname === '/signin' || pathname === '/signup' || pathname === '/go'
  const request = useCallback((next: PlaybackSelection) => {
    setSelection(previous => previous?.storyId === next.storyId && previous?.mode === next.mode
      ? previous.navigationKey === next.navigationKey ? previous : { ...previous, navigationKey: next.navigationKey } : next)
  }, [])

  useEffect(() => {
    if (loading) return
    const next = user?.id || null
    if (identity.current !== null && identity.current !== next) {
      setSelection(null)
      setSnapshot(null)
    }
    identity.current = next
  }, [user?.id, loading])
  useEffect(() => {
    if (clearForRoute) { setSelection(null); setSnapshot(null) }
  }, [clearForRoute])

  const advance = useCallback((storyId: string) => {
    setSelection(previous => previous ? { ...previous, storyId, resumeParam: null } : previous)
    // Do not pull a listener away from Home/Library at a natural track ending.
    if (window.location.pathname.startsWith('/player/')) {
      router.replace(`/player/${storyId}?playlist=1&autoplay=1&playNow=1`)
    }
  }, [router])
  const miniature = !playerPage && !clearForRoute && !pathname?.startsWith('/admin') &&
    snapshot && snapshot.storyId === selection?.storyId

  return <PlayerContext.Provider value={request}>
    {children}
    {selection && !clearForRoute && <div hidden={!playerPage} style={playerPage
      ? { position: 'fixed', top: 56, bottom: 0, left: 0, right: 0, zIndex: 40, overflowY: 'auto', background: '#020617' }
      : { display: 'none' }}>
      <CanonicalPlayer storyId={selection.storyId} mode={selection.mode} resumeParam={selection.resumeParam} navigationKey={selection.navigationKey}
        onPlaybackSnapshot={setSnapshot} onAdvanceInPlace={advance} />
    </div>}
    {miniature && <>
      <div style={{ height: 164 }} aria-hidden="true" />
      <aside aria-label="Now playing" style={{ position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', left: 12, right: 12,
        zIndex: 60, padding: 12, borderRadius: 14, background: '#1e293b', color: 'white', border: '1px solid #475569', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label={`Open player for ${snapshot.title}`} onClick={() => router.push(`/player/${selection.storyId}${selection.mode === 'playlist' ? '?playlist=1' : selection.mode === 'series' ? '?mode=series' : ''}`)}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'white', cursor: 'pointer' }}>
          <strong style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{snapshot.title}</strong>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>{formatPlaybackTime(snapshot.currentTime)} / {formatPlaybackTime(snapshot.duration)}</span>
        </button>
        <button type="button" onClick={snapshot.toggle} aria-label={snapshot.isPlaying ? 'Pause playback' : 'Continue playback'}
          style={{ minHeight: 48, minWidth: 92, border: 0, borderRadius: 10, background: snapshot.isPlaying ? '#f97316' : '#22c55e', color: '#020617', fontWeight: 800, cursor: 'pointer' }}>
          {snapshot.isPlaying ? 'Pause' : 'Continue'}
        </button>
      </aside>
    </>}
  </PlayerContext.Provider>
}

// Route pages request a track, but never own an audio element. Returning to
// the same track leaves its media element, position and pause state intact.
export function PlayerRoute({ storyId, resumeParam = null, mode = 'story', navigationKey = '' }: PlaybackSelection) {
  const request = useContext(PlayerContext)
  useEffect(() => { request?.({ storyId, resumeParam, mode, navigationKey }) }, [request, storyId, resumeParam, mode, navigationKey])
  return <div role="status" aria-label="Loading player" />
}
