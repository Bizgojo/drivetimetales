'use client'

import { Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'

function HomeSkeleton() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617' }}>
      <div style={{ height: '60px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }} />
      <div style={{ padding: '1.5rem 1rem' }}>
        <div style={{ height: '20px', width: '140px', backgroundColor: '#1e293b', borderRadius: '6px', marginBottom: '1rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
          {[1, 2].map(i => (
            <div key={i} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
              <div style={{ aspectRatio: '1/1', backgroundColor: '#334155', borderRadius: '8px', marginBottom: '0.5rem' }} />
              <div style={{ height: '12px', backgroundColor: '#334155', borderRadius: '4px', marginBottom: '6px' }} />
              <div style={{ height: '10px', width: '60%', backgroundColor: '#334155', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
        <div style={{ height: '20px', width: '180px', backgroundColor: '#1e293b', borderRadius: '6px', marginBottom: '1rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: '#334155', borderRadius: '8px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: '12px', backgroundColor: '#334155', borderRadius: '4px', marginBottom: '6px' }} />
                <div style={{ height: '10px', width: '70%', backgroundColor: '#334155', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HomeContent() {
  const { loading } = useAuth()
  if (loading) return <HomeSkeleton />
  return (
    <div className="min-h-screen bg-slate-950">
      <StickyHeaderFull />
      <main className="pb-20">
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
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}
