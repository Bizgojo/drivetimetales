'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'

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

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  cover_url: string | null
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
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

function LibraryPlaylistContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  
  // Filters
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('Both')
  const [selectedGenre, setSelectedGenre] = useState('All')
  
  // Playlist state
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentProgress, setCurrentProgress] = useState(0) // seconds into current story
  const [isPlaying, setIsPlaying] = useState(false)
  const [buildingPlaylist, setBuildingPlaylist] = useState(false)
  const [buildGenre, setBuildGenre] = useState('All')

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits !== null) {
      setFreeCredits(parseInt(storedCredits, 10))
    }
    
    // Load saved playlist from localStorage
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    if (savedPlaylist) {
      setPlaylist(JSON.parse(savedPlaylist))
    }
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    if (savedIndex) {
      setCurrentIndex(parseInt(savedIndex, 10))
    }
    const savedProgress = localStorage.getItem('dtt_playlist_story_progress')
    if (savedProgress) {
      setCurrentProgress(parseInt(savedProgress, 10))
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('series_name', { ascending: true, nullsFirst: false })
        .order('series_number', { ascending: true })
        .order('published_on', { ascending: false })

      if (storiesData) setStories(storiesData)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Simulate playback progress
  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return
    
    const interval = setInterval(() => {
      setCurrentProgress(prev => {
        const currentStory = playlist[currentIndex]
        if (!currentStory) return prev
        
        const storyDurationSecs = currentStory.duration_mins * 60
        if (prev >= storyDurationSecs) {
          // Move to next story
          if (currentIndex < playlist.length - 1) {
            setCurrentIndex(currentIndex + 1)
            localStorage.setItem('dtt_playlist_index', String(currentIndex + 1))
            localStorage.setItem('dtt_playlist_story_progress', '0')
            return 0
          } else {
            // Playlist finished
            setIsPlaying(false)
            return prev
          }
        }
        localStorage.setItem('dtt_playlist_story_progress', String(prev + 1))
        return prev + 1
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isPlaying, currentIndex, playlist])

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
    if (selectedType === 'Singles') {
      if (story.series_number && story.series_total) return false
    }
    if (selectedType === 'Series') {
      if (!story.series_number || !story.series_total) return false
    }
    return true
  })

  // Group stories by series
  const groupedStories = filteredStories.reduce((acc, story) => {
    const key = story.series_name || story.id
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(story)
    return acc
  }, {} as Record<string, Story[]>)

  const buildFilteredStories = stories.filter(story => {
    if (buildGenre !== 'All') {
      if (!story.genre?.toLowerCase().includes(buildGenre.toLowerCase())) return false
    }
    return true
  })

  const playlistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)
  
  // Calculate remaining time
  const playedMins = playlist.slice(0, currentIndex).reduce((sum, item) => sum + item.duration_mins, 0) + Math.floor(currentProgress / 60)
  const remainingMins = playlistTotal - playedMins

  const togglePlaylistItem = (story: Story) => {
    const exists = playlist.find(p => p.id === story.id)
    if (exists) {
      setPlaylist(playlist.filter(p => p.id !== story.id))
    } else {
      setPlaylist([...playlist, {
        id: story.id,
        title: story.title,
        duration_mins: story.duration_mins,
        genre: story.genre,
        cover_url: story.cover_url
      }])
    }
  }

  const savePlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_story_progress', '0')
    setCurrentIndex(0)
    setCurrentProgress(0)
    setBuildingPlaylist(false)
  }

  const deletePlaylist = () => {
    localStorage.removeItem('dtt_playlist')
    localStorage.removeItem('dtt_playlist_index')
    localStorage.removeItem('dtt_playlist_story_progress')
    setPlaylist([])
    setCurrentIndex(0)
    setCurrentProgress(0)
    setIsPlaying(false)
  }

  const handlePlay = () => {
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPlaying(false)
  }

  const handleBack = () => {
    if (isPlaying) {
      handlePause()
    } else {
      router.back()
    }
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}hr ${m}min` : `${hrs}hr`
  }

  const formatSeconds = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}:${s.toString().padStart(2, '0')}`
  }

  const btnStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.5rem 0.6rem',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Building Playlist Screen
  if (buildingPlaylist) {
    const buildPlaylistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)
    
    return (
      <div className="min-h-screen bg-slate-950">
        <div style={{ backgroundColor: '#1e293b', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            onClick={() => setBuildingPlaylist(false)}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
          >
            ←
          </button>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '18px' }}>Build Your Playlist</span>
        </div>

        <div style={{ padding: '0.75rem' }}>
          {/* Genre filter */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
                <button
                  key={g}
                  onClick={() => setBuildGenre(g)}
                  style={btnStyle(buildGenre === g)}
                >
                  {g === 'All' ? 'All' : 
                   g === 'Mystery' ? '🔍Myst' :
                   g === 'Romance' ? '💕Rom' :
                   g === 'Sci-Fi' ? '🚀SciFi' :
                   g === 'Horror' ? '👻Horr' :
                   g === 'Comedy' ? '😂Com' : '🧠Learn'}
                </button>
              ))}
            </div>
          </div>

          {/* Running total */}
          <div style={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '10px', 
            padding: '0.75rem 1rem', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '0.75rem',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Playlist Total:</span>
            <span style={{ color: '#22c55e', fontSize: '18px', fontWeight: 'bold' }}>
              {playlist.length} stories • {formatTime(buildPlaylistTotal)}
            </span>
          </div>

          {/* Story list */}
          {buildFilteredStories.map(story => {
            const isSelected = playlist.some(p => p.id === story.id)
            return (
              <div 
                key={story.id}
                onClick={() => togglePlaylistItem(story)}
                style={{ 
                  backgroundColor: isSelected ? '#1e3a2f' : '#1e293b',
                  border: isSelected ? '2px solid #22c55e' : '2px solid transparent',
                  borderRadius: '10px', 
                  padding: '0.75rem', 
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ 
                  width: '50px', 
                  height: '50px', 
                  backgroundColor: '#334155',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                  overflow: 'hidden'
                }}>
                  {story.cover_url ? (
                    <img src={story.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getGenreEmoji(story.genre)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {story.title}
                    {story.series_number && story.series_total && (
                      <span style={{ color: '#3b82f6', fontSize: '12px', marginLeft: '6px' }}>
                        [{story.series_number}/{story.series_total}]
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                    {story.genre} • {story.duration_mins} min
                  </div>
                </div>
                <div style={{ 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '50%', 
                  border: isSelected ? 'none' : '2px solid #475569',
                  backgroundColor: isSelected ? '#22c55e' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0
                }}>
                  {isSelected && '✓'}
                </div>
              </div>
            )
          })}

          {/* Finish button */}
          <button 
            onClick={savePlaylist}
            disabled={playlist.length === 0}
            style={{ 
              backgroundColor: playlist.length > 0 ? '#22c55e' : '#475569',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: 'bold',
              border: 'none',
              cursor: playlist.length > 0 ? 'pointer' : 'not-allowed',
              width: '100%',
              marginTop: '0.5rem'
            }}
          >
            ✓ Finished - Save Playlist
          </button>
        </div>
      </div>
    )
  }

  // Playing State
  if (isPlaying && playlist.length > 0) {
    const currentStory = playlist[currentIndex]
    const storyDurationSecs = currentStory ? currentStory.duration_mins * 60 : 0
    const progressPercent = storyDurationSecs > 0 ? (currentProgress / storyDurationSecs) * 100 : 0

    return (
      <div className="min-h-screen bg-slate-950">
        {/* Header with back/pause */}
        <div style={{ backgroundColor: '#1e293b', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
          >
            ← Pause
          </button>
          <div style={{ 
            backgroundColor: '#22c55e', 
            color: 'white', 
            padding: '0.25rem 0.75rem', 
            borderRadius: '20px', 
            fontSize: '12px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: 'white', borderRadius: '50%', animation: 'pulse 1s infinite' }}></span>
            Playing
          </div>
        </div>

        <div style={{ padding: '1rem' }}>
          {/* Now Playing */}
          <div style={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '12px', 
            padding: '1.5rem', 
            textAlign: 'center',
            marginBottom: '1rem'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', marginBottom: '1rem' }}>
              Now Playing • {currentIndex + 1} of {playlist.length}
            </div>
            
            <div style={{ 
              width: '150px', 
              height: '150px', 
              margin: '0 auto 1rem',
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: '#334155'
            }}>
              {currentStory?.cover_url ? (
                <img src={currentStory.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '60px' }}>
                  {getGenreEmoji(currentStory?.genre || '')}
                </div>
              )}
            </div>

            <div style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {currentStory?.title}
            </div>
            
            {/* Progress bar */}
            <div style={{ backgroundColor: '#334155', height: '6px', borderRadius: '3px', margin: '1rem 0', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f97316', height: '100%', width: `${progressPercent}%`, borderRadius: '3px', transition: 'width 0.5s' }}></div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px' }}>
              <span>{formatSeconds(currentProgress)}</span>
              <span>-{formatSeconds(storyDurationSecs - currentProgress)}</span>
            </div>
          </div>

          {/* Up Next */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Up Next
            </div>
            
            {playlist.slice(currentIndex + 1, currentIndex + 4).map((item, idx) => (
              <div key={item.id} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                padding: '0.5rem 0',
                borderBottom: idx < 2 ? '1px solid #334155' : 'none'
              }}>
                <span style={{ color: '#94a3b8', fontSize: '14px', width: '20px' }}>{currentIndex + idx + 2}</span>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  backgroundColor: '#334155',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  {item.cover_url ? (
                    <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                      {getGenreEmoji(item.genre)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>{item.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>{item.duration_mins} min</div>
                </div>
              </div>
            ))}
            
            {playlist.length - currentIndex - 1 > 3 && (
              <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', marginTop: '0.5rem' }}>
                + {playlist.length - currentIndex - 4} more
              </div>
            )}
          </div>

          {/* Pause button */}
          <button 
            onClick={handlePause}
            style={{ 
              backgroundColor: '#f97316',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: 'bold',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            ⏸️ Pause
          </button>
        </div>
      </div>
    )
  }

  // Main Library Screen (Paused or No Playlist)
  return (
    <div className="min-h-screen bg-slate-950">
      <WL01StickyLogo credits={freeCredits} />
      
      <div style={{ padding: '1rem 0.75rem 0.75rem' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
          {/* Row 1: Duration + Type */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => (
              <button
                key={d}
                onClick={() => setSelectedDuration(d)}
                style={btnStyle(selectedDuration === d)}
              >
                {d}
              </button>
            ))}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
            {['Both', 'Singles', 'Series'].map(t => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                style={btnStyle(selectedType === t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Row 2: Genre */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                style={btnStyle(selectedGenre === g)}
              >
                {g === 'All' ? 'All' : 
                 g === 'Mystery' ? '🔍Myst' :
                 g === 'Romance' ? '💕Rom' :
                 g === 'Sci-Fi' ? '🚀SciFi' :
                 g === 'Horror' ? '👻Horr' :
                 g === 'Comedy' ? '😂Com' : '🧠Learn'}
              </button>
            ))}
          </div>

          {/* Row 3: Playlist actions */}
          {playlist.length === 0 ? (
            <button 
              onClick={() => setBuildingPlaylist(true)}
              style={{ 
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                marginTop: '0.35rem'
              }}
            >
              ➕ Create a Playlist
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
              <button 
                onClick={handlePlay}
                style={{ 
                  backgroundColor: currentIndex > 0 || currentProgress > 0 ? '#f97316' : '#22c55e',
                  color: 'white',
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {currentIndex > 0 || currentProgress > 0
                  ? `▶️ Continue Playlist (${formatTime(remainingMins)} left)`
                  : `▶️ Play Your Playlist (${formatTime(playlistTotal)})`
                }
              </button>
              <button 
                onClick={deletePlaylist}
                style={{ 
                  backgroundColor: '#ef4444',
                  color: 'white',
                  padding: '0.5rem',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                🗑️ Delete Playlist
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Story cards grouped by series */}
      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {Object.entries(groupedStories).map(([key, seriesStories]) => (
          <div key={key}>
            {/* Series header if it's a series */}
            {seriesStories[0]?.series_name && (
              <div style={{ 
                color: '#3b82f6', 
                fontSize: '12px', 
                fontWeight: 600, 
                padding: '0.5rem 0.25rem',
                textTransform: 'uppercase'
              }}>
                📚 {seriesStories[0].series_name} ({seriesStories.length} parts)
              </div>
            )}
            
            {seriesStories.map(story => {
              const storyCost = getCredits(story.duration_mins)
              const canAfford = freeCredits >= storyCost
              const isPlayed = playlist.findIndex(p => p.id === story.id) < currentIndex && playlist.some(p => p.id === story.id)
              
              return (
                <div 
                  key={story.id}
                  onClick={() => {
                    localStorage.setItem('dtt_return_path', '/library-playlist')
                    router.push('/player/' + story.id)
                  }}
                  className="flex rounded-xl overflow-hidden hover:bg-slate-700 transition cursor-pointer"
                  style={{ 
                    backgroundColor: isPlayed ? '#1e3a2f' : '#1e293b',
                    marginBottom: '0.5rem',
                    opacity: isPlayed ? 0.7 : 1
                  }}
                >
                  <div style={{ width: '100px', height: '100px', flexShrink: 0, padding: '0.5rem', position: 'relative' }}>
                    <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%' }}>
                      <img 
                        src={story.cover_url || '/images/default-cover.png'} 
                        alt={story.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    {isPlayed && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '0.5rem', 
                        right: '0.5rem', 
                        backgroundColor: '#22c55e',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px'
                      }}>
                        ✓
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h3 className="text-white font-bold line-clamp-1" style={{ fontSize: '16px', margin: 0 }}>
                      {story.title}
                      {story.series_number && (
                        <span style={{ color: '#3b82f6', fontSize: '12px', marginLeft: '6px' }}>
                          [{story.series_number}/{story.series_total}]
                        </span>
                      )}
                    </h3>
                    <p className="text-white" style={{ fontSize: '14px', margin: '2px 0' }}>{story.genre}</p>
                    <p className="text-white" style={{ fontSize: '14px', margin: '2px 0' }}>{story.duration_mins} min • {storyCost} credits</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      {canAfford && (
                        <span 
                          style={{ 
                            backgroundColor: '#22c55e', 
                            color: 'white', 
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}
                        >
                          FREE
                        </span>
                      )}
                      {isPlayed && (
                        <span 
                          style={{ 
                            backgroundColor: '#6b7280', 
                            color: 'white', 
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}
                        >
                          PLAYED
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
