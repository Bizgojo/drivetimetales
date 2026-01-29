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
  const [showButtons, setShowButtons] = useState(true)
  const [charged, setCharged] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)

  // Fetch story and library entry
  useEffect(() => {
    async function fetchData() {
      if (!storyId) {
        setError('No story ID')
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

        if (storyError) throw storyError
        setStory(storyData)

        // Check if user has this in library
        if (user) {
          const { data: libData } = await supabase
            .from('user_library')
            .select('story_id, progress, completed')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()

          if (libData) {
            setLibraryEntry(libData)
            setCharged(true) // Already in library = already charged
            setShowButtons(false)
          }
        }
      } catch (err) {
        console.error('Error fetching story:', err)
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [storyId, user])

  // Handle audio loaded
  const handleCanPlay = () => {
    setAudioReady(true)
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
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
    
    // Deduct credits (skip if unlimited = -1)
    if (user.credits !== -1) {
      const { error: creditError } = await supabase
        .from('users')
        .update({ credits: (user.credits || 0) - creditCost })
        .eq('id', user.id)

      if (creditError) {
        console.error('Error deducting credits:', creditError)
        return
      }
    }

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
    setShowButtons(false)
    refreshUser()
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

  // Reserve for later (add to wishlist)
  const handleReserve = async () => {
    if (!user || !story) return
    
    await supabase
      .from('wishlists')
      .upsert({
        user_id: user.id,
        story_id: story.id,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,story_id' })
    
    router.push('/reserved')
  }

  // Not for me (mark as passed)
  const handleNotForMe = async () => {
    if (!user || !story) return
    
    await supabase
      .from('user_passes')
      .upsert({
        user_id: user.id,
        story_id: story.id,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,story_id' })
    
    router.back()
  }

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get display name for header
  const displayName = user?.display_name || user?.email?.split('@')[0] || 'U'

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Error state
  if (error || !story) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <p style={{ color: 'white', fontSize: '18px' }}>Story not found</p>
        <Link href="/home" style={{ color: '#f97316' }}>← Back to Home</Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #334155' }}>
        <button onClick={() => router.back()} style={{ color: '#f97316', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ← Back
        </button>
        
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span style={{ fontSize: '18px' }}>🚛</span>
          <span style={{ fontSize: '18px' }}>🚗</span>
          <span style={{ fontWeight: 'bold', color: 'white', fontSize: '14px' }}>Drive Time </span>
          <span style={{ fontWeight: 'bold', color: '#f97316', fontSize: '14px' }}>Tales</span>
        </Link>
        
        {user && (
          <Link href="/account" style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'black', fontWeight: 'bold', fontSize: '14px', textDecoration: 'none' }}>
            {displayName.charAt(0).toUpperCase()}
          </Link>
        )}
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Cover - larger when buttons hidden */}
        <div style={{ 
          width: showButtons ? '200px' : '280px', 
          height: showButtons ? '200px' : '280px', 
          margin: '0 auto 16px', 
          borderRadius: '12px', 
          overflow: 'hidden',
          boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease'
        }}>
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #475569, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>
          )}
        </div>

        {/* Title and info - hide some after charge */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{story.title}</h1>
          {showButtons && (
            <>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>{story.genre} • {story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
              <p style={{ color: 'white', fontSize: '14px' }}>by {story.author || 'Unknown Author'}</p>
            </>
          )}
        </div>

        {/* Description - only when showButtons */}
        {showButtons && story.description && (
          <p style={{ color: 'white', fontSize: '14px', textAlign: 'center', marginBottom: '16px', lineHeight: 1.5 }}>
            {story.description}
          </p>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Progress bar */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div style={{ height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              backgroundColor: '#f97316', 
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              transition: 'width 0.1s'
            }} />
          </div>
        </div>

        {/* Play/Pause button */}
        <button
          onClick={handlePlayPause}
          style={{
            width: '100%',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: !isPlaying && audioReady ? '#22c55e' : '#f97316',
            color: 'black',
            animation: !isPlaying && audioReady ? 'pulse 2s infinite' : 'none'
          }}
        >
          {isPlaying ? (
            <>❚❚ Pause</>
          ) : audioReady ? (
            <>▶ Tap to Play</>
          ) : (
            <>Loading...</>
          )}
        </button>

        {/* Bottom Buttons - visibility hidden after 3 min so layout doesn't shift */}
        <div style={{ 
          display: 'flex', 
          gap: '8px',
          visibility: showButtons ? 'visible' : 'hidden',
          height: showButtons ? 'auto' : '0',
          overflow: 'hidden'
        }}>
          <button 
            onClick={handleReserve} 
            style={{ flex: 1, padding: '14px', backgroundColor: '#db2777', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
          >
            📖 Reserve for Later
          </button>
          <button 
            onClick={handleNotForMe} 
            style={{ flex: 1, padding: '14px', backgroundColor: '#334155', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
          >
            👎 Not For Me
          </button>
        </div>

        {/* Charge countdown */}
        {!charged && currentTime > 0 && currentTime < 180 && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '12px' }}>
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
