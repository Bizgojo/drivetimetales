'use client'

import { useState, useRef } from 'react'

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

const NEWS_CATEGORIES = [
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

interface NewsBriefingsProps {
  newsEpisodes: Record<string, any>
  userState?: string
}

export function NewsBriefings({ newsEpisodes, userState }: NewsBriefingsProps) {
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  const handlePlayBriefing = (categoryId: string) => {
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId && !audio.paused) { audio.pause(); setBriefingStatus(prev => ({ ...prev, [id]: 'paused' })) }
    })
    
    if (!audioRefs.current[categoryId] && newsEpisodes[categoryId]?.audio_url) {
      const audio = new Audio(newsEpisodes[categoryId].audio_url)
      audio.addEventListener('ended', () => setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' })))
      audioRefs.current[categoryId] = audio
    }
    
    const audio = audioRefs.current[categoryId]
    if (!audio) return
    
    const currentStatus = briefingStatus[categoryId] || 'new'
    if (currentStatus === 'playing') { audio.pause(); setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' })) }
    else { if (currentStatus === 'played') audio.currentTime = 0; audio.play(); setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' })) }
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
          const displayName = cat.id === 'state' ? `${stateAbbrev} ${cat.name}` : cat.name
          return (
            <button key={cat.id} onClick={() => hasEpisode && handlePlayBriefing(cat.id)} disabled={!hasEpisode}
              style={{ position: 'relative' }}
              className={`p-3 rounded-xl text-center transition-all ${hasEpisode ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` : 'bg-slate-800 opacity-50 cursor-not-allowed'}`}>
              <span className="text-lg" style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }}>{cat.icon}</span>
              {hasEpisode && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ position: 'absolute', top: '0.375rem', right: '0.375rem', backgroundColor: status === 'new' ? '#fbbf24' : status === 'playing' ? '#34d399' : status === 'paused' ? '#38bdf8' : '#fb7185', color: '#000' }}>
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
