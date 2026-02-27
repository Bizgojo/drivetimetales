'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string; title: string; author: string; description: string
  genre: string; duration_mins: number; cover_url: string | null; audio_url: string
}

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user } = useAuth()
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioReady, setAudioReady] = useState(false)
  const [hasProgress, setHasProgress] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!storyId) { setLoading(false); return }
      const { data } = await supabase.from('stories').select('*').eq('id', storyId).single()
      if (data) {
        setStory(data)
        if (user) {
          const { data: lib } = await supabase.from('user_library').select('progress, completed').eq('user_id', user.id).eq('story_id', storyId).single()
          if (lib && lib.progress > 0) { const r = lib.completed ? 0 : Math.max(0, lib.progress - 3); if (audioRef.current) audioRef.current.currentTime = r; setCurrentTime(r); setHasProgress(true) }
        } else {
          const saved = localStorage.getItem(`et_progress_${storyId}`)
          if (saved) { const r = Math.max(0, parseInt(saved) - 3); if (audioRef.current) audioRef.current.currentTime = r; setCurrentTime(r) }
        }
      }
      setLoading(false)
    }
    fetchData()
  }, [storyId, user])

  const saveProgress = async (time: number, completed = false) => {
    localStorage.setItem(`et_progress_${storyId}`, String(Math.floor(time)))
    if (user && storyId) await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, progress: Math.floor(time), completed, last_played: new Date().toISOString() })
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const t = audioRef.current.currentTime; setCurrentTime(t)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveProgress(t), 5000)
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); saveProgress(currentTime) } else { audioRef.current.play(); setHasProgress(true) }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const newTime = ((e.clientX - rect.left) / rect.width) * duration
    audioRef.current.currentTime = newTime; setCurrentTime(newTime)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const timeRemaining = duration > 0 ? Math.max(0, duration - currentTime) : (story?.duration_mins || 0) * 60
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  if (loading) return <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>
  if (!story) return <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><p>Story not found</p><button onClick={() => router.back()} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', marginTop: '12px' }}>Go Back</button></div>

  return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <audio ref={audioRef} src={story.audio_url}
        onCanPlay={() => { setAudioReady(true); if (audioRef.current) setDuration(audioRef.current.duration) }}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setIsPlaying(false); saveProgress(duration, true) }}
        onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <button onClick={() => { if (audioRef.current) audioRef.current.pause(); router.back() }} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <div style={{ width: '100vw', aspectRatio: '1', flexShrink: 0, overflow: 'hidden' }}>
        {story.cover_url ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#475569,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'white', textAlign: 'center', lineHeight: 1.2 }}>{story.title}</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0', textAlign: 'center' }}>by {story.author || 'Endless Tales'} · {formatTime(timeRemaining)} remaining</p>
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
            {!audioReady ? 'Loading...' : isPlaying ? '⏸ Pause' : hasProgress ? '▶ Continue' : '▶ Play'}
          </button>
          {hasProgress ? (
            <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; setCurrentTime(0); audioRef.current.play(); setIsPlaying(true) } }} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#1e293b', color: '#94a3b8' }}>
              Start Over
            </button>
          ) : (
            <button onClick={() => { if (audioRef.current) audioRef.current.pause(); saveProgress(currentTime); router.back() }} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#1e293b', color: '#94a3b8' }}>
              Not for Me
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
      <PlayerContent />
    </Suspense>
  )
}
