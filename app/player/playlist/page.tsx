'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface PlaylistItem { id: string; title: string; duration_mins: number; cover_url: string | null; audio_url?: string | null }
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
        const items = Array.isArray(parsed) ? parsed : (parsed.stories || [])
        if (items.length) {
          autoPlayNext.current = true
          setPlaylist(items); setCurrentIndex(idx)
          prefetchAllStories(items)
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

  useEffect(() => {
    if (!playlist.length) return
    const item = playlist[currentIndex]; if (!item) return
    async function loadStory() {
      setLoading(true); setAudioReady(false); setCurrentTime(0); setDuration(0)

      // Use pre-fetched data if available (works offline)
      const prefetched = resolvedStories.current.get(item.id)
      if (prefetched) {
        setStoryData(prefetched); setLoading(false)
      } else if (item.audio_url) {
        const story = { id: item.id, title: item.title, author: '', cover_url: item.cover_url, audio_url: item.audio_url, duration_mins: item.duration_mins }
        resolvedStories.current.set(item.id, story)
        setStoryData(story); setLoading(false)
      } else {
        try {
          const { data } = await supabase.from('stories').select('id, title, author, cover_url, audio_url, duration_mins').eq('id', item.id).single()
          if (data) { resolvedStories.current.set(item.id, data); setStoryData(data) }
        } catch {
          // Truly offline and not pre-fetched
        }
        setLoading(false)
      }

      const saved = localStorage.getItem(`et_progress_${item.id}`)
      if (saved) { const prog = parseInt(saved); const resume = prog < 120 ? 0 : Math.max(0, prog - 15); if (audioRef.current) audioRef.current.currentTime = resume; setCurrentTime(resume) }
    }
    loadStory()
  }, [playlist, currentIndex])

  const saveProgress = async (time: number, completed = false) => {
    const item = playlist[currentIndex]; if (!item) return
    localStorage.setItem(`et_progress_${item.id}`, String(Math.floor(time)))
    if (user) {
      try {
        await supabase.from('user_library').upsert({ user_id: user.id, story_id: item.id, progress: Math.floor(time), completed, last_played: new Date().toISOString() })
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
    if (currentIndex < playlist.length - 1) {
      autoPlayNext.current = true
      const n = currentIndex + 1
      const nextItem = playlist[n]
      if (nextItem) { setNowPlayingLabel(nextItem.title); setTimeout(() => setNowPlayingLabel(null), 3000) }
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
            Playlist · {currentIndex + 1} of {playlist.length}
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
