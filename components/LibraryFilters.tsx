'use client'

import { useState, useRef, useEffect } from 'react'

interface LibraryFiltersProps {
  selectedDuration: string
  setSelectedDuration: (value: string) => void
  selectedGenre: string
  setSelectedGenre: (value: string) => void
  selectedType: string
  setSelectedType: (value: string) => void
}

const DURATIONS = ['All Lengths', '~15 min', '~30 min', '~1 hr']
const GENRES = ['All Categories', 'Mystery', 'Thriller', 'Romance', 'Sci-Fi', 'Fantasy', 'Horror', 'Comedy', 'Drama']
const TYPES = ['Singles & Series', 'Singles Only', 'Series Only']

export default function LibraryFilters({
  selectedDuration,
  setSelectedDuration,
  selectedGenre,
  setSelectedGenre,
  selectedType,
  setSelectedType,
}: LibraryFiltersProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleReset = () => {
    setSelectedDuration('All Lengths')
    setSelectedGenre('All Categories')
    setSelectedType('Singles & Series')
  }

  const isFiltered = selectedDuration !== 'All Lengths' || selectedGenre !== 'All Categories' || selectedType !== 'Singles & Series'

  // Clock icon - green circle, red hands
  const ClockIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2.5"/>
      <path d="M12 6v6l4 2" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )

  // Genre icon - 4 colored squares
  const GenreIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1" fill="#ef4444"/>
      <rect x="13" y="3" width="8" height="8" rx="1" fill="#22c55e"/>
      <rect x="3" y="13" width="8" height="8" rx="1" fill="#3b82f6"/>
      <rect x="13" y="13" width="8" height="8" rx="1" fill="#f97316"/>
    </svg>
  )

  // Book spines icon based on type
  const TypeIcon = ({ type }: { type: string }) => {
    if (type === 'Singles Only') {
      return (
        <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
          <div style={{ width: '8px', height: '20px', backgroundColor: '#22c55e', borderRadius: '1px' }}></div>
        </div>
      )
    }
    if (type === 'Series Only') {
      return (
        <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
          <div style={{ width: '5px', height: '16px', backgroundColor: '#ef4444', borderRadius: '1px' }}></div>
          <div style={{ width: '5px', height: '20px', backgroundColor: '#3b82f6', borderRadius: '1px' }}></div>
          <div style={{ width: '5px', height: '18px', backgroundColor: '#f97316', borderRadius: '1px' }}></div>
        </div>
      )
    }
    // Singles & Series
    return (
      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
        <div style={{ width: '7px', height: '20px', backgroundColor: '#22c55e', borderRadius: '1px' }}></div>
        <div style={{ width: '3px' }}></div>
        <div style={{ width: '4px', height: '16px', backgroundColor: '#ef4444', borderRadius: '1px' }}></div>
        <div style={{ width: '4px', height: '20px', backgroundColor: '#3b82f6', borderRadius: '1px' }}></div>
        <div style={{ width: '4px', height: '18px', backgroundColor: '#f97316', borderRadius: '1px' }}></div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'sticky', 
        top: '60px', 
        zIndex: 40,
        padding: '0 1rem'
      }}
    >
      <div style={{ 
        backgroundColor: '#1e293b', 
        borderRadius: '12px', 
        padding: '0.75rem' 
      }}>
        
        {/* Duration Row */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', position: 'relative' }}>
          <div style={{ flex: 1, color: '#e2e8f0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClockIcon />
            <span>Duration - {selectedDuration}</span>
          </div>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'duration' ? null : 'duration')}
            style={{ 
              backgroundColor: '#f97316', 
              color: 'white', 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              fontSize: '15px', 
              fontWeight: 500, 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Change ▼
          </button>
          {openDropdown === 'duration' && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              right: 0, 
              marginTop: '4px',
              backgroundColor: '#334155', 
              borderRadius: '8px', 
              overflow: 'hidden',
              zIndex: 50,
              minWidth: '150px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {DURATIONS.map(d => (
                <button 
                  key={d}
                  onClick={() => { setSelectedDuration(d); setOpenDropdown(null) }}
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    textAlign: 'left',
                    backgroundColor: selectedDuration === d ? '#475569' : 'transparent',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Genre Row */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', position: 'relative' }}>
          <div style={{ flex: 1, color: '#e2e8f0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GenreIcon />
            <span>Genre - {selectedGenre}</span>
          </div>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'genre' ? null : 'genre')}
            style={{ 
              backgroundColor: '#f97316', 
              color: 'white', 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              fontSize: '15px', 
              fontWeight: 500, 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Change ▼
          </button>
          {openDropdown === 'genre' && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              right: 0, 
              marginTop: '4px',
              backgroundColor: '#334155', 
              borderRadius: '8px', 
              overflow: 'hidden',
              zIndex: 50,
              minWidth: '150px',
              maxHeight: '250px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {GENRES.map(g => (
                <button 
                  key={g}
                  onClick={() => { setSelectedGenre(g); setOpenDropdown(null) }}
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    textAlign: 'left',
                    backgroundColor: selectedGenre === g ? '#475569' : 'transparent',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Type Row */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
          <div style={{ flex: 1, color: '#e2e8f0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TypeIcon type={selectedType} />
            <span>Type - {selectedType}</span>
          </div>
          <button 
            onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            style={{ 
              backgroundColor: '#f97316', 
              color: 'white', 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              fontSize: '15px', 
              fontWeight: 500, 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Change ▼
          </button>
          {openDropdown === 'type' && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              right: 0, 
              marginTop: '4px',
              backgroundColor: '#334155', 
              borderRadius: '8px', 
              overflow: 'hidden',
              zIndex: 50,
              minWidth: '160px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {TYPES.map(t => (
                <button 
                  key={t}
                  onClick={() => { setSelectedType(t); setOpenDropdown(null) }}
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    textAlign: 'left',
                    backgroundColor: selectedType === t ? '#475569' : 'transparent',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '15px'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reset Button */}
        {isFiltered && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155' }}>
            <button 
              onClick={handleReset}
              style={{ 
                width: '100%', 
                backgroundColor: '#f97316', 
                color: 'white', 
                padding: '0.5rem', 
                borderRadius: '6px', 
                fontSize: '15px', 
                fontWeight: 500, 
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Reset Filters
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
