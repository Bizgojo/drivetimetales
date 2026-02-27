'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderHome from '@/components/StickyHeaderHome'
import WelcomeCredits from '@/components/WelcomeCredits'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'

function HomeContent() {
  const { user } = useAuth()
  const [userName, setUserName] = useState('Friend')

  useEffect(() => {
    if (user) {
      setUserName('Marc')
    }
  }, [user])

  return (
    <div className="min-h-screen bg-slate-950">
      <StickyHeaderHome />
      <main className="pb-20">
        <WelcomeCredits displayName={userName} />
        <NewReleases />
        <RecommendedForYou />
      </main>
      <BottomStickyButtons />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}
