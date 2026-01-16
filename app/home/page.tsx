/*
================================================================================
DTT HOME PAGE - ASSEMBLY FILE
================================================================================
Location: /app/home/page.tsx
Created: January 16, 2026

PURPOSE:
This page simply imports and renders the 7 protected components in order.
Each component handles its own data fetching and state.

COMPONENTS (in order):
1. Header - Logo centered, avatar right, no back button
2. WelcomeCredits - Welcome message + credit balance
3. NewsBriefings - 6 news category tiles
4. ContinueListening - Resume card (only shows if uncompleted story exists)
5. NewReleases - 3 most recent stories grid
6. RecommendedForYou - 4 horizontal story cards
7. BottomStickyButtons - Library + Recommend buttons

DO NOT add business logic here - keep it as a simple assembly file.
================================================================================
*/

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Import all protected components
import Header from '@/components/Header'
import WelcomeCredits from '@/components/WelcomeCredits'
import NewsBriefings from '@/components/NewsBriefings'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function HomePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [userInitial, setUserInitial] = useState('U')

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          router.push('/signin')
          return
        }

        // Get user initial for header avatar
        const email = session.user.email || ''
        setUserInitial(email.charAt(0).toUpperCase() || 'U')
        setAuthChecked(true)
      } catch (err) {
        console.error('[HomePage] Auth error:', err)
        router.push('/signin')
      }
    }
    
    checkAuth()
  }, [router])

  // Callback when WelcomeCredits loads user data
  const handleUserLoaded = (name: string) => {
    setUserInitial(name.charAt(0).toUpperCase())
  }

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  // Render all components in order
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      
      {/* 1. Header - No back button on Home */}
      <Header showBackButton={false} userInitial={userInitial} />
      
      {/* Main content with bottom padding for sticky buttons */}
      <main className="pb-14">
        
        {/* 2. Welcome + Credits */}
        <WelcomeCredits onUserLoaded={handleUserLoaded} />
        
        {/* 3. News Briefings */}
        <NewsBriefings />
        
        {/* 4. Continue Listening (auto-hides if no uncompleted story) */}
        <ContinueListening />
        
        {/* 5. New Releases */}
        <NewReleases />
        
        {/* 6. Recommended For You */}
        <RecommendedForYou />
        
      </main>
      
      {/* 7. Bottom Sticky Buttons */}
      <BottomStickyButtons />
      
    </div>
  )
}
