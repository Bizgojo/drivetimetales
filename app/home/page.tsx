'use client'

import { Suspense } from 'react'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'
import AddToHomeScreen from '@/components/AddToHomeScreen'

function HomeContent() {
  return (
    <div className="min-h-screen bg-slate-950">
      <StickyHeaderFull />
      <main className="pb-20">
        <AddToHomeScreen />
        <ContinueListening />
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
