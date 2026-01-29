/*
================================================================================
🔒 PROTECTED MODULE W2 - NEWS BRIEFINGS (WELCOME PAGE)
================================================================================
Module: W2_NewsBriefings
Location: ~/DriveTimeFiles/WorkingCodeLibrary/01_WelcomePage/
File: W2_NewsBriefings.protected.tsx

Created: January 18, 2026
Updated: January 18, 2026 - Added state selection dropdown, no-credits handling
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
News Briefings section for Welcome page with horizontal button layout.

SCENARIOS:
1. User has 1+ credits: Plays the actual news briefing
2. User has 0 credits: Plays "no credits" message from narrator
3. State News first click: Shows dropdown to select state, then plays

FEATURES:
- First click on State News shows state dropdown
- Selected state saved to localStorage
- State abbreviation becomes label (e.g., "TN News")
- No-credits handling plays narrator message

LAYOUT:
- Wider horizontal buttons (not square)
- Icon on LEFT side of button
- Category name to RIGHT of icon
- Status badge (New/Playing/Paused/Played) in top right corner
- 3-column grid

COLOR WHEEL ORDER:
- State: Red (0°) - #dc2626 to #991b1b
- National: Orange (60°) - #f97316 to #c2410c
- World: Yellow (120°) - #eab308 to #a16207
- Business: Green (180°) - #16a34a to #166534
- Sports: Blue (240°) - #2563eb to #1e40af
- Sci/Tech: Purple (300°) - #9333ea to #6b21a8

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
================================================================================
*/

'use client'

import { useState, useRef, useEffect } from 'react'

// =============================================================================
// TYPES
// =============================================================================

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

interface W2NewsBriefingsProps {
  newsEpisodes: Record<string, NewsEpisode>
  credits: number
}

// =============================================================================
// US STATES
// =============================================================================

const US_STATES = [
  { abbrev: 'AL', name: 'Alabama' },
  { abbrev: 'AK', name: 'Alaska' },
  { abbrev: 'AZ', name: 'Arizona' },
  { abbrev: 'AR', name: 'Arkansas' },
  { abbrev: 'CA', name: 'California' },
  { abbrev: 'CO', name: 'Colorado' },
  { abbrev: 'CT', name: 'Connecticut' },
  { abbrev: 'DE', name: 'Delaware' },
  { abbrev: 'FL', name: 'Florida' },
  { abbrev: 'GA', name: 'Georgia' },
  { abbrev: 'HI', name: 'Hawaii' },
  { abbrev: 'ID', name: 'Idaho' },
  { abbrev: 'IL', name: 'Illinois' },
  { abbrev: 'IN', name: 'Indiana' },
  { abbrev: 'IA', name: 'Iowa' },
  { abbrev: 'KS', name: 'Kansas' },
  { abbrev: 'KY', name: 'Kentucky' },
  { abbrev: 'LA', name: 'Louisiana' },
  { abbrev: 'ME', name: 'Maine' },
  { abbrev: 'MD', name: 'Maryland' },
  { abbrev: 'MA', name: 'Massachusetts' },
  { abbrev: 'MI', name: 'Michigan' },
  { abbrev: 'MN', name: 'Minnesota' },
  { abbrev: 'MS', name: 'Mississippi' },
  { abbrev: 'MO', name: 'Missouri' },
  { abbrev: 'MT', name: 'Montana' },
  { abbrev: 'NE', name: 'Nebraska' },
  { abbrev: 'NV', name: 'Nevada' },
  { abbrev: 'NH', name: 'New Hampshire' },
  { abbrev: 'NJ', name: 'New Jersey' },
  { abbrev: 'NM', name: 'New Mexico' },
  { abbrev: 'NY', name: 'New York' },
  { abbrev: 'NC', name: 'North Carolina' },
  { abbrev: 'ND', name: 'North Dakota' },
  { abbrev: 'OH', name: 'Ohio' },
  { abbrev: 'OK', name: 'Oklahoma' },
  { abbrev: 'OR', name: 'Oregon' },
  { abbrev: 'PA', name: 'Pennsylvania' },
  { abbrev: 'RI', name: 'Rhode Island' },
  { abbrev: 'SC', name: 'South Carolina' },
  { abbrev: 'SD', name: 'South Dakota' },
  { abbrev: 'TN', name: 'Tennessee' },
  { abbrev: 'TX', name: 'Texas' },
  { abbrev: 'UT', name: 'Utah' },
  { abbrev: 'VT', name: 'Vermont' },
  { abbrev: 'VA', name: 'Virginia' },
  { abbrev: 'WA', name: 'Washington' },
  { abbrev: 'WV', name: 'West Virginia' },
  { abbrev: 'WI', name: 'Wisconsin' },
  { abbrev: 'WY', name: 'Wyoming' },
  { abbrev: 'DC', name: 'Washington D.C.' },
]

