'use client'

import { useState, useRef } from 'react'

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

const NEWS_CATEGORIES = [
  { id: 'state', name: 'News', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-yellow-500 to-yellow-700' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-600 to-green-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-600 to-blue-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

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

// State name to abbreviation converter
const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC'
}

function getStateAbbreviation(state: string): string {
  if (!state) return 'State'
  // If already 2 letters, return as-is
  if (state.length === 2) return state.toUpperCase()
  // Look up full name
  const abbrev = STATE_ABBREVIATIONS[state.toLowerCase()]
  return abbrev || state
}

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

  const stateAbbrev = getStateAbbreviation(userState)

  return (
    <section className="px-4">
      <h2 className="text-lg font-bold text-white mb-1">📰 NEWS BRIEFINGS</h2>
      <p className="text-white text-xs mb-4">Top stories updated throughout the day</p>
      <div className="grid grid-cols-3 gap-3">
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const hasEpisode = !!episode?.audio_url
          const status: BriefingStatus = briefingStatus[cat.id] || 'new'
          
          const displayName = cat.id === 'state' 
            ? `${stateAbbrev} ${cat.name}` 
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
              <span className="absolute top-2 left-2 text-lg">{cat.icon}</span>
              
              {hasEpisode && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${STATUS_STYLES[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              )}
              
              <div className="text-white text-sm font-semibold mt-6">{displayName}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export { NEWS_CATEGORIES }
