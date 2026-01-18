'use client'

import { useState } from 'react'

interface LibraryFiltersProps {
  selectedDuration: string
  setSelectedDuration: (val: string) => void
  selectedGenre: string
  setSelectedGenre: (val: string) => void
  selectedType: string
  setSelectedType: (val: string) => void
}

const durations = ['Any Length', '~15 min', '~30 min', '~1 hr']
const genres = ['📚 All', '🔍 Mystery', '🎭 Drama', '🚀 Sci-Fi', '👻 Horror', '😂 Comedy', '💕 Romance', '🚛 Truckers', '👶 Children', '🧠 Get Smart']
const types = ['All', 'Singles', 'Series']

export default function LibraryFilters({
  selectedDuration,
  setSelectedDuration,
  selectedGenre,
  setSelectedGenre,
  selectedType,
  setSelectedType
}: LibraryFiltersProps) {
  
  const [genreExpanded, setGenreExpanded] = useState(true)

  const resetFilters = () => {
    setSelectedDuration('Any Length')
    setSelectedGenre('📚 All')
    setSelectedType('All')
    setGenreExpanded(true)
  }

  const handleGenreSelect = (g: string) => {
    setSelectedGenre(g)
    setGenreExpanded(false)
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      {/* Single instruction line */}
      <p className="text-white text-sm" style={{ marginBottom: '0.75rem' }}>
        <span className="font-bold">LIBRARY</span> pick a duration, genre, type
      </p>

      {/* Duration */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex' }}>
          {durations.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDuration(d)}
              className={`rounded-xl text-sm ${selectedDuration === d ? 'bg-orange-500' : ''}`}
              style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
            >
              {d === 'Any Length' ? '🚗 Any' : d}
            </button>
          ))}
        </div>
      </div>
      
      {/* Genre - Collapsible */}
      <div style={{ marginBottom: '0.5rem' }}>
        {genreExpanded ? (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.375rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {genres.map(g => (
                <button
                  key={g}
                  onClick={() => handleGenreSelect(g)}
                  className={`rounded-xl text-sm ${selectedGenre === g ? 'bg-orange-500' : ''}`}
                  style={{ padding: '0.625rem 1rem', border: 'none', cursor: 'pointer', color: 'white' }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex', gap: '0.25rem' }}>
            {selectedGenre === '📚 All' ? (
              <>
                <button className="bg-orange-500 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
                  📚 All
                </button>
                <button onClick={() => setGenreExpanded(true)} className="bg-slate-700 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
                  Genre ▼
                </button>
              </>
            ) : (
              <>
                <button className="bg-orange-500 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
                  {selectedGenre}
                </button>
                <button onClick={() => setGenreExpanded(true)} className="bg-slate-700 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
                  More ▼
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Type */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex' }}>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`rounded-xl text-sm font-medium ${selectedType === t ? 'bg-orange-500' : ''}`}
              style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
            >
              {t === 'All' ? '📚 Either' : t === 'Singles' ? '📖 Singles' : '📺 Series'}
            </button>
          ))}
        </div>
      </div>
      
      {/* Reset */}
      <button 
        onClick={resetFilters}
        className="text-slate-400 text-sm"
        style={{ width: '100%', padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ↺ Show me everything
      </button>
    </div>
  )
}
