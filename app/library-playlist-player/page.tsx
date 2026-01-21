'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  audio_url?: string | null
  credited: boolean
}

function getGenreEmoji(genre: string): string {
  const g = genre?.toLowerCase() || ''
  if (g.includes('mystery') || g.includes('thriller')) return '🔍'
  if (g.includes('romance')) return '💕'
  if (g.includes('sci-fi') || g.includes('scifi')) return '🚀'
  if (g.includes('horror')) return '👻'
  if (g.includes('comedy')) return '😂'
  if (g.includes('learn') || g.includes('education')) return '🧠'
  return '📖'
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
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  if (playlist.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <span style={{ fontSize: '48px', marginBottom: '1rem' }}>🎵</span>
        <h2 style={{ color: 'white', fontSize: '20px', marginBottom: '0.5rem' }}>No Playlist Found</h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Create a playlist first to start playing.</p>
        <button onClick={() => router.push('/library-playlist')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Create Playlist</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <Link href="/library-playlist" style={{ color: '#94a3b8', textDecoration: 'none' }}>← Back</Link>
        <span style={{ color: 'white', fontWeight: 'bold' }}>🚗 Playlist Player</span>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isPlaying ? '#22c55e' : '#f97316', animation: isPlaying ? 'pulse 1.5s infinite' : 'none' }} />
            <span style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>{isPlaying ? 'Now Playing' : 'Paused'}</span>
            <span style={{ color: '#64748b', fontSize: '12px', marginLeft: 'auto' }}>Story {currentIndex + 1} of {playlist.length}</span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 15px rgba(255,255,255,0.3)' }}>
              {currentStory?.cover_url ? (
                <img src={currentStory.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{getGenreEmoji(currentStory?.genre || '')}</div>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '0.25rem' }}>{currentStory?.title}</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>by {currentStory?.author}</p>
              <p style={{ color: '#64748b', fontSize: '12px' }}>{currentStory?.genre}</p>
            </div>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ backgroundColor: '#334155', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f97316', height: '100%', width: `${Math.min(progressPercent, 100)}%`, borderRadius: '3px', transition: 'width 0.5s' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px' }}>
            <span>{formatSeconds(currentProgress)}</span>
            <span>-{formatSeconds(Math.max(0, storyDurationSecs - currentProgress))}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button onClick={handlePauseResume} style={{ flex: 1, backgroundColor: '#f97316', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>{isPlaying ? '⏸️ Pause' : '▶️ Resume'}</button>
          <button onClick={handleSkip} style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>⏭️ Skip</button>
        </div>

        <div style={{ backgroundColor: '#1e3a5f', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>💡</span>
          <span style={{ color: '#93c5fd', fontSize: '12px' }}>Credits charged at 10% • Skip before 10% = free</span>
        </div>

        {playlist.length > currentIndex + 1 && (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Up Next</div>
            {playlist.slice(currentIndex + 1, currentIndex + 4).map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < Math.min(2, playlist.length - currentIndex - 2) ? '1px solid #334155' : 'none' }}>
                <span style={{ color: '#64748b', fontSize: '14px', width: '20px' }}>{currentIndex + idx + 2}</span>
                <div style={{ width: '40px', height: '40px', backgroundColor: '#334155', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  {item.cover_url ? <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{getGenreEmoji(item.genre)}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>{item.duration_mins} min • {getCredits(item.duration_mins)} cr</div>
                </div>
              </div>
            ))}
            {playlist.length - currentIndex - 1 > 3 && <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '0.75rem' }}>+ {playlist.length - currentIndex - 4} more</div>}
          </div>
        )}
      </div>

      {showComplete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '2rem', maxWidth: '320px', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>🎉</span>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Playlist Complete!</h2>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Great listening, {userName}!</p>
            <button onClick={exitPlayer} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%' }}>Back to Library</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPlayerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>}>
      <PlaylistPlayerContent />
    </Suspense>
  )
}
