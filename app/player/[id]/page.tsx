'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeader from '@/components/StickyHeader'

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
          if (libData) { 
            setLibraryEntry(libData)
            setCharged(true)
            setShowButtons(false)
          }
        }
      } catch (err) { console.error('Error fetching story:', err); setError('Story not found') }
      finally { setLoading(false) }
    }
    fetchData()
  }, [storyId, user])

  const handleCanPlay = () => { 
    setAudioReady(true)
    if (audioRef.current) setDuration(audioRef.current.duration) 
  }
  
  const handleTimeUpdate = () => { 
    if (audioRef.current) { 
      setCurrentTime(audioRef.current.currentTime)
      if (!charged && audioRef.current.currentTime >= 180) chargeCredits() 
    } 
  }
  
  const chargeCredits = async () => {
    if (!user || !story || charged) return
    setCharged(true)
    setShowButtons(false)
    try {
      await supabase.from('users').update({ credits: (user as any).credits - story.credits }).eq('id', user.id)
      await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, progress: Math.floor(currentTime), completed: false, last_played: new Date().toISOString() })
      if (refreshUser) refreshUser()
    } catch (err) { console.error('Error charging credits:', err) }
  }

  const handlePlayPause = () => { 
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause() } else { audioRef.current.play() }
    setIsPlaying(!isPlaying) 
  }
  
  const handleReserve = async () => { 
    if (!user || !storyId) return
    if (audioRef.current) { audioRef.current.pause() }
    try { 
      await supabase.from('wishlists').upsert({ user_id: user.id, story_id: storyId })
      router.back() 
    } catch (err) { console.error('Error reserving:', err) } 
  }
  
  const handleNotForMe = async () => { 
    if (!user || !storyId) return
    if (audioRef.current) { audioRef.current.pause() }
    try { 
      await supabase.from('user_passes').upsert({ user_id: user.id, story_id: storyId })
      router.back() 
    } catch (err) { console.error('Error passing:', err) } 
  }
  
  const formatTime = (s: number) => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
  
  const getCountdown = () => {
    const r = Math.max(0, 180 - currentTime)
    return `${Math.floor(r/60)}:${Math.floor(r%60).toString().padStart(2,'0')}`
  }

  if (loading) return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
  
  if (error || !story) return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ marginBottom: '16px' }}>{error || 'Story not found'}</p>
      <button onClick={() => router.back()} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>Go Back</button>
    </div>
  )

  // Cover will expand to fill available space

  return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <audio ref={audioRef} src={story.audio_url} onCanPlay={handleCanPlay} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      
      <StickyHeader />
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 16px 0', justifyContent: 'flex-start', gap: '8px' }}>
        <div style={{ width: showButtons ? '270px' : '320px', height: showButtons ? '270px' : '320px', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 0 24px rgba(249,115,22,0.25)', flexShrink: 0 }}>
          {story.cover_url ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#475569,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>🎧</div>}
        </div>
        
        <div style={{ lineHeight: 1.3 }}>
          <h1 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0, color: 'white', textAlign: 'center' }}>{story.title}</h1>
          <p style={{ color: 'white', fontSize: '12px', margin: 0, textAlign: 'center' }}>{story.genre} • {story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
          <p style={{ color: 'white', fontSize: '12px', margin: 0, textAlign: 'center' }}>by {story.author || 'Drive Time Tales'}</p>
          {story.description && (
            <p style={{ color: 'white', fontSize: '12px', textAlign: 'justify', margin: 0, marginTop: '8px', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{story.description}</p>
          )}
        </div>
      </main>
      
      <div style={{ backgroundColor: '#020617', padding: '6px 16px 12px', flexShrink: 0 }}>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px', fontSize: '10px', color: 'white', marginBottom: '2px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div style={{ height: '4px', backgroundColor: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#f97316', width: duration > 0 ? `${(currentTime/duration)*100}%` : '0%', transition: 'width 0.1s' }} />
          </div>
        </div>
        
        <button onClick={handlePlayPause} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginBottom: showButtons ? '6px' : '0', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color: isPlaying ? 'white' : 'black' }}>
          {!audioReady ? 'Loading...' : isPlaying ? 'Pause' : charged ? (libraryEntry?.completed ? 'Play Again' : currentTime > 0 ? 'Continue' : 'Play') : currentTime > 0 ? 'Continue' : 'Tap to Play'}
        </button>
        
        {showButtons && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
            <button onClick={handleReserve} style={{ flex: 1, padding: '10px', backgroundColor: '#db2777', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Reserve for Later</button>
            <button onClick={handleNotForMe} style={{ flex: 1, padding: '10px', backgroundColor: '#334155', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Not For Me</button>
          </div>
        )}
        
        </div>
      
      {!charged && showButtons && (
        <p style={{ textAlign: 'center', color: '#f97316', fontSize: '11px', padding: '4px 0 8px', backgroundColor: '#020617' }}>Credit{story.credits !== 1 ? 's' : ''} charged after 3 min of play</p>
      )}
      
      {!charged && isPlaying && currentTime < 180 && (
        <p style={{ textAlign: 'center', color: '#f97316', fontSize: '11px', padding: '0 0 8px', backgroundColor: '#020617' }}>Credit{story.credits !== 1 ? 's' : ''} charged in {getCountdown()}</p>
      )}
      
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
