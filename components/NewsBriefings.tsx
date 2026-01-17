'use client'

/**
 * ============================================================================
 * PROTECTED MODULE: 05_NewsBriefings
 * Location: WorkingCodeLibrary/02_HomePage/05_NewsBriefings.protected.tsx
 * 
 * ⚠️  DO NOT MODIFY THIS FILE WITHOUT EXPLICIT PERMISSION
 * ⚠️  Changes require approval and version archival
 * ============================================================================
 * 
 * PURPOSE: News Briefings section with 6 category tiles
 * 
 * LAYOUT:
 * - 3x2 grid of news category tiles
 * - Icon: TOP LEFT corner
 * - Status Flag: TOP RIGHT corner  
 * - Label: Centered below (uses state abbreviation + "News" for state category)
 * 
 * COLOR WHEEL (gradient backgrounds):
 * - World: from-red-600 to-red-800
 * - US: from-orange-500 to-orange-700
 * - Business: from-yellow-500 to-yellow-700
 * - Sports: from-green-600 to-green-800
 * - Entertainment: from-blue-600 to-blue-800
 * - State: from-purple-600 to-purple-800
 * 
 * STATUS FLAGS:
 * - New: bg-amber-400 text-black
 * - Playing: bg-emerald-400 text-black
 * - Paused: bg-sky-400 text-black
 * - Played: bg-rose-400 text-black
 * 
 * DEPENDENCIES:
 * - Supabase client for fetching news episodes
 * - Audio playback via HTML5 audio refs
 * 
 * LAST VERIFIED: Jan 17, 2026
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// State name to abbreviation mapping
const STATE_ABBREVIATIONS: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC'
}

function getStateAbbreviation(stateName: string): string {
  if (!stateName) return 'State'
  if (stateName.length === 2) return stateName.toUpperCase()
  return STATE_ABBREVIATIONS[stateName] || stateName.substring(0, 2).toUpperCase()
}

interface NewsCategory {
  id: string
  name: string
  icon: string
  color: string
}

const NEWS_CATEGORIES: NewsCategory[] = [
  { id: 'world', name: 'World', icon: '🌍', color: 'from-red-600 to-red-800' },
  { id: 'us', name: 'US', icon: '🇺🇸', color: 'from-orange-500 to-orange-700' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-yellow-500 to-yellow-700' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-green-600 to-green-800' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: 'from-blue-600 to-blue-800' },
  { id: 'state', name: 'News', icon: '📍', color: 'from-purple-600 to-purple-800' },
]

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

const STATUS_LABELS: Record<BriefingStatus, string> = {
  new: 'New',
  playing: '▶',
  paused: '⏸',
  played: '✓',
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string
  title: string
}

interface NewsBriefingsProps {
  userState?: string
}

export default function NewsBriefings({ userState }: NewsBriefingsProps) {
  const supabase = createClientComponentClient()
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  useEffect(() => {
    const fetchNewsEpisodes = async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('news_episodes')
        .select('*')
        .eq('publish_date', today)

      if (data && !error) {
        const episodeMap: Record<string, NewsEpisode> = {}
        data.forEach((ep: NewsEpisode) => {
          episodeMap[ep.category] = ep
          if (ep.audio_url) {
            const audio = new Audio(ep.audio_url)
            audio.addEventListener('ended', () => {
              setBriefingStatus(prev => ({ ...prev, [ep.category]: 'played' }))
            })
            audioRefs.current[ep.category] = audio
          }
        })
        setNewsEpisodes(episodeMap)
      }
    }

    fetchNewsEpisodes()
    
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause()
        audio.src = ''
      })
    }
  }, [supabase])

  const handlePlayBriefing = (categoryId: string) => {
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId && !audio.paused) {
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [id]: 'paused' }))
      }
    })

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

  const stateAbbrev = getStateAbbreviation(userState || '')

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
                <span 
                  className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    backgroundColor: status === 'new' ? '#fbbf24' : status === 'playing' ? '#34d399' : status === 'paused' ? '#38bdf8' : '#fb7185',
                    color: '#000'
                  }}
                >
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
