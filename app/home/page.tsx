'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'
import InstallAppBanner from '@/components/InstallAppBanner'
import ContinueSampleHero from '@/components/ContinueSampleHero'
import YourPlaylist from '@/components/YourPlaylist'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import { buildSeriesPlaybackTarget } from '@/lib/seriesPlayback'
import { trackClientEvent } from '@/lib/tracking/client'
import { startTrialEventId, randomEventId } from '@/lib/tracking/events'

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
  }
}

type SearchStory = {
  id: string
  title: string
  genre: string
  author: string | null
  duration_mins: number
  cover_url: string | null
  series_id: string | null
  series_name: string | null
  series_number?: number | null
  description?: string | null
  avg_rating?: number | null
  review_count?: number | null
}

type SearchLibraryRow = {
  story_id: string
  progress: number | null
  completed: boolean | null
  not_for_me?: boolean | null
  last_played?: string | null
}

type SearchItem =
  | { type: 'single'; story: SearchStory }
  | {
      type: 'series'
      group: {
        id: string
        series_name: string
        genre: string
        author: string | null
        episode_count: number
        total_duration_mins: number
        cover_url: string | null
        description: string | null
        episodes: Array<{ id: string; episode_number: number }>
        play_episode_id?: string | null
        resume_seconds?: number
        is_in_progress?: boolean
      }
    }

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

function HomeSearchResults({ query }: { query: string }) {
  const { user } = useAuth()
  const [items, setItems] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      setItems([])
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data: publicRows, error: publicError } = await supabase
          .from('stories')
          .select('id')
          .eq('status', 'published')
          .eq('is_hidden', false)

        if (publicError) throw publicError
        const publicIds = (publicRows || []).map((row) => row.id)
        if (publicIds.length === 0) {
          if (!cancelled) setItems([])
          return
        }

        const { data, error } = await supabase
          .from('story_analytics')
          .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, description, avg_rating, review_count')
          .not('cover_url', 'is', null)
          .eq('is_hidden', false)
          .in('id', publicIds)
          .limit(200)

        if (error) throw error

        const rows = (data || []) as SearchStory[]
        const matchedRows = rows.filter((story) => {
          const haystack = [
            story.title,
            story.author,
            story.series_name,
          ].filter(Boolean).join(' ').toLowerCase()
          return haystack.includes(normalizedQuery)
        })

        let userLibraryRows: SearchLibraryRow[] = []
        if (user?.id) {
          const { data: lib } = await supabase
            .from('user_library')
            .select('story_id, progress, completed, not_for_me, last_played')
            .eq('user_id', user.id)
          userLibraryRows = (lib || []) as SearchLibraryRow[]
        }

        const seriesMap = new Map<string, SearchStory[]>()
        const singles: SearchStory[] = []
        matchedRows.forEach((story) => {
          if (story.series_id) {
            const group = seriesMap.get(story.series_id) || []
            group.push(story)
            seriesMap.set(story.series_id, group)
          } else {
            singles.push(story)
          }
        })

        const searchItems: SearchItem[] = [
          ...singles.map((story) => ({ type: 'single' as const, story })),
          ...Array.from(seriesMap.entries()).map(([seriesId, seriesRows]) => {
            const sorted = seriesRows.slice().sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
            const first = sorted[0]
            const episodes = sorted.map((story, index) => ({ id: story.id, episode_number: story.series_number || index + 1 }))
            const target = buildSeriesPlaybackTarget(
              episodes,
              userLibraryRows.filter((row) => episodes.some((episode) => episode.id === row.story_id))
            )
            return {
              type: 'series' as const,
              group: {
                id: seriesId,
                series_name: first.series_name || first.title,
                genre: first.genre,
                author: first.author,
                episode_count: sorted.length,
                total_duration_mins: sorted.reduce((sum, story) => sum + (story.duration_mins || 0), 0),
                cover_url: sorted.find((story) => story.cover_url)?.cover_url || null,
                description: first.description || null,
                episodes: target.playlist,
                play_episode_id: target.episodeId,
                resume_seconds: target.resumeSeconds,
                is_in_progress: target.isInProgress,
              },
            }
          }),
        ]

        searchItems.sort((a, b) => {
          const aName = a.type === 'series' ? a.group.series_name : a.story.title
          const bName = b.type === 'series' ? b.group.series_name : b.story.title
          return aName.localeCompare(bName)
        })

        if (!cancelled) setItems(searchItems.slice(0, 20))
      } catch (err) {
        console.error('[HomeSearch] failed:', err)
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [query, user?.id])

  if (!query.trim()) return null

  return (
    <section style={{ padding: '1rem 1rem 0.5rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>SEARCH RESULTS</h2>
      {loading && (
        <div style={{ color: 'white', fontSize: '13px', padding: '0.75rem 0' }}>Searching…</div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ color: 'white', fontSize: '13px', padding: '0.75rem 0' }}>No stories found.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((item) => {
          // ORION-CARD-CANON-001 (Marc walk fix 4, 2026-07-12): canonical HSC
          // card for BOTH series groups and singles — one design per list.
          if (item.type === 'series') {
            return (
              <HorizontalStoryCard
                key={`series-${item.group.id}`}
                id={item.group.play_episode_id || item.group.episodes[0]?.id || item.group.id}
                title={item.group.series_name}
                genre={item.group.genre}
                author={item.group.author || 'Endless Tales'}
                duration_mins={item.group.total_duration_mins}
                cover_url={item.group.cover_url}
                description={item.group.description}
                series_name={item.group.series_name}
                series_total={item.group.episode_count}
                progress_percent={item.group.is_in_progress ? Math.min(99, Math.max(1, Math.round(((item.group.resume_seconds || 0) / Math.max(1, item.group.total_duration_mins * 60)) * 100))) : undefined}
              />
            )
          }

          return (
            <HorizontalStoryCard
              key={item.story.id}
              id={item.story.id}
              title={item.story.title}
              genre={item.story.genre}
              author={item.story.author || 'Endless Tales'}
              duration_mins={item.story.duration_mins}
              cover_url={item.story.cover_url}
              description={item.story.description}
              avg_rating={item.story.avg_rating}
              review_count={item.story.review_count || undefined}
            />
          )
        })}
      </div>
    </section>
  )
}

