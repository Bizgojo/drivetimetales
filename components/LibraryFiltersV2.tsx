'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface LibraryFiltersV2Props {
  selectedDuration: string
  setSelectedDuration: (value: string) => void
  selectedGenre: string
  setSelectedGenre: (value: string) => void
  selectedType: string
  setSelectedType: (value: string) => void
  selectedGroup: string
  setSelectedGroup: (value: string) => void
}

interface GenreOption {
  value: string
  label: string
  shortLabel: string
  emoji: string
}

const DURATIONS = [
  { value: 'All Lengths', label: 'All' },
  { value: '~15 min', label: '15m' },
  { value: '~30 min', label: '30m' },
  { value: '~1 hr', label: '1hr' },
]

const TYPES = [
  { value: 'Singles & Series', label: 'Both' },
  { value: 'Singles Only', label: 'Singles' },
  { value: 'Series Only', label: 'Series' },
]

// Emoji map for known genres - add new ones as needed
const GENRE_EMOJIS: Record<string, string> = {
  'Mystery': '🔍',
  'Romance': '💕',
  'Sci-Fi': '🚀',
  'Horror': '👻',
  'Comedy': '😂',
  'Drama': '🎭',
  'Thriller': '😱',
  'Fantasy': '🧙',
  'Adventure': '⛰️',
  'Western': '🤠',
  'Appalachian': '🏔️',
  'Children': '👶',
  'Folk': '🪕',
  'Noir': '🕵️',
  'Historical': '📜',
  'True Crime': '🔪',
  'Science': '🔬',
  'Documentary': '🎬',
  'Self-Help': '💪',
  'Biography': '📖',
  'Get Smarter': '🧠',
  'Learn': '🧠',
  'Truckers': '🚛',
  'Non-Fiction': '📚',
}

function makeShortLabel(name: string): string {
  if (name.length <= 5) return name
  // Known short labels
  const shorts: Record<string, string> = {
    'Mystery': 'Myst',
    'Romance': 'Rom',
    'Horror': 'Horr',
    'Comedy': 'Com',
    'Thriller': 'Thrill',
    'Sci-Fi': 'SciFi',
    'Children': 'Kids',
    'Truckers': 'Truck',
    'Adventure': 'Adv',
    'Fantasy': 'Fan',
    'Historical': 'Hist',
    'Documentary': 'Doc',
    'Biography': 'Bio',
    'Appalachian': 'Appal',
    'True Crime': 'Crime',
    'Get Smarter': 'Smart',
    'Self-Help': 'Self',
    'Non-Fiction': 'NF',
    'Western': 'West',
  }
  return shorts[name] || name.slice(0, 5)
}

