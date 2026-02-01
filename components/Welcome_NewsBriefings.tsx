/*
================================================================================
🔒 PROTECTED MODULE - WELCOME NEWS BRIEFINGS
================================================================================
Module: Welcome_NewsBriefings
Location: ~/Projects/drivetimetales/components/
File: Welcome_NewsBriefings.tsx

Created: January 18, 2026
Updated: February 1, 2026 - Removed state dropdown, added upsell message for State News
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
News Briefings section for WELCOME page with horizontal button layout.
State News plays upsell message (subscriber-only feature).

SCENARIOS:
1. User clicks State News: Plays upsell message encouraging subscription
2. User clicks other categories: Plays intro → news → outro via stitch API
3. User has 0 credits: Plays "no credits" message from narrator

FEATURES:
- State News is locked (plays upsell message)
- Other categories play via stitch API with generic intros/outros
- No state dropdown on Welcome page (that's a subscriber feature)

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

interface WelcomeNewsBriefingsProps {
  newsEpisodes: Record<string, {
    id: string
    category: string
    audio_url: string | null
    is_live: boolean
  }>
  credits: number
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

export function Welcome_NewsBriefings({ newsEpisodes, credits }: WelcomeNewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [currentPlaylist, setCurrentPlaylist] = useState<PlaylistItem[]>([])
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const noCreditsAudioRef = useRef<HTMLAudioElement | null>(null)

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
      console.error('[Welcome_NewsBriefings] Audio error, skipping track')
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.play().catch(err => {
      console.error('[Welcome_NewsBriefings] Play error:', err)
      setCurrentPlaylistIndex(prev => prev + 1)
    })
  }

  // =============================================================================
  // STATE NEWS UPSELL MESSAGE (subscriber-only feature)
  // =============================================================================

  const playStateUpsellMessage = () => {
    // Stop any other audio
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (activeBriefingId && activeBriefingId !== 'state') {
      setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'paused' }))
    }
    
    // Play the pre-generated Tanya voice upsell
    const audio = new Audio('https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/news-audio/welcome-clips/state-upsell-1769960343663.mp3')
    audioRef.current = audio
    
    setActiveBriefingId('state')
    setBriefingStatus(prev => ({ ...prev, state: 'playing' }))
    
    audio.onended = () => {
      setBriefingStatus(prev => ({ ...prev, state: 'played' }))
      setActiveBriefingId(null)
    }
    
    audio.onerror = () => {
      setBriefingStatus(prev => ({ ...prev, state: 'new' }))
      setActiveBriefingId(null)
    }
    
    audio.play().catch(err => {
      console.error('Error playing upsell:', err)
      setBriefingStatus(prev => ({ ...prev, state: 'new' }))
    })
  }

  // =============================================================================
  // NO CREDITS MESSAGE
  // =============================================================================

  const playNoCreditsMessage = async (categoryId: string) => {
    // Stop any other audio
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    
    if (noCreditsAudioRef.current && !noCreditsAudioRef.current.paused) {
      noCreditsAudioRef.current.pause()
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
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
        URL.revokeObjectURL(audioUrl)
      }
      
      noCreditsAudioRef.current.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      
    } catch (err) {
      console.error('Error playing no-credits message:', err)
    }
  }

  // =============================================================================
  // STITCH API PLAYBACK
  // =============================================================================

  const playBriefingWithStitch = async (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    
    if (credits <= 0) {
      playNoCreditsMessage(categoryId)
      return
    }
    
    if (!episode?.audio_url) return

    // Stop any other playing audio
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    if (activeBriefingId && activeBriefingId !== categoryId) {
      setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'paused' }))
    }

    // Set loading state
    setBriefingStatus(prev => ({ ...prev, [categoryId]: 'loading' }))
    setActiveBriefingId(categoryId)

    try {
      // Call stitch API for GENERIC clips (type=welcome, no userId)
      const response = await fetch(
        `/api/audio/stitch?type=welcome&category=${categoryId}`
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
      console.error('[Welcome_NewsBriefings] Stitch API error:', error)
      
      // Fallback: play just the news body directly (old behavior)
      const audio = new Audio(episode.audio_url)
      audioRef.current = audio
      
      audio.onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
        setActiveBriefingId(null)
      }
      
      audio.play().catch(err => {
        console.error('[Welcome_NewsBriefings] Fallback play error:', err)
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'new' }))
        setActiveBriefingId(null)
      })
      
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  // =============================================================================
  // MAIN PLAY HANDLER
  // =============================================================================

  const handlePlayBriefing = async (categoryId: string) => {
    // State news is subscriber-only on Welcome page
    if (categoryId === 'state') {
      playStateUpsellMessage()
      return
    }

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

    // Play with stitch API
    await playBriefingWithStitch(categoryId)
  }

  // =============================================================================
  // RENDER
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
          
          // State news is always clickable (plays upsell), others need episode or no credits
          const isClickable = cat.id === 'state' || hasEpisode || credits <= 0
          
          // Display name - State News always shows "State News" on Welcome page
          const displayName = cat.id === 'state' ? 'State News' : cat.name

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
                background: cat.id === 'state' ? cat.gradient : (hasEpisode ? cat.gradient : '#1e293b'),
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
              {(cat.id === 'state' || hasEpisode || credits <= 0) && (
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
