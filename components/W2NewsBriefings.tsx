'use client'

// =============================================================================
// W2NewsBriefings.tsx - News Briefings Section for Welcome Page
// =============================================================================
// BEHAVIOR:
// 1. Six news categories: State, National, World, Business, Sports, Sci-Tech
// 2. Each category plays audio when clicked
// 3. State News first click: Shows dropdown to select state, then plays
// 
// STATE NEWS FLOW:
// - First click on State News shows state dropdown
// - User picks a state → confirmation popup appears
// - Cancel → returns to state dropdown to pick again
// - Play Now → closes everything, plays the briefing
// =============================================================================

import { useState, useEffect } from 'react'

// US States list
const US_STATES = [
  { abbrev: 'AL', name: 'Alabama' }, { abbrev: 'AK', name: 'Alaska' },
  { abbrev: 'AZ', name: 'Arizona' }, { abbrev: 'AR', name: 'Arkansas' },
  { abbrev: 'CA', name: 'California' }, { abbrev: 'CO', name: 'Colorado' },
  { abbrev: 'CT', name: 'Connecticut' }, { abbrev: 'DE', name: 'Delaware' },
  { abbrev: 'FL', name: 'Florida' }, { abbrev: 'GA', name: 'Georgia' },
  { abbrev: 'HI', name: 'Hawaii' }, { abbrev: 'ID', name: 'Idaho' },
  { abbrev: 'IL', name: 'Illinois' }, { abbrev: 'IN', name: 'Indiana' },
  { abbrev: 'IA', name: 'Iowa' }, { abbrev: 'KS', name: 'Kansas' },
  { abbrev: 'KY', name: 'Kentucky' }, { abbrev: 'LA', name: 'Louisiana' },
  { abbrev: 'ME', name: 'Maine' }, { abbrev: 'MD', name: 'Maryland' },
  { abbrev: 'MA', name: 'Massachusetts' }, { abbrev: 'MI', name: 'Michigan' },
  { abbrev: 'MN', name: 'Minnesota' }, { abbrev: 'MS', name: 'Mississippi' },
  { abbrev: 'MO', name: 'Missouri' }, { abbrev: 'MT', name: 'Montana' },
  { abbrev: 'NE', name: 'Nebraska' }, { abbrev: 'NV', name: 'Nevada' },
  { abbrev: 'NH', name: 'New Hampshire' }, { abbrev: 'NJ', name: 'New Jersey' },
  { abbrev: 'NM', name: 'New Mexico' }, { abbrev: 'NY', name: 'New York' },
  { abbrev: 'NC', name: 'North Carolina' }, { abbrev: 'ND', name: 'North Dakota' },
  { abbrev: 'OH', name: 'Ohio' }, { abbrev: 'OK', name: 'Oklahoma' },
  { abbrev: 'OR', name: 'Oregon' }, { abbrev: 'PA', name: 'Pennsylvania' },
  { abbrev: 'RI', name: 'Rhode Island' }, { abbrev: 'SC', name: 'South Carolina' },
  { abbrev: 'SD', name: 'South Dakota' }, { abbrev: 'TN', name: 'Tennessee' },
  { abbrev: 'TX', name: 'Texas' }, { abbrev: 'UT', name: 'Utah' },
  { abbrev: 'VT', name: 'Vermont' }, { abbrev: 'VA', name: 'Virginia' },
  { abbrev: 'WA', name: 'Washington' }, { abbrev: 'WV', name: 'West Virginia' },
  { abbrev: 'WI', name: 'Wisconsin' }, { abbrev: 'WY', name: 'Wyoming' },
  { abbrev: 'DC', name: 'Washington DC' }
]

// News categories configuration
const NEWS_CATEGORIES = [
  { id: 'state', label: 'State', color: '#ef4444', icon: '🏛️' },
  { id: 'national', label: 'National', color: '#f97316', icon: '🇺🇸' },
  { id: 'world', label: 'World', color: '#eab308', icon: '🌍' },
  { id: 'business', label: 'Business', color: '#22c55e', icon: '💼' },
  { id: 'sports', label: 'Sports', color: '#3b82f6', icon: '⚽' },
  { id: 'scitech', label: 'Sci/Tech', color: '#8b5cf6', icon: '🔬' }
]

interface NewsEpisode {
  id: string
  title: string
  audio_url: string
  duration?: number
}

interface W2NewsBriefingsProps {
  newsEpisodes: Record<string, NewsEpisode>
  credits: number
}