// =============================================================================
// NEWS CATEGORIES - COLOR WHEEL (60° apart) - DO NOT CHANGE
// =============================================================================

const NEWS_CATEGORIES = [
  { id: 'state', name: 'News', icon: '🏛️', gradient: 'linear-gradient(to bottom right, #dc2626, #991b1b)' },
  { id: 'national', name: 'National', icon: '🇺🇸', gradient: 'linear-gradient(to bottom right, #f97316, #c2410c)' },
  { id: 'international', name: 'World', icon: '🌍', gradient: 'linear-gradient(to bottom right, #eab308, #a16207)' },
  { id: 'business', name: 'Business', icon: '💼', gradient: 'linear-gradient(to bottom right, #16a34a, #166534)' },
  { id: 'sports', name: 'Sports', icon: '⚽', gradient: 'linear-gradient(to bottom right, #2563eb, #1e40af)' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', gradient: 'linear-gradient(to bottom right, #9333ea, #6b21a8)' },
]

// =============================================================================
// STATUS BADGE STYLES
// =============================================================================

const STATUS_STYLES: Record<BriefingStatus, { backgroundColor: string; color: string }> = {
  new: { backgroundColor: '#f87171', color: 'white' },
  playing: { backgroundColor: '#34d399', color: 'black' },
  paused: { backgroundColor: '#38bdf8', color: 'black' },
  played: { backgroundColor: '#a78bfa', color: 'black' },
}

const STATUS_LABELS: Record<BriefingStatus, string> = {
  new: 'New',
  playing: 'Playing',
  paused: 'Paused',
  played: 'Played',
}

// =============================================================================
// COMPONENT
// =============================================================================

export function W2NewsBriefings({ newsEpisodes, credits }: W2NewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [noCreditsPlaying, setNoCreditsPlaying] = useState(false)
  const [showStateDropdown, setShowStateDropdown] = useState(false)
  const [pendingState, setPendingState] = useState<string | null>(null)
  const [selectedState, setSelectedState] = useState<string>('')
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})
  const noCreditsAudioRef = useRef<HTMLAudioElement | null>(null)

  // Load saved state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('dtt_user_state')
    if (savedState) {
      setSelectedState(savedState)
    }
  }, [])

  // Handle state selection
  const handleStateSelect = (stateAbbrev: string) => {
    setPendingState(stateAbbrev)
    setShowStateDropdown(false)
  }

  const confirmStateSelection = () => {
    if (!pendingState) return
    setSelectedState(pendingState)
    localStorage.setItem('dtt_user_state', pendingState)
    setPendingState(null)
    setTimeout(() => {
      handlePlayBriefing('state')
    }, 100)
  }

  const cancelStateSelection = () => {
    setPendingState(null)
  }

  const handleStateSelectOLD = (stateAbbrev: string) => {
    setSelectedState(stateAbbrev)
    localStorage.setItem('dtt_user_state', stateAbbrev)
    setShowStateDropdown(false)
    
    // Auto-play state news after selection
    setTimeout(() => {
      handlePlayBriefing('state')
    }, 100)
  }

  // Handle playing the "no credits" message
  const playNoCreditsMessage = async (categoryId: string) => {
    Object.values(audioRefs.current).forEach(audio => {
      if (!audio.paused) audio.pause()
    })
    
    if (noCreditsAudioRef.current && !noCreditsAudioRef.current.paused) {
      noCreditsAudioRef.current.pause()
      setNoCreditsPlaying(false)
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
      return
    }

    try {
      const response = await fetch(`/api/news/no-credits-audio?category=${categoryId}`)
      
      if (!response.ok) {
        console.error('Failed to fetch no-credits audio')
        return
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      noCreditsAudioRef.current = new Audio(audioUrl)
      noCreditsAudioRef.current.onended = () => {
        setNoCreditsPlaying(false)
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
        URL.revokeObjectURL(audioUrl)
      }
      
      noCreditsAudioRef.current.play()
      setNoCreditsPlaying(true)
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      
    } catch (err) {
      console.error('Error playing no-credits message:', err)
    }
  }

  const handlePlayBriefing = (categoryId: string) => {
    // Special handling for state news - show dropdown if no state selected
    if (categoryId === 'state' && !selectedState) {
      setShowStateDropdown(true)
      return
    }

    const episode = newsEpisodes[categoryId]
    
    // If user has no credits, play the "no credits" message instead
    if (credits <= 0) {
      playNoCreditsMessage(categoryId)
      return
    }

    if (!episode?.audio_url) return

    // Pause any other playing audio
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId && !audio.paused) {
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [id]: 'paused' }))
      }
    })

    // Stop no-credits audio if playing
    if (noCreditsAudioRef.current && !noCreditsAudioRef.current.paused) {
      noCreditsAudioRef.current.pause()
      setNoCreditsPlaying(false)
    }

    if (!audioRefs.current[categoryId]) {
      audioRefs.current[categoryId] = new Audio(episode.audio_url)
      audioRefs.current[categoryId].onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
      }
    }

    const audio = audioRefs.current[categoryId]
    const currentStatus = briefingStatus[categoryId] || 'new'

    if (currentStatus === 'playing') {
      audio.pause()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
    } else {
      if (currentStatus === 'played') {
        audio.currentTime = 0
      }
      audio.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', marginTop: '1.5rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>📰 NEWS BRIEFINGS</h2>
      <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Top stories updated throughout the day</p>
      
      {/* State Selection Dropdown */}
      {showStateDropdown && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '20rem',
            width: '90%',
            maxHeight: '70vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 className="text-white font-bold" style={{ fontSize: '1.125rem', marginBottom: '0.5rem', textAlign: 'center' }}>
              Select Your State
            </h3>
            <p className="text-slate-400" style={{ fontSize: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              Choose your state to hear local news
            </p>
            <div style={{ 
              overflowY: 'auto', 
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '0.5rem'
            }}>
              {US_STATES.map((state) => (
                <button
                  key={state.abbrev}
                  onClick={() => handleStateSelect(state.abbrev)}
                  className="hover:bg-slate-600 transition rounded-lg"
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>{state.abbrev}</span> - {state.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowStateDropdown(false)}
              className="text-slate-400 hover:text-white transition"
              style={{ marginTop: '1rem', fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* State Selection Confirmation Popup */}
      {pendingState && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '320px',
            width: '90%',
            textAlign: 'center'
          }}>
            <p style={{ color: 'white', fontSize: '1.25rem', marginBottom: '1rem' }}>
              Play <strong>{pendingState}</strong> News?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={cancelStateSelection}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#475569',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStateSelection}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#22c55e',
                  color: 'black',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}
              >
                Play Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3-column grid with horizontal buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const hasEpisode = !!episode?.audio_url
          const status: BriefingStatus = briefingStatus[cat.id] || 'new'
          
          const isClickable = hasEpisode || credits <= 0 || cat.id === 'state'
          
          // For state news, show "XX News" if state selected, otherwise "State News"
          let displayName = cat.name
          if (cat.id === 'state') {
            displayName = selectedState ? `${selectedState} News` : 'State News'
          }

          return (
            <button
              key={cat.id}
              onClick={() => isClickable && handlePlayBriefing(cat.id)}
              disabled={!isClickable}
              className="rounded-xl transition-all hover:scale-105"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                paddingRight: '2.5rem',
                background: hasEpisode ? cat.gradient : '#1e293b',
                opacity: isClickable ? 1 : 0.5,
                cursor: isClickable ? 'pointer' : 'not-allowed',
                border: 'none',
                minHeight: '3rem'
              }}
            >
              {/* Icon on LEFT */}
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>
                {cat.icon}
              </span>
              
              {/* Category name to RIGHT of icon */}
              <span 
                className="text-white font-semibold"
                style={{ fontSize: '0.8rem', textAlign: 'left', lineHeight: '1.2' }}
              >
                {displayName}
              </span>
              
              {/* Status Badge TOP RIGHT */}
              {(hasEpisode || credits <= 0) && (
                <span style={{
                  position: 'absolute',
                  top: '-0.25rem',
                  right: '-0.25rem',
                  fontSize: '9px',
                  paddingLeft: '0.375rem',
                  paddingRight: '0.375rem',
                  paddingTop: '0.125rem',
                  paddingBottom: '0.125rem',
                  borderRadius: '9999px',
                  fontWeight: 'bold',
                  backgroundColor: STATUS_STYLES[status].backgroundColor,
                  color: STATUS_STYLES[status].color
                }}>
                  {STATUS_LABELS[status]}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export { NEWS_CATEGORIES }
