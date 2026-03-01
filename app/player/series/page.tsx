'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import Link from 'next/link'

interface SeriesStory {
  id: string
  title: string
  author: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url: string
  episode_number: number
  series_name: string
}

function SeriesPlayerContent() {
  const router = useRouter()
  const { user } = useAuth()
  
  const [playlist, setPlaylist] = useState<SeriesStory[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [charged, setCharged] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentStory = playlist[currentIndex]
  const nextStory = playlist[currentIndex + 1]
  const isLastStory = currentIndex === playlist.length - 1
  const totalEpisodes = playlist.length
  const currentEpisode = currentIndex + 1

  // Load series playlist from localStorage
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_series_playlist')
    const savedIndex = localStorage.getItem('dtt_series_index')
    
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        // Fetch full story data for each episode
        fetchFullStoryData(parsed)
      } catch (e) {
        console.error('Failed to parse series playlist:', e)
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
    
    if (savedIndex) {
      setCurrentIndex(parseInt(savedIndex, 10))
    }
  }, [])

  // Fetch full story data from database
  const fetchFullStoryData = async (episodes: any[]) => {
    const ids = episodes.map(ep => ep.id)
    const { data: stories } = await supabase
      .from('stories')
      .select('id, title, author, description, genre, duration_mins, cover_url, audio_url, episode_number, series_name')
      .in('id', ids)
    
    if (stories) {
      // Sort by episode number and merge with playlist order
      const storyMap = new Map(stories.map(s => [s.id, s]))
      const fullPlaylist = episodes.map(ep => ({
        ...storyMap.get(ep.id),
        episode_number: ep.episode_number || storyMap.get(ep.id)?.episode_number || 1,
        series_name: ep.series_name || storyMap.get(ep.id)?.series_name || 'Series'
      })).filter(Boolean) as SeriesStory[]
      
      setPlaylist(fullPlaylist)
    }
    setLoading(false)
  }

  // FIX: Force audio element to load new source when currentIndex changes
  useEffect(() => {
    if (audioRef.current && playlist.length > 0 && currentStory) {
      // Reset state for new episode
      setAudioReady(false)
      setDuration(0)
      // Force the audio element to load the new source
      audioRef.current.load()
    }
  }, [currentIndex, playlist])

  // Auto-play when audio is ready
  useEffect(() => {
    if (audioReady && audioRef.current && playlist.length > 0) {
      audioRef.current.play().catch(err => {
        console.error('Autoplay failed:', err)
      })
      setIsPlaying(true)
    }
  }, [audioReady])

  // Check if current story is already in user's library
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
      localStorage.setItem('dtt_series_index', currentIndex.toString())
    }
  }, [currentIndex, playlist.length])

  // Handle audio metadata loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setAudioReady(true)
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
    
    // If not last story, go to next
    if (!isLastStory && nextStory) {
      goToNextStory()
    } else {
      // Series complete
      localStorage.removeItem('dtt_series_index')
    }
  }

  // Skip to next episode
  const handleSkip = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    
    if (!isLastStory && nextStory) {
      goToNextStory()
    } else {
      router.push('/library')
    }
  }

  // Go to next story
  const goToNextStory = () => {
    setAudioReady(false)
    setCurrentTime(0)
    setDuration(0)
    setCharged(false)
    setIsPlaying(false)
    setCurrentIndex(prev => prev + 1)
  }

  // Track progress after 3 minutes of listening
  useEffect(() => {
    if (isPlaying && !charged && currentTime >= 180 && user && currentStory) {
      supabase.from('user_library').upsert({
        user_id: user.id,
        story_id: currentStory.id,
        progress: Math.floor(currentTime),
        completed: false,
        last_played: new Date().toISOString()
      }, { onConflict: 'user_id,story_id' })
      setCharged(true)
    }
  }, [currentTime, isPlaying, charged])

  // Play/Pause toggle
  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play().catch(err => console.error('Play failed:', err))
        setIsPlaying(true)
      }
    }
  }

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Empty playlist
  if (!currentStory) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <StickyHeaderFull />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📺</div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>No Series Selected</h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Go to the library and select a series to play</p>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#f97316', color: 'black', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Go to Library</button>
        </div>
      </div>
    )
  }

  // Series complete
  if (currentIndex >= playlist.length) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <StickyHeaderFull />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Series Complete!</h2>
        <p style={{ color: '#94a3b8', marginBottom: '24px' }}>You've finished {currentStory?.series_name || 'the series'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => { setCurrentIndex(0); setCharged(false); }} style={{ backgroundColor: '#f97316', color: 'black', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>↻ Play Again</button>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Back to Library</button>
        </div>
      </div>
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
      
      {/* Header */}
      <StickyHeaderFull />

      {/* Main Content */}
      <main style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Series Name + Episode Number */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <p style={{ color: '#f97316', fontSize: '14px', fontWeight: 'bold' }}>
            {currentStory.series_name}
          </p>
          <p style={{ color: 'white', fontSize: '12px' }}>
            Episode {currentStory.episode_number || currentEpisode} of {totalEpisodes}
          </p>
        </div>
        
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
            <div
              style={{
                display: 'flex',
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                overflow: 'hidden'
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
                <p style={{ color: '#f97316', fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>Episode {nextStory.episode_number || currentIndex + 2}</p>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>{nextStory.title}</p>
                <p style={{ color: 'white', fontSize: '12px' }}>
                  {nextStory.duration_mins} min
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Last episode message */}
        {isLastStory && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>🎉 This is the last episode!</p>
          </div>
        )}

        {/* Charge countdown */}
        
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function SeriesPlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SeriesPlayerContent />
    </Suspense>
  )
}