// ─── Belle Welcome Audio Card ────────────────────────────────────────────────
// BELLE-WELCOME-001 (Marc, 2026-08-11)
// Seg 2 is fixed/cached; Seg 1 URL comes from user_metadata.welcome_seg1_url
// (pre-rendered at signup by invite-signup route). Falls back to /api/name-audio.
const SEG2_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/welcome/belle-welcome-seg2-v2.mp3'

function AnimatedBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '24px' }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: '4px',
            borderRadius: '2px',
            background: '#f97316',
            animation: `belle-bar 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
            height: `${[14, 22, 18, 10][i]}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes belle-bar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.0); }
        }
      `}</style>
    </div>
  )
}

interface WelcomeAudioCardProps {
  seg1Url: string | null
  firstName: string
  onDismiss: () => void
}

function WelcomeAudioCard({ seg1Url, firstName, onDismiss }: WelcomeAudioCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [activeSeg, setActiveSeg] = useState<1 | 2>(1)

  // Cleanup helper
  const detachAudio = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.onended = null
    audioRef.current.onplay = null
    audioRef.current.onpause = null
  }, [])

  // Play Seg 2 after Seg 1 ends
  const playSeg2 = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    setActiveSeg(2)
    el.src = SEG2_URL
    el.onended = () => {
      setIsPlaying(false)
      onDismiss()
    }
    el.play().catch(() => setIsPlaying(false))
  }, [onDismiss])

  // Attempt to play Seg 1 (or Seg 2 if no Seg 1 URL)
  const startPlayback = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    setAutoplayBlocked(false)
    setIsPlaying(true)

    if (seg1Url) {
      setActiveSeg(1)
      el.src = seg1Url
      el.onended = playSeg2
      el.play().catch(() => {
        setIsPlaying(false)
        setAutoplayBlocked(true)
      })
    } else {
      // No Seg 1 — skip straight to Seg 2
      playSeg2()
    }
  }, [seg1Url, playSeg2])

  // Auto-attempt on mount
  useEffect(() => {
    const el = new Audio()
    audioRef.current = el

    // Preload both segments
    if (seg1Url) el.src = seg1Url
    else el.src = SEG2_URL

    el.onplay = () => setIsPlaying(true)
    el.onpause = () => setIsPlaying(false)

    if (seg1Url) {
      setActiveSeg(1)
      el.onended = playSeg2
    } else {
      setActiveSeg(2)
      el.onended = () => { setIsPlaying(false); onDismiss() }
    }

    const playPromise = el.play()
    if (playPromise !== undefined) {
      playPromise.catch((err: DOMException) => {
        if (err.name === 'NotAllowedError') {
          setAutoplayBlocked(true)
          setIsPlaying(false)
        }
      })
    }

    return () => { detachAudio() }
  }, []) // intentionally run once on mount only

  const label = autoplayBlocked
    ? 'Tap to hear your welcome'
    : isPlaying
      ? (activeSeg === 1 ? 'Welcome message' : 'Welcome message')
      : 'Welcome message'

  return (
    <div
      style={{
        width: '100%',
        background: '#111827',
        border: '1px solid rgba(148,163,184,0.28)',
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: isPlaying && !autoplayBlocked ? 'default' : 'pointer',
      }}
      onClick={autoplayBlocked || !isPlaying ? startPlayback : undefined}
      role={autoplayBlocked || !isPlaying ? 'button' : undefined}
      tabIndex={autoplayBlocked || !isPlaying ? 0 : undefined}
      aria-label={autoplayBlocked || !isPlaying ? label : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && (autoplayBlocked || !isPlaying)) startPlayback()
      }}
    >
      {/* Speaker icon */}
      <span style={{ fontSize: '20px', flexShrink: 0 }}>🔊</span>

      {/* Label */}
      <span style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 500, flex: 1 }}>
        {label}
      </span>

      {/* Visual state: bars when playing, play button when not */}
      {isPlaying && !autoplayBlocked ? (
        <AnimatedBars />
      ) : (
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '14px',
            paddingLeft: '2px',
            flexShrink: 0,
          }}
          aria-hidden
        >
          ▶
        </div>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

function HomeContent() {
  const { loading, user } = useAuth()
  const searchParams = useSearchParams()
  const [continueIds, setContinueIds] = useState<string[]>([])
  // WALK-BUG-0713 #5: catalog story id the ContinueSampleHero is showing —
  // the Continue Listening list excludes it (no same-story double-stack).
  const [heroStoryId, setHeroStoryId] = useState<string | null>(null)
  const [playlistIds, setPlaylistIds] = useState<string[]>([])
  const [allExcludeIds, setAllExcludeIds] = useState<string[]>([])
  // Gate: do not render RecommendedForYou until NewReleases has reported its IDs.
  // This prevents RecommendedForYou loading with partial/empty excludeIds and briefly
  // showing duplicate cards that are already visible in New Arrivals.
  const [newArrivalsReady, setNewArrivalsReady] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [seg1Url, setSeg1Url] = useState<string | null>(null)
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [homeSearch, setHomeSearch] = useState('')

  // Key to force ContinueListening remount after updating user_library from /listen handoff
  const [clKey, setClKey] = useState(0)

  useEffect(() => {
    // ATL-PIXEL-001 (walk finding, 2026-07-13): StartTrial keys on the ?cs=
    // param — Stripe's success redirect is the ONLY thing that appends
    // cs={CHECKOUT_SESSION_ID} (see /api/checkout success_url). The live ad
    // funnel goes signup→/subscribe→checkout with returnTo='/home', which
    // lands WITHOUT welcome=true — gating on welcome would silently drop the
    // primary optimization event for exactly the users ads care about.
    // PRIMARY optimization event. The Stripe webhook fires the server twin
    // with the SAME event_id (st_<cs>) → platforms dedup to one event.
    // localStorage guard remains as a refresh/revisit belt-and-braces.
    const cs = searchParams.get('cs')
    const welcome = searchParams.get('welcome') === 'true'
    if ((cs || welcome) && user?.id) {
      const eventKey = `et_meta_start_trial_${user.id}`
      if (!localStorage.getItem(eventKey)) {
        trackClientEvent('StartTrial', {
          content_name: 'Endless Tales Trial',
          value: 0,
          currency: 'USD',
        }, cs ? startTrialEventId(cs) : randomEventId('st'))
        localStorage.setItem(eventKey, String(Date.now()))
      }
    }
    if (welcome && !user?.user_metadata?.welcome_dismissed) {
      setShowWelcome(true)
      // Strip ?welcome=true from URL immediately on mount so back-nav can't re-trigger the banner
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams, user?.id])

  // BELLE-WELCOME-001 / BELLE-SEG1-READER-001: Resolve Seg 1 URL when welcome is active.
  // Priority:
  //   1. user_metadata.welcome_seg1_url — fast path (set at signup when JWT was fresh).
  //   2. BELLE-SEG1-READER-001: HEAD the "names" bucket using PR-121 naming:
  //      welcome-seg1-{normalizedName}.mp3  (normalizedName = firstName.trim().toLowerCase().replace(/[^a-z-]/g, ''))
  //      Fires when the JWT was stale at landing but the file was still written by invite-signup.
  //   3. GET /api/name-audio?name=firstName — on-demand ElevenLabs render (2–4 s), last resort.
  //   4. null → WelcomeAudioCard plays Seg 2 only (graceful degradation).
  useEffect(() => {
    if (!showWelcome || !user) return
    const firstName = (user as any)?.user_metadata?.first_name || ''

    // Fast path: pre-rendered URL already present in session JWT
    const preRendered: string | undefined = (user as any)?.user_metadata?.welcome_seg1_url
    if (preRendered) {
      setSeg1Url(preRendered)
      return
    }

    // No name — skip Seg 1, WelcomeAudioCard will play Seg 2 only
    if (!firstName) {
      setSeg1Url(null)
      return
    }

    // BELLE-SEG1-READER-001: bucket lookup + API fallback (async, non-blocking)
    let cancelled = false
    ;(async () => {
      // Step 1: HEAD the "names" bucket using PR-121 naming convention.
      // This resolves within ~200 ms for a cache hit and does not trigger ElevenLabs.
      const normalizedName = firstName.trim().toLowerCase().replace(/[^a-z-]/g, '')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (supabaseUrl) {
        const bucketUrl = `${supabaseUrl}/storage/v1/object/public/names/welcome-seg1-${normalizedName}.mp3`
        try {
          const headCtrl = new AbortController()
          const headTimeout = setTimeout(() => headCtrl.abort(), 1500)
          const headRes = await fetch(bucketUrl, { method: 'HEAD', signal: headCtrl.signal })
          clearTimeout(headTimeout)
          if (!cancelled && headRes.ok) {
            setSeg1Url(bucketUrl)
            return
          }
        } catch {
          // HEAD timed out or network error — fall through to API fallback
        }
      }

      if (cancelled) return

      // Step 2: /api/name-audio — on-demand render (2–4 s, triggers ElevenLabs)
      try {
        const apiCtrl = new AbortController()
        const apiTimeout = setTimeout(() => apiCtrl.abort(), 2000)
        const r = await fetch(`/api/name-audio?name=${encodeURIComponent(firstName)}`, { signal: apiCtrl.signal })
        clearTimeout(apiTimeout)
        const json = await r.json()
        if (!cancelled && json?.audio_url) setSeg1Url(json.audio_url)
      } catch {
        // timeout or network error — WelcomeAudioCard plays Seg 2 only
      }
    })()

    return () => { cancelled = true }
  }, [showWelcome, user?.id])

  // On mount with authenticated user: read gvl_nowplaying from sessionStorage (written by
  // /listen's handleGoToApp), update user_library to the real Ep4 position, then force
  // ContinueListening to remount so it queries fresh and picks up the Cass record.
  // The signup API already seeded progress=61; this updates to the accurate currentTime.
  useEffect(() => {
    if (!user?.id) return
    try {
      const raw = sessionStorage.getItem('gvl_nowplaying')
      if (!raw) return
      sessionStorage.removeItem('gvl_nowplaying')
      const payload = JSON.parse(raw)
      const storyId = payload?.storyId
      const currentTime = Number(payload?.currentTime) || 0
      if (!storyId) return
      void fetch('/api/user/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, progress: currentTime }),
      }).catch(() => {})
      // Force ContinueListening remount so it re-queries and picks up the seeded record
      setClKey(k => k + 1)
    } catch {}
  }, [user?.id])

  useEffect(() => {
    if (!loading) {
      setAuthWaitExpired(false)
      return
    }

    const timer = window.setTimeout(() => {
      console.warn('[Home] Auth loading timed out; rendering home without user-specific state')
      setAuthWaitExpired(true)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [loading])

  // HOOKS RULE: searchInputRef must be before the early return so hook order
  // is identical on every render (loading=true and loading=false both call it)
  const searchInputRef = useRef<HTMLInputElement>(null)

  if (loading && !authWaitExpired) return <HomeSkeleton />

  const firstName = (user as any)?.user_metadata?.first_name || ''

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="pb-20">
        <div style={{ padding: '1rem 1rem 0' }}>
          {showWelcome ? (
            /* BELLE-WELCOME-001 (Marc, 2026-08-11): audio player card in the search slot.
               Auto-dismisses when both segments finish (~20.94s total).
               Tapping the ▶ button starts/resumes audio (also the autoplay fallback). */
            <WelcomeAudioCard
              seg1Url={seg1Url}
              firstName={firstName}
              onDismiss={() => {
                setShowWelcome(false)
                setTimeout(() => searchInputRef.current?.focus(), 0)
                // Persist dismissal so reload/revisit doesn't re-show the banner
                void supabase.auth.updateUser({ data: { welcome_dismissed: true } })
              }}
            />
          ) : (
            <>
              <label htmlFor="home-story-search" style={{ display: 'block', color: 'white', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Search stories
              </label>
              <input
                ref={searchInputRef}
                id="home-story-search"
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search by title or author"
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid rgba(148,163,184,0.28)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '16px',
                  padding: '12px 14px',
                  outline: 'none',
                }}
              />
            </>
          )}
        </div>
        {homeSearch.trim() ? (
          <HomeSearchResults query={homeSearch} />
        ) : (
          <>
            {/* ORION-HOME-WALK-001: /go sample continue hero LEADS the page (Marc walk, 2026-07-12). */}
            {/* WALK-BUG-0713 #5 (Marc, 2026-07-13): the hero's story must not repeat
                in the Continue Listening list below — heroStoryId feeds its exclude. */}
            <ContinueSampleHero onStoryId={(id) => { setHeroStoryId(id); setContinueIds(prev => Array.from(new Set([id, ...prev]))); setAllExcludeIds(prev => Array.from(new Set([id, ...prev]))) }} />
            {/* key=clKey forces remount after /listen progress is written to user_library */}
            <ContinueListening key={clKey} excludeStoryId={heroStoryId} onIdsLoaded={(ids) => { setContinueIds(prev => Array.from(new Set([...prev, ...ids]))); setAllExcludeIds(prev => Array.from(new Set([...prev, ...ids, ...playlistIds]))) }} />
            <YourPlaylist onIdsLoaded={(ids) => { setPlaylistIds(ids); setAllExcludeIds(prev => [...new Set([...prev, ...ids])]) }} />
            <NewReleases
              excludeIds={[...new Set([...continueIds, ...playlistIds])]}
              onIdsLoaded={(ids) => {
                setAllExcludeIds(prev => [...new Set([...prev, ...ids])])
                setNewArrivalsReady(true)
              }}
            />
            {newArrivalsReady && <RecommendedForYou excludeIds={allExcludeIds} />}
          </>
        )}
      </main>
      {/* ORION-HOME-WALK-001 fix 3: banner must never obscure the bottom nav (Marc walk, 2026-07-12). */}
      <InstallAppBanner aboveBottomNav />
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
