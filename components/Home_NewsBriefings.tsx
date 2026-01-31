/*
================================================================================
🔒 PROTECTED MODULE - HOME NEWS BRIEFINGS
================================================================================
Module: Home_NewsBriefings
Location: ~/Projects/drivetimetales/components/
File: Home_NewsBriefings.tsx

Created: January 29, 2026
Updated: January 31, 2026 - Added stitch API for intro/outro playback
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
News Briefings section for HOME page with horizontal button layout.
State is passed as prop from user profile (set during signup/Stripe).

SCENARIOS:
1. User has 1+ credits: Plays intro → news → outro via stitch API
2. User has 0 credits: Plays "no credits" message from narrator
3. State already set from user profile - no dropdown needed

FEATURES:
- State passed as prop (from profile.state)
- No dropdown - state already selected during signup/checkout
- State abbreviation becomes label (e.g., "TN News")
- No-credits handling plays narrator message
- Stitch API integration for personalized intros/outros

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

type BriefingStatus = 'new' | 'loading' | 'playing' | 'paused' | 'played'

interface PlaylistItem {
  type: 'intro' | 'news' | 'outro'
  url: string
}

interface HomeNewsBriefingsProps {
  newsEpisodes: Record<string, {
    id: string
    category: string
    audio_url: string | null
    is_live: boolean
  }>
  credits: number
  userState: string  // State from user profile (set during signup/Stripe)
  userId?: string    // User ID for personalized clips
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
  loading: { backgroundColor: '#fbbf24', color: 'black' },
  playing: { backgroundColor: '#34d399', color: 'black' },
  paused: { backgroundColor: '#38bdf8', color: 'black' },
  played: { backgroundColor: '#a78bfa', color: 'black' },
}

const STATUS_LABELS: Record<BriefingStatus, string> = {
  new: 'New',
  loading: '...',
  playing: 'Playing',
  paused: 'Paused',
  played: 'Played',
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Home_NewsBriefings({ newsEpisodes, credits, userState, userId }: HomeNewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [noCreditsPlaying, setNoCreditsPlaying] = useState(false)
  const [currentPlaylist, setCurrentPlaylist] = useState<PlaylistItem[]>([])
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const noCreditsAudioRef = useRef<HTMLAudioElement | null>(null)

  // State comes from props (user profile), not localStorage or dropdown
  const selectedState = userState

  // =============================================================================
  // PLAYLIST PLAYBACK - plays intro → news → outro in sequence
  // =============================================================================

  useEffect(() => {
    if (currentPlaylist.length > 0 && activeBriefingId) {
      playCurrentTrack()
    }
  }, [currentPlaylist, currentPlaylistIndex])

  const playCurrentTrack = () => {
    if (currentPlaylistIndex >= currentPlaylist.length) {
      // Playlist finished
      if (activeBriefingId) {
        setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'played' }))
      }
      setActiveBriefingId(null)
      setCurrentPlaylist([])
      setCurrentPlaylistIndex(0)
      return
    }

    const track = currentPlaylist[currentPlaylistIndex]
    
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    const audio = new Audio(track.url)
    audioRef.current = audio
    
    audio.onended = () => {
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.onerror = () => {
      console.error('[Home_NewsBriefings] Audio error, skipping track')
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.play().catch(err => {
      console.error('[Home_NewsBriefings] Play error:', err)
      setCurrentPlaylistIndex(prev => prev + 1)
    })
  }

  // =============================================================================
  // NO CREDITS MESSAGE
  // =============================================================================

  const playNoCreditsMessage = async (categoryId: string) => {
    // Stop any playlist audio
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
    }
    
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

  // =============================================================================
  // MAIN PLAY HANDLER - calls stitch API
  // =============================================================================

  const handlePlayBriefing = async (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    
    // If user has no credits, play the "no credits" message instead
    if (credits <= 0) {
      playNoCreditsMessage(categoryId)
      return
    }

    if (!episode?.audio_url) return

    const currentStatus = briefingStatus[categoryId] || 'new'

    // If this briefing is currently playing, pause it
    if (currentStatus === 'playing' && activeBriefingId === categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
      return
    }

    // If this briefing is paused, resume it
    if (currentStatus === 'paused' && activeBriefingId === categoryId) {
      if (audioRef.current) {
        audioRef.current.play()
      }
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      return
    }

    // Stop any other playing audio
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (noCreditsAudioRef.current && !noCreditsAudioRef.current.paused) {
      noCreditsAudioRef.current.pause()
      setNoCreditsPlaying(false)
    }
    if (activeBriefingId && activeBriefingId !== categoryId) {
      setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'paused' }))
    }

    // Set loading state
    setBriefingStatus(prev => ({ ...prev, [categoryId]: 'loading' }))
    setActiveBriefingId(categoryId)

    try {
      // Call stitch API for personalized clips (type=user)
      const stateParam = selectedState ? `&state=${encodeURIComponent(selectedState)}` : ''
      const userParam = userId ? `&userId=${encodeURIComponent(userId)}` : ''
      const response = await fetch(
        `/api/audio/stitch?type=user&category=${categoryId}${stateParam}${userParam}`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch audio playlist')
      }
      
      const data = await response.json()
      
      if (!data.playlist || data.playlist.length === 0) {
        throw new Error('Empty playlist returned')
      }
      
      // Set playlist and start playing
      setCurrentPlaylist(data.playlist)
      setCurrentPlaylistIndex(0)
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      
    } catch (error) {
      console.error('[Home_NewsBriefings] Stitch API error:', error)
      
      // Fallback: play just the news body directly (old behavior)
      const audio = new Audio(episode.audio_url)
      audioRef.current = audio
      
      audio.onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
        setActiveBriefingId(null)
      }
      
      audio.play().catch(err => {
        console.error('[Home_NewsBriefings] Fallback play error:', err)
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'new' }))
        setActiveBriefingId(null)
      })
      
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  // =============================================================================
  // RENDER - UNCHANGED FROM ORIGINAL
  // =============================================================================

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
