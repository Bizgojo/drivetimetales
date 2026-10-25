'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CanonicalPlayer from './CanonicalPlayer'
import type { PlayerMode } from './playerTypes'
import { supabase } from '@/lib/supabase'
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
  coverUrl?: string | null
  seek?: (seconds: number) => void
  toggle: () => void
}
const NowPlayingContext = createContext<PlaybackSnapshot | null>(null)
export function useNowPlaying() { return useContext(NowPlayingContext) }
const PlayerContext = createContext<((selection: PlaybackSelection) => void) | null>(null)

// Lives inside the root layout, outside changing page segments. Hiding the
// full controls never unmounts the existing audio engine or creates new audio.
export default function PersistentPlayer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const [selection, setSelection] = useState<PlaybackSelection | null>(null)
  const [liveSnapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)
  const [savedStories, setSavedStories] = useState<Array<{id: string; title: string; coverUrl: string | null; progress: number; duration: number}>>([])
  const saved = savedStories[0]
  const snapshot: PlaybackSnapshot | null = liveSnapshot && liveSnapshot.storyId === selection?.storyId ? liveSnapshot : saved ? {
    storyId: saved.id, title: saved.title, coverUrl: saved.coverUrl, currentTime: saved.progress, duration: saved.duration, isPlaying: false,
    toggle: () => router.push(`/player/${saved.id}?resume=${saved.progress}&autoplay=1&playNow=1`),
  } : null
  useEffect(() => {
    setSavedStories([])
    if (loading || !user?.id) return
    let cancelled = false
    void supabase.from('user_library')
      .select('story_id,progress,last_played,stories(title,cover_url,duration_mins)')
      .eq('user_id', user.id).eq('completed', false).eq('hide_from_home', false)
      .not('last_played', 'is', null).order('last_played', { ascending: false }).limit(50)
      .then(({data}) => {
        if (cancelled) return
        setSavedStories((data || []).filter(row => row.stories).map(row => {
          const story = row.stories as unknown as {title: string; cover_url: string | null; duration_mins: number}
          return {id: row.story_id, title: story.title, coverUrl: story.cover_url, progress: Number(row.progress || 0), duration: Number(story.duration_mins || 0) * 60}
        }))
      })
    return () => { cancelled = true }
  }, [user?.id, loading])
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
    snapshot

  return <PlayerContext.Provider value={request}><NowPlayingContext.Provider value={miniature ? snapshot : null}>
    <div style={{ paddingTop: miniature ? 186 : 0 }}>{children}</div>
    {selection && !clearForRoute && <div hidden={!playerPage} style={playerPage
      ? { position: 'fixed', top: 56, bottom: 0, left: 0, right: 0, zIndex: 40, overflowY: 'auto', background: '#020617' }
      : { display: 'none' }}>
      <CanonicalPlayer storyId={selection.storyId} mode={selection.mode} resumeParam={selection.resumeParam} navigationKey={selection.navigationKey}
        onPlaybackSnapshot={setSnapshot} onAdvanceInPlace={advance} />
    </div>}
    {miniature && <>

      <aside aria-label="Now playing" style={{ position: 'fixed', top: 64, left: 12, right: 12,
        zIndex: 45, padding: 10, borderRadius: 14, background: '#1e293b', color: 'white', border: '1px solid #475569' }}>
        <button type="button" aria-label={`Open player for ${snapshot.title}`} onClick={() => router.push(`/player/${snapshot.storyId}${selection?.mode === 'playlist' ? '?playlist=1' : selection?.mode === 'series' ? '?mode=series' : ''}`)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'none', border: 0, color: 'white', cursor: 'pointer' }}>
          {snapshot.coverUrl && <img src={snapshot.coverUrl} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} />}
          <strong style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{snapshot.title}</strong>
        </button>
        <div role="progressbar" aria-label="Listening progress" aria-valuemin={0} aria-valuemax={Math.max(1, snapshot.duration)} aria-valuenow={Math.min(snapshot.currentTime, snapshot.duration)} style={{ height: 4, background: '#475569', margin: '8px 0', borderRadius: 4 }}>
          <div style={{ height: '100%', width: `${snapshot.duration > 0 ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0}%`, background: '#f97316', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 12, color: '#cbd5e1' }}>{formatPlaybackTime(snapshot.currentTime)} · {formatPlaybackTime(Math.max(0, snapshot.duration - snapshot.currentTime))} left</span>
          <button type="button" aria-label="Back 15 seconds" disabled={!snapshot.seek} onClick={() => snapshot.seek?.(Math.max(0, snapshot.currentTime - 15))} style={{ minHeight: 44, minWidth: 44, background: '#334155', color: 'white', border: 0, borderRadius: 8 }}>↶15</button>
          <button type="button" onClick={snapshot.toggle} aria-label={snapshot.isPlaying ? 'Pause playback' : 'Continue playback'} style={{ minHeight: 44, minWidth: 88, border: 0, borderRadius: 8, background: snapshot.isPlaying ? '#f97316' : '#22c55e', color: '#020617', fontWeight: 800, cursor: 'pointer' }}>{snapshot.isPlaying ? 'Pause' : 'Continue'}</button>
          <button type="button" aria-label="Forward 15 seconds" disabled={!snapshot.seek} onClick={() => snapshot.seek?.(Math.min(snapshot.duration, snapshot.currentTime + 15))} style={{ minHeight: 44, minWidth: 44, background: '#334155', color: 'white', border: 0, borderRadius: 8 }}>15↷</button>
        </div>
        {savedStories.some(story => story.id !== snapshot.storyId) && <details style={{ marginTop: 6, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', padding: '4px 0' }}>Other unfinished stories ({savedStories.filter(story => story.id !== snapshot.storyId).length})</summary>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>{savedStories.filter(story => story.id !== snapshot.storyId).map(story =>
            <button key={story.id} type="button" onClick={() => router.push(`/player/${story.id}?resume=${story.progress}&autoplay=1&playNow=1`)} style={{ display: 'block', width: '100%', minHeight: 44, textAlign: 'left', background: '#334155', color: 'white', border: 0, borderRadius: 6, marginTop: 4, padding: 8 }}>{story.title}</button>
          )}</div>
        </details>}
      </aside>
    </>}
  </NowPlayingContext.Provider></PlayerContext.Provider>
}

// Route pages request a track, but never own an audio element. Returning to
// the same track leaves its media element, position and pause state intact.
export function PlayerRoute({ storyId, resumeParam = null, mode = 'story', navigationKey = '' }: PlaybackSelection) {
  const request = useContext(PlayerContext)
  useEffect(() => { request?.({ storyId, resumeParam, mode, navigationKey }) }, [request, storyId, resumeParam, mode, navigationKey])
  return <div role="status" aria-label="Loading player" />
}
