/*
================================================================================
🔒 PROTECTED MODULE - HOME NEWS BRIEFINGS
================================================================================
Module: Home_NewsBriefings
Location: ~/Projects/drivetimetales/components/
File: Home_NewsBriefings.tsx

Created: January 29, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
News Briefings section for HOME page with horizontal button layout.
State is passed as prop from user profile (set during signup/Stripe).

SCENARIOS:
1. User has 1+ credits: Plays the actual news briefing
2. User has 0 credits: Plays "no credits" message from narrator
3. State already set from user profile - no dropdown needed

FEATURES:
- State passed as prop (from profile.state)
- No dropdown - state already selected during signup/checkout
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

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

interface HomeNewsBriefingsProps {
  newsEpisodes: Record<string, {
    id: string
    category: string
    audio_url: string | null
    is_live: boolean
  }>
  credits: number
  userState: string  // State from user profile (set during signup/Stripe)
}

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

export function Home_NewsBriefings({ newsEpisodes, credits, userState }: HomeNewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [noCreditsPlaying, setNoCreditsPlaying] = useState(false)
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})
  const noCreditsAudioRef = useRef<HTMLAudioElement | null>(null)

  // State comes from props (user profile), not localStorage or dropdown
  const selectedState = userState

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
    // No dropdown needed - state comes from user profile
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