export default function LibraryFiltersV2({
  selectedDuration,
  setSelectedDuration,
  selectedGenre,
  setSelectedGenre,
  selectedType,
  setSelectedType,
  selectedGroup,
  setSelectedGroup,
}: LibraryFiltersV2Props) {

  const [allGenres, setAllGenres] = useState<GenreOption[]>([])
  const [visibleGenres, setVisibleGenres] = useState<string[]>([])
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [groups, setGroups] = useState<{id: string, name: string}[]>([])

  useEffect(() => {
    loadGenresWithStories()
    supabase.from('groups').select('id, name').order('display_order', { ascending: true }).then(({ data }) => {
      if (data) setGroups(data)
    })
  }, [])

  async function loadGenresWithStories() {
    // Fetch active genres from genres table
    const { data: genreRows } = await supabase
      .from('genres')
      .select('name, display_order')
      .eq('active', true)
      .order('display_order', { ascending: true })

    // Fetch all stories to find which genres are actually used
    const { data: stories } = await supabase
      .from('stories')
      .select('genre, genre_secondary, genre_third')

    // Count which genres have at least one story
    const usedGenres = new Set<string>()
    if (stories) {
      for (const s of stories) {
        if (s.genre) usedGenres.add(s.genre)
        if (s.genre_secondary) usedGenres.add(s.genre_secondary)
        if (s.genre_third) usedGenres.add(s.genre_third)
      }
    }

    // Build genre options: only genres that exist in genres table AND have stories
    const options: GenreOption[] = []
    if (genreRows) {
      for (const g of genreRows) {
        if (usedGenres.has(g.name)) {
          options.push({
            value: g.name,
            label: g.name,
            shortLabel: makeShortLabel(g.name),
            emoji: GENRE_EMOJIS[g.name] || '📂',
          })
        }
      }
    }

    // Also add any used genres not in the genres table (legacy data)
    for (const name of Array.from(usedGenres)) {
      if (!options.find(o => o.value === name)) {
        options.push({
          value: name,
          label: name,
          shortLabel: makeShortLabel(name),
          emoji: GENRE_EMOJIS[name] || '📂',
        })
      }
    }

    setAllGenres(options)

    // Set first 3 genres as default visible
    const defaultVisible = options.slice(0, 3).map(g => g.value)
    setVisibleGenres(defaultVisible)
    setLoaded(true)
  }

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

  const getGenre = (value: string) => allGenres.find(g => g.value === value)

  const handleVisibleGenreClick = (genreValue: string) => {
    setSelectedGenre(genreValue)
  }

  const handleMoreSelect = (genreValue: string) => {
    if (selectedGenre === 'All Categories') {
      const newVisible = [genreValue, visibleGenres[1], visibleGenres[2]]
      setVisibleGenres(newVisible)
    } else {
      const currentIndex = visibleGenres.indexOf(selectedGenre)
      if (currentIndex !== -1) {
        const newVisible = [...visibleGenres]
        newVisible[currentIndex] = genreValue
        setVisibleGenres(newVisible)
      } else {
        const newVisible = [genreValue, visibleGenres[1], visibleGenres[2]]
        setVisibleGenres(newVisible)
      }
    }
    setSelectedGenre(genreValue)
    setShowMoreMenu(false)
  }

  const moreGenres = allGenres.filter(
    g => !visibleGenres.includes(g.value)
  )

  return (
    <div style={{ position: 'sticky', top: '60px', zIndex: 40, padding: '0 1rem' }}>
      <div style={{ backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '0.5rem' }}>
        
        {/* Row 1: Duration | Type */}
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', alignItems: 'center', justifyContent: 'center' }}>
          {DURATIONS.map(d => (
            <button
              key={d.value}
              onClick={() => setSelectedDuration(d.value)}
              style={btnStyle(selectedDuration === d.value)}
            >
              {d.label}
            </button>
          ))}
          <span style={{ color: '#475569', padding: '0 2px' }}>|</span>
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

        {/* Row 2: Genre + More */}
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={() => handleVisibleGenreClick('All Categories')}
            style={btnStyle(selectedGenre === 'All Categories')}
          >
            All
          </button>
          {loaded && visibleGenres.map(genreValue => {
            const genre = getGenre(genreValue)
            if (!genre) return null
            return (
              <button
                key={genre.value}
                onClick={() => handleVisibleGenreClick(genre.value)}
                style={btnStyle(selectedGenre === genre.value)}
              >
                {genre.emoji}{genre.shortLabel}
              </button>
            )
          })}
          {loaded && moreGenres.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                style={btnStyle(false)}
              >
                More ▼
              </button>
              {showMoreMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px',
                  zIndex: 100,
                  minWidth: '140px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
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
                        color: '#111',
                        fontSize: '14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '4px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {genre.emoji} {genre.label}
                    </button>
                  ))}
                  {groups.length > 0 && (
                    <>
                      <div style={{ borderTop: '1px solid #cbd5e1', margin: '6px 0' }} />
                      <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, padding: '2px 12px 4px', letterSpacing: '0.05em' }}>COLLECTIONS</div>
                      {groups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => { setSelectedGroup(selectedGroup === group.name ? '' : group.name); setShowMoreMenu(false) }}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 12px',
                            backgroundColor: selectedGroup === group.name ? '#e2e8f0' : 'transparent',
                            border: 'none',
                            color: selectedGroup === group.name ? '#f97316' : '#111',
                            fontSize: '14px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontWeight: selectedGroup === group.name ? 600 : 400,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedGroup === group.name ? '#e2e8f0' : 'transparent'}
                        >
                          📦 {group.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
