'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import W3NewReleases from '@/components/W3NewReleases'
import W4PopularSeries from '@/components/W4PopularSeries'
import WelcomeHeader from '@/components/WelcomeHeader'
import InstallAppBanner from '@/components/InstallAppBanner'

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const partner = searchParams.get('partner')
  const ref = searchParams.get('ref')
  const [freeCredits, setFreeCredits] = useState(2)

  useEffect(() => {
    async function initialize() {
      const authTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 3000)
      )
      try {
        const authPromise = supabase.auth.getSession()
        const { data: { session } } = await Promise.race([authPromise, authTimeout]) as any
        if (session) { router.push('/home'); return }
      } catch (authErr) {
        console.log('[DTT Debug] Auth check skipped:', authErr)
      }
      const storedCredits = localStorage.getItem('dtt_free_credits')
      if (storedCredits !== null) {
        setFreeCredits(parseInt(storedCredits, 10))
      } else {
        localStorage.setItem('dtt_free_credits', '2')
        setFreeCredits(2)
      }
    }
    initialize()
  }, [router])

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto', padding: '1.5rem 1rem', paddingBottom: '6rem' }}>
        {ref && (
          <div style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '1rem', padding: '1rem', textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎁</div>
            <div style={{ color: 'white', fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>You've been given 2 Weeks Free!</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>A friend shared their Endless Tales link with you. Subscribe to claim your free 14 days.</div>
          </div>
        )}
        {partner && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '0.75rem', padding: '0.75rem 1rem', textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#22c55e' }}>
            Welcome from {partner.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — enjoy your free stories!
          </div>
        )}
        <WelcomeHeader credits={freeCredits} />
        <W3NewReleases credits={freeCredits} />
        <W4PopularSeries credits={freeCredits} />
      </main>

      {/* W5: BottomStickyButtons */}
      <div className="bg-slate-950 border-t border-slate-800" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '0.75rem 1rem', zIndex: 50 }}>
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
          <Link href="/library" className="hover:bg-orange-400 font-semibold rounded-xl transition" style={{ flex: 1, padding: '0.625rem', textAlign: 'center', backgroundColor: '#f97316', color: 'white', fontSize: '1.125rem' }}>
            See More Stories<br />Go To Library
          </Link>
          <Link href="/signup" className="hover:bg-green-400 font-semibold rounded-xl transition" style={{ flex: 1, padding: '0.625rem', textAlign: 'center', backgroundColor: '#22c55e', color: 'black', fontSize: '1.125rem' }}>
            Subscribe<br />or buy credits
          </Link>
        </div>
      </div>

      {/* Install banner — slides up after 2 seconds */}
      <InstallAppBanner />
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  )
}
