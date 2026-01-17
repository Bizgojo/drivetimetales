/*
================================================================================
🔒 PROTECTED MODULE 05 - PRODUCTION SAFE VERSION
================================================================================
Module: 05_NewsBriefings
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 05_NewsBriefings.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026 - Added inline styles for Tailwind purge protection
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

DESCRIPTION:
News Briefings section with 6 categories using color wheel colors (60° apart)

PRODUCTION FIX:
Critical layout and positioning properties use inline styles to prevent Tailwind CSS purging.

COLOR WHEEL ORDER:
- State: Red (0°) - #dc2626 to #991b1b
- National: Orange (60°) - #f97316 to #c2410c
- World: Yellow (120°) - #eab308 to #a16207
- Business: Green (180°) - #16a34a to #166534
- Sports: Blue (240°) - #2563eb to #1e40af
- Sci/Tech: Purple (300°) - #9333ea to #6b21a8

================================================================================
*/

'use client'

import { useState, useRef } from 'react'

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

interface NewsBriefingsProps {
  newsEpisodes: Record<string, NewsEpisode>
  userState: string
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
// STATUS BADGE STYLES - DO NOT CHANGE
// =============================================================================

const STATUS_STYLES: Record<BriefingStatus, { backgroundColor: string; color: string }> = {
  new: { backgroundColor: '#fbbf24', color: 'black' },
  playing: { backgroundColor: '#34d399', color: 'black' },
  paused: { backgroundColor: '#38bdf8', color: 'black' },
  played: { backgroundColor: '#fb7185', color: 'black' },
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

export function NewsBriefings({ newsEpisodes, userState }: NewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  const handlePlayBriefing = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    if (!episode?.audio_url) return

    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId && !audio.paused) {
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [id]: 'paused' }))
      }
    })

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
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>📰 NEWS BRIEFINGS</h2>
      <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Top stories updated throughout the day</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const hasEpisode = !!episode?.audio_url
          const status: BriefingStatus = briefingStatus[cat.id] || 'new'
          
          const displayName = cat.id === 'state' 
            ? `${userState || 'State'} ${cat.name}` 
            : cat.name

          return (
            <button
              key={cat.id}
              onClick={() => hasEpisode && handlePlayBriefing(cat.id)}
              disabled={!hasEpisode}
              className="rounded-xl transition-all hover:scale-105"
              style={{
                position: 'relative',
                padding: '0.75rem',
                textAlign: 'center',
                background: hasEpisode ? cat.gradient : '#1e293b',
                opacity: hasEpisode ? 1 : 0.5,
                cursor: hasEpisode ? 'pointer' : 'not-allowed',
                border: 'none',
                minHeight: '5rem'
              }}
            >
              {/* Icon TOP LEFT */}
              <span style={{ 
                position: 'absolute', 
                top: '0.5rem', 
                left: '0.5rem', 
                fontSize: '1.125rem' 
              }}>
                {cat.icon}
              </span>
              
              {/* Status Flag TOP RIGHT */}
              {hasEpisode && (
                <span style={{
                  position: 'absolute',
                  top: '0.375rem',
                  right: '0.375rem',
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
              
              {/* Label centered below */}
              <div 
                className="text-white font-semibold"
                style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}
              >
                {displayName}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export { NEWS_CATEGORIES }
