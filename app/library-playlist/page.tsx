'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  audio_url?: string | null
  series_id?: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
  flag?: string | null
  is_free?: boolean
  created_at?: string
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

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(0)
  const [userName, setUserName] = useState('Friend')

  // Filter states
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')

  // Playlist state
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [showSavedMessage, setShowSavedMessage] = useState(false)

  // Load existing playlist from localStorage
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

  // Fetch stories and user data
  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, audio_url, series_id, series_name, series_number, series_total, flag, is_free, created_at')
        .not('cover_url', 'is', null)
        .order('created_at', { ascending: false })
      if (storiesData) setStories(storiesData)

      if (user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, display_name, credits')
          .eq('id', user.id)
          .single()
        if (userData) {
          setUserName(userData.first_name || userData.display_name || 'Friend')
          setUserCredits(userData.credits || 0)
        }
      }
      setLoading(false)
    }
    fetchData()
  }, [user])

  // Calculate credits used by playlist
  const creditsUsed = playlist.reduce((sum, item) => sum + getCredits(item.duration_mins), 0)
  const creditsLeft = userCredits - creditsUsed
  const totalMinutes = playlist.reduce((sum, item) => sum + item.duration_mins, 0)

  // Filter stories (same logic as library page)
  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All Lengths') {
      if (selectedDuration === '~15 min' && story.duration_mins > 20) return false
      if (selectedDuration === '~30 min' && (story.duration_mins <= 20 || story.duration_mins > 45)) return false
      if (selectedDuration === '~1 hr' && story.duration_mins <= 45) return false
    }
    if (selectedGenre !== 'All Categories') {
      const genreLower = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !genreLower.includes('mystery')) return false
      if (selectedGenre === 'Romance' && !genreLower.includes('romance')) return false
      if (selectedGenre === 'Sci-Fi' && !genreLower.includes('sci-fi') && !genreLower.includes('scifi')) return false
      if (selectedGenre === 'Horror' && !genreLower.includes('horror')) return false
      if (selectedGenre === 'Comedy' && !genreLower.includes('comedy')) return false
      if (selectedGenre === 'Learn' && !genreLower.includes('learn') && !genreLower.includes('educational')) return false
      if (selectedGenre === 'Thriller' && !genreLower.includes('thriller')) return false
      if (selectedGenre === 'Truckers' && !genreLower.includes('trucker')) return false
      if (selectedGenre === 'Children' && !genreLower.includes('child') && !genreLower.includes('kids')) return false
    }
    if (selectedType === 'Singles Only' && story.series_name) return false
    if (selectedType === 'Series Only' && !story.series_name) return false
    return true
  })

  // Check if story is already in playlist
  const isInPlaylist = (storyId: string) => playlist.some(item => item.id === storyId)

  // Add story to playlist
  const addToPlaylist = (story: Story) => {
    if (isInPlaylist(story.id)) return
    const cost = getCredits(story.duration_mins)
    if (creditsLeft < cost && !story.is_free) return
    setPlaylist([...playlist, {
      id: story.id,
      title: story.title,
      duration_mins: story.duration_mins,
      genre: story.genre,
      author: story.author || 'Drive Time Tales',
      cover_url: story.cover_url,
      audio_url: story.audio_url || null,
      credited: false,
    }])
  }

  // Remove story from playlist
  const removeFromPlaylist = (storyId: string) => {
    setPlaylist(playlist.filter(item => item.id !== storyId))
  }

  // Move story up in playlist
  const moveUp = (index: number) => {
    if (index === 0) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index - 1], newPlaylist[index]] = [newPlaylist[index], newPlaylist[index - 1]]
    setPlaylist(newPlaylist)
  }

  // Move story down in playlist
  const moveDown = (index: number) => {
    if (index === playlist.length - 1) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index], newPlaylist[index + 1]] = [newPlaylist[index + 1], newPlaylist[index]]
    setPlaylist(newPlaylist)
  }

  // Save playlist
  const savePlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    setShowSavedMessage(true)
    setTimeout(() => setShowSavedMessage(false), 2000)
  }

  // Start driving - save and go to player
  const startDrive = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    router.push('/player/playlist')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950" style={{ paddingBottom: '140px' }}>
      <StickyHeaderFull />

      {/* Filters - same as library page */}
      <LibraryFiltersV2
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />

      {/* Stats bar */}
      <div style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ backgroundColor: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '6px', textAlign: 'center', border: '1px solid #334155' }}>
          <div style={{ color: 'white', fontSize: '10px' }}>Credits</div>
          <div style={{ color: creditsLeft < 0 ? '#ef4444' : '#22c55e', fontSize: '14px', fontWeight: 'bold' }}>{creditsLeft}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>
            {playlist.length} {playlist.length === 1 ? 'story' : 'stories'} • {totalMinutes} min
          </span>
        </div>
        <button
          onClick={() => router.push('/library')}
          style={{ backgroundColor: '#334155', color: 'white', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
        >
          ← Library
        </button>
      </div>

      {/* YOUR PLAYLIST section */}
      {playlist.length > 0 && (
        <div style={{ padding: '0 0.75rem', marginBottom: '0.5rem' }}>
          <h2 style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
            🎧 Your Playlist
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {playlist.map((item, index) => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#1e3a5f',
                borderRadius: '12px',
                padding: '0.5rem',
                border: '1px solid #3b82f6',
                gap: '0.5rem',
              }}>
                {/* Order number */}
                <div style={{ color: '#93c5fd', fontSize: '16px', fontWeight: 'bold', width: '24px', textAlign: 'center', flexShrink: 0 }}>
                  {index + 1}
                </div>
                {/* Cover */}
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                  {item.cover_url ? (
                    <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #f97316, #c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '20px' }}>🎵</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: 'white', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{item.title}</p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', margin: 0 }}>{item.duration_mins} min • {getCredits(item.duration_mins)} cr</p>
                </div>
                {/* Move up/down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button onClick={() => moveUp(index)} disabled={index === 0} style={{ backgroundColor: index === 0 ? '#334155' : '#475569', color: 'white', border: 'none', borderRadius: '4px', width: '24px', height: '20px', fontSize: '10px', cursor: index === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>
                  <button onClick={() => moveDown(index)} disabled={index === playlist.length - 1} style={{ backgroundColor: index === playlist.length - 1 ? '#334155' : '#475569', color: 'white', border: 'none', borderRadius: '4px', width: '24px', height: '20px', fontSize: '10px', cursor: index === playlist.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>
                </div>
                {/* Remove */}
                <button onClick={() => removeFromPlaylist(item.id)} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AVAILABLE STORIES section */}
      <div style={{ padding: '0 0.75rem' }}>
        <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
          {playlist.length > 0 ? '➕ Add More Stories' : '➕ Select Stories for Your Playlist'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredStories.length === 0 ? (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>😔</div>
              <p style={{ color: 'white', fontSize: '16px', marginBottom: '0.5rem' }}>Sorry {userName}, no stories match your request.</p>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Try a different filter</p>
            </div>
          ) : (
            filteredStories.map(story => {
              const inPlaylist = isInPlaylist(story.id)
              const cost = getCredits(story.duration_mins)
              const canAfford = creditsLeft >= cost || story.is_free

              return (
                <div
                  key={story.id}
                  onClick={() => !inPlaylist && canAfford && addToPlaylist(story)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: inPlaylist ? '#1e3a5f' : '#1e293b',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: inPlaylist || !canAfford ? 'default' : 'pointer',
                    opacity: inPlaylist ? 0.5 : !canAfford ? 0.4 : 1,
                    border: inPlaylist ? '1px solid #3b82f6' : '1px solid transparent',
                  }}
                >
                  {/* Cover */}
                  <div style={{ width: '5rem', height: '5rem', flexShrink: 0, padding: '0.5rem' }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }}>
                      <img
                        src={story.cover_url || '/images/default-cover.png'}
                        alt={story.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, paddingTop: '0.5rem', paddingBottom: '0.5rem', paddingRight: '0.5rem', minWidth: 0 }}>
                    <h3 style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</h3>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>{story.genre}</p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>by {story.author || 'Drive Time Tales'}</p>
                    <p style={{ color: 'white', fontSize: '12px', fontWeight: 600, margin: '2px 0 0 0' }}>
                      {story.duration_mins} min • {cost} credit{cost !== 1 ? 's' : ''}
                      {story.is_free && <span style={{ backgroundColor: '#22c55e', color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, marginLeft: '6px' }}>FREE</span>}
                    </p>
                  </div>
                  {/* Add/Added indicator */}
                  <div style={{ paddingRight: '0.75rem', flexShrink: 0 }}>
                    {inPlaylist ? (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: '14px' }}>✓</span>
                      </div>
                    ) : canAfford ? (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#22c55e', fontSize: '18px', lineHeight: 1 }}>+</span>
                      </div>
                    ) : (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#475569', fontSize: '14px' }}>$</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Saved message toast */}
      {showSavedMessage && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#22c55e', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          ✓ Playlist Saved!
        </div>
      )}

      {/* Bottom action buttons */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        {playlist.length > 0 ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={savePlaylist}
              style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white', padding: '0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              💾 Save ({playlist.length} stories • {totalMinutes}min)
            </button>
            <button
              onClick={startDrive}
              style={{ flex: 1, backgroundColor: '#22c55e', color: 'white', padding: '0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              🚗 Start Drive
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '0.5rem' }}>
            Select stories above to build your playlist
          </div>
        )}
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
