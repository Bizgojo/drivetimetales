'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface EpisodeEntry { id: string; title: string; duration_mins: number; cover_url: string | null; audio_url?: string | null }
interface PlaylistItem {
  type: 'single' | 'series'
  // single fields
  id?: string
  title?: string
  duration_mins?: number
  cover_url?: string | null
  audio_url?: string | null
  // series fields
  series_name?: string
  total_mins?: number
  episode_count?: number
  episodes?: EpisodeEntry[]
}
interface StoryData { id: string; title: string; author: string; cover_url: string | null; audio_url: string; duration_mins: number }

// Tell service worker to pre-cache a list of audio URLs
function precacheAudioUrls(urls: string[]) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AUDIO',
      urls: urls.filter(Boolean)
    })
  }
}

function PlaylistPlayerContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [storyData, setStoryData] = useState<StoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const autoPlayNext = useRef(false)
  const [nowPlayingLabel, setNowPlayingLabel] = useState<string | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  // Store all resolved story data keyed by story id for offline playback
  const resolvedStories = useRef<Map<string, StoryData>>(new Map())

  useEffect(() => {
    const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
    const idx = parseInt(localStorage.getItem('dtt_playlist_index') || '0')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        // Support new format (items array) and legacy format (stories array)
        const items: PlaylistItem[] = parsed.items
          ? parsed.items
          : Array.isArray(parsed)
            ? parsed.map((s: any) => ({ type: 'single', ...s }))
            : (parsed.stories || []).map((s: any) => ({ type: 'single', ...s }))
        if (items.length) {
          autoPlayNext.current = true
          setPlaylist(items); setCurrentIndex(idx)
        } else { router.replace('/library') }
      } catch { router.replace('/library') }
    } else {
      router.replace('/library')
    }
  }, [])

  // Pre-fetch ALL stories in playlist upfront — resolves audio URLs and caches audio files
  async function prefetchAllStories(items: PlaylistItem[]) {
    const audioUrlsToCache: string[] = []

    await Promise.all(items.map(async (item) => {
      try {
        let audioUrl = item.audio_url || null

        if (!audioUrl) {
          const { data } = await supabase
            .from('stories')
            .select('id, title, author, cover_url, audio_url, duration_mins')
            .eq('id', item.id)
            .single()
          if (data) {
            audioUrl = data.audio_url
            resolvedStories.current.set(item.id, data)
          }
        } else {
          resolvedStories.current.set(item.id, {
            id: item.id,
            title: item.title,
            author: '',
            cover_url: item.cover_url,
            audio_url: audioUrl,
            duration_mins: item.duration_mins
          })
        }

        if (audioUrl) audioUrlsToCache.push(audioUrl)
      } catch {
        // Silently fail — will retry when story loads
      }
    }))

    if (audioUrlsToCache.length > 0) {
      precacheAudioUrls(audioUrlsToCache)
      setOfflineReady(true)
    }
  }

  // Track which episode we're on within a series item
  const [seriesEpisodeIndex, setSeriesEpisodeIndex] = useState(0)

  // Resolve the actual episode to play from current playlist item
  async function resolveCurrentEpisode(item: PlaylistItem, epIdx: number): Promise<{ storyId: string; resumeAt: number } | null> {
    if (item.type === 'single') {
      const storyId = item.id!
      // Check user_library for resume point
      let resumeAt = 0
      if (user?.id) {
        const { data } = await supabase.from('user_library').select('progress, completed').eq('user_id', user.id).eq('story_id', storyId).single().catch(() => ({ data: null }))
        if (data && !data.completed && data.progress > 120) resumeAt = Math.max(0, data.progress - 15)
      }
      return { storyId, resumeAt }
    } else {
      // Series — find smart episode to start from
      const episodes = item.episodes || []
      if (episodes.length === 0) return null
      if (epIdx > 0 && epIdx < episodes.length) {
        // Already mid-series, use provided index
        const ep = episodes[epIdx]
        let resumeAt = 0
        if (user?.id) {
          const { data } = await supabase.from('user_library').select('progress, completed').eq('user_id', user.id).eq('story_id', ep.id).single().catch(() => ({ data: null }))
          if (data && !data.completed && data.progress > 120) resumeAt = Math.max(0, data.progress - 15)
        }
        return { storyId: ep.id, resumeAt }
      }
      // Smart start: find in-progress ep, or first unstarted, or ep1
      if (user?.id) {
        const ids = episodes.map(e => e.id)
        const { data: progressData } = await supabase.from('user_library').select('story_id, progress, completed').eq('user_id', user.id).in('story_id', ids).catch(() => ({ data: null }))
        const progressMap: Record<string, { progress: number; completed: boolean }> = {}
        if (progressData) progressData.forEach((p: any) => { progressMap[p.story_id] = { progress: p.progress || 0, completed: p.completed || false } })
        // Find in-progress episode
        const inProgressEp = episodes.find(e => { const p = progressMap[e.id]; return p && p.progress > 0 && !p.completed })
        if (inProgressEp) {
          const p = progressMap[inProgressEp.id]
          const resumeAt = p.progress > 120 ? Math.max(0, p.progress - 15) : 0
          const idx = episodes.findIndex(e => e.id === inProgressEp.id)
          setSeriesEpisodeIndex(idx)
          return { storyId: inProgressEp.id, resumeAt }
        }
        // Find first unstarted after last completed
        let lastCompletedIdx = -1
        episodes.forEach((e, i) => { if (progressMap[e.id]?.completed) lastCompletedIdx = i })
        if (lastCompletedIdx >= 0 && lastCompletedIdx < episodes.length - 1) {
          const nextEp = episodes[lastCompletedIdx + 1]
          setSeriesEpisodeIndex(lastCompletedIdx + 1)
          return { storyId: nextEp.id, resumeAt: 0 }
        }
        // All completed — play from ep1
        const allCompleted = episodes.every(e => progressMap[e.id]?.completed)
        if (allCompleted) { setSeriesEpisodeIndex(0); return { storyId: episodes[0].id, resumeAt: 0 } }
      }
      // No user or no progress — start from ep1
      setSeriesEpisodeIndex(0)
      return { storyId: episodes[0].id, resumeAt: 0 }
    }
  }

  useEffect(() => {
    if (!playlist.length) {
      setLoading(false)
      setStoryData(null)
      return
    }
    const item = playlist[currentIndex]
    if (!item) {
      setLoading(false)
      setStoryData(null)
      return
    }
    setSeriesEpisodeIndex(0)
    async function loadStory() {
      setLoading(true); setAudioReady(false); setCurrentTime(0); setDuration(0)
      const resolved = await resolveCurrentEpisode(item, 0)
      if (!resolved) { setLoading(false); return }
      const { storyId, resumeAt } = resolved
      const prefetched = resolvedStories.current.get(storyId)
      if (prefetched) {
        setStoryData(prefetched)
        if (resumeAt > 0 && audioRef.current) { audioRef.current.currentTime = resumeAt; setCurrentTime(resumeAt) }
        setLoading(false)
      } else {
        try {
          const { data } = await supabase.from('stories').select('id, title, author, cover_url, audio_url, duration_mins').eq('id', storyId).single()
          if (data) { resolvedStories.current.set(storyId, data); setStoryData(data) }
        } catch {}
        setLoading(false)
        if (resumeAt > 0 && audioRef.current) { audioRef.current.currentTime = resumeAt; setCurrentTime(resumeAt) }
      }
    }
    loadStory()
  }, [playlist, currentIndex])

  const saveProgress = async (time: number, completed = false) => {
    if (!storyData?.id) return
    const storyId = storyData.id
    localStorage.setItem(`et_progress_${storyId}`, String(Math.floor(time)))
    if (user) {
      try {
        await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, progress: Math.floor(time), completed, last_played: new Date().toISOString() })
      } catch {
        // Offline — saved to localStorage, syncs when back online
      }
    }
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const t = audioRef.current.currentTime; setCurrentTime(t)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveProgress(t), 10000)
  }

  const handleEnded = async () => {
    await saveProgress(duration, true)
    const item = playlist[currentIndex]
    // If current item is a series, check if there are more episodes
    if (item?.type === 'series') {
      const episodes = item.episodes || []
      const nextEpIdx = seriesEpisodeIndex + 1
      if (nextEpIdx < episodes.length) {
        // Play next episode in series
        setSeriesEpisodeIndex(nextEpIdx)
        setLoading(true); setAudioReady(false); setCurrentTime(0); setDuration(0)
        const nextEp = episodes[nextEpIdx]
        setNowPlayingLabel(nextEp.title); setTimeout(() => setNowPlayingLabel(null), 3000)
        const prefetched = resolvedStories.current.get(nextEp.id)
        if (prefetched) {
          setStoryData(prefetched); setLoading(false)
        } else {
          try {
            const { data } = await supabase.from('stories').select('id, title, author, cover_url, audio_url, duration_mins').eq('id', nextEp.id).single()
            if (data) { resolvedStories.current.set(nextEp.id, data); setStoryData(data) }
          } catch {}
          setLoading(false)
        }
        autoPlayNext.current = true
        return
      }
    }
    // Advance to next playlist item
    if (currentIndex < playlist.length - 1) {
      autoPlayNext.current = true
      const n = currentIndex + 1
      const nextItem = playlist[n]
      if (nextItem) {
        const label = nextItem.type === 'series' ? nextItem.series_name! : nextItem.title!
        setNowPlayingLabel(label); setTimeout(() => setNowPlayingLabel(null), 3000)
      }
      localStorage.setItem('dtt_playlist_index', String(n)); setCurrentIndex(n)
    } else {
      setIsPlaying(false)
      localStorage.removeItem('dtt_active_playlist'); localStorage.removeItem('dtt_playlist_index'); router.replace('/library')
    }
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); saveProgress(currentTime) } else { audioRef.current.play() }
    setIsPlaying(!isPlaying)
  }

  const handleSkip = async () => {
    if (!audioRef.current) return
    audioRef.current.pause(); await saveProgress(currentTime)
    if (currentIndex < playlist.length - 1) { const n = currentIndex + 1; localStorage.setItem('dtt_playlist_index', String(n)); setCurrentIndex(n) }
    else { localStorage.removeItem('dtt_active_playlist'); localStorage.removeItem('dtt_playlist_index'); router.replace('/library') }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const newTime = ((e.clientX - rect.left) / rect.width) * duration
    audioRef.current.currentTime = newTime; setCurrentTime(newTime)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const timeRemaining = duration > 0 ? Math.max(0, duration - currentTime) : (storyData?.duration_mins || 0) * 60
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const isLast = currentIndex === playlist.length - 1

  if (loading || !storyData) return <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>

  return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <audio ref={audioRef} src={storyData.audio_url} onCanPlay={() => {
        setAudioReady(true)
        if (audioRef.current) setDuration(audioRef.current.duration)
        if (autoPlayNext.current) {
          autoPlayNext.current = false
          audioRef.current?.play().catch(() => {})
        }
      }} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <StickyHeaderFull />
      <div style={{ width: '100vw', maxHeight: '40vh', flexShrink: 0, overflow: 'hidden' }}>
        {storyData.cover_url ? <img src={storyData.cover_url} alt={storyData.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '200px', background: 'linear-gradient(135deg,#475569,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', gap: '12px' }}>
        <div>
          <p style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px', textAlign: 'center' }}>
            {playlist[currentIndex]?.type === 'series' ? playlist[currentIndex].series_name : 'Playlist'} · {currentIndex + 1} of {playlist.length}
            {offlineReady && <span style={{ marginLeft: '8px', color: '#22c55e' }}>✓ offline ready</span>}
          </p>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'white', textAlign: 'center', lineHeight: 1.2 }}>{storyData.title}</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0', textAlign: 'center' }}>{storyData.author ? `by ${storyData.author} · ` : ''}{formatTime(timeRemaining)} remaining</p>
        </div>
        <div>
          <div onClick={handleSeek} style={{ height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden', cursor: 'pointer' }}>
            <div style={{ height: '100%', backgroundColor: '#f97316', width: `${progressPct}%`, transition: 'width 0.1s', borderRadius: '3px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            <span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handlePlayPause} style={{ flex: 2, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color: 'white' }}>
            {!audioReady ? 'Loading...' : isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={handleSkip} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#1e293b', color: isLast ? '#64748b' : '#94a3b8' }}>
            {isLast ? 'Done' : 'Skip ⏭'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {nowPlayingLabel && (
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'rgba(0,0,0,0.85)', borderRadius:16, padding:'20px 32px', textAlign:'center', zIndex:999, backdropFilter:'blur(8px)', border:'1px solid rgba(249,115,22,0.3)', maxWidth:'80vw' }}>
          <div style={{ color:'#f97316', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Up Next</div>
          <div style={{ color:'white', fontSize:16, fontWeight:800, lineHeight:1.3 }}>{nowPlayingLabel}</div>
        </div>
      )}
    </div>
  )
}

export default function PlaylistPlayerPage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
      <PlaylistPlayerContent />
    </Suspense>
  )
}
