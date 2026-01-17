/*
================================================================================
🔒 COMPLETED PAGE C01 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Page: C01_Completed_HomePage
Location: ~/Projects/drivetimetales/app/home/
File: page.tsx

Created: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Completed Assembly

PURPOSE:
This is the official completed Home Page for the DTT app.
It assembles all approved protected modules in the correct order.

⚠️  DO NOT MODIFY THIS PAGE WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  THIS PAGE CAN ONLY BE CHANGED IF UNDERLYING MODULES ARE CHANGED
⚠️  ALL MODULES REFERENCED ARE PROTECTED - DO NOT ALTER

================================================================================
ASSEMBLED MODULES (in order):
================================================================================
1. Module 02: StickyLogo1 (00_SharedComponents) - Updated Jan 17, 2026
   - Logo centered between left edge and avatar
   
2. Module 04: WelcomeCredits (02_HomePage) - Jan 16, 2026
   - Welcome message + credits display
   
3. Module 05: NewsBriefings (02_HomePage) - Updated Jan 17, 2026
   - 6 categories, color wheel, icon top-left, status flags top-right
   
4. Module 06: ContinueListening (02_HomePage) - Jan 16, 2026
   - Most recent uncompleted story with progress bar
   
5. Module 07: NewReleases (02_HomePage) - Updated Jan 17, 2026
   - 2 stories, 2-column grid, bg-slate-800 background
   
6. Module 08: RecommendedForYou (02_HomePage) - Updated Jan 17, 2026
   - 3 stories using HorizontalStoryCard format
   
7. Module 09: BottomStickyButtons (02_HomePage) - Jan 16, 2026
   - Library + Recommend a Friend buttons

================================================================================
*/

'use client'

// =============================================================================
// IMPORTS - Protected Modules
// =============================================================================

import StickyLogo1 from '@/components/StickyLogo1'           // Module 02
import { WelcomeCredits } from '@/components/WelcomeCredits' // Module 04
import { NewsBriefings } from '@/components/NewsBriefings'   // Module 05
import ContinueListening from '@/components/ContinueListening' // Module 06
import NewReleases from '@/components/NewReleases'           // Module 07
import RecommendedForYou from '@/components/RecommendedForYou' // Module 08
import BottomStickyButtons from '@/components/BottomStickyButtons' // Module 09

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

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
// PAGE COMPONENT
// =============================================================================

export default function HomePage() {
  const { user } = useAuth()
  
  // User data state
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('')
  
  // News briefings state
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})

  // =============================================================================
  // FETCH USER DATA
  // =============================================================================
  
  useEffect(() => {
    async function fetchUserData() {
      if (!user) return

      try {
        const { data: profile, error } = await supabase
          .from('users')
          .select('first_name, credits, state')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error fetching user profile:', error)
          return
        }

        if (profile) {
          setDisplayName(profile.first_name || user.email?.split('@')[0] || 'friend')
          setUserCredits(profile.credits || 0)
          setUserState(profile.state || '')
        }
      } catch (err) {
        console.error('Error in fetchUserData:', err)
      }
    }

    fetchUserData()
  }, [user])

  // =============================================================================
  // FETCH NEWS EPISODES
  // =============================================================================
  
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

  // =============================================================================
  // RENDER - Assembly of Protected Modules
  // =============================================================================

  return (
    <div className="min-h-screen bg-slate-950">
      
      {/* Module 02: StickyLogo1 */}
      <StickyLogo1 userName={displayName} />
      
      <main className="pb-24">
        
        {/* Module 04: WelcomeCredits */}
        <WelcomeCredits 
          displayName={displayName} 
          userCredits={userCredits} 
        />
        
        {/* Module 05: NewsBriefings */}
        <NewsBriefings 
          newsEpisodes={newsEpisodes}
          userState={userState}
        />
        
        {/* Module 06: ContinueListening */}
        <ContinueListening />
        
        {/* Module 07: NewReleases */}
        <NewReleases />
        
        {/* Module 08: RecommendedForYou */}
        <RecommendedForYou />
        
      </main>
      
      {/* Module 09: BottomStickyButtons */}
      <BottomStickyButtons />
      
    </div>
  )
}
