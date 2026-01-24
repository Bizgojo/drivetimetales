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

const VISIBLE_GENRES = [
  { key: 'mystery', label: 'Myst', emoji: '🔍' },
  { key: 'romance', label: 'Roma', emoji: '💕' },
  { key: 'horror', label: 'Horr', emoji: '👻' },
]

const MORE_GENRES = [
  { key: 'thriller', label: 'Thriller', emoji: '😱' },
  { key: 'comedy', label: 'Comedy', emoji: '😂' },
  { key: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { key: 'children', label: 'Kids', emoji: '🧒' },
  { key: 'truckers', label: 'Truckers', emoji: '🚛' },
  { key: 'learn', label: 'Learn', emoji: '🧠' },
]

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(0)
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('?')
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])

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

  // Fetch user data
  useEffect(() => {
    async function fetchUser() {
      if (!user) return
      try {
        const { data } = await supabase
          .from('users')
          .select('first_name, display_name, credits, subscription_type')
          .eq('id', user.id)
          .single()
        if (data) {
          const name = data.display_name || data.first_name || 'Friend'
          setUserName(name)
          setUserInitial(name.charAt(0).toUpperCase())
          setUserCredits(data.credits || 0)
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUser()
  }, [user])

  // Fetch stories
  useEffect(() => {
    async function fetchStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, audio_url, series_name, series_number, series_total')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })
        
        if (data) {
          setStories(data.filter(s => s.cover_url && s.cover_url.trim() !== ''))
        }
      } catch (err) {
        console.error('Error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStories()
  }, [])

  // Calculate playlist stats
  const playlistMins = playlist.reduce((sum, s) => sum + s.duration_mins, 0)
  const playlistCredits = playlist.reduce((sum, s) => sum + getCredits(s.duration_mins), 0)
  const creditsRemaining = userCredits - playlistCredits

  // Filter stories
  const filteredStories = stories.filter(story => {
    if (playlist.some(p => p.id === story.id)) return false
    
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedType === 'Singles' && story.series_name) return false
    
    if (selectedGenre !== 'All') {
      const storyGenre = story.genre?.toLowerCase() || ''
      if (!storyGenre.includes(selectedGenre.toLowerCase())) return false
    }
    
    return true
  })

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

  const handleStartDrive = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    router.push('/library-playlist-player')
  }

  const btnStyle = (active: boolean) => ({
    padding: '0.4rem 0.6rem',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    minHeight: '36px',
  } as React.CSSProperties)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617' }}>
      {/* HEADER: Back | Logo | Avatar */}
      <div style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 50, 
        backgroundColor: '#020617', 
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1e293b'
      }}>
        <button 
          onClick={() => router.push('/library')}
          style={{ 
            background: '#1e293b', 
            border: 'none', 
            color: 'white', 
            fontSize: '14px', 
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          ← Back
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '20px' }}>🚛</span>
          <span style={{ fontSize: '20px' }}>🚗</span>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>Drive Time </span>
          <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '16px' }}>Tales</span>
        </div>
        
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: '#f97316',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '16px'
        }}>
          {userInitial}
        </div>
      </div>

      {/* STICKY FILTERS */}
      <div style={{ 
        position: 'sticky', 
        top: '57px', 
        zIndex: 40, 
        backgroundColor: '#020617', 
        padding: '0.5rem 0.75rem'
      }}>
        {/* Row 1: Duration + Type */}
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {['All', '15m', '30m', '1hr'].map(d => (
            <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>
          ))}
          <span style={{ color: '#475569', padding: '0 4px' }}>|</span>
          {['All', 'Series'].map(t => (
            <button key={t} onClick={() => setSelectedType(t === 'All' ? 'All' : t)} style={btnStyle(selectedType === t)}>{t}</button>
          ))}
        </div>
        
        {/* Row 2: Genres + More dropdown */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setSelectedGenre('All')} style={btnStyle(selectedGenre === 'All')}>All</button>
          {VISIBLE_GENRES.map(g => (
            <button key={g.key} onClick={() => setSelectedGenre(g.key)} style={btnStyle(selectedGenre === g.key)}>
              {g.emoji}{g.label}
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={btnStyle(false)}>
              More {showMoreDropdown ? '▲' : '▼'}
            </button>
            {showMoreDropdown && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                marginTop: '0.25rem', 
                backgroundColor: '#1e293b', 
                borderRadius: '8px', 
                padding: '0.5rem', 
                zIndex: 100,
                minWidth: '140px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}>
                {MORE_GENRES.map(g => (
                  <button
                    key={g.key}
                    onClick={() => { setSelectedGenre(g.key); setShowMoreDropdown(false); }}
                    style={{ 
                      display: 'block', 
                      width: '100%', 
                      textAlign: 'left', 
                      padding: '0.5rem', 
                      background: selectedGenre === g.key ? '#f97316' : 'transparent', 
                      border: 'none', 
                      color: 'white', 
                      fontSize: '14px', 
                      cursor: 'pointer',
                      borderRadius: '4px'
                    }}
                  >
                    {g.emoji} {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Playlist Stats Bar */}
        <div style={{ 
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem', 
          backgroundColor: '#1e293b', 
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ color: 'white', fontSize: '14px' }}>
            <span style={{ color: '#f97316', fontWeight: 'bold' }}>{playlistCredits}</span>
            <span> of </span>
            <span style={{ fontWeight: 'bold' }}>{userCredits}</span>
            <span> credits used</span>
          </div>
          <div style={{ color: 'white', fontSize: '14px' }}>
            <span>Playlist: </span>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{playlistMins} min</span>
            <span style={{ color: '#94a3b8' }}> ({playlist.length} stories)</span>
          </div>
        </div>
      </div>

      {/* STORY LIST */}
      <div style={{ padding: '0.75rem', paddingBottom: playlist.length > 0 ? '100px' : '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredStories.map(story => {
            const inPlaylist = playlist.some(p => p.id === story.id)
            const cost = getCredits(story.duration_mins)
            const canAfford = cost <= creditsRemaining
            
            return (
              <div 
                key={story.id} 
                onClick={() => toggleStory(story)}
                style={{ 
                  cursor: 'pointer',
                  opacity: !canAfford && !inPlaylist ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, pointerEvents: 'none' }}>
                    <HorizontalStoryCard
                      id={story.id}
                      title={story.title}
                      genre={story.genre}
                      author={story.author || 'Drive Time Tales'}
                      duration_mins={story.duration_mins}
                      cover_url={story.cover_url}
                      series_number={story.series_number}
                      series_total={story.series_total}
                    />
                  </div>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: inPlaylist ? 'none' : '2px solid #64748b',
                    backgroundColor: inPlaylist ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {inPlaylist && <span style={{ color: 'white', fontSize: '16px' }}>✓</span>}
                  </div>
                </div>
              </div>
            )
          })}
          
          {filteredStories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'white' }}>
              <p>No stories match your filters</p>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM STICKY: Start Drive */}
      {playlist.length > 0 && (
        <div style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          backgroundColor: '#0f172a', 
          padding: '0.75rem 1rem', 
          borderTop: '1px solid #334155',
          zIndex: 40
        }}>
          <button
            onClick={handleStartDrive}
            style={{
              width: '100%',
              backgroundColor: '#22c55e',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold'
            }}
          >
            🚗 Start Drive ({playlist.length} stories • {playlistMins} min)
          </button>
        </div>
      )}

      {/* Click-away for dropdown */}
      {showMoreDropdown && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 90 }} 
          onClick={() => setShowMoreDropdown(false)} 
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    }>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
