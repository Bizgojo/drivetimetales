'use client'

import StickyLogo1 from '@/components/StickyLogo1'
import { WelcomeCredits } from '@/components/WelcomeCredits'
import { NewsBriefings } from '@/components/NewsBriefings'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

export default function HomePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('')
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})

  useEffect(() => {
    async function fetchUserData() {
      if (!user) return
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('first_name, credits, state')
          .eq('id', user.id)
          .single()
        if (profile) {
          setDisplayName(profile.first_name || user.email?.split('@')[0] || 'friend')
          setUserCredits(profile.credits || 0)
          setUserState(profile.state || '')
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
          .select('id, category, audio_url, is_live')
          .eq('is_live', true)

        if (error) {
          console.error('Error fetching news episodes:', error)
          return
        }

        if (data) {
          const episodesByCategory: Record<string, NewsEpisode> = {}
          data.forEach(ep => {
            episodesByCategory[ep.category] = ep
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
      <StickyLogo1 userName={displayName} />
      <main className="pb-24">
        <WelcomeCredits displayName={displayName} userCredits={userCredits} />
        <NewsBriefings newsEpisodes={newsEpisodes} userState={userState} />
        <p className="text-white text-lg px-4 pt-6">Modules 02 + 04 + 05 loaded successfully.</p>
      </main>
    </div>
  )
}
