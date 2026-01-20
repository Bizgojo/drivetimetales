'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
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

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
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
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  
  // Drag to reorder
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

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
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  // Sort: selected stories at top in playlist order, then unselected
  const sortedStories = [...filteredStories].sort((a, b) => {
    const aIndex = playlist.findIndex(p => p.id === a.id)
    const bIndex = playlist.findIndex(p => p.id === b.id)
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1
    return 0
  })

  const playlistCreditsUsed = playlist.reduce((sum, item) => sum + getCredits(item.duration_mins), 0)
  const creditsRemaining = userCredits - playlistCreditsUsed
  const playlistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)

  const toggleStorySelection = (story: Story) => {
    const exists = playlist.find(p => p.id === story.id)
    if (exists) {
      setPlaylist(playlist.filter(p => p.id !== story.id))
    } else {
      const storyCost = getCredits(story.duration_mins)
      if (storyCost > creditsRemaining) return
      setPlaylist([...playlist, {
        id: story.id,
        title: story.title,
        duration_mins: story.duration_mins,
        genre: story.genre,
        author: story.author || 'Drive Time Tales',
        cover_url: story.cover_url,
        credited: false
      }])
    }
  }

  const handleLongPressStart = (index: number) => {
    longPressTimer.current = setTimeout(() => setDraggedIndex(index), 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newPlaylist = [...playlist]
      const [removed] = newPlaylist.splice(draggedIndex, 1)
      newPlaylist.splice(dragOverIndex, 0, removed)
      setPlaylist(newPlaylist)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const savePlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    router.push('/library')
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}hr ${m}min` : `${hrs}hr`
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label : key }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '80px' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header */}
        <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: 'transparent', color: 'white', padding: '0.25rem', border: 'none', cursor: 'pointer', fontSize: '18px' }}>←</button>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: 500 }}>Select stories for your playlist</span>
        </div>
        
        {/* Filters - compact design matching library */}
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
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>{playlist.length} stories • {formatTime(playlistTotal)}</span>
          <span style={{ backgroundColor: creditsRemaining >= 0 ? '#22c55e' : '#ef4444', color: creditsRemaining >= 0 ? '#0f172a' : 'white', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '13px', fontWeight: 600 }}>{creditsRemaining} credits left</span>
        </div>
      </div>

      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      {/* Story Cards */}
      <div style={{ padding: '0.5rem 0.75rem' }}>
        {sortedStories.map(story => {
          const isSelected = playlist.some(p => p.id === story.id)
          const storyCost = getCredits(story.duration_mins)
          const canAfford = storyCost <= creditsRemaining || isSelected
          const playlistIndex = playlist.findIndex(p => p.id === story.id)
          const isDragging = draggedIndex === playlistIndex
          const isDragOver = dragOverIndex === playlistIndex && draggedIndex !== null

          return (
            <div 
              key={story.id}
              onClick={() => canAfford && toggleStorySelection(story)}
              onTouchStart={() => isSelected && handleLongPressStart(playlistIndex)}
              onTouchEnd={handleLongPressEnd}
              onMouseDown={() => isSelected && handleLongPressStart(playlistIndex)}
              onMouseUp={handleLongPressEnd}
              onMouseEnter={() => draggedIndex !== null && isSelected && setDragOverIndex(playlistIndex)}
              style={{ 
                backgroundColor: isSelected ? '#1e3a2f' : '#1e293b',
                border: isDragOver ? '2px dashed #f97316' : isSelected ? '2px solid #22c55e' : '2px solid transparent',
                borderRadius: '8px', 
                padding: '0.5rem', 
                marginBottom: '0.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                cursor: canAfford ? 'pointer' : 'not-allowed', 
                opacity: canAfford ? 1 : 0.5,
                transform: isDragging ? 'scale(1.02)' : 'scale(1)', 
                boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.4)' : 'none', 
                transition: 'transform 0.15s, box-shadow 0.15s'
              }}
            >
              {/* Drag handle + order number for selected */}
              {isSelected && <div style={{ color: 'white', fontSize: '14px', cursor: 'grab' }}>☰</div>}
              {isSelected && <div style={{ backgroundColor: '#f97316', color: 'white', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>{playlistIndex + 1}</div>}
              
              {/* Cover */}
              <div style={{ width: '55px', height: '55px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#334155' }}>
                {story.cover_url ? <img src={story.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>}
              </div>
              
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'white', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                  {story.title}
                  {story.series_number && story.series_total && <span style={{ color: '#3b82f6', fontSize: '11px', marginLeft: '4px' }}>[{story.series_number}/{story.series_total}]</span>}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: 1.3 }}>{story.genre}</div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: 1.3 }}>{story.duration_mins} min • {storyCost} {storyCost === 1 ? 'credit' : 'credits'}</div>
              </div>
              
              {/* Checkbox */}
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: isSelected ? 'none' : '2px solid #475569', backgroundColor: isSelected ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, fontSize: '14px' }}>{isSelected && '✓'}</div>
            </div>
          )
        })}
      </div>

      {/* Save Button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        <button onClick={savePlaylist} disabled={playlist.length === 0} style={{ backgroundColor: playlist.length > 0 ? '#22c55e' : '#475569', color: playlist.length > 0 ? '#0f172a' : 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', cursor: playlist.length > 0 ? 'pointer' : 'not-allowed', width: '100%', fontSize: '15px', fontWeight: 'bold' }}>
          💾 Save My Playlist ({playlist.length} stories • {formatTime(playlistTotal)})
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPage() { return <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}><LibraryPlaylistContent /></Suspense> }
