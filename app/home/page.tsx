'use client'
import StickyHeaderHome from '@/components/StickyHeaderHome'

// C01 Home Page - Updated Jan 21, 2026 - Playlist priority over Continue Listening

import StickyHeaderFull from '@/components/StickyHeaderFull'
import { WelcomeCredits } from '@/components/WelcomeCredits'
import { Home_NewsBriefings } from '@/components/Home_NewsBriefings'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import YourPlaylist from '@/components/YourPlaylist'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import BottomStickyButtons from '@/components/BottomStickyButtons'

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

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
  if (!state) return ''
  if (state.length === 2) return state.toUpperCase()
  const abbrev = STATE_ABBREVIATIONS[state.toLowerCase()]
  return abbrev || state
}

export default function HomePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('')
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [hasPlaylist, setHasPlaylist] = useState(false)

  // Check for playlist in localStorage
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        setHasPlaylist(Array.isArray(parsed) && parsed.length > 0)
      } catch (e) {
        setHasPlaylist(false)
      }
    }
  }, [])

  useEffect(() => {
    async function fetchUserData() {
      if (!user) return
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('first_name, display_name, credits, state')
          .eq('id', user.id)
          .single()
        if (profile) {
          setDisplayName(profile.first_name || profile.display_name || profile.display_name || user.email?.split('@')[0] || 'friend')
          setUserCredits(profile.credits || 0)
          setUserState(getStateAbbreviation(profile.state || ''))
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUserData()
  }, [user])

  useEffect(() => {
    async function fetchNewsEpisodes() {
      try {
        const { data, error } = await supabase
          .from('news_episodes')
          .select('id, category, audio_url, is_live, created_at')
          .eq('is_live', true)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching news episodes:', error)
          return
        }

        if (data) {
          const episodesByCategory: Record<string, NewsEpisode> = {}
          data.forEach(ep => {
            if (!episodesByCategory[ep.category]) { episodesByCategory[ep.category] = ep }
          })
          setNewsEpisodes(episodesByCategory)
        }
      } catch (err) {
        console.error('Error in fetchNewsEpisodes:', err)
      }
    }
    fetchNewsEpisodes()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 w-full">
      <div className="hidden bg-amber-400 bg-emerald-400 bg-sky-400 bg-rose-400 from-red-600 to-red-800 from-orange-500 to-orange-700 from-yellow-500 to-yellow-700 from-green-600 to-green-800 from-blue-600 to-blue-800 from-purple-600 to-purple-800"></div>
      
      <StickyHeaderHome />
      <main className="pb-24">
        <WelcomeCredits displayName={displayName} userCredits={userCredits} />
        
        {/* Show Playlist OR Continue Listening, not both */}
        {hasPlaylist ? <YourPlaylist /> : <ContinueListening />}
        
        <Home_NewsBriefings newsEpisodes={newsEpisodes} credits={userCredits} userState={userState} userName={displayName} />
        <NewReleases />
        <RecommendedForYou />
      </main>
      <BottomStickyButtons />
    </div>
  )
}
