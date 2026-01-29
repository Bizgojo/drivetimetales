'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface Story {
  id: string
  title: string
  author: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url: string
  credits: number
}

interface LibraryEntry {
  story_id: string
  progress: number
  completed: boolean
}

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user, refreshUser } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntry | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showButtons, setShowButtons] = useState(true)
  const [charged, setCharged] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    async function fetchData() {
      if (!storyId) { setError('No story ID'); setLoading(false); return }
      try {
        const { data: storyData, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single()
        if (storyError) throw storyError
        setStory(storyData)
        if (user) {
          const { data: libData } = await supabase.from('user_library').select('story_id, progress, completed').eq('user_id', user.id).eq('story_id', storyId).single()
          if (libData) { setLibraryEntry(libData); setCharged(true); setShowButtons(false) }
        }
      } catch (err) { console.error('Error fetching story:', err); setError('Story not found') }
      finally { setLoading(false) }
    }
    fetchData()
  }, [storyId, user])

  const handleCanPlay = () => { setAudioReady(true); if (audioRef.current) setDuration(audioRef.current.duration) }
  const handleTimeUpdate = () => { if (audioRef.current) { setCurrentTime(audioRef.current.currentTime); if (!charged && audioRef.current.currentTime >= 180) chargeCredits() } }
  
  const chargeCredits = async () => {
    if (!user || !story || charged) return
    setCharged(true); setShowButtons(false)
    try {
      await supabase.from('users').update({ credits: (user as any).credits - story.credits }).eq('id', user.id)
      await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, progress: Math.floor(currentTime), completed: false, last_played: new Date().toISOString() })
      if (refreshUser) refreshUser()
    } catch (err) { console.error('Error charging credits:', err) }
  }

  const handlePlayPause = () => { if (!audioRef.current) return; if (isPlaying) { audioRef.current.pause() } else { audioRef.current.play() }; setIsPlaying(!isPlaying) }
  const handleReserve = async () => { if (!user || !storyId) return; try { await supabase.from('wishlists').upsert({ user_id: user.id, story_id: storyId }); router.push('/library') } catch (err) { console.error('Error reserving:', err) } }
  const handleNotForMe = async () => { if (!user || !storyId) return; try { await supabase.from('user_passes').upsert({ user_id: user.id, story_id: storyId }); router.push('/library') } catch (err) { console.error('Error passing:', err) } }
  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, '0')}` }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>)
  if (error || !story) return (<div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}><p style={{ marginBottom: '16px' }}>{error || 'Story not found'}</p><button onClick={() => router.push('/library')} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>Back to Library</button></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <audio ref={audioRef} src={story.audio_url} onCanPlay={handleCanPlay} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <StickyHeaderFull />
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: showButtons ? '200px' : '280px', height: showButtons ? '200px' : '280px', margin: '0 auto 16px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)', transition: 'all 0.3s ease' }}>
          {story.cover_url ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #475569, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>}
        </div>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{story.title}</h1>
          {showButtons && (<><p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>{story.genre} - {story.duration_mins} min - {story.credits} credit{story.credits !== 1 ? 's' : ''}</p><p style={{ color: 'white', fontSize: '14px' }}>by {story.author || 'Unknown Author'}</p></>)}
        </div>
        {showButtons && story.description && (<p style={{ color: 'white', fontSize: '14px', textAlign: 'justify', marginBottom: '16px', lineHeight: 1.5, padding: '0 8px' }}>{story.description}</p>)}
        <div style={{ flex: 1 }} />
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
          <div style={{ height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}><div style={{ height: '100%', backgroundColor: '#f97316', width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%', transition: 'width 0.1s' }} /></div>
        </div>
        <button onClick={handlePlayPause} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: !isPlaying && audioReady ? '#22c55e' : '#f97316', color: 'black', animation: !isPlaying && audioReady ? 'pulse 2s infinite' : 'none' }}>
          {isPlaying ? <>Pause</> : audioReady ? <>Tap to Play</> : <>Loading...</>}
        </button>
        <div style={{ display: 'flex', gap: '8px', visibility: showButtons ? 'visible' : 'hidden', height: showButtons ? 'auto' : '0', overflow: 'hidden' }}>
          <button onClick={handleReserve} style={{ flex: 1, padding: '14px', backgroundColor: '#db2777', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Reserve for Later</button>
          <button onClick={handleNotForMe} style={{ flex: 1, padding: '14px', backgroundColor: '#334155', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Not For Me</button>
        </div>
        {!charged && currentTime > 0 && currentTime < 180 && (<p style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '12px' }}>Credits charged in {Math.ceil((180 - currentTime) / 60)} min</p>)}
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }`}</style>
    </div>
  )
}

export default function PlayerPage() {
  return (<Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}><PlayerContent /></Suspense>)
}
