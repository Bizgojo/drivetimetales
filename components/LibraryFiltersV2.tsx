'use client'

import { useState } from 'react'

interface LibraryFiltersV2Props {
  selectedDuration: string
  setSelectedDuration: (value: string) => void
  selectedGenre: string
  setSelectedGenre: (value: string) => void
  selectedType: string
  setSelectedType: (value: string) => void
}

const DURATIONS = [
  { value: 'All Lengths', label: 'All' },
  { value: '~15 min', label: '15m' },
  { value: '~30 min', label: '30m' },
  { value: '~1 hr', label: '1hr' },
]

const ALL_GENRES = [
  { value: 'All Categories', label: 'All', emoji: '' },
  { value: 'Mystery', label: 'Myst', emoji: '🔍' },
  { value: 'Romance', label: 'Rom', emoji: '💕' },
  { value: 'Sci-Fi', label: 'SciFi', emoji: '🚀' },
  { value: 'Horror', label: 'Horr', emoji: '👻' },
  { value: 'Comedy', label: 'Com', emoji: '😂' },
  { value: 'Learn', label: 'Learn', emoji: '🧠' },
  { value: 'Thriller', label: 'Thrill', emoji: '😱' },
  { value: 'Truckers', label: 'Truck', emoji: '🚛' },
  { value: 'Children', label: 'Kids', emoji: '👶' },
]

const TYPES = [
  { value: 'Singles & Series', label: 'Both' },
  { value: 'Singles Only', label: 'Singles' },
  { value: 'Series Only', label: 'Series' },
]

// Default visible genres (values, not including 'All Categories')
const DEFAULT_VISIBLE = ['Mystery', 'Romance', 'Horror']

export default function LibraryFiltersV2({
  selectedDuration,
  setSelectedDuration,
  selectedGenre,
  setSelectedGenre,
  selectedType,
  setSelectedType,
}: LibraryFiltersV2Props) {
  
  // Track which genres are visible in the row (not including 'All Categories')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

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

  // Get genre object by value
  const getGenre = (value: string) => ALL_GENRES.find(g => g.value === value)

  // Handle clicking a VISIBLE genre button - just move highlight, don't change button positions
  const handleVisibleGenreClick = (genreValue: string) => {
    setSelectedGenre(genreValue)
    // DO NOT change visibleGenres here - buttons stay in place
  }

  // Handle selecting from More menu - this DOES change button positions
  const handleMoreSelect = (genreValue: string) => {
    if (selectedGenre === 'All Categories') {
      // If on All, put new genre in first slot (position 0)
      const newVisible = [genreValue, visibleGenres[1], visibleGenres[2]]
      setVisibleGenres(newVisible)
    } else {
      // Replace the currently selected genre's position with the new genre
      const currentIndex = visibleGenres.indexOf(selectedGenre)
      if (currentIndex !== -1) {
        const newVisible = [...visibleGenres]
        newVisible[currentIndex] = genreValue
        setVisibleGenres(newVisible)
      } else {
        // Fallback: put in first slot
        const newVisible = [genreValue, visibleGenres[1], visibleGenres[2]]
        setVisibleGenres(newVisible)
      }
    }
    setSelectedGenre(genreValue)
    setShowMoreMenu(false)
  }

  // Genres available in More menu (not currently visible and not All)
  const moreGenres = ALL_GENRES.filter(
    g => g.value !== 'All Categories' && !visibleGenres.includes(g.value)
  )

  return (
    <div style={{ position: 'sticky', top: '60px', zIndex: 40, padding: '0 1rem' }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
        
        {/* Duration Row */}
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {DURATIONS.map(d => (
            <button
              key={d.value}
              onClick={() => setSelectedDuration(d.value)}
              style={btnStyle(selectedDuration === d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Genre Row */}
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center', position: 'relative' }}>
          {/* All button - always first */}
          <button
            onClick={() => handleVisibleGenreClick('All Categories')}
            style={btnStyle(selectedGenre === 'All Categories')}
          >
            All
          </button>
          
          {/* Visible genre buttons - clicking just moves highlight */}
          {visibleGenres.map(genreValue => {
            const genre = getGenre(genreValue)
            if (!genre) return null
            return (
              <button
                key={genre.value}
                onClick={() => handleVisibleGenreClick(genre.value)}
                style={btnStyle(selectedGenre === genre.value)}
              >
                {genre.emoji}{genre.label}
              </button>
            )
          })}
          
          {/* More button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={btnStyle(false)}
            >
              More ▼
            </button>
            
            {/* More dropdown menu */}
            {showMoreMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '8px',
                zIndex: 100,
                minWidth: '140px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}>
                {moreGenres.map(genre => (
                  <button
                    key={genre.value}
                    onClick={() => handleMoreSelect(genre.value)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {genre.emoji} {genre.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Type Row */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setSelectedType(t.value)}
              style={btnStyle(selectedType === t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

      </div>
      
      {/* Click outside to close menu */}
      {showMoreMenu && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }}
          onClick={() => setShowMoreMenu(false)}
        />
      )}
    </div>
  )
}
