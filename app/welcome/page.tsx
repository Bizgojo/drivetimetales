/*
================================================================================
🔒 WELCOME PAGE - Drive Time Tales
================================================================================
Location: app/welcome/page.tsx
Updated: January 18, 2026

MODULES:
- W1: WelcomeHeader (animated vehicles, credits, secret code)
- W2: NewsBriefings (horizontal button layout)
- W3: NewReleases (TODO - 1-2 credits only)
- W4: RecommendedForYou (TODO - 1-2 credits only)
- W5: BottomStickyButtons ([Go To Library] + [Subscribe])
================================================================================
*/

'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WelcomeHeader from '@/components/WelcomeHeader'
import { W2NewsBriefings } from '@/components/W2NewsBriefings'
import W3NewReleases from '@/components/W3NewReleases'
import W4RecommendedForYou from '@/components/W4RecommendedForYou'

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
// MAIN CONTENT COMPONENT
// =============================================================================

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Free credits for non-logged-in users (stored in localStorage)
  const [freeCredits, setFreeCredits] = useState(2)
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})

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
  // RENDER
  // =============================================================================
  
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      <main style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto', padding: '1.5rem 1rem', paddingBottom: '6rem' }}>

        {/* W1: WelcomeHeader */}
        <WelcomeHeader credits={freeCredits} />

        {/* W2: NewsBriefings */}
        <W2NewsBriefings newsEpisodes={newsEpisodes} credits={freeCredits} />

        {/* W3: NewReleases */}
        <W3NewReleases credits={freeCredits} />

        {/* W4: RecommendedForYou */}
        <W4RecommendedForYou credits={freeCredits} />

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
              padding: '1.25rem',
              textAlign: 'center',
              backgroundColor: '#f97316',
              color: 'white',
              fontSize: '1.125rem'
            }}
          >
            See More Stories
          </Link>
          <Link
            href="/subscribe"
            className="hover:bg-green-400 font-semibold rounded-xl transition"
            style={{
              flex: 1,
              padding: '1.25rem',
              textAlign: 'center',
              backgroundColor: '#22c55e',
              color: 'black',
              fontSize: '1.125rem'
            }}
          >
            Subscribe
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
