'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  audio_url?: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
}

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  audio_url?: string | null
}

const ALL_GENRES = [
  { key: 'mystery', label: 'Mystery', emoji: '🔍' },
  { key: 'thriller', label: 'Thriller', emoji: '😱' },
  { key: 'romance', label: 'Romance', emoji: '💕' },
  { key: 'horror', label: 'Horror', emoji: '👻' },
  { key: 'comedy', label: 'Comedy', emoji: '😂' },
  { key: 'truckers', label: 'Truckers', emoji: '🚛' },
  { key: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { key: 'children', label: 'Children', emoji: '🧒' },
  { key: 'learn', label: 'Learn', emoji: '🧠' }
]

const DEFAULT_VISIBLE = ['mystery', 'romance', 'horror']

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function formatTime(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (remaining === 0) return `${hours} hr`
  return `${hours} hr ${remaining} min`
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userInitial, setUserInitial] = useState('?')
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])

  // Load saved genres from localStorage
  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) {
      try {
        const parsed = JSON.parse(storedGenres)
        if (Array.isArray(parsed) && parsed.length >= 3) setVisibleGenres(parsed.slice(0, 3))
      } catch (e) {}
    }
  }, [])

  // Load existing playlist from localStorage
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        if (Array.isArray(parsed)) setPlaylist(parsed)
      } catch (e) {}
    }
  }, [])

  // Save playlist to localStorage
  useEffect(() => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
  }, [playlist])

  // Fetch user and stories
  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, audio_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      
      if (user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, display_name, credits')
          .eq('id', user.id)
          .single()
        if (userData) {
          const name = userData.display_name || userData.first_name || 'Friend'
          setUserName(name)
          setUserInitial(name.charAt(0).toUpperCase())
          setUserCredits(userData.credits || 0)
        }
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey)
    setShowMoreDropdown(false)
    if (genreKey !== 'All') {
      const newVisible = [genreKey, ...visibleGenres.filter(g => g !== genreKey)].slice(0, 3)
      setVisibleGenres(newVisible)
      localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible))
    }
  }

  // Calculate playlist stats
  const playlistMins = playlist.reduce((sum, s) => sum + s.duration_mins, 0)
  const playlistCredits = playlist.reduce((sum, s) => sum + getCredits(s.duration_mins), 0)
  const creditsRemaining = userCredits - playlistCredits

  // Filter stories (but selected always show at top)
  const filterStory = (story: Story) => {
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  }

  // Sort: Selected stories at top (in playlist order), then filtered unselected
  const sortedStories = [
    ...playlist.map(p => {
      const found = stories.find(s => s.id === p.id)
      if (found) return found
      return { id: p.id, title: p.title, genre: p.genre, author: p.author, duration_mins: p.duration_mins, cover_url: p.cover_url, audio_url: p.audio_url, series_name: null, series_number: null, series_total: null } as Story
    }),
    ...stories.filter(s => !playlist.some(p => p.id === s.id) && filterStory(s))
  ]

  const toggleStory = (story: Story) => {
    const exists = playlist.find(p => p.id === story.id)
    if (exists) {
      setPlaylist(playlist.filter(p => p.id !== story.id))
    } else {
      const cost = getCredits(story.duration_mins)
      if (cost > creditsRemaining) {
        alert('Not enough credits for this story')
        return
      }
      setPlaylist([...playlist, {
        id: story.id,
        title: story.title,
        duration_mins: story.duration_mins,
        genre: story.genre,
        author: story.author || 'Drive Time Tales',
        cover_url: story.cover_url,
        audio_url: story.audio_url,
      }])
    }
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const newPlaylist = [...playlist]
    const temp = newPlaylist[index - 1]
    newPlaylist[index - 1] = newPlaylist[index]
    newPlaylist[index] = temp
    setPlaylist(newPlaylist)
  }

  const moveDown = (index: number) => {
    if (index >= playlist.length - 1) return
    const newPlaylist = [...playlist]
    const temp = newPlaylist[index + 1]
    newPlaylist[index + 1] = newPlaylist[index]
    newPlaylist[index] = temp
    setPlaylist(newPlaylist)
  }

  const handleStartDrive = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    router.push('/library-playlist-player')
  }

  // Same button styles as Library page
  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label.substring(0, 4) : key }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: playlist.length > 0 ? '70px' : '0' }}>
      {/* STICKY HEADER - Same as Library */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header row */}
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '18px' }}>🚗</span>
            <span style={{ fontSize: '18px' }}>🚙</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
            <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
          </div>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userInitial}</span>
          </div>
        </div>

        {/* Filter section - Same as Library */}
        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#1e293b' }}>
          {/* Row 1: Duration + Type */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
            <button onClick={() => setSelectedDuration('All')} style={allBtnStyle(selectedDuration === 'All')}>All</button>
            <button onClick={() => setSelectedDuration('15m')} style={btnStyle(selectedDuration === '15m')}>15m</button>
            <button onClick={() => setSelectedDuration('30m')} style={btnStyle(selectedDuration === '30m')}>30m</button>
            <button onClick={() => setSelectedDuration('1hr')} style={btnStyle(selectedDuration === '1hr')}>1hr</button>
            <span style={{ color: '#475569', display: 'flex', alignItems: 'center', padding: '0 2px' }}>|</span>
            <button onClick={() => setSelectedType('All')} style={btnStyle(selectedType === 'All')}>All</button>
            <button onClick={() => setSelectedType('Series')} style={btnStyle(selectedType === 'Series')}>Series</button>
          </div>

          {/* Row 2: Genres + More dropdown */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => (
              <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>
            ))}
            <div style={{ position: 'relative', flex: 1.5 }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
              {showMoreDropdown && (
                <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', marginTop: '4px', minWidth: '140px', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                  {ALL_GENRES.map(g => (
                    <button key={g.key} onClick={() => selectGenre(g.key)} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}>
                      {g.emoji} {g.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Playlist stats (replaces Credits + PlaylistButton) */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '0.25rem 0.6rem', borderRadius: '6px', textAlign: 'center', lineHeight: 1.2 }}>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 'normal' }}>Credits</div>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>
                <span style={{ color: '#f97316' }}>{playlistCredits}</span> of {userCredits}
              </div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '0.25rem 0.6rem', borderRadius: '6px', textAlign: 'center', lineHeight: 1.2, flex: 1 }}>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 'normal' }}>Playlist</div>
              <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 'normal' }}>
                {formatTime(playlistMins)} <span style={{ color: 'white' }}>({playlist.length} stories)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click-away for dropdown */}
      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      {/* STORY LIST */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sortedStories.map(story => {
          const isSelected = playlist.some(p => p.id === story.id)
          const playlistIndex = playlist.findIndex(p => p.id === story.id)
          const cost = getCredits(story.duration_mins)
          const canAfford = cost <= creditsRemaining

          return (
            <div
              key={story.id}
              onClick={() => !isSelected && toggleStory(story)}
              style={{
                backgroundColor: isSelected ? '#1e3a2f' : '#1e293b',
                border: isSelected ? '2px solid #22c55e' : '2px solid transparent',
                borderRadius: '12px',
                padding: '0.5rem',
                cursor: isSelected ? 'default' : 'pointer',
                opacity: !canAfford && !isSelected ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Order number for selected */}
                {isSelected && (
                  <div style={{
                    backgroundColor: '#f97316',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {playlistIndex + 1}
                  </div>
                )}

                {/* Story card */}
                <div style={{ flex: 1, pointerEvents: 'none' }}>
                  <HorizontalStoryCard
                    id={story.id}
                    title={story.title}
                    genre={story.genre}
                    author={story.author || 'Drive Time Tales'}
                    duration_mins={story.duration_mins}
                    credits={getCredits(story.duration_mins)}
                    cover_url={story.cover_url}
                    series_number={story.series_number}
                    series_total={story.series_total}
                  />
                </div>

                {/* Arrow/remove buttons for selected OR checkbox for unselected */}
                {isSelected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {playlist.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); playlistIndex === 0 ? moveDown(0) : moveUp(playlistIndex); }}
                        style={{ backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                      >
                        {playlistIndex === 0 ? '▼' : '▲'}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setPlaylist(playlist.filter(p => p.id !== story.id)); }}
                      style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '2px solid #64748b',
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* BOTTOM STICKY: Start Drive */}
      {playlist.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
          <button
            onClick={handleStartDrive}
            style={{
              width: '100%',
              backgroundColor: '#22c55e',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            🚗 Start Drive ({playlist.length} stories • {formatTime(playlistMins)})
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
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
