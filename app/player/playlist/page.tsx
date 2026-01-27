'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import Link from 'next/link'

interface PlaylistStory {
  id: string
  title: string
  author: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url: string
  credits: number
  announcement_url?: string | null
}

function PlaylistPlayerContent() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  
  const [playlist, setPlaylist] = useState<PlaylistStory[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [charged, setCharged] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [playingAnnouncement, setPlayingAnnouncement] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const announcementRef = useRef<HTMLAudioElement>(null)

  const currentStory = playlist[currentIndex]
  const nextStory = playlist[currentIndex + 1]
  const isLastStory = currentIndex === playlist.length - 1

  // Load playlist from localStorage
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    const autoplay = localStorage.getItem('dtt_playlist_autoplay')
    
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        setPlaylist(parsed)
        if (savedIndex) {
          setCurrentIndex(parseInt(savedIndex, 10))
        }
      } catch (e) {
        console.error('Failed to parse playlist:', e)
      }
    }
    setLoading(false)
    
    // Clear autoplay flag
    localStorage.removeItem('dtt_playlist_autoplay')
  }, [])

  // Auto-play when audio is ready
  useEffect(() => {
    if (audioReady && audioRef.current && !isPlaying && playlist.length > 0) {
      audioRef.current.play().catch(err => {
        console.error('Autoplay failed:', err)
      })
      setIsPlaying(true)
    }
  }, [audioReady, playlist.length])

  // Check if current story is already in user's library (already charged)
  // But always start from beginning for playlist playback
  useEffect(() => {
    async function checkLibrary() {
      if (!user || !currentStory) return
      
      const { data } = await supabase
        .from('user_library')
        .select('*')
        .eq('user_id', user.id)
        .eq('story_id', currentStory.id)
        .maybeSingle()
      
      if (data) {
        setCharged(true)
        // Always start from beginning for playlist - don't restore progress
        setCurrentTime(0)
      } else {
        setCharged(false)
        setCurrentTime(0)
      }
    }
    
    checkLibrary()
  }, [currentStory, user])

  // Save current index to localStorage
  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem('dtt_playlist_index', currentIndex.toString())
    }
  }, [currentIndex, playlist.length])

  // Handle audio metadata loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setAudioReady(true)
      // Always start from beginning for playlist
      audioRef.current.currentTime = 0
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
    
    // Mark as completed in library
    if (user && currentStory) {
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: currentStory.id,
          progress: 0,
          completed: true,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })
    }
    
    // If not last story, play announcement for next story
    if (!isLastStory && nextStory) {
      playNextAnnouncement()
    } else {
      // Playlist complete
      localStorage.removeItem('dtt_playlist_index')
    }
  }

  // Play announcement for next story
  const playNextAnnouncement = () => {
    if (nextStory?.announcement_url && announcementRef.current) {
      setPlayingAnnouncement(true)
      announcementRef.current.src = nextStory.announcement_url
      announcementRef.current.play().catch(err => {
        console.error('Announcement playback failed:', err)
        goToNextStory()
      })
    } else {
      goToNextStory()
    }
  }

  // Handle announcement ended
  const handleAnnouncementEnded = () => {
    setPlayingAnnouncement(false)
    goToNextStory()
  }

  // Skip (go to announcement/next story)
  const handleSkip = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    
    if (!isLastStory && nextStory) {
      playNextAnnouncement()
    } else {
      router.push('/library')
    }
  }

  // Skip announcement
  const handleSkipAnnouncement = () => {
    if (announcementRef.current) {
      announcementRef.current.pause()
    }
    setPlayingAnnouncement(false)
    goToNextStory()
  }

  // Go to next story
  const goToNextStory = () => {
    setAudioReady(false)
    setCurrentTime(0)
    setDuration(0)
    setCharged(false)
    setCurrentIndex(prev => prev + 1)
  }

  // Charge credits after 3 minutes (180 seconds)
  useEffect(() => {
    if (isPlaying && !charged && currentTime >= 180 && user && currentStory) {
      chargeCredits()
    }
  }, [currentTime, isPlaying, charged])

  const chargeCredits = async () => {
    if (!user || !currentStory || charged) return
    
    const creditCost = currentStory.credits || Math.max(1, Math.floor(currentStory.duration_mins / 15))
    
    const { error: creditError } = await supabase
      .from('users')
      .update({ credits: (user.credits || 0) - creditCost })
      .eq('id', user.id)

    if (!creditError) {
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: currentStory.id,
          progress: Math.floor(currentTime),
          completed: false,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })

      setCharged(true)
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

  // Save progress periodically
  useEffect(() => {
    if (!user || !currentStory || !isPlaying) return
    
    const interval = setInterval(async () => {
      await supabase
        .from('user_library')
        .upsert({
          user_id: user.id,
          story_id: currentStory.id,
          progress: Math.floor(currentTime),
          completed: false,
          last_played: new Date().toISOString()
        }, { onConflict: 'user_id,story_id' })
    }, 30000)

    return () => clearInterval(interval)
  }, [user, currentStory, isPlaying, currentTime])

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // Loading state
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  // No playlist state
  if (playlist.length === 0) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', color: 'white', marginBottom: '16px' }}>No playlist found</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>Build a playlist from the library first.</p>
        <button onClick={() => router.push('/library')} style={{ backgroundColor: '#f97316', color: 'black', padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Go to Library</button>
      </div>
    </div>
  )

  // Playlist complete state
  if (currentIndex >= playlist.length) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', color: 'white', marginBottom: '8px' }}>🎉 Playlist Complete!</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>You've finished all {playlist.length} stories.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => { setCurrentIndex(0); setCharged(false); }} style={{ backgroundColor: '#f97316', color: 'black', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>↻ Play Again</button>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Back to Library</button>
        </div>
      </div>
    </div>
  )

  // Announcement playing state
  if (playingAnnouncement && nextStory) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <audio 
        ref={announcementRef}
        onEnded={handleAnnouncementEnded}
      />
      <StickyHeaderFull />
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>Up Next...</p>
        
        {/* Next story cover */}
        <div style={{ 
          width: '100%', 
          maxWidth: '200px', 
          margin: '0 auto 16px', 
          aspectRatio: '1', 
          borderRadius: '12px', 
          overflow: 'hidden', 
          backgroundColor: '#1e293b',
          boxShadow: '0 0 20px rgba(255,255,255,0.3)'
        }}>
          {nextStory.cover_url ? (
            <img src={nextStory.cover_url} alt={nextStory.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #ea580c, #7c2d12)' }}>
              <span style={{ fontSize: '48px', opacity: 0.5 }}>🎧</span>
            </div>
          )}
        </div>
        
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', textAlign: 'center', color: 'white', marginBottom: '24px' }}>{nextStory.title}</h1>
        
        {/* Skip button */}
        <button 
          onClick={handleSkipAnnouncement}
          style={{ 
            padding: '14px 48px', 
            backgroundColor: '#334155', 
            border: 'none', 
            borderRadius: '12px', 
            color: 'white', 
            fontWeight: '600', 
            fontSize: '16px', 
            cursor: 'pointer' 
          }}
        >
          Skip →
        </button>
      </main>
    </div>
  )

  // Main player
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <audio 
        ref={audioRef} 
        src={currentStory.audio_url || undefined} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata} 
        onEnded={handleEnded} 
        preload="auto" 
      />
      <audio ref={announcementRef} preload="none" />
      
      {/* Header */}
      <StickyHeaderFull />

      {/* Main Content */}
      <main style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Now Playing Flag */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={{
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}>
            Now Playing
          </span>
        </div>
        
        {/* Cover */}
        <div style={{ 
          width: '100%', 
          maxWidth: '180px', 
          margin: '0 auto 12px', 
          aspectRatio: '1', 
          borderRadius: '12px', 
          overflow: 'hidden', 
          backgroundColor: '#1e293b',
          boxShadow: '0 0 20px rgba(255,255,255,0.3)'
        }}>
          {currentStory.cover_url ? (
            <img src={currentStory.cover_url} alt={currentStory.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #ea580c, #7c2d12)' }}>
              <span style={{ fontSize: '48px', opacity: 0.5 }}>🎧</span>
            </div>
          )}
        </div>
        
        {/* Title only */}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', textAlign: 'center', color: 'white', marginBottom: '12px' }}>{currentStory.title}</h1>
        
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
        
        {/* Play/Pause and Skip Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button 
            onClick={handlePlayPause} 
            style={{ 
              flex: 1,
              padding: '16px',
              borderRadius: '12px', 
              backgroundColor: isPlaying ? '#334155' : '#22c55e', 
              border: 'none', 
              color: isPlaying ? 'white' : 'black', 
              fontSize: '18px', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button 
            onClick={handleSkip} 
            style={{ 
              flex: 1,
              padding: '16px',
              borderRadius: '12px', 
              backgroundColor: '#334155', 
              border: 'none', 
              color: 'white', 
              fontSize: '18px', 
              fontWeight: 'bold', 
              cursor: 'pointer'
            }}
          >
            Skip →
          </button>
        </div>

        {/* Next Up */}
        {nextStory && (
          <div>
            <p style={{ color: '#f97316', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Next Up</p>
            <Link 
              href={`/player/${nextStory.id}`}
              style={{
                display: 'flex',
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                overflow: 'hidden',
                textDecoration: 'none'
              }}
            >
              <div style={{ width: '80px', height: '80px', flexShrink: 0, padding: '8px' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }}>
                  <img 
                    src={nextStory.cover_url || '/images/default-cover.png'} 
                    alt={nextStory.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              </div>
              <div style={{ 
                flex: 1, 
                padding: '8px 12px 8px 0', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center' 
              }}>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>{nextStory.title}</p>
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>{nextStory.genre}</p>
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>by {nextStory.author}</p>
                <p style={{ color: 'white', fontSize: '12px' }}>
                  {nextStory.duration_mins} min • {nextStory.credits || Math.max(1, Math.floor(nextStory.duration_mins / 15))} credit
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Charge countdown */}
        {!charged && currentTime > 0 && currentTime < 180 && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '12px' }}>
            Credits charged in {Math.ceil((180 - currentTime) / 60)} min
          </p>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function PlaylistPlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PlaylistPlayerContent />
    </Suspense>
  )
}
