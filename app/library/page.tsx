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
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
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

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)

  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) {
      try {
        const parsed = JSON.parse(storedGenres)
        if (Array.isArray(parsed) && parsed.length >= 3) {
          setVisibleGenres(parsed.slice(0, 3))
        }
      } catch (e) { /* use default */ }
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      // Fetch stories
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      
      if (storiesError) console.error('Stories query error:', storiesError)
      if (storiesData) setStories(storiesData)

      // Fetch user data if logged in
      if (user?.id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('first_name, avatar_url')
          .eq('id', user.id)
          .single()
        
        if (userError) console.error('User query error:', userError)
        if (userData) {
          setUserName(userData.first_name || 'Friend')
          setAvatarUrl(userData.avatar_url || null)
        }
      }
      
      setLoading(false)
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

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All') {
      const g = story.genre?.toLowerCase() || ''
      if (!g.includes(selectedGenre.toLowerCase())) return false
    }
    return true
  })

  const handleStoryClick = (story: Story) => {
    router.push('/player/' + story.id)
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.3rem 0',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center'
  })

  const allBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle(active),
    flex: 'none',
    width: '42px'
  })

  const getGenreLabel = (key: string) => {
    const genre = ALL_GENRES.find(g => g.key === key)
    if (!genre) return key
    return genre.emoji + genre.label.substring(0, 4)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Sticky Header + Filters */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header with avatar */}
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/home')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '18px' }}>🚗</span><span style={{ fontSize: '18px' }}>🚙</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
            <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
          </div>
          {/* Avatar */}
          <div 
            onClick={() => router.push('/profile')}
            style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%', 
              backgroundColor: '#334155',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>
        
        {/* Filters - full width rows */}
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
          {/* Row 2: Genre - All fixed width, others flex, More wider */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => (
              <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>
                {getGenreLabel(g)}
              </button>
            ))}
            <div style={{ position: 'relative', flex: 1.5 }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>
                More ▼
              </button>
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
          {/* Playlist button - goes directly to playlist page for subscribers */}
          <button onClick={() => router.push('/library-playlist')} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.45rem 1rem', borderRadius: '6px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%' }}>➕ Create a Playlist</button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      {/* Story Cards or Empty State */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.length === 0 ? (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>😔</div>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '0.5rem' }}>Sorry {userName}, we have no stories to match your request.</p>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>But we will request this category to our writers!</p>
          </div>
        ) : (
          filteredStories.map(story => {
            const storyCost = getCredits(story.duration_mins)
            return (
              <div key={story.id} onClick={() => handleStoryClick(story)} style={{ cursor: 'pointer' }}>
                <HorizontalStoryCard 
                  id={story.id} 
                  title={story.title} 
                  genre={story.genre} 
                  author={story.author || 'Drive Time Tales'} 
                  duration_mins={story.duration_mins} 
                  credits={storyCost} 
                  cover_url={story.cover_url} 
                  series_number={story.series_number} 
                  series_total={story.series_total}
                />
              </div>
            )
          })
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}>
      <LibraryContent />
    </Suspense>
  )
}
