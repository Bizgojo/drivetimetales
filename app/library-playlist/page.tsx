'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs}hr ${mins}min`
  return `${mins}min`
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(10)
  const [isSubscriber, setIsSubscriber] = useState(true)
  const [userName, setUserName] = useState('Friend')

  // Filters
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [selectedType, setSelectedType] = useState('Both')

  // Playlist
  const [playlist, setPlaylist] = useState<Story[]>([])
  const [isBuilding, setIsBuilding] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [playedStories, setPlayedStories] = useState<Set<string>>(new Set())
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_user_credits')
    if (storedCredits) setUserCredits(parseInt(storedCredits, 10))

    const storedSubscriber = localStorage.getItem('dtt_is_subscriber')
    setIsSubscriber(storedSubscriber === 'true')

    const storedName = localStorage.getItem('dtt_user_name')
    if (storedName) setUserName(storedName)

    const storedPlaylist = localStorage.getItem('dtt_playlist')
    if (storedPlaylist) {
      const parsed = JSON.parse(storedPlaylist)
      setPlaylist(parsed)
    }

    const storedIndex = localStorage.getItem('dtt_playlist_index')
    if (storedIndex) setCurrentIndex(parseInt(storedIndex, 10))

    const storedProgress = localStorage.getItem('dtt_playlist_progress')
    if (storedProgress) setCurrentProgress(parseInt(storedProgress, 10))

    const storedPlayed = localStorage.getItem('dtt_played_stories')
    if (storedPlayed) setPlayedStories(new Set(JSON.parse(storedPlayed)))
  }, [])

  useEffect(() => {
    async function fetchStories() {
      const { data } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })

      if (data) setStories(data)
      setLoading(false)
    }
    fetchStories()
  }, [])

  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    }
  }, [playlist])

  useEffect(() => {
    localStorage.setItem('dtt_playlist_index', currentIndex.toString())
  }, [currentIndex])

  useEffect(() => {
    localStorage.setItem('dtt_playlist_progress', currentProgress.toString())
  }, [currentProgress])

  useEffect(() => {
    localStorage.setItem('dtt_played_stories', JSON.stringify([...playedStories]))
  }, [playedStories])

  // Filter stories
  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      const mins = story.duration_mins
      if (selectedDuration === '15m' && mins > 20) return false
      if (selectedDuration === '30m' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '1hr' && mins < 40) return false
    }
    if (selectedGenre !== 'All') {
      if (!story.genre?.toLowerCase().includes(selectedGenre.toLowerCase())) return false
    }
    if (selectedType !== 'Both') {
      const isSeries = story.series_name && story.series_total && story.series_total > 1
      if (selectedType === 'Singles' && isSeries) return false
      if (selectedType === 'Series' && !isSeries) return false
    }
    return true
  })

  const playlistTotal = playlist.reduce((acc, s) => acc + s.duration_mins * 60, 0)
  const playlistCredits = playlist.reduce((acc, s) => acc + getCredits(s.duration_mins), 0)
  const remainingCredits = userCredits - playlistCredits

  const btnStyle = (active: boolean) => ({
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    minHeight: '44px'
  })

  const handleCreatePlaylist = () => {
    if (!isSubscriber) {
      setShowSubscriberPopup(true)
      return
    }
    setIsBuilding(true)
  }

  const toggleStorySelection = (story: Story) => {
    const isSelected = playlist.some(s => s.id === story.id)
    if (isSelected) {
      setPlaylist(playlist.filter(s => s.id !== story.id))
    } else {
      const storyCost = getCredits(story.duration_mins)
      if (remainingCredits >= storyCost) {
        setPlaylist([...playlist, story])
      }
    }
  }

  const savePlaylist = () => {
    setIsBuilding(false)
  }

  const startPlaylist = () => {
    if (playlist.length === 0) return
    setIsPlaying(true)
    setIsPaused(false)
    
    // Resume 5 seconds before if we have progress
    const resumeProgress = currentProgress > 5 ? currentProgress - 5 : 0
    setCurrentProgress(resumeProgress)
    
    // Start playback simulation
    playIntervalRef.current = setInterval(() => {
      setCurrentProgress(prev => {
        const currentStory = playlist[currentIndex]
        const storyDuration = currentStory.duration_mins * 60
        
        // Check if passed 10% - deduct credit
        const tenPercent = storyDuration * 0.1
        if (prev === Math.floor(tenPercent)) {
          console.log(`💰 Credit deducted for: ${currentStory.title}`)
        }
        
        if (prev >= storyDuration) {
          // Story finished
          setPlayedStories(played => new Set([...played, currentStory.id]))
          
          if (currentIndex < playlist.length - 1) {
            // Next story
            const nextStory = playlist[currentIndex + 1]
            console.log(`🎧 Next up: ${nextStory.title}, ${nextStory.genre}, by ${nextStory.author || 'Drive Time Tales'}, ${nextStory.duration_mins} minutes`)
            setCurrentIndex(i => i + 1)
            return 0
          } else {
            // Playlist finished
            console.log(`🎉 ${userName}, your playlist has ended. Hope you enjoyed it!`)
            clearInterval(playIntervalRef.current!)
            setIsPlaying(false)
            setPlaylist([])
            setCurrentIndex(0)
            localStorage.removeItem('dtt_playlist')
            localStorage.removeItem('dtt_playlist_index')
            localStorage.removeItem('dtt_playlist_progress')
            return 0
          }
        }
        return prev + 1
      })
    }, 1000)
  }

  const pausePlaylist = () => {
    setIsPaused(true)
    setIsPlaying(false)
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current)
    }
  }

  const skipStory = () => {
    const currentStory = playlist[currentIndex]
    const storyDuration = currentStory.duration_mins * 60
    const tenPercent = storyDuration * 0.1
    
    if (currentProgress < tenPercent) {
      console.log(`⏭️ Skipped before 10% - no credit charged for: ${currentStory.title}`)
    }
    
    if (currentIndex < playlist.length - 1) {
      const nextStory = playlist[currentIndex + 1]
      console.log(`🎧 Next up: ${nextStory.title}`)
      setCurrentIndex(i => i + 1)
      setCurrentProgress(0)
    } else {
      console.log(`🎉 ${userName}, your playlist has ended. Hope you enjoyed it!`)
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      setIsPlaying(false)
      setPlaylist([])
      setCurrentIndex(0)
      localStorage.removeItem('dtt_playlist')
    }
  }

  const deletePlaylist = () => {
    setPlaylist([])
    setCurrentIndex(0)
    setCurrentProgress(0)
    setIsPaused(false)
    localStorage.removeItem('dtt_playlist')
    localStorage.removeItem('dtt_playlist_index')
    localStorage.removeItem('dtt_playlist_progress')
  }

  const getPlayStatus = (storyId: string): 'played' | 'continue' | null => {
    if (playedStories.has(storyId)) return 'played'
    return null
  }

  const getRemainingTime = () => {
    let remaining = 0
    for (let i = currentIndex; i < playlist.length; i++) {
      if (i === currentIndex) {
        remaining += (playlist[i].duration_mins * 60) - currentProgress
      } else {
        remaining += playlist[i].duration_mins * 60
      }
    }
    return remaining
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  // SUBSCRIBER POPUP
  if (showSubscriberPopup) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ color: 'white', fontSize: '24px', marginBottom: '1rem' }}>🎧 Playlists for Subscribers</h2>
          <p style={{ color: '#e2e8f0', marginBottom: '1.5rem' }}>Create playlists and enjoy hands-free listening during your commute. Subscribe to unlock this feature!</p>
          <button
            onClick={() => router.push('/subscribe')}
            style={{ backgroundColor: '#f97316', color: 'white', padding: '1rem 2rem', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '1rem', width: '100%' }}
          >
            Subscribe Now
          </button>
          <button
            onClick={() => setShowSubscriberPopup(false)}
            style={{ backgroundColor: 'transparent', color: '#94a3b8', padding: '0.5rem', border: 'none', cursor: 'pointer' }}
          >
            Maybe Later
          </button>
        </div>
      </div>
    )
  }

  // PLAYING STATE
  if (isPlaying && playlist.length > 0) {
    const currentStory = playlist[currentIndex]
    const storyDuration = currentStory.duration_mins * 60
    const progressPercent = (currentProgress / storyDuration) * 100

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
        <WL01StickyLogo credits={userCredits} />
        
        {/* Now Playing Banner - Sticky */}
        <div style={{ 
          position: 'sticky', 
          top: '60px', 
          zIndex: 40, 
          backgroundColor: '#0f172a', 
          padding: '1rem',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '10px', height: '10px', backgroundColor: '#22c55e', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#22c55e', fontSize: '14px', fontWeight: 'bold' }}>NOW PLAYING</span>
              <span style={{ color: 'white', marginLeft: 'auto', fontSize: '14px' }}>{formatTime(getRemainingTime())} remaining</span>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <img 
                src={currentStory.cover_url || '/images/default-cover.png'} 
                alt={currentStory.title}
                style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover' }}
              />
              <div style={{ flex: 1 }}>
                <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', margin: 0 }}>{currentStory.title}</h3>
                <p style={{ color: 'white', fontSize: '14px', margin: '4px 0' }}>{currentStory.genre} • by {currentStory.author || 'Drive Time Tales'}</p>
                <p style={{ color: 'white', fontSize: '12px', margin: 0 }}>Story {currentIndex + 1} of {playlist.length}</p>
              </div>
              <button
                onClick={pausePlaylist}
                style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ⏸️ Pause
              </button>
            </div>
            
            {/* Progress Bar */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontSize: '12px', marginBottom: '4px' }}>
                <span>{formatTime(currentProgress)}</span>
                <span>-{formatTime(storyDuration - currentProgress)}</span>
              </div>
              <div style={{ backgroundColor: '#475569', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f97316', height: '100%', width: `${progressPercent}%`, transition: 'width 1s linear' }} />
              </div>
            </div>
          </div>
          
          {/* Skip Button */}
          <button
            onClick={skipStory}
            style={{ width: '100%', backgroundColor: '#3b82f6', color: 'white', padding: '1rem', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.75rem' }}
          >
            ⏭️ Skip to Next Story
          </button>
        </div>

        {/* Up Next */}
        <div style={{ padding: '1rem' }}>
          <h3 style={{ color: 'white', fontSize: '16px', marginBottom: '0.75rem' }}>Up Next</h3>
          {playlist.slice(currentIndex + 1, currentIndex + 4).map((story, idx) => (
            <div key={story.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '14px' }}>{currentIndex + 2 + idx}</span>
              <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover' }} />
              <div>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', margin: 0 }}>{story.title}</p>
                <p style={{ color: 'white', fontSize: '12px', margin: 0 }}>{story.duration_mins}min</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // BUILDING STATE
  if (isBuilding) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
        <WL01StickyLogo credits={userCredits} />
        
        {/* Sticky Filter + Status Section */}
        <div style={{ 
          position: 'sticky', 
          top: '60px', 
          zIndex: 40, 
          backgroundColor: '#0f172a', 
          padding: '0.75rem',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
            {/* Header with credits */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
              <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Select stories for your playlist</span>
              <span style={{ backgroundColor: '#22c55e', color: '#0f172a', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
                {remainingCredits} credits left
              </span>
            </div>
            
            {/* Filters Row 1: Duration | Type */}
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['All', '15m', '30m', '1hr'].map(d => (
                <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>
              ))}
              <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
              {['Both', 'Singles', 'Series'].map(t => (
                <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>
              ))}
            </div>
            
            {/* Filters Row 2: Genre */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
                <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                  {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Playlist Status */}
          {playlist.length > 0 && (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.75rem', marginTop: '0.5rem', textAlign: 'center' }}>
              <span style={{ color: 'white', fontSize: '14px' }}>{playlist.length} stories • {formatTime(playlistTotal)} • {playlistCredits} credits</span>
            </div>
          )}
        </div>

        {/* Story List */}
        <div style={{ padding: '0.75rem' }}>
          {filteredStories.map((story) => {
            const isSelected = playlist.some(s => s.id === story.id)
            const storyCost = getCredits(story.duration_mins)
            const canAfford = remainingCredits >= storyCost || isSelected
            const position = playlist.findIndex(s => s.id === story.id) + 1

            return (
              <div
                key={story.id}
                onClick={() => canAfford && toggleStorySelection(story)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  backgroundColor: isSelected ? '#1e3a5f' : '#1e293b',
                  borderRadius: '12px',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  opacity: canAfford ? 1 : 0.5,
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  border: isSelected ? '2px solid #f97316' : '2px solid transparent'
                }}
              >
                {isSelected && (
                  <div style={{ width: '28px', height: '28px', backgroundColor: '#f97316', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px', flexShrink: 0 }}>
                    {position}
                  </div>
                )}
                <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ color: 'white', fontSize: '15px', fontWeight: 'bold', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</h3>
                  <p style={{ color: 'white', fontSize: '13px', margin: '2px 0' }}>{story.genre} • {story.duration_mins}min • {storyCost} cr</p>
                  <p style={{ color: 'white', fontSize: '12px', margin: 0 }}>by {story.author || 'Drive Time Tales'}</p>
                </div>
                {isSelected ? (
                  <span style={{ color: '#22c55e', fontSize: '20px' }}>✓</span>
                ) : (
                  <span style={{ color: '#475569', fontSize: '20px' }}>+</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Sticky Save Button */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '1rem', backgroundColor: '#0f172a', borderTop: '1px solid #334155' }}>
          <button
            onClick={savePlaylist}
            disabled={playlist.length === 0}
            style={{
              width: '100%',
              backgroundColor: playlist.length > 0 ? '#22c55e' : '#475569',
              color: playlist.length > 0 ? '#0f172a' : 'white',
              padding: '1rem',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: 'bold',
              border: 'none',
              cursor: playlist.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            💾 Save My Playlist ({playlist.length} stories • {formatTime(playlistTotal)})
          </button>
        </div>
      </div>
    )
  }

  // MAIN LIBRARY STATE (with saved playlist or not)
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <WL01StickyLogo credits={userCredits} />
      
      {/* Sticky Filter + Playlist Section */}
      <div style={{ 
        position: 'sticky', 
        top: '60px', 
        zIndex: 40, 
        backgroundColor: '#0f172a', 
        padding: '0.75rem',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
          {/* Filters Row 1: Duration | Type */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => (
              <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>
            ))}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
            {['Both', 'Singles', 'Series'].map(t => (
              <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>
            ))}
          </div>
          
          {/* Filters Row 2: Genre */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
              <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
              </button>
            ))}
          </div>

          {/* Playlist Row */}
          {playlist.length === 0 && !isPaused ? (
            <button
              onClick={handleCreatePlaylist}
              style={{ width: '100%', backgroundColor: '#3b82f6', color: 'white', padding: '0.75rem', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.35rem' }}
            >
              ➕ Create a Playlist
            </button>
          ) : isPaused ? (
            <div style={{ marginTop: '0.35rem' }}>
              <button
                onClick={startPlaylist}
                style={{ width: '100%', backgroundColor: '#f97316', color: 'white', padding: '0.75rem', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '0.35rem' }}
              >
                ▶️ Continue Playlist ({formatTime(getRemainingTime())} left)
              </button>
              <button
                onClick={deletePlaylist}
                style={{ width: '100%', backgroundColor: '#dc2626', color: 'white', padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '13px', cursor: 'pointer' }}
              >
                🗑️ Delete Playlist
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '0.35rem' }}>
              <button
                onClick={startPlaylist}
                style={{ width: '100%', backgroundColor: '#22c55e', color: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '0.35rem' }}
              >
                ▶️ Play Your Playlist ({formatTime(playlistTotal)})
              </button>
              <button
                onClick={deletePlaylist}
                style={{ width: '100%', backgroundColor: '#dc2626', color: 'white', padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '13px', cursor: 'pointer' }}
              >
                🗑️ Delete Playlist
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Story Cards */}
      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: 'white', fontSize: '18px', marginBottom: '0.5rem' }}>
              Sorry, we have no stories for your {selectedDuration !== 'All' ? selectedDuration + ', ' : ''}{selectedGenre !== 'All' ? selectedGenre + ', ' : ''}{selectedType !== 'Both' ? selectedType.toLowerCase() : ''} selection.
            </p>
            <p style={{ color: '#e2e8f0', fontSize: '14px' }}>We will make a request to our writers for this category.</p>
          </div>
        ) : (
          filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = userCredits >= storyCost
            return (
              <HorizontalStoryCard
                key={story.id}
                id={story.id}
                title={story.title}
                genre={story.genre}
                author={story.author || 'Drive Time Tales'}
                duration_mins={story.duration_mins}
                credits={storyCost}
                cover_url={story.cover_url}
                rating={4.0}
                review_count={0}
                flag={canAfford ? 'free' : null}
                series_number={story.series_number}
                series_total={story.series_total}
                play_status={getPlayStatus(story.id)}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
