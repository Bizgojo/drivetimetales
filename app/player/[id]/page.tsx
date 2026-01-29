'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

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
  const [showExtras, setShowExtras] = useState(true)
  const [charged, setCharged] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)

  // Fetch story and library entry
  useEffect(() => {
    async function fetchData() {
      if (!storyId) {
        setError('No story ID provided')
        setLoading(false)
        return
      }

      try {
        // Fetch story
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single()

        if (storyError) {
          setError('Story not found')
          setLoading(false)
          return
        }

        setStory(storyData)

        // Fetch library entry if user is logged in
        if (user) {
          const { data: libData } = await supabase
            .from('user_library')
            .select('*')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .maybeSingle()

          if (libData) {
            setLibraryEntry(libData)
            setCurrentTime(libData.progress || 0)
            setCharged(true)
            setShowExtras(false)
          }
        }

        setLoading(false)
      } catch (err) {
        setError('Failed to load story')
        setLoading(false)
      }
    }

    fetchData()
  }, [storyId, user])

  // Handle audio metadata loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setAudioReady(true)
      if (currentTime > 0) {
        audioRef.current.currentTime = currentTime
      }
    }
  }

  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  // Handle story ending
  const handleEnded = async () => {
    setIsPlaying(false)
    if (user && story) {
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: story.id,
          progress: 0,
          completed: true,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })
    }
  }

  // Charge credits after 3 minutes (180 seconds)
  useEffect(() => {
    if (isPlaying && !charged && currentTime >= 180 && user && story) {
      chargeCredits()
    }
  }, [currentTime, isPlaying, charged])

  const chargeCredits = async () => {
    if (!user || !story || charged) return
    
    const creditCost = story.credits || Math.max(1, Math.floor(story.duration_mins / 15))
    
    // Deduct credits
    const { error: creditError } = await supabase
      .from('users')
      .update({ credits: (user.credits || 0) - creditCost })
      .eq('id', user.id)

    if (!creditError) {
      // Add to library
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: story.id,
          progress: Math.floor(currentTime),
          completed: false,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })

      setCharged(true)
      setShowExtras(false)
      refreshUser()
    }
  }

  // Play/Pause toggle
  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(err => {
          console.error('Playback failed:', err)
        })
      }
      setIsPlaying(!isPlaying)
    }
  }

  // Skip forward/backward
  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds))
    }
  }

  // Save progress periodically
  useEffect(() => {
    if (!user || !story || !isPlaying) return
    
    const interval = setInterval(async () => {
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: story.id,
          progress: Math.floor(currentTime),
          completed: false,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })
    }, 30000)

    return () => clearInterval(interval)
  }, [user, story, isPlaying, currentTime])

  // Reserve for later
  const handleReserve = async () => {
    if (!user || !story) return
    await supabase
      .from('user_reserved')
      .upsert({
        user_id: user.id,
        story_id: story.id,
        reserved_at: new Date().toISOString()
      }, { onConflict: 'user_id,story_id' })
    router.push('/library')
  }

  // Not for me
  const handleNotForMe = async () => {
    if (!user || !story) return
    await supabase
      .from('user_not_for_me')
      .upsert({
        user_id: user.id,
        story_id: story.id,
        marked_at: new Date().toISOString()
      }, { onConflict: 'user_id,story_id' })
    router.push('/library')
  }

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Truncate description
  const truncateDescription = (desc: string | null) => {
    if (!desc) return ''
    return desc.length > 120 ? desc.substring(0, 120) + '...' : desc
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const creditCost = story?.credits || 1

  // Loading state
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  // Error state
  if (error || !story) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', color: 'white', marginBottom: '16px' }}>Story not found</h1>
        <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
        <button onClick={() => router.push('/library')} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>← Back to Library</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <audio 
        ref={audioRef} 
        src={story.audio_url || undefined} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata} 
        onEnded={handleEnded} 
        preload="auto" 
      />
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
        <button onClick={() => router.back()} style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>← Back</button>
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
          <span>🚛</span>
          <span>🚗</span>
          <span style={{ color: 'white', fontWeight: 'bold' }}>Drive Time</span>
          <span style={{ color: '#fb923c', fontWeight: 'bold' }}>Tales</span>
        </Link>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'black' }}>
          {user?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxHeight: 'calc(100vh - 60px)' }}>
        
        {/* Cover */}
        <div style={{ 
          width: '100%', 
          maxWidth: showExtras ? '180px' : '280px', 
          margin: '0 auto 12px', 
          aspectRatio: '1', 
          borderRadius: '12px', 
          overflow: 'hidden', 
          backgroundColor: '#1e293b',
          boxShadow: '0 0 20px rgba(255,255,255,0.3)'
        }}>
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #ea580c, #7c2d12)' }}>
              <span style={{ fontSize: '48px', opacity: 0.5 }}>🎧</span>
            </div>
          )}
        </div>
        
        {/* Title */}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', textAlign: 'center', color: 'white', marginBottom: '8px' }}>{story.title}</h1>
        
        {/* Meta & Description - only when showExtras */}
        {showExtras && (
          <>
            <p style={{ color: 'white', fontSize: '12px', textAlign: 'center', marginBottom: '4px' }}>
              {story.genre} • {story.author || 'Unknown'} • {story.duration_mins} min • {creditCost} credit{creditCost > 1 ? 's' : ''}
            </p>
            <p style={{ color: 'white', fontSize: '12px', textAlign: 'center', marginBottom: '12px' }}>{truncateDescription(story.description)}</p>
          </>
        )}
        
        {/* Progress Bar */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ height: '8px', backgroundColor: '#334155', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#f97316', width: `${progressPercent}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'white', marginTop: '4px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        
        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '12px' }}>
          <button 
            onClick={() => handleSkip(-30)} 
            style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#334155', border: 'none', color: 'white', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            -30
          </button>
          <button 
            onClick={handlePlayPause} 
            style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              backgroundColor: !isPlaying && audioReady ? '#22c55e' : '#f97316', 
              border: 'none', 
              color: 'black', 
              fontSize: '24px', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              animation: !isPlaying && audioReady ? 'pulse 2s infinite' : 'none'
            }}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button 
            onClick={() => handleSkip(30)} 
            style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#334155', border: 'none', color: 'white', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            +30
          </button>
        </div>

        {/* Loading audio indicator */}
        {!audioReady && !isPlaying && (
          <p style={{ textAlign: 'center', color: '#fb923c', fontSize: '12px', marginBottom: '8px' }}>Loading audio...</p>
        )}
        
        {/* Bottom Buttons - only when showExtras */}
        {showExtras && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={handleReserve} 
              style={{ flex: 1, padding: '12px', backgroundColor: '#db2777', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
            >
              📖 Reserve for Later
            </button>
            <button 
              onClick={handleNotForMe} 
              style={{ flex: 1, padding: '12px', backgroundColor: '#334155', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
            >
              👎 Not For Me
            </button>
          </div>
        )}

        {/* Charge countdown */}
        {!charged && currentTime > 0 && currentTime < 180 && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
            Credits charged in {Math.ceil((180 - currentTime) / 60)} min
          </p>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PlayerContent />
    </Suspense>
  )
}
