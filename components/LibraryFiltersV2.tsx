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

const GENRES = [
  { value: 'All Categories', label: 'All', emoji: '' },
  { value: 'Mystery', label: 'Myst', emoji: '🔍' },
  { value: 'Romance', label: 'Rom', emoji: '💕' },
  { value: 'Sci-Fi', label: 'SciFi', emoji: '🚀' },
  { value: 'Horror', label: 'Horr', emoji: '👻' },
  { value: 'Comedy', label: 'Com', emoji: '😂' },
  { value: 'Learn', label: 'Learn', emoji: '🧠' },
]

const TYPES = [
  { value: 'Singles & Series', label: 'Both' },
  { value: 'Singles Only', label: 'Singles' },
  { value: 'Series Only', label: 'Series' },
]

export default function LibraryFiltersV2({
  selectedDuration,
  setSelectedDuration,
  selectedGenre,
  setSelectedGenre,
  selectedType,
  setSelectedType,
}: LibraryFiltersV2Props) {

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
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {GENRES.map(g => (
            <button
              key={g.value}
              onClick={() => setSelectedGenre(g.value)}
              style={btnStyle(selectedGenre === g.value)}
            >
              {g.emoji}{g.label}
            </button>
          ))}
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
    </div>
  )
}
