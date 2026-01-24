'use client'

import { useState, useEffect } from 'react'
import PlaylistButton from '@/components/PlaylistButton'

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

interface LibraryFiltersWithSearchProps {
  userCredits: number
  isUnlimited: boolean
  showPlaylistButton?: boolean
  onFilterChange: (filters: {
    duration: string
    type: string
    genre: string
    searchQuery: string
    searchType: 'title' | 'author'
  }) => void
}

export default function LibraryFiltersWithSearch({
  userCredits,
  isUnlimited,
  showPlaylistButton = true,
  onFilterChange
}: LibraryFiltersWithSearchProps) {
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  const [showSearchScreen, setShowSearchScreen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'title' | 'author'>('title')
  const [tempSearchQuery, setTempSearchQuery] = useState('')

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
    onFilterChange({ duration: selectedDuration, type: selectedType, genre: selectedGenre, searchQuery, searchType })
  }, [selectedDuration, selectedType, selectedGenre, searchQuery, searchType, onFilterChange])

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey)
    setShowMoreDropdown(false)
    if (genreKey !== 'All') {
      const newVisible = [genreKey, ...visibleGenres.filter(g => g !== genreKey)].slice(0, 3)
      setVisibleGenres(newVisible)
      localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible))
    }
  }

  const openSearch = () => { setTempSearchQuery(searchQuery); setShowSearchScreen(true) }
  const applySearch = () => { setSearchQuery(tempSearchQuery); setShowSearchScreen(false) }
  const clearSearch = () => { setSearchQuery(''); setTempSearchQuery(''); setShowSearchScreen(false) }

  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label.substring(0, 4) : key }

  return (
    <>
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
        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', position: 'relative' }}>
          <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
          {visibleGenres.map(g => <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>)}
          <div style={{ position: 'relative', flex: 1.5 }}>
            <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
            {showMoreDropdown && <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', marginTop: '4px', minWidth: '140px', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>{ALL_GENRES.map(g => <button key={g.key} onClick={() => selectGenre(g.key)} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}>{g.emoji} {g.label}</button>)}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '6px', textAlign: 'center', lineHeight: 1.2 }}>
            <div style={{ color: 'white', fontSize: '10px', fontWeight: 'normal' }}>Credits</div>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: 'normal' }}>{isUnlimited ? '∞' : userCredits}</div>
          </div>
          {showPlaylistButton && <div style={{ flex: 1 }}><PlaylistButton /></div>}
          <button onClick={openSearch} style={{ backgroundColor: searchQuery ? '#f97316' : '#334155', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Search</button>
        </div>
      </div>
      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}
      {searchQuery && !showSearchScreen && <div style={{ margin: '0.5rem 0.75rem', backgroundColor: '#334155', borderRadius: '6px', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'white', fontSize: '13px' }}>Searching {searchType}: "{searchQuery}"</span><button onClick={clearSearch} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '12px', cursor: 'pointer' }}>✕</button></div>}
      {showSearchScreen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 100, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button onClick={() => setShowSearchScreen(false)} style={{ backgroundColor: 'transparent', color: 'white', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '0.5rem' }}>✕ Cancel</button>
            <span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Search Stories</span>
            <div style={{ width: '70px' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
            <button onClick={() => setSearchType('title')} style={{ padding: '1rem 2rem', borderRadius: '12px', border: searchType === 'title' ? '3px solid #f97316' : '3px solid #475569', backgroundColor: searchType === 'title' ? '#f97316' : 'transparent', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>Title</button>
            <button onClick={() => setSearchType('author')} style={{ padding: '1rem 2rem', borderRadius: '12px', border: searchType === 'author' ? '3px solid #f97316' : '3px solid #475569', backgroundColor: searchType === 'author' ? '#f97316' : 'transparent', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>Author</button>
          </div>
          <div style={{ marginBottom: '1.5rem' }}><input type="text" placeholder={'Type ' + searchType + ' here...'} value={tempSearchQuery} onChange={(e) => setTempSearchQuery(e.target.value)} autoFocus style={{ width: '100%', padding: '1.25rem 1rem', borderRadius: '12px', border: 'none', backgroundColor: '#ffffff', color: '#000000', fontSize: '20px', fontWeight: 500, outline: 'none', boxShadow: '0 4px 12px rgba(255,255,255,0.2)' }} /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={applySearch} disabled={!tempSearchQuery.trim()} style={{ flex: 1, padding: '1rem', borderRadius: '12px', border: 'none', backgroundColor: tempSearchQuery.trim() ? '#22c55e' : '#334155', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: tempSearchQuery.trim() ? 'pointer' : 'not-allowed' }}>🔍 Search</button>
            {searchQuery && <button onClick={clearSearch} style={{ padding: '1rem 1.5rem', borderRadius: '12px', border: 'none', backgroundColor: '#dc2626', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>Clear</button>}
          </div>
          <div style={{ flex: 1 }} />
        </div>
      )}
    </>
  )
}
