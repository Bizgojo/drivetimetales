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
  const [playlistProgress, setPlaylistProgress] = useState(0) // minutes played
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
    const savedProgress = localStorage.getItem('dtt_playlist_progress')
    if (savedProgress) {
      setPlaylistProgress(parseInt(savedProgress, 10))
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })

      if (storiesData) setStories(storiesData)
      setLoading(false)
    }
    fetchData()
  }, [])

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

  const buildFilteredStories = stories.filter(story => {
    if (buildGenre !== 'All') {
      if (!story.genre?.toLowerCase().includes(buildGenre.toLowerCase())) return false
    }
    return true
  })

  const playlistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)
  const playlistRemaining = playlistTotal - playlistProgress

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
    localStorage.setItem('dtt_playlist_progress', '0')
    setPlaylistProgress(0)
    setBuildingPlaylist(false)
  }

  const deletePlaylist = () => {
    localStorage.removeItem('dtt_playlist')
    localStorage.removeItem('dtt_playlist_progress')
    setPlaylist([])
    setPlaylistProgress(0)
  }

  const playPlaylist = () => {
    if (playlist.length > 0) {
      localStorage.setItem('dtt_return_path', '/library-playlist')
      router.push('/player/' + playlist[0].id + '?playlist=true')
    }
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}hr ${m}min` : `${hrs}hr`
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
              {playlist.length} stories • {formatTime(playlistTotal)}
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

  // Main Library Screen
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
                onClick={playPlaylist}
                style={{ 
                  backgroundColor: playlistProgress > 0 ? '#f97316' : '#22c55e',
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
                {playlistProgress > 0 
                  ? `▶️ Continue Playlist (${formatTime(playlistRemaining)} left)`
                  : `▶️ Play Your Playlist (${formatTime(playlistTotal)})`
                }
              </button>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button 
                  onClick={() => setBuildingPlaylist(true)}
                  style={{ 
                    flex: 1,
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '0.5rem',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ✏️ Edit
                </button>
                <button 
                  onClick={deletePlaylist}
                  style={{ 
                    flex: 1,
                    backgroundColor: '#ef4444',
                    color: 'white',
                    padding: '0.5rem',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Story cards */}
      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.map(story => {
          const storyCost = getCredits(story.duration_mins)
          const canAfford = freeCredits >= storyCost
          return (
            <div 
              key={story.id}
              onClick={() => {
                localStorage.setItem('dtt_return_path', '/library-playlist')
                router.push('/player/' + story.id)
              }}
              className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition cursor-pointer"
            >
              <div style={{ width: '100px', height: '100px', flexShrink: 0, padding: '0.5rem' }}>
                <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%' }}>
                  <img 
                    src={story.cover_url || '/images/default-cover.png'} 
                    alt={story.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              </div>
              <div style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 className="text-white font-bold line-clamp-1" style={{ fontSize: '16px', margin: 0 }}>{story.title}</h3>
                <p className="text-white" style={{ fontSize: '14px', margin: '2px 0' }}>{story.genre}</p>
                <p className="text-white" style={{ fontSize: '14px', margin: '2px 0' }}>{story.duration_mins} min • {storyCost} credits</p>
                {canAfford && (
                  <span 
                    style={{ 
                      backgroundColor: '#22c55e', 
                      color: 'white', 
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      alignSelf: 'flex-start',
                      marginTop: '2px'
                    }}
                  >
                    FREE
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
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
