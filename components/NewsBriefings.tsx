/*
================================================================================
🔒 PROTECTED MODULE 05 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 05_NewsBriefings
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 05_NewsBriefings.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

DESCRIPTION:
News Briefings section with 6 categories using color wheel colors (60° apart)

COLOR WHEEL ORDER:
- State: Red (0°) - from-red-600 to-red-800
- National: Orange (60°) - from-orange-500 to-orange-700
- World: Yellow (120°) - from-yellow-500 to-yellow-700
- Business: Green (180°) - from-green-600 to-green-800
- Sports: Blue (240°) - from-blue-600 to-blue-800
- Sci/Tech: Purple (300°) - from-purple-600 to-purple-800

LAYOUT:
- Icon: TOP LEFT corner
- Status Flag: TOP RIGHT corner
- Label: Centered below (uses state abbreviation + "News" for state category)

STATUS FLAGS:
- New: bg-amber-400 text-black
- Playing: bg-emerald-400 text-black
- Paused: bg-sky-400 text-black
- Played: bg-rose-400 text-black

BEHAVIOR:
- New + Press → Playing
- Playing + Press → Paused
- Paused + Press → Resumes, Playing
- Played + Press → Starts from beginning, Playing
- Audio ends → Played

CHANGE LOG:
- 2026-01-16: Initial version (wrong colors, dots instead of flags)
- 2026-01-17: Corrected to color wheel, added status flags, icon top-left, abbreviations

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
  userState: string  // State abbreviation (e.g., "SC")
}

// =============================================================================
// NEWS CATEGORIES - COLOR WHEEL (60° apart) - DO NOT CHANGE
// =============================================================================

const NEWS_CATEGORIES = [
  { id: 'state', name: 'News', icon: '🏛️', color: 'from-red-600 to-red-800' },        // Red (0°)
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700' }, // Orange (60°)
  { id: 'international', name: 'World', icon: '🌍', color: 'from-yellow-500 to-yellow-700' }, // Yellow (120°)
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-600 to-green-800' },    // Green (180°)
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-600 to-blue-800' },          // Blue (240°)
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },   // Purple (300°)
]

// =============================================================================
// STATUS BADGE STYLES - DO NOT CHANGE
// =============================================================================

const STATUS_STYLES: Record<BriefingStatus, string> = {
  new: 'bg-amber-400 text-black',
  playing: 'bg-emerald-400 text-black',
  paused: 'bg-sky-400 text-black',
  played: 'bg-rose-400 text-black',
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

  // Handle play/pause toggle
  const handlePlayBriefing = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    if (!episode?.audio_url) return

    // Pause any other playing audio
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId && !audio.paused) {
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [id]: 'paused' }))
      }
    })

    // Create audio element if needed
    if (!audioRefs.current[categoryId]) {
      audioRefs.current[categoryId] = new Audio(episode.audio_url)
      audioRefs.current[categoryId].onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
      }
    }

    const audio = audioRefs.current[categoryId]
    const currentStatus = briefingStatus[categoryId] || 'new'

    if (currentStatus === 'playing') {
      // Currently playing -> pause
      audio.pause()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
    } else {
      // Not playing -> play/resume
      if (currentStatus === 'played') {
        audio.currentTime = 0
      }
      audio.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  return (
    <section className="px-4">
      <h2 className="text-lg font-bold text-white mb-1">📰 NEWS BRIEFINGS</h2>
      <p className="text-white text-xs mb-4">Top stories updated throughout the day</p>
      <div className="grid grid-cols-3 gap-3">
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const hasEpisode = !!episode?.audio_url
          const status: BriefingStatus = briefingStatus[cat.id] || 'new'
          
          // For state category, show "SC News" format
          const displayName = cat.id === 'state' 
            ? `${userState || 'State'} ${cat.name}` 
            : cat.name

          return (
            <button
              key={cat.id}
              onClick={() => hasEpisode && handlePlayBriefing(cat.id)}
              disabled={!hasEpisode}
              className={`relative p-3 rounded-xl text-center transition-all ${
                hasEpisode 
                  ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` 
                  : 'bg-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              {/* Icon TOP LEFT */}
              <span className="absolute top-2 left-2 text-lg">{cat.icon}</span>
              
              {/* Status Flag TOP RIGHT */}
              {hasEpisode && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${STATUS_STYLES[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              )}
              
              {/* Label centered below */}
              <div className="text-white text-sm font-semibold mt-6">{displayName}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Export categories for use elsewhere
export { NEWS_CATEGORIES }
