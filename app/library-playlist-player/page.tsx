'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyLogo1 from '@/components/StickyLogo1'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  credited: boolean
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function formatSeconds(secs: number): string {
  const mins = Math.floor(secs / 60)
  const remainingSecs = Math.floor(secs % 60)
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`
}

function PlaylistPlayerContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [userName, setUserName] = useState('Friend')
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasAnnouncedStart = useRef(false)

  useEffect(() => {
    async function loadUser() {
      if (!user) return
      const { data } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', user.id)
        .single()
      if (data?.first_name) {
        setUserName(data.first_name)
      }
    }
    loadUser()
  }, [user])

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    const savedProgress = localStorage.getItem('dtt_playlist_progress')

    if (savedPlaylist) {
      const parsed = JSON.parse(savedPlaylist)
      setPlaylist(parsed)
      setCurrentIndex(savedIndex ? parseInt(savedIndex) : 0)
      setCurrentProgress(savedProgress ? parseInt(savedProgress) : 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading && playlist.length > 0 && !hasAnnouncedStart.current) {
      hasAnnouncedStart.current = true
      const firstStory = playlist[0]
      console.log(`[ANNOUNCEMENT] Hi ${userName}! Here is your first selection: "${firstStory.title}"`)
      setIsPlaying(true)
    }
  }, [loading, playlist, userName])

  const currentStory = playlist[currentIndex]
  const storyDurationSecs = (currentStory?.duration_mins || 1) * 60
  const progressPercent = (currentProgress / storyDurationSecs) * 100
  const tenPercentMark = storyDurationSecs * 0.1

  useEffect(() => {
    if (isPlaying && currentStory) {
      intervalRef.current = setInterval(() => {
        setCurrentProgress(prev => {
          const newProgress = prev + 1
          
          if (newProgress % 10 === 0) {
            localStorage.setItem('dtt_playlist_progress', newProgress.toString())
          }

          if (prev < tenPercentMark && newProgress >= tenPercentMark && !currentStory.credited) {
            const credits = getCredits(currentStory.duration_mins)
            console.log(`[CREDITS] Deducting ${credits} credit(s) for "${currentStory.title}"`)
            const updatedPlaylist = [...playlist]
            updatedPlaylist[currentIndex].credited = true
            setPlaylist(updatedPlaylist)
            localStorage.setItem('dtt_playlist', JSON.stringify(updatedPlaylist))
          }

          if (newProgress >= storyDurationSecs) {
            handleNextStory()
            return 0
          }

          return newProgress
        })
      }, 1000)

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, currentIndex, currentStory, storyDurationSecs, tenPercentMark])

  const handlePauseResume = () => {
    if (isPlaying) {
      setIsPlaying(false)
      console.log(`[PLAYBACK] Paused at ${currentProgress}s`)
    } else {
      const resumePoint = Math.max(0, currentProgress - 5)
      setCurrentProgress(resumePoint)
      setIsPlaying(true)
      console.log(`[PLAYBACK] Resuming from ${resumePoint}s (rewound 5 seconds)`)
    }
  }

  const handleSkip = () => {
    if (!currentStory) return
    if (currentProgress < tenPercentMark && !currentStory.credited) {
      console.log(`[CREDITS] Skipped before 10% - no charge for "${currentStory.title}"`)
    }
    handleNextStory()
  }

  const handleNextStory = () => {
    if (currentIndex < playlist.length - 1) {
      const nextIndex = currentIndex + 1
      const nextStory = playlist[nextIndex]
      console.log(`[ANNOUNCEMENT] Next up: "${nextStory.title}", ${nextStory.duration_mins} minutes`)
      setCurrentIndex(nextIndex)
      setCurrentProgress(0)
      localStorage.setItem('dtt_playlist_index', nextIndex.toString())
      localStorage.setItem('dtt_playlist_progress', '0')
    } else {
      console.log(`[ANNOUNCEMENT] Your playlist is complete. Hope you enjoyed it, ${userName}!`)
      setIsPlaying(false)
      setShowComplete(true)
      localStorage.removeItem('dtt_playlist')
      localStorage.removeItem('dtt_playlist_index')
      localStorage.removeItem('dtt_playlist_progress')
    }
  }

  const exitPlayer = () => {
    router.push('/library')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  if (playlist.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
        <StickyLogo1 userName={userName} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '64px', marginBottom: '1rem' }}>🎵</span>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '0.5rem' }}>No Playlist Found</h2>
          <p style={{ color: '#cbd5e1', fontSize: '18px', marginBottom: '2rem' }}>Create a playlist first to start playing.</p>
          <button onClick={() => router.push('/library-playlist')} style={{ backgroundColor: '#f97316', color: 'white', padding: '1rem 2rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>Create Playlist</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <StickyLogo1 userName={userName} />

      <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', paddingBottom: '120px' }}>
        
        {/* NOW PLAYING Banner - BIG for driving */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: isPlaying ? '#22c55e' : '#f97316', animation: isPlaying ? 'pulse 1.5s infinite' : 'none' }} />
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {isPlaying ? 'Now Playing' : 'Paused'}
            </span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginLeft: 'auto' }}>
              {currentIndex + 1} of {playlist.length}
            </span>
          </div>

          {/* Cover and Info - BIGGER */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 20px rgba(255,255,255,0.4)' }}>
              {currentStory?.cover_url ? (
                <img src={currentStory.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #f97316, #c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '40px' }}>🎧</span>
                </div>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '0.5rem', lineHeight: 1.2 }}>{currentStory?.title}</h2>
              <p style={{ color: '#cbd5e1', fontSize: '16px' }}>by {currentStory?.author}</p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>{currentStory?.genre} • {currentStory?.duration_mins} min</p>
            </div>
          </div>

          {/* Progress Bar - FATTER */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ backgroundColor: '#475569', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f97316', height: '100%', width: `${Math.min(progressPercent, 100)}%`, borderRadius: '6px', transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Time Display - BIGGER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontSize: '18px', fontWeight: '600' }}>
            <span>{formatSeconds(currentProgress)}</span>
            <span>-{formatSeconds(Math.max(0, storyDurationSecs - currentProgress))}</span>
          </div>
        </div>

        {/* Control Buttons - BIG for driving */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button onClick={handlePauseResume} style={{ flex: 1, backgroundColor: '#f97316', color: 'white', padding: '1.25rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}>
            {isPlaying ? '⏸️ Pause' : '▶️ Resume'}
          </button>
          <button onClick={handleSkip} style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white', padding: '1.25rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}>
            ⏭️ Skip
          </button>
        </div>

        {/* Credit Info Banner */}
        <div style={{ backgroundColor: '#1e3a5f', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '20px' }}>💡</span>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: '500' }}>Credits charged at 10% • Skip before 10% = free</span>
        </div>

        {/* Up Next - Using HorizontalStoryCard */}
        {playlist.length > currentIndex + 1 && (
          <div>
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>📋 Up Next</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {playlist.slice(currentIndex + 1, currentIndex + 4).map((item) => (
                <div key={item.id} style={{ pointerEvents: 'none' }}>
                  <HorizontalStoryCard
                    id={item.id}
                    title={item.title}
                    genre={item.genre}
                    author={item.author}
                    duration_mins={item.duration_mins}
                    cover_url={item.cover_url}
                  />
                </div>
              ))}
              {playlist.length - currentIndex - 1 > 3 && (
                <p style={{ color: 'white', fontSize: '14px', textAlign: 'center', marginTop: '0.5rem' }}>
                  + {playlist.length - currentIndex - 4} more stories
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Playlist Complete Popup */}
      {showComplete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '20px', padding: '2.5rem', maxWidth: '340px', textAlign: 'center' }}>
            <span style={{ fontSize: '64px', display: 'block', marginBottom: '1rem' }}>🎉</span>
            <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '0.75rem' }}>Playlist Complete!</h2>
            <p style={{ color: '#cbd5e1', fontSize: '18px', marginBottom: '2rem' }}>Great listening, {userName}!</p>
            <button onClick={exitPlayer} style={{ backgroundColor: '#f97316', color: 'white', padding: '1rem 2rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold', width: '100%' }}>Back to Library</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPlayerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '48px', height: '48px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>}>
      <PlaylistPlayerContent />
    </Suspense>
  )
}
