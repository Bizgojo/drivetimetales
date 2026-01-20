'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

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

const DEFAULT_VISIBLE = ['mystery', 'romance', 'horror']

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(0)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  
  // Array to maintain selection order
  const [playlistOrder, setPlaylistOrder] = useState<string[]>([])

  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) {
      try {
        const parsed = JSON.parse(storedGenres)
        if (Array.isArray(parsed) && parsed.length >= 3) setVisibleGenres(parsed.slice(0, 3))
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase.from('stories').select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total').not('cover_url', 'is', null).order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('credits').eq('id', user.id).single()
        if (userData) setUserCredits(userData.credits || 0)
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
    // Don't show already selected stories in the available list
    if (playlistOrder.includes(story.id)) return false
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  const addToPlaylist = (storyId: string) => {
    setPlaylistOrder([...playlistOrder, storyId])
  }

  const removeFromPlaylist = (storyId: string) => {
    setPlaylistOrder(playlistOrder.filter(id => id !== storyId))
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newOrder = [...playlistOrder]
    ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    setPlaylistOrder(newOrder)
  }

  const moveDown = (index: number) => {
    if (index === playlistOrder.length - 1) return
    const newOrder = [...playlistOrder]
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    setPlaylistOrder(newOrder)
  }

  // Get selected stories in playlist order
  const playlistStories = playlistOrder.map(id => stories.find(s => s.id === id)).filter(Boolean) as Story[]
  const totalMinutes = playlistStories.reduce((sum, s) => sum + s.duration_mins, 0)
  const totalCredits = playlistStories.reduce((sum, s) => sum + getCredits(s.duration_mins), 0)
  const creditsLeft = userCredits - totalCredits

  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label : key }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '70px' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header */}
        <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: 'transparent', color: 'white', padding: '0.25rem', border: 'none', cursor: 'pointer', fontSize: '18px' }}>←</button>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: 500 }}>Create Your Playlist</span>
        </div>
        
        {/* Filters */}
        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#1e293b' }}>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
            <button onClick={() => setSelectedDuration('All')} style={allBtnStyle(selectedDuration === 'All')}>All</button>
            <button onClick={() => setSelectedDuration('15m')} style={btnStyle(selectedDuration === '15m')}>15m</button>
            <button onClick={() => setSelectedDuration('30m')} style={btnStyle(selectedDuration === '30m')}>30m</button>
            <button onClick={() => setSelectedDuration('1hr')} style={btnStyle(selectedDuration === '1hr')}>1hr</button>
            <span style={{ color: '#475569', display: 'flex', alignItems: 'center', padding: '0 2px' }}>|</span>
            <button onClick={() => setSelectedType('All')} style={btnStyle(selectedType === 'All')}>All</button>
            <button onClick={() => setSelectedType('Series')} style={btnStyle(selectedType === 'Series')}>Series</button>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>)}
            <div style={{ position: 'relative', flex: 1.5 }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
              {showMoreDropdown && <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', marginTop: '4px', minWidth: '140px', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>{ALL_GENRES.map(g => <button key={g.key} onClick={() => selectGenre(g.key)} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}>{g.emoji} {g.label}</button>)}</div>}
            </div>
          </div>
        </div>

        {/* Summary Bar */}
        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>{playlistOrder.length} stories • {totalMinutes}min</span>
          <span style={{ backgroundColor: creditsLeft >= 0 ? '#22c55e' : '#ef4444', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '13px', fontWeight: 500 }}>{creditsLeft} credits left</span>
        </div>
      </div>

      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      <div style={{ padding: '0.5rem 0.75rem' }}>
        {/* Selected Stories - Your Playlist */}
        {playlistOrder.length > 0 && (
          <>
            <div style={{ color: '#f97316', fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Your Playlist (in play order)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {playlistStories.map((story, index) => {
                const storyCost = getCredits(story.duration_mins)
                return (
                  <div key={story.id} style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', border: '2px solid #f97316' }}>
                    {/* Order number */}
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>{index + 1}</span>
                    </div>
                    {/* Cover */}
                    <div style={{ width: '50px', height: '50px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#334155' }}>
                      {story.cover_url ? <img src={story.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📖</div>}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'white', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</div>
                      <div style={{ color: '#cbd5e1', fontSize: '11px' }}>{story.duration_mins} min • {storyCost} cr</div>
                    </div>
                    {/* Move buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button onClick={() => moveUp(index)} disabled={index === 0} style={{ backgroundColor: index === 0 ? '#475569' : '#334155', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === 0 ? 'default' : 'pointer', fontSize: '12px' }}>▲</button>
                      <button onClick={() => moveDown(index)} disabled={index === playlistOrder.length - 1} style={{ backgroundColor: index === playlistOrder.length - 1 ? '#475569' : '#334155', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === playlistOrder.length - 1 ? 'default' : 'pointer', fontSize: '12px' }}>▼</button>
                    </div>
                    {/* Remove button */}
                    <button onClick={() => removeFromPlaylist(story.id)} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}>×</button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Available Stories */}
        <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Available Stories</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredStories.map(story => {
            const storyCost = getCredits(story.duration_mins)
            return (
              <div key={story.id} onClick={() => addToPlaylist(story.id)} style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '0.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center', cursor: 'pointer', border: '2px solid transparent' }}>
                {/* Cover */}
                <div style={{ width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#334155' }}>
                  {story.cover_url ? <img src={story.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>{story.title}</div>
                  <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.3 }}>{story.genre}</div>
                  <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.3 }}>{story.duration_mins} min • {storyCost} {storyCost === 1 ? 'credit' : 'credits'}</div>
                </div>
                {/* Add button */}
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#22c55e', fontSize: '18px', lineHeight: 1 }}>+</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Save Button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        <button onClick={() => { if (playlistOrder.length > 0 && creditsLeft >= 0) alert('Saving playlist...') }} disabled={playlistOrder.length === 0 || creditsLeft < 0} style={{ backgroundColor: playlistOrder.length === 0 || creditsLeft < 0 ? '#475569' : '#3b82f6', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', cursor: playlistOrder.length === 0 || creditsLeft < 0 ? 'not-allowed' : 'pointer', width: '100%', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>💾 Save My Playlist ({playlistOrder.length} stories • {totalMinutes}min)</button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPage() { return <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}><LibraryPlaylistContent /></Suspense> }
