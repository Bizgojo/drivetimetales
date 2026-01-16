/*
================================================================================
DTT HOME PAGE - ASSEMBLY FILE
================================================================================
Location: /app/home/page.tsx
Created: January 16, 2026

PURPOSE:
This page assembles the protected modules and handles data fetching.
It passes props to modules that need them and renders standalone modules directly.

MODULES USED:
- WelcomeCredits (props: displayName, userCredits)
- NewsBriefings (props: newsEpisodes, userState, playingCategory, onPlayNews)
- ContinueListening (standalone - uses useAuth)
- NewReleases (standalone - fetches own data)
- BottomStickyButtons (standalone)

DO NOT MODIFY THE PROTECTED MODULES - only this assembly file.
================================================================================
*/

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Import protected modules EXACTLY as they are
import { WelcomeCredits } from '@/components/WelcomeCredits'
import { NewsBriefings } from '@/components/NewsBriefings'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import BottomStickyButtons from '@/components/BottomStickyButtons'

// =============================================================================
// TYPES
// =============================================================================

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

// =============================================================================
// STATE NAME MAPPING (for converting abbreviations)
// =============================================================================

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

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function HomePage() {
  const router = useRouter()

  // Auth state
  const [authChecked, setAuthChecked] = useState(false)
  
  // User data for WelcomeCredits
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('State')

  // News data for NewsBriefings
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [playingCategory, setPlayingCategory] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // =============================================================================
  // AUTH CHECK & DATA LOADING
  // =============================================================================

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          router.push('/signin')
          return
        }

        // Load user profile for WelcomeCredits
        const { data: profile } = await supabase
          .from('users')
          .select('first_name, display_name, credits, state')
          .eq('id', session.user.id)
          .single()
        
        if (profile) {
          const name = profile.first_name 
            || profile.display_name?.split(' ')[0] 
            || session.user.email?.split('@')[0] 
            || 'friend'
          setDisplayName(name)
          setUserCredits(profile.credits || 0)
          
          // Convert state abbreviation to full name if needed
          if (profile.state) {
            if (profile.state.length === 2) {
              setUserState(STATE_NAMES[profile.state.toUpperCase()] || profile.state)
            } else {
              setUserState(profile.state)
            }
          }
        }

        // Load news episodes for NewsBriefings
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
        console.error('[HomePage] Init error:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    
    init()
  }, [router])

  // =============================================================================
  // NEWS PLAYBACK HANDLER (for NewsBriefings)
  // =============================================================================

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

    // Toggle play/pause
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

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  // =============================================================================
  // RENDER - Assemble protected modules
  // =============================================================================

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950">
        <div className="w-10"></div>
        <div className="flex items-center gap-1">
          <span className="text-xl">🚗</span>
          <span className="font-bold text-white text-sm">
            Drive Time <span className="text-orange-400">Tales</span>
          </span>
        </div>
        <div className="w-10 flex justify-end">
          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-xs">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="px-4 pb-20">
        
        {/* WelcomeCredits - pass props */}
        <WelcomeCredits displayName={displayName} userCredits={userCredits} />
        
        {/* NewsBriefings - pass props */}
        <NewsBriefings 
          newsEpisodes={newsEpisodes}
          userState={userState}
          playingCategory={playingCategory}
          onPlayNews={handlePlayNews}
        />
        
        {/* ContinueListening - standalone */}
        <ContinueListening />
        
        {/* NewReleases - standalone */}
        <NewReleases />
        
      </main>
      
      {/* BottomStickyButtons - standalone */}
      <BottomStickyButtons />
      
    </div>
  )
}
