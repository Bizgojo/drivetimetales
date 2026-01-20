'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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

function WelcomeLibraryContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(2)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_user_credits')
    if (storedCredits !== null) setUserCredits(parseInt(storedCredits, 10))
    
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
      const { data: storiesData, error } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (error) console.error('Stories query error:', error)
      if (storiesData) setStories(storiesData)
      setLoading(false)
    }
    fetchData()
  }, [])

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey)
    setShowMoreDropdown(false)
    
    if (genreKey !== 'All' && !visibleGenres.includes(genreKey)) {
      const newVisible = [genreKey, ...visibleGenres.filter(g => g !== genreKey)].slice(0, 3)
      setVisibleGenres(newVisible)
      localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible))
    } else if (genreKey !== 'All') {
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
    const storyCost = getCredits(story.duration_mins)
    if (storyCost <= userCredits) router.push('/player/' + story.id)
    else { setSelectedStory(story); setShowCreditModal(true) }
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '5px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer'
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
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '55px' }}>
      {/* Sticky Header + Filters */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header - compact */}
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/welcome')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '18px' }}>🚗</span><span style={{ fontSize: '18px' }}>🚙</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
            <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
          </div>
        </div>
        
        {/* Filters - sticky */}
        <div style={{ padding: '0.4rem 0.75rem', backgroundColor: '#1e293b' }}>
          {/* Row 1: Duration + Type */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>)}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center', fontSize: '12px' }}>|</span>
            {['All', 'Series'].map(t => <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>)}
          </div>
          {/* Row 2: Genre with dynamic buttons + More dropdown */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', flexWrap: 'wrap', justifyContent: 'center', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={btnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => (
              <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>
                {getGenreLabel(g)}
              </button>
            ))}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), display: 'flex', alignItems: 'center', gap: '2px' }}>
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
          {/* Playlist button */}
          <button onClick={() => setShowSubscriberPopup(true)} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.4rem 1rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%' }}>➕ Create a Playlist</button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      {/* Story Cards */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.map(story => (
          <div key={story.id} onClick={() => handleStoryClick(story)} style={{ cursor: 'pointer' }}>
            <HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={getCredits(story.duration_mins)} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} />
          </div>
        ))}
      </div>

      {/* Bottom Button - compact */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        <button onClick={() => router.push('/subscribe')} style={{ backgroundColor: '#22c55e', color: '#0f172a', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>You only have {userCredits} credits</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Subscribe Now!</span>
        </button>
      </div>

      {showSubscriberPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowSubscriberPopup(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>Playlists for Subscribers</h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1.5rem' }}>Playlists are only available for subscribers. Subscribe now to create your own hands-free driving playlists!</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowSubscriberPopup(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => setShowSubscriberPopup(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}

      {showCreditModal && selectedStory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowCreditModal(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>Not Enough Credits</h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1rem' }}>This story requires {getCredits(selectedStory.duration_mins)} credits, but you only have {userCredits}.</p>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '1.5rem' }}>Subscribe or buy more credits to listen to this story.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowCreditModal(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => setShowCreditModal(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function WelcomeLibraryPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}>
      <WelcomeLibraryContent />
    </Suspense>
  )
}
