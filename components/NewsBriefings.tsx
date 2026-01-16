/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: NewsBriefings
Location: /components/NewsBriefings.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
News Briefings section with 6 categories in specific order and colors.
Order: State (red) → National (blue) → World (green) → Business (yellow) → Sports (orange) → Sci/Tech (purple)

FEATURES:
- Green dot = audio available
- Red dot = no audio yet
- Pulsing green dot = currently playing
- State category shows user's registered state name
- News Briefings are FREE (no credit check)
================================================================================
*/

'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// PROTECTED: NEWS CATEGORIES - FIXED ORDER AND COLORS - DO NOT CHANGE
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-blue-600 to-blue-800' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-green-600 to-green-800' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-yellow-600 to-yellow-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-600 to-orange-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

// State abbreviation to full name mapping
const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

export default function NewsBriefings() {
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [userState, setUserState] = useState('State')
  const [playingCategory, setPlayingCategory] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load user's state and news episodes
  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        // Load user state
        if (session?.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('state')
            .eq('id', session.user.id)
            .single()
          
          if (profile?.state) {
            if (profile.state.length === 2) {
              setUserState(STATE_NAMES[profile.state.toUpperCase()] || profile.state)
            } else {
              setUserState(profile.state)
            }
          }
        }

        // Load news episodes
        const { data: episodes } = await supabase
          .from('news_episodes')
          .select('id, category, audio_url, is_live')
          .eq('is_live', true)
        
        if (episodes) {
          const episodeMap: Record<string, NewsEpisode> = {}
          episodes.forEach(ep => { episodeMap[ep.category] = ep })
          setNewsEpisodes(episodeMap)
        }
      } catch (err) {
        console.error('[NewsBriefings] Error:', err)
      }
    }
    
    loadData()
  }, [])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePlayNews = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    if (!episode?.audio_url) return

    // Stop current audio if different category
    if (playingCategory && playingCategory !== categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }

    // Toggle play/pause for same category
    if (playingCategory === categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingCategory(null)
      return
    }

    // Play new category
    audioRef.current = new Audio(episode.audio_url)
    audioRef.current.onended = () => {
      setPlayingCategory(null)
      audioRef.current = null
    }
    audioRef.current.play()
    setPlayingCategory(categoryId)
  }

  return (
    <section className="px-4 pb-6">
      <h2 className="text-lg font-bold text-white mb-4">📰 News Briefings</h2>
      <p className="text-white text-sm mb-3">News Briefings are Free!</p>
      <div className="grid grid-cols-3 gap-3">
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const isAvailable = episode?.audio_url
          const isPlaying = playingCategory === cat.id
          const displayCatName = cat.id === 'state' ? userState : cat.name

          return (
            <button
              key={cat.id}
              onClick={() => isAvailable && handlePlayNews(cat.id)}
              disabled={!isAvailable}
              className={`relative p-4 rounded-xl text-center transition-all ${
                isAvailable 
                  ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` 
                  : 'bg-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-2xl mb-1">{cat.icon}</div>
              <div className="text-white text-xs font-medium">{displayCatName}</div>
              {/* Status indicator */}
              <div className="absolute top-2 right-2">
                {isPlaying ? (
                  <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse inline-block"></span>
                ) : isAvailable ? (
                  <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
                ) : (
                  <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
