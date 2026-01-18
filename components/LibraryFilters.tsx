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
  
  const [durationExpanded, setDurationExpanded] = useState(false)
  const [genreExpanded, setGenreExpanded] = useState(false)
  const [typeExpanded, setTypeExpanded] = useState(false)

  const resetFilters = () => {
    setSelectedDuration('Any Length')
    setSelectedGenre('📚 All')
    setSelectedType('All')
  }

  const handleDurationSelect = (d: string) => {
    setSelectedDuration(d)
    setDurationExpanded(false)
  }

  const handleGenreSelect = (g: string) => {
    setSelectedGenre(g)
    setGenreExpanded(false)
  }

  const handleTypeSelect = (t: string) => {
    setSelectedType(t)
    setTypeExpanded(false)
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      {/* Duration - Collapsible */}
      <div style={{ marginBottom: '0.5rem' }}>
        {durationExpanded ? (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex' }}>
            {durations.map(d => (
              <button
                key={d}
                onClick={() => handleDurationSelect(d)}
                className={`rounded-xl text-sm ${selectedDuration === d ? 'bg-orange-500' : ''}`}
                style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
              >
                {d === 'Any Length' ? '🚗 Any' : d}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex', gap: '0.25rem' }}>
            <button className="bg-orange-500 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              {selectedDuration === 'Any Length' ? '🚗 Any' : selectedDuration}
            </button>
            <button onClick={() => setDurationExpanded(true)} className="bg-slate-700 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              Duration ▼
            </button>
          </div>
        )}
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
            <button className="bg-orange-500 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              {selectedGenre}
            </button>
            <button onClick={() => setGenreExpanded(true)} className="bg-slate-700 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              Genre ▼
            </button>
          </div>
        )}
      </div>
      
      {/* Type - Collapsible */}
      <div style={{ marginBottom: '0.5rem' }}>
        {typeExpanded ? (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex' }}>
            {types.map(t => (
              <button
                key={t}
                onClick={() => handleTypeSelect(t)}
                className={`rounded-xl text-sm font-medium ${selectedType === t ? 'bg-orange-500' : ''}`}
                style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
              >
                {t === 'All' ? '📚 Either' : t === 'Singles' ? '📖 Singles' : '📺 Series'}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex', gap: '0.25rem' }}>
            <button className="bg-orange-500 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              {selectedType === 'All' ? '📚 Either' : selectedType === 'Singles' ? '📖 Singles' : '📺 Series'}
            </button>
            <button onClick={() => setTypeExpanded(true)} className="bg-slate-700 rounded-xl text-sm" style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}>
              Type ▼
            </button>
          </div>
        )}
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
