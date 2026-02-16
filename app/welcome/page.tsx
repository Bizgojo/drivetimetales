/*
================================================================================
🔑 WELCOME PAGE - Drive Time Tales
Location: app/welcome/page.tsx
Updated: February 15, 2026

MODULES:
- W1: WelcomeHeader (animated vehicles, credits, secret code)
- W3: NewReleases (latest 2 stories)
- W4: PopularSeries (series with 15-20 min episodes to hook new users)
- W5: BottomStickyButtons ([Go To Library] + [Subscribe])
================================================================================
*/

'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import W3NewReleases from '@/components/W3NewReleases'
import W4PopularSeries from '@/components/W4PopularSeries'
import WelcomeHeader from '@/components/WelcomeHeader'

// =============================================================================
// MAIN CONTENT COMPONENT
// =============================================================================

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const partner = searchParams.get('partner')

  // Free credits for non-logged-in users (stored in localStorage)
  const [freeCredits, setFreeCredits] = useState(2)

  // =============================================================================
  // INITIALIZE: Check auth, load free credits
  // =============================================================================

  useEffect(() => {
    async function initialize() {
      // Check if user is logged in - redirect to home if so
      const authTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 3000)
      )

      try {
        const authPromise = supabase.auth.getSession()
        const { data: { session } } = await Promise.race([authPromise, authTimeout]) as any

        if (session) {
          console.log('[DTT Debug] User logged in, redirecting to /home')
          router.push('/home')
          return
        }
      } catch (authErr) {
        console.log('[DTT Debug] Auth check skipped (timeout or error):', authErr)
      }

      // Load free credits from localStorage
      const storedCredits = localStorage.getItem('dtt_free_credits')
      if (storedCredits !== null) {
        setFreeCredits(parseInt(storedCredits, 10))
      } else {
        // First visit - set 2 free credits
        localStorage.setItem('dtt_free_credits', '2')
        setFreeCredits(2)
      }
    }

    initialize()
  }, [router])

  // =============================================================================
  // RENDER
  // =============================================================================
  
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      <main style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto', padding: '1.5rem 1rem', paddingBottom: '6rem' }}>

        {/* Partner welcome banner */}
        {partner && (
          <div style={{
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '0.75rem',
            padding: '0.75rem 1rem',
            textAlign: 'center',
            marginBottom: '0.5rem',
            fontSize: '0.9rem',
            color: '#22c55e'
          }}>
            Welcome from {partner.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — enjoy your free stories!
          </div>
        )}

        {/* W1: WelcomeHeader */}
        <WelcomeHeader credits={freeCredits} />

        {/* W3: NewReleases */}
        <W3NewReleases credits={freeCredits} />

        {/* W4: PopularSeries (replaces RecommendedForYou) */}
        <W4PopularSeries credits={freeCredits} />

      </main>

      {/* W5: BottomStickyButtons */}
      <div
        className="bg-slate-950 border-t border-slate-800"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.75rem 1rem',
          zIndex: 50
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
          <Link
            href="/library"
            className="hover:bg-orange-400 font-semibold rounded-xl transition"
            style={{
              flex: 1,
              padding: '0.625rem',
              textAlign: 'center',
              backgroundColor: '#f97316',
              color: 'white',
              fontSize: '1.125rem'
            }}
          >
            See More Stories<br />Go To Library
          </Link>
          <Link
            href="/signup"
            className="hover:bg-green-400 font-semibold rounded-xl transition"
            style={{
              flex: 1,
              padding: '0.625rem',
              textAlign: 'center',
              backgroundColor: '#22c55e',
              color: 'black',
              fontSize: '1.125rem'
            }}
          >
            Subscribe<br />or buy credits
          </Link>
        </div>
      </div>

    </div>
  )
}

// =============================================================================
// PAGE EXPORT WITH SUSPENSE
// =============================================================================

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
