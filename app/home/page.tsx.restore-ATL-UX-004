'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import HomeHeader from '@/components/HomeHeader'
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'
import InstallAppBanner from '@/components/InstallAppBanner'
import YourPlaylist from '@/components/YourPlaylist'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'
import { buildSeriesPlaybackTarget } from '@/lib/seriesPlayback'

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
  const router = useRouter()
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
          .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, description, review_count')
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
          if (item.type === 'series') {
            return (
              <SeriesCard
                key={`series-${item.group.id}`}
                id={item.group.id}
                series_name={item.group.series_name}
                genre={item.group.genre}
                author={item.group.author}
                episode_count={item.group.episode_count}
                total_duration_mins={item.group.total_duration_mins}
                cover_url={item.group.cover_url}
                description={item.group.description}
                episodes={item.group.episodes}
                play_episode_id={item.group.play_episode_id}
                resume_seconds={item.group.resume_seconds}
                is_in_progress={item.group.is_in_progress}
              />
            )
          }

          return (
            <div key={item.story.id} onClick={() => router.push(`/player/${item.story.id}?autoplay=1&playNow=1`)} style={{ cursor: 'pointer' }}>
              <HorizontalStoryCard
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
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HomeContent() {
  const { loading, user } = useAuth()
  const searchParams = useSearchParams()
  const [continueIds, setContinueIds] = useState<string[]>([])
  const [playlistIds, setPlaylistIds] = useState<string[]>([])
  const [allExcludeIds, setAllExcludeIds] = useState<string[]>([])
  // Gate: do not render RecommendedForYou until NewReleases has reported its IDs.
  // This prevents RecommendedForYou loading with partial/empty excludeIds and briefly
  // showing duplicate cards that are already visible in New Arrivals.
  const [newArrivalsReady, setNewArrivalsReady] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [homeSearch, setHomeSearch] = useState('')

  useEffect(() => {
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true)
      const t = setTimeout(() => setShowWelcome(false), 6000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

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

  if (loading && !authWaitExpired) return <HomeSkeleton />

  const firstName = (user as any)?.user_metadata?.first_name || ''

  return (
    <div className="min-h-screen bg-slate-950">
      <HomeHeader />
      <main className="pb-20">
        <div style={{ padding: '1rem 1rem 0' }}>
          <label htmlFor="home-story-search" style={{ display: 'block', color: 'white', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Search stories
          </label>
          <input
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
        </div>
        {showWelcome && (
          <div style={{ margin: '1rem', padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ color: '#f97316', fontWeight: 800, fontSize: '15px', marginBottom: '2px' }}>
                🎉 Welcome{firstName ? `, ${firstName}` : ''}!
              </div>
              <div style={{ color: 'white', fontSize: '13px' }}>
                Your 14-day free trial has started. Pick a story and press play.
              </div>
            </div>
            <button onClick={() => setShowWelcome(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        )}
        {homeSearch.trim() ? (
          <HomeSearchResults query={homeSearch} />
        ) : (
          <>
            <ContinueListening onIdsLoaded={(ids) => { setContinueIds(ids); setAllExcludeIds([...new Set([...ids, ...playlistIds])]) }} />
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