export function W2NewsBriefings({ newsEpisodes, credits }: W2NewsBriefingsProps) {
  const [playingCategory, setPlayingCategory] = useState<string | null>(null)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [showStateDropdown, setShowStateDropdown] = useState(false)
  const [pendingState, setPendingState] = useState<string | null>(null)
  const [selectedState, setSelectedState] = useState<string>('')
  const [showNoCreditsMessage, setShowNoCreditsMessage] = useState(false)

  // Load saved state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('dtt_user_state')
    if (savedState) {
      setSelectedState(savedState)
    }
  }, [])

  // Handle state selection - shows confirmation popup, keeps dropdown open behind it
  const handleStateSelect = (stateAbbrev: string) => {
    setPendingState(stateAbbrev)
    // Don't close dropdown yet - user might cancel
  }

  // Confirm state selection - close everything and play
  const confirmStateSelection = () => {
    if (!pendingState) return
    setSelectedState(pendingState)
    localStorage.setItem('dtt_user_state', pendingState)
    setPendingState(null)
    setShowStateDropdown(false) // Close dropdown on confirm
    setTimeout(() => {
      handlePlayBriefing('state')
    }, 100)
  }

  // Cancel state selection - go back to state list
  const cancelStateSelection = () => {
    setPendingState(null)
    // Keep showStateDropdown = true so user can pick again
  }

  // Handle playing the "no credits" message
  const playNoCreditsMessage = () => {
    // Stop any current audio
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    
    // Create and play the no credits message
    const noCreditsAudio = new Audio('/audio/no-credits-message.mp3')
    noCreditsAudio.play().catch(console.error)
    setAudio(noCreditsAudio)
    setShowNoCreditsMessage(true)
    
    noCreditsAudio.onended = () => {
      setShowNoCreditsMessage(false)
      setAudio(null)
    }
  }

  // Handle playing a briefing
  const handlePlayBriefing = (categoryId: string) => {
    // For state news, check if we need to show dropdown
    if (categoryId === 'state' && !selectedState) {
      setShowStateDropdown(true)
      return
    }

    // Check credits - news is free, but we still track
    // For now, allow playing without credit check for news briefings
    
    const episode = newsEpisodes[categoryId]
    if (!episode?.audio_url) {
      console.log('No audio available for', categoryId)
      return
    }

    // If already playing this category, stop it
    if (playingCategory === categoryId && audio) {
      audio.pause()
      audio.currentTime = 0
      setPlayingCategory(null)
      setAudio(null)
      return
    }

    // Stop any current audio
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }

    // Play new audio
    const newAudio = new Audio(episode.audio_url)
    newAudio.play().catch(console.error)
    setAudio(newAudio)
    setPlayingCategory(categoryId)

    newAudio.onended = () => {
      setPlayingCategory(null)
      setAudio(null)
    }
  }

  // Close dropdown when clicking outside
  const handleBackdropClick = () => {
    setShowStateDropdown(false)
    setPendingState(null)
  }

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '600px', 
      margin: '0 auto',
      padding: '1rem'
    }}>
      {/* Section Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>📰</span>
        <h2 style={{ 
          color: 'white', 
          fontSize: '1.25rem', 
          fontWeight: 'bold',
          margin: 0
        }}>
          News Briefings
        </h2>
        <span style={{ 
          backgroundColor: '#22c55e', 
          color: 'black', 
          fontSize: '0.625rem', 
          fontWeight: 'bold',
          padding: '0.125rem 0.375rem',
          borderRadius: '0.25rem',
          textTransform: 'uppercase'
        }}>
          Free
        </span>
      </div>

      {/* State Dropdown Modal */}
      {showStateDropdown && (
        <div 
          onClick={handleBackdropClick}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '1rem',
              padding: '1rem',
              maxWidth: '350px',
              width: '90%',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <p style={{ 
              color: 'white', 
              fontSize: '1.125rem', 
              fontWeight: 'bold',
              marginBottom: '0.75rem',
              textAlign: 'center'
            }}>
              Select Your State
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
              onClick={handleBackdropClick}
              style={{
                marginTop: '0.75rem',
                padding: '0.5rem',
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
          </div>
        </div>
      )}

      {/* State Selection Confirmation Popup - overlays on top of state dropdown */}
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
          const isPlaying = playingCategory === cat.id

          // For state news, show "XX News" if state selected, otherwise "State News"
          let displayName = cat.label
          if (cat.id === 'state') {
            displayName = selectedState ? `${selectedState} News` : 'State News'
          }

          return (
            <button
              key={cat.id}
              onClick={() => handlePlayBriefing(cat.id)}
              disabled={!hasEpisode && cat.id !== 'state'}
              style={{
                backgroundColor: cat.color,
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 0.5rem',
                cursor: hasEpisode || cat.id === 'state' ? 'pointer' : 'not-allowed',
                opacity: hasEpisode || cat.id === 'state' ? 1 : 0.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'transform 0.1s',
                transform: isPlaying ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>
                {isPlaying ? '🔊' : cat.icon}
              </span>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: '1.2'
              }}>
                {displayName}
              </span>
            </button>
          )
        })}
      </div>

      {/* No Credits Message */}
      {showNoCreditsMessage && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#fef3c7',
          borderRadius: '0.5rem',
          textAlign: 'center'
        }}>
          <p style={{ color: '#92400e', fontSize: '0.875rem', margin: 0 }}>
            Playing message about credits...
          </p>
        </div>
      )}
    </div>
  )
}

export default W2NewsBriefings
