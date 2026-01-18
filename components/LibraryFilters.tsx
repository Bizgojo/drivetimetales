/*
================================================================================
🔒 PROTECTED MODULE L01/WL01 - LIBRARY FILTERS
================================================================================
Module: L01_LibraryFilters / WL01_LibraryFilters
Location: ~/DriveTimeFiles/WorkingCodeLibrary/
Status: PROTECTED

ORDER (based on driver thinking):
1. Duration - "How long is your drive?"
2. Genre - "What are you in the mood for?" (collapsible)
3. Type - "Want a series or standalone?"

⚠️  DO NOT MODIFY WITHOUT MARC'S APPROVAL
================================================================================
*/

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
      {/* Duration FIRST */}
      <div style={{ marginBottom: '1rem' }}>
        <p className="text-white text-sm font-semibold" style={{ marginBottom: '0.5rem' }}>How long is your drive?</p>
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
      
      {/* Genre SECOND - Collapsible */}
      <div style={{ marginBottom: '1rem' }}>
        <p className="text-white text-sm font-semibold" style={{ marginBottom: '0.5rem' }}>What are you in the mood for?</p>
        
        {genreExpanded ? (
          /* Expanded: Show all genres */
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
          /* Collapsed: Show selected + More/Genre button */
          <div className="bg-slate-800 rounded-xl" style={{ padding: '0.25rem', display: 'flex', gap: '0.25rem' }}>
            {selectedGenre === '📚 All' ? (
              <>
                <button
                  className="bg-orange-500 rounded-xl text-sm"
                  style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
                >
                  📚 All
                </button>
                <button
                  onClick={() => setGenreExpanded(true)}
                  className="bg-slate-700 rounded-xl text-sm"
                  style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
                >
                  Genre ▼
                </button>
              </>
            ) : (
              <>
                <button
                  className="bg-orange-500 rounded-xl text-sm"
                  style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
                >
                  {selectedGenre}
                </button>
                <button
                  onClick={() => setGenreExpanded(true)}
                  className="bg-slate-700 rounded-xl text-sm"
                  style={{ flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer', color: 'white' }}
                >
                  More ▼
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Type THIRD */}
      <div style={{ marginBottom: '1rem' }}>
        <p className="text-white text-sm font-semibold" style={{ marginBottom: '0.5rem' }}>Want a series or standalone?</p>
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
