'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyLogo1 from '@/components/StickyLogo1'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  audio_url?: string | null
}

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

const ALL_GENRES = [
  { key: 'mystery', label: 'Myst', emoji: '🔍' },
  { key: 'thriller', label: 'Thri', emoji: '😱' },
  { key: 'romance', label: 'Rom', emoji: '💕' },
  { key: 'horror', label: 'Horr', emoji: '👻' },
  { key: 'comedy', label: 'Com', emoji: '😂' },
  { key: 'truckers', label: 'Truc', emoji: '🚛' },
  { key: 'scifi', label: 'Sci-', emoji: '🚀' },
  { key: 'children', label: 'Kids', emoji: '🧒' },
  { key: 'learn', label: 'Lear', emoji: '🧠' }
]

const DEFAULT_VISIBLE = ['learn', 'thriller', 'truckers']

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
  const [isSubscriber, setIsSubscriber] = useState(false)
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [showCreditsPopup, setShowCreditsPopup] = useState(false)

  // LOAD EXISTING PLAYLIST FROM LOCALSTORAGE
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlaylist(parsed)
        }
      } catch (e) {
        console.error('Error loading playlist:', e)
      }
    }
  }, [])

  // Save playlist to localStorage whenever it changes
  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    }
  }, [playlist])

  // Load visible genres from localStorage
  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) {
      try {
        const parsed = JSON.parse(storedGenres)
        if (Array.isArray(parsed) && parsed.length >= 3) {
          setVisibleGenres(parsed.slice(0, 3))
        }
      } catch (e) {}
    }
  }, [])

  // Fetch user data
  useEffect(() => {
    async function fetchUser() {
      if (!user) return
      try {
        const { data } = await supabase
          .from('users')
          .select('first_name, credits, subscription_status')
          .eq('id', user.id)
          .single()
        if (data) {
          setUserName(data.first_name || 'Friend')
          setUserCredits(data.credits || 0)
          setIsSubscriber(data.subscription_status === 'active')
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
          .select('id, title, genre, author, duration_mins, cover_url, audio_url')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })
        
        if (error) {
          console.error('Error fetching stories:', error)
        } else if (data) {
          setStories(data)
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
  const totalMins = playlist.reduce((sum, s) => sum + s.duration_mins, 0)
  const totalCredits = playlist.reduce((sum, s) => sum + getCredits(s.duration_mins), 0)
  const creditsRemaining = userCredits - totalCredits

  // Filter stories
  const filteredStories = stories.filter(story => {
    // Exclude stories already in playlist
    if (playlist.some(p => p.id === story.id)) return false
    
    // Duration filter
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    
    // Genre filter
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
      if (!isSubscriber) {
        setShowSubscriberPopup(true)
        return
      }
      const storyCost = getCredits(story.duration_mins)
      if (storyCost > creditsRemaining) {
        setShowCreditsPopup(true)
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
        credited: false
      }])
    }
  }

  const removeFromPlaylist = (id: string) => {
    setPlaylist(playlist.filter(p => p.id !== id))
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

  const handleGoToPlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    router.push('/library-playlist-player')
  }

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey === selectedGenre ? 'All' : genreKey)
    if (genreKey !== 'All' && !visibleGenres.includes(genreKey)) {
      const newVisible = [genreKey, ...visibleGenres.slice(0, 2)]
      setVisibleGenres(newVisible)
      localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible))
    }
    setShowMoreDropdown(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <StickyLogo1 userName={userName} />
      
      <div style={{ padding: '1rem', paddingBottom: playlist.length > 0 ? '100px' : '1rem' }}>
        {/* Back button */}
        <button 
          onClick={() => router.push('/library')} 
          style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '1rem' }}
        >
          ← Back to Library
        </button>

        {/* YOUR PLAYLIST SECTION - Shows existing playlist */}
        {playlist.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>📋 Your Playlist</h2>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>{playlist.length} stories • {totalMins} min</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {playlist.map((item, index) => (
                <div key={item.id} style={{ backgroundColor: '#1e3a5f', borderRadius: '12px', padding: '0.75rem', border: '1px solid #3b82f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '16px', width: '24px' }}>{index + 1}</span>
                    <div style={{ width: '50px', height: '50px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                      {item.cover_url ? (
                        <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎧</div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px' }}>{item.duration_mins} min • {getCredits(item.duration_mins)} cr</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => moveUp(index)} disabled={index === 0} style={{ background: index === 0 ? '#334155' : '#475569', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: index === 0 ? 'default' : 'pointer', fontSize: '12px' }}>▲</button>
                      <button onClick={() => moveDown(index)} disabled={index === playlist.length - 1} style={{ background: index === playlist.length - 1 ? '#334155' : '#475569', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: index === playlist.length - 1 ? 'default' : 'pointer', fontSize: '12px' }}>▼</button>
                      <button onClick={() => removeFromPlaylist(item.id)} style={{ background: '#dc2626', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#1e293b', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>Total cost:</span>
              <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{totalCredits} credits</span>
            </div>
          </div>
        )}

        {/* ADD MORE STORIES SECTION */}
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.75rem' }}>
            {playlist.length > 0 ? '➕ Add More Stories' : '➕ Select Stories'}
          </h2>
          
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {['All', '15m', '30m', '1hr'].map(dur => (
              <button
                key={dur}
                onClick={() => setSelectedDuration(dur)}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: selectedDuration === dur ? '#f97316' : '#334155',
                  color: 'white'
                }}
              >
                {dur}
              </button>
            ))}
          </div>
          
          {/* Genre filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedGenre('All')}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: selectedGenre === 'All' ? '#f97316' : '#334155',
                color: 'white'
              }}
            >
              All
            </button>
            {visibleGenres.map(genreKey => {
              const genre = ALL_GENRES.find(g => g.key === genreKey)
              if (!genre) return null
              return (
                <button
                  key={genreKey}
                  onClick={() => selectGenre(genreKey)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: selectedGenre === genreKey ? '#f97316' : '#334155',
                    color: 'white'
                  }}
                >
                  {genre.emoji}{genre.label}
                </button>
              )
            })}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMoreDropdown(!showMoreDropdown)}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: '#334155',
                  color: 'white'
                }}
              >
                More ▼
              </button>
              {showMoreDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.25rem', backgroundColor: '#1e293b', borderRadius: '8px', padding: '0.5rem', zIndex: 50, minWidth: '120px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                  {ALL_GENRES.filter(g => !visibleGenres.includes(g.key)).map(genre => (
                    <button
                      key={genre.key}
                      onClick={() => selectGenre(genre.key)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.5rem', background: 'none', border: 'none', color: 'white', fontSize: '13px', cursor: 'pointer', borderRadius: '4px' }}
                    >
                      {genre.emoji} {genre.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Credits remaining */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem 0.75rem', backgroundColor: '#1e293b', borderRadius: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Credits available:</span>
            <span style={{ color: creditsRemaining >= 0 ? '#22c55e' : '#ef4444', fontSize: '16px', fontWeight: 'bold' }}>{creditsRemaining}</span>
          </div>
        </div>

        {/* Story list */}
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
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <HorizontalStoryCard
                      id={story.id}
                      title={story.title}
                      genre={story.genre}
                      author={story.author || 'Drive Time Tales'}
                      duration_mins={story.duration_mins}
                      cover_url={story.cover_url}
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
        </div>
      </div>

      {/* Bottom sticky - Go to Playlist */}
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
            onClick={handleGoToPlaylist}
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
            🎧 Go to Playlist ({playlist.length} stories)
          </button>
        </div>
      )}

      {/* Credits popup */}
      {showCreditsPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '300px', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>💳</span>
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Not Enough Credits</h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>You need more credits to add this story.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowCreditsPopup(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#475569', color: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => router.push('/pricing')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#f97316', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Get Credits</button>
            </div>
          </div>
        </div>
      )}

      {/* Subscriber popup */}
      {showSubscriberPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '300px', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>⭐</span>
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Subscribers Only</h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Playlists are available for subscribers.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowSubscriberPopup(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#475569', color: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => router.push('/pricing')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#f97316', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Subscribe</button>
            </div>
          </div>
        </div>
      )}

      {showMoreDropdown && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />
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
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    }>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
