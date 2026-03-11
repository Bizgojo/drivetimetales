'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface PlaylistItem { id: string; title: string; duration_mins: number; cover_url: string | null; audio_url?: string | null }
interface StoryData { id: string; title: string; author: string; cover_url: string | null; audio_url: string; duration_mins: number }

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
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Read from dtt_active_playlist (saved by library-playlist page)
    // Format: { id, stories: PlaylistItem[] } OR legacy plain array
    const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
    const idx = parseInt(localStorage.getItem('dtt_playlist_index') || '0')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const items = Array.isArray(parsed) ? parsed : (parsed.stories || [])
        if (items.length) { setPlaylist(items); setCurrentIndex(idx) }
        else { router.replace('/library') }
      } catch { router.replace('/library') }
    } else {
      router.replace('/library')
    }
  }, [])

  useEffect(() => {
    if (!playlist.length) return
    const item = playlist[currentIndex]; if (!item) return
    async function loadStory() {
      setLoading(true); setAudioReady(false); setCurrentTime(0); setDuration(0)
      if (item.audio_url) { setStoryData({ id: item.id, title: item.title, author: '', cover_url: item.cover_url, audio_url: item.audio_url, duration_mins: item.duration_mins }); setLoading(false) }
      else { const { data } = await supabase.from('stories').select('id, title, author, cover_url, audio_url, duration_mins').eq('id', item.id).single(); if (data) setStoryData(data); setLoading(false) }
      const saved = localStorage.getItem(`et_progress_${item.id}`)
      if (saved) { const resume = Math.max(0, parseInt(saved) - 3); if (audioRef.current) audioRef.current.currentTime = resume; setCurrentTime(resume) }
    }
    loadStory()
  }, [playlist, currentIndex])

  const saveProgress = async (time: number, completed = false) => {
    const item = playlist[currentIndex]; if (!item) return
    localStorage.setItem(`et_progress_${item.id}`, String(Math.floor(time)))
    if (user) await supabase.from('user_library').upsert({ user_id: user.id, story_id: item.id, progress: Math.floor(time), completed, last_played: new Date().toISOString() })
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const t = audioRef.current.currentTime; setCurrentTime(t)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveProgress(t), 10000)
  }

  const handleEnded = async () => {
    setIsPlaying(false); await saveProgress(duration, true)
    if (currentIndex < playlist.length - 1) { const n = currentIndex + 1; localStorage.setItem('dtt_playlist_index', String(n)); setCurrentIndex(n) }
    else { localStorage.removeItem('dtt_active_playlist'); localStorage.removeItem('dtt_playlist_index'); router.replace('/library') }
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
      <audio ref={audioRef} src={storyData.audio_url} onCanPlay={() => { setAudioReady(true); if (audioRef.current) setDuration(audioRef.current.duration) }} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <button onClick={() => { if (audioRef.current) audioRef.current.pause(); router.back() }} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <div style={{ width: '100vw', aspectRatio: '1', flexShrink: 0, overflow: 'hidden' }}>
        {storyData.cover_url ? <img src={storyData.cover_url} alt={storyData.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#475569,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', gap: '12px' }}>
        <div>
          <p style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px', textAlign: 'center' }}>Playlist · {currentIndex + 1} of {playlist.length}</p>
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
