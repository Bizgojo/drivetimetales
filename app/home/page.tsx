'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import HomeHeader from '@/components/HomeHeader'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'
import InstallAppBanner from '@/components/InstallAppBanner'
import YourPlaylist from '@/components/YourPlaylist'

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
  const { loading, user } = useAuth()
  const searchParams = useSearchParams()
  const [continueIds, setContinueIds] = useState<string[]>([])
  const [allExcludeIds, setAllExcludeIds] = useState<string[]>([])
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true)
      const t = setTimeout(() => setShowWelcome(false), 6000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  if (loading) return <HomeSkeleton />

  const firstName = (user as any)?.user_metadata?.first_name || ''

  return (
    <div className="min-h-screen bg-slate-950">
      <HomeHeader />
      <main className="pb-20">
        {showWelcome && (
          <div style={{ margin: '1rem', padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ color: '#f97316', fontWeight: 800, fontSize: '15px', marginBottom: '2px' }}>
                🎉 Welcome{firstName ? `, ${firstName}` : ''}!
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
                Your 14-day free trial has started. Pick a story and press play.
              </div>
            </div>
            <button onClick={() => setShowWelcome(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        )}
        <ContinueListening onIdsLoaded={(ids) => { setContinueIds(ids); setAllExcludeIds(ids) }} />
        <YourPlaylist />
        <NewReleases excludeIds={continueIds} onIdsLoaded={(ids) => setAllExcludeIds(prev => [...new Set([...prev, ...ids])])} />
        <RecommendedForYou excludeIds={allExcludeIds} />
      </main>
      <InstallAppBanner />
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
