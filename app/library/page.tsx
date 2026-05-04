'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import ReviewModal from '@/components/ReviewModal'
import { buildSeriesPlaybackTarget, storeSeriesPlayback } from '@/lib/seriesPlayback'

const PLAYLIST_KEY = 'et_current_playlist'
const SAVED_PLAYLIST_KEY = 'et_saved_playlist'
const ACTIVE_PLAYLIST_KEY = 'dtt_active_playlist'

type Story = {
  id: string
  title: string
  genre: string | null
  author: string | null
  duration_mins: number | null
  cover_url: string | null
  series_id: string | null
  series_name: string | null
  series_number: number | null
  series_total: number | null
  episode_title: string | null
  description: string | null
  flag: string | null
  is_hidden: boolean
  is_free: boolean
  created_at: string
  avg_rating: number | null
  review_count: number | null
}

type LibraryRow = {
  story_id: string
  progress: number | null
  completed: boolean | null
  not_for_me: boolean | null
}

type CardItem = {
  key: string
  type: 'single' | 'series'
  story?: Story
  seriesId?: string
  seriesName?: string
  episodeCount?: number
  avgDuration?: number
  cover?: string | null
  author?: string | null
  genre?: string | null
  description?: string | null
  flag?: string | null
  avgRating?: number | null
  firstEpisodeId?: string
  playEpisodeId?: string
  resumeSeconds?: number
  seriesInProgress?: boolean
  episodePlaylist?: Array<{ id: string; episode_number: number }>
  durationForSort: number
  notForMe: boolean
}

type ReviewTarget = {
  id: string
  title: string
  genre: string
  duration_mins: number
  cover_url: string | null
}

type CanonicalGenre = {
  id: string
  name: string
  active: boolean | null
  display_order: number | null
}

const GENRE_LABELS: Record<string, string> = {
  All: 'All',
  Mystery: '🔍Myst',
  Thriller: '😱Thrill',
  Horror: '☠️Horr',
  Drama: '🎭Drama',
}

export default function LibraryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<LibraryRow[]>([])
  const [userReviewedIds, setUserReviewedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [activeGenre, setActiveGenre] = useState('All')
  const [showMoreGenres, setShowMoreGenres] = useState(false)
  const [genreSlots, setGenreSlots] = useState<string[]>([])
  const [playlist, setPlaylist] = useState<string[]>([])
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [canonicalGenres, setCanonicalGenres] = useState<CanonicalGenre[]>([])

  // Hydrate playlist from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYLIST_KEY)
      if (raw) setPlaylist(JSON.parse(raw))
    } catch {}
  }, [])

  // Persist playlist
  useEffect(() => {
    try {
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist))
    } catch {}
  }, [playlist])

  useEffect(() => {
    if (!authLoading) {
      setAuthWaitExpired(false)
      return
    }

    const timer = window.setTimeout(() => {
      console.warn('[Library] Auth loading timed out; loading public library data without user state')
      setAuthWaitExpired(true)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [authLoading])

  // Fetch stories + user data
  useEffect(() => {
    if (authLoading && !authWaitExpired) return
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setLoadError(null)

        const { data: publicRows, error: publicError } = await supabase
          .from('stories')
          .select('id')
          .eq('status', 'published')
          .eq('is_hidden', false)

        if (publicError) throw new Error(`public stories lookup failed: ${publicError.message}`)
        const publicIds = (publicRows || []).map((row) => row.id)

        let storiesData: any[] | null = []
        if (publicIds.length > 0) {
          const { data: analyticsData, error: storiesError } = await supabase
            .from('story_analytics')
            .select(
              'id, title, genre, author, duration_mins, cover_url, series_id, series_name, episode_title, description, is_hidden, series_number, series_total, flag, is_free, created_at, avg_rating, review_count'
            )
            .eq('is_hidden', false)
            .in('id', publicIds)
            .order('created_at', { ascending: false })

          if (storiesError) throw new Error(`story_analytics failed: ${storiesError.message}`)
          storiesData = analyticsData || []
        }
        if (cancelled) return
        if (storiesData) {
          const storyRows = (storiesData as Story[]).filter((story) => Boolean(story.cover_url))
          const seriesIds = Array.from(new Set(storyRows.map((story) => story.series_id).filter(Boolean))) as string[]

          if (seriesIds.length > 0) {
            const { data: episodeRows, error: episodeError } = await supabase
              .from('stories')
              .select('id,episode_number')
              .in('series_id', seriesIds)
              .eq('status', 'published')
              .eq('is_hidden', false)

            if (episodeError) {
              console.warn('[Library] series episode_number lookup failed:', episodeError.message)
            } else {
              const episodeNumberById = new Map((episodeRows || []).map((row: any) => [row.id, row.episode_number || null]))
              storyRows.forEach((story) => {
                if (!story.series_number && episodeNumberById.get(story.id)) {
                  story.series_number = episodeNumberById.get(story.id)
                }
              })
            }
          }

          setStories(storyRows)
        }

        const { data: genreData, error: genreError } = await supabase
          .from('genres')
          .select('id,name,active,display_order')
          .eq('active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true })

        if (genreError) {
          console.warn('[Library] canonical genre lookup failed:', genreError.message)
        } else if (!cancelled) {
          setCanonicalGenres((genreData || []) as CanonicalGenre[])
        }

        if (!authWaitExpired && user?.id) {
          const { data: libraryData, error: libraryError } = await supabase
            .from('user_library')
            .select('story_id, progress, completed, not_for_me')
            .eq('user_id', user.id)
          if (libraryError) throw new Error(`user_library failed: ${libraryError.message}`)
          if (!cancelled && libraryData) setUserLibrary(libraryData as LibraryRow[])

          const { data: reviewsData, error: reviewsError } = await supabase
            .from('reviews')
            .select('story_id')
            .eq('user_id', user.id)
          if (reviewsError) throw new Error(`reviews failed: ${reviewsError.message}`)
          if (!cancelled && reviewsData) {
            setUserReviewedIds(new Set(reviewsData.map((r: any) => r.story_id)))
          }
        }
      } catch (err) {
        console.error('[Library] load failed:', err)
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Library failed to load')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, authWaitExpired, user?.id])

  const libraryLookup = useMemo(() => {
    const m = new Map<string, LibraryRow>()
    userLibrary.forEach((r) => m.set(r.story_id, r))
    return m
  }, [userLibrary])

  // Build card items: standalones one each, series collapsed to one card
  const cardItems = useMemo<CardItem[]>(() => {
    const items: CardItem[] = []
    const seriesGroups = new Map<string, Story[]>()

    stories.forEach((s) => {
      if (s.series_id) {
        const arr = seriesGroups.get(s.series_id) || []
        arr.push(s)
        seriesGroups.set(s.series_id, arr)
      } else {
        const lib = libraryLookup.get(s.id)
        items.push({
          key: `single-${s.id}`,
          type: 'single',
          story: s,
          cover: s.cover_url,
          author: s.author,
          genre: s.genre,
          description: s.description,
          flag: s.flag,
          avgRating: s.avg_rating,
          durationForSort: s.duration_mins || 0,
          notForMe: !!lib?.not_for_me,
        })
      }
    })

    seriesGroups.forEach((eps, seriesId) => {
      const sorted = eps.slice().sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
      const first = sorted[0]
      const totalDuration = sorted.reduce((sum, e) => sum + (e.duration_mins || 0), 0)
      const avgDuration = sorted.length > 0 ? Math.round(totalDuration / sorted.length) : 0
      const anyEpisodeNotForMe = sorted.some((e) => !!libraryLookup.get(e.id)?.not_for_me)
      const playbackTarget = buildSeriesPlaybackTarget(
        sorted.map((episode) => ({ id: episode.id, episode_number: episode.series_number || 0 })),
        sorted
          .map((episode) => libraryLookup.get(episode.id))
          .filter(Boolean) as LibraryRow[]
      )
      items.push({
        key: `series-${seriesId}`,
        type: 'series',
        seriesId,
        seriesName: first.series_name || 'Series',
        episodeCount: first.series_total || sorted.length,
        avgDuration,
        cover: first.cover_url,
        author: first.author,
        genre: first.genre,
        description: first.description,
        flag: first.flag,
        avgRating: first.avg_rating,
        firstEpisodeId: first.id,
        playEpisodeId: playbackTarget.episodeId || first.id,
        resumeSeconds: playbackTarget.resumeSeconds,
        seriesInProgress: playbackTarget.isInProgress,
        episodePlaylist: playbackTarget.playlist,
        durationForSort: avgDuration,
        notForMe: anyEpisodeNotForMe,
      })
    })

    return items
  }, [stories, libraryLookup])

  // Filter by genre, sort short to long, push not-for-me to bottom
  const filteredItems = useMemo(() => {
    const filtered =
      activeGenre === 'All'
        ? cardItems
        : cardItems.filter((i) => (i.genre || '').toLowerCase() === activeGenre.toLowerCase())
    return filtered.slice().sort((a, b) => {
      if (a.notForMe !== b.notForMe) return a.notForMe ? 1 : -1
      return a.durationForSort - b.durationForSort
    })
  }, [cardItems, activeGenre])

  const availableGenres = useMemo(() => {
    const populated = new Set(cardItems.map((item) => (item.genre || '').toLowerCase()).filter(Boolean))
    const canonical = canonicalGenres
      .filter((genre) => genre.active !== false && populated.has(genre.name.toLowerCase()))
      .map((genre) => genre.name)

    if (canonical.length > 0) return canonical

    return Array.from(new Set(cardItems.map((item) => item.genre).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [cardItems, canonicalGenres])

  useEffect(() => {
    setGenreSlots((prev) => {
      const valid = prev.filter((genre) =>
        availableGenres.some((available) => available.toLowerCase() === genre.toLowerCase())
      )
      const next = [...valid]
      availableGenres.forEach((genre) => {
        if (next.length >= 3) return
        if (!next.some((item) => item.toLowerCase() === genre.toLowerCase())) next.push(genre)
      })
      return next.slice(0, 3)
    })
  }, [availableGenres])

  const visibleGenres = useMemo(() => ['All', ...genreSlots], [genreSlots])
  const moreGenres = useMemo(
    () => availableGenres.filter((genre) => !genreSlots.some((slot) => slot.toLowerCase() === genre.toLowerCase())),
    [availableGenres, genreSlots]
  )
  const moreMenuGenres = moreGenres.length > 0 ? moreGenres : availableGenres

  function selectMoreGenre(genre: string) {
    setGenreSlots((prev) => {
      const next = prev.slice(0, 3)
      while (next.length < 3) {
        const filler = availableGenres.find((item) => !next.some((slot) => slot.toLowerCase() === item.toLowerCase()))
        if (!filler) break
        next.push(filler)
      }

      const activeIndex =
        activeGenre !== 'All'
          ? next.findIndex((slot) => slot.toLowerCase() === activeGenre.toLowerCase())
          : -1
      const replaceIndex = activeIndex >= 0 ? activeIndex : 0
      const withoutPicked = next.filter((slot) => slot.toLowerCase() !== genre.toLowerCase())
      withoutPicked[replaceIndex] = genre
      return withoutPicked.slice(0, 3)
    })
    setActiveGenre(genre)
    setShowMoreGenres(false)
  }

  useEffect(() => {
    if (activeGenre === 'All') return
    if (availableGenres.some((genre) => genre.toLowerCase() === activeGenre.toLowerCase())) return
    setActiveGenre('All')
    setShowMoreGenres(false)
  }, [activeGenre, availableGenres])

  const validPlaylist = useMemo(() => {
    const validKeys = new Set(cardItems.map((i) => i.key))
    return playlist.filter((key) => validKeys.has(key))
  }, [playlist, cardItems])

  useEffect(() => {
    if (loading) return
    if (validPlaylist.length === playlist.length) return
    setPlaylist(validPlaylist)
  }, [loading, playlist, validPlaylist])

  // Playlist running totals
  const playlistTotalMins = useMemo(() => {
    let mins = 0
    validPlaylist.forEach((key) => {
      const item = cardItems.find((i) => i.key === key)
      if (!item) return
      if (item.type === 'single') mins += item.story?.duration_mins || 0
      else mins += (item.avgDuration || 0) * (item.episodeCount || 0)
    })
    return mins
  }, [validPlaylist, cardItems])

  function togglePlaylist(key: string) {
    setPlaylist((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))
  }

  function playSingle(storyId: string) {
    router.push(`/player/${storyId}`)
  }

  function playSeries(item: CardItem) {
    if (!item.playEpisodeId) return
    try {
      storeSeriesPlayback({
        episodeId: item.playEpisodeId,
        resumeSeconds: item.resumeSeconds || 0,
        isInProgress: !!item.seriesInProgress,
        playlist: item.episodePlaylist || [],
      })
    } catch {}
    router.push(`/player/${item.playEpisodeId}${item.resumeSeconds && item.resumeSeconds > 0 ? `?resume=${item.resumeSeconds}` : ''}`)
  }

  function openSeries(seriesId: string) {
    router.push(`/series/${seriesId}`)
  }

  function playPlaylistFromBar() {
    if (validPlaylist.length === 0) return
    const first = cardItems.find((i) => i.key === validPlaylist[0])
    if (!first) return
    const id = first.type === 'single' ? first.story?.id : first.firstEpisodeId
    if (id) router.push(`/player/${id}?playlist=1`)
  }

  function savePlaylistToHome() {
    try {
      const items = validPlaylist
        .map((key) => {
          const item = cardItems.find((i) => i.key === key)
          if (!item) return null
          if (item.type === 'single' && item.story) {
            return {
              type: 'single',
              id: item.story.id,
              title: item.story.title,
              author: item.story.author || 'Endless Tales',
              genre: item.story.genre || '',
              duration_mins: item.story.duration_mins || 0,
              cover_url: item.story.cover_url || null,
            }
          }
          if (item.type === 'series') {
            return {
              type: 'series',
              id: item.seriesId,
              series_id: item.seriesId,
              series_name: item.seriesName || 'Series',
              title: item.seriesName || 'Series',
              author: item.author || 'Endless Tales',
              genre: item.genre || '',
              duration_mins: (item.avgDuration || 0) * (item.episodeCount || 0),
              total_mins: (item.avgDuration || 0) * (item.episodeCount || 0),
              episode_count: item.episodeCount || 0,
              cover_url: item.cover || null,
              episodes: item.episodePlaylist || [],
            }
          }
          return null
        })
        .filter(Boolean)
      const savedPlaylist = {
        id: `library-${Date.now()}`,
        items,
        remaining_mins: playlistTotalMins,
        completed: 0,
      }
      localStorage.setItem(ACTIVE_PLAYLIST_KEY, JSON.stringify(savedPlaylist))
      localStorage.setItem(SAVED_PLAYLIST_KEY, JSON.stringify(validPlaylist))
      window.dispatchEvent(new Event('et_playlist_saved'))
      alert('Saved to home')
    } catch {}
  }

  function getCardState(item: CardItem) {
    const inPlaylist = validPlaylist.includes(item.key)
    let progress = 0
    let completed = false
    const isNotForMe = item.notForMe
    if (item.type === 'single' && item.story) {
      const lib = libraryLookup.get(item.story.id)
      progress = lib?.progress || 0
      completed = !!lib?.completed
    }
    const reviewed =
      item.type === 'single' && item.story ? userReviewedIds.has(item.story.id) : false
    return { inPlaylist, progress, completed, isNotForMe, reviewed }
  }

  if (loading || (authLoading && !authWaitExpired)) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
        <StickyHeaderFull />
        <div style={{ padding: '40px 16px', color: 'white', textAlign: 'center', fontSize: '14px' }}>
          Loading library…
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
        <StickyHeaderFull />
        <div style={{ padding: '40px 16px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Library failed to load</div>
          <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5 }}>{loadError}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0a',
        paddingBottom: validPlaylist.length > 0 ? '90px' : '20px',
      }}
    >
      <StickyHeaderFull />

      {/* Genre picker — established one-row treatment */}
      <div style={{ position: 'sticky', top: '60px', zIndex: 40, padding: '0 12px 12px' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'stretch', overflowX: 'auto' }}>
            {visibleGenres.map((g) => (
              <button
                key={g}
                onClick={() => {
                  setActiveGenre(g)
                  setShowMoreGenres(false)
                }}
                style={{
                  backgroundColor: activeGenre === g ? '#f97316' : '#334155',
                  color: 'white',
                  padding: '0 8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: '42px',
                  minWidth: g === 'All' ? '72px' : '58px',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {GENRE_LABELS[g] || g}
              </button>
            ))}
            {availableGenres.length > 0 && (
              <button
                onClick={() => setShowMoreGenres((show) => !show)}
                style={{
                  backgroundColor: moreGenres.includes(activeGenre) || showMoreGenres ? '#f97316' : '#2563eb',
                  color: 'white',
                  padding: '0 8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: '42px',
                  minWidth: '72px',
                  flex: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                More
              </button>
            )}
            {showMoreGenres && moreMenuGenres.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '58px',
                  right: '20px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px',
                  zIndex: 100,
                  minWidth: '120px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                {moreMenuGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      selectMoreGenre(g)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '9px 10px',
                      backgroundColor: activeGenre === g ? '#e2e8f0' : 'transparent',
                      border: 'none',
                      color: '#111827',
                      fontSize: '13px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ padding: '0 12px' }}>
        {filteredItems.length === 0 && (
          <div
            style={{
              color: '#94a3b8',
              textAlign: 'center',
              padding: '40px 16px',
              fontSize: '13px',
            }}
          >
            No stories in this genre yet.
          </div>
        )}
        {filteredItems.map((item) => {
          const state = getCardState(item)
          return (
            <StoryCard
              key={item.key}
              item={item}
              state={state}
              onPlay={() => {
                if (item.type === 'single' && item.story) playSingle(item.story.id)
                else if (item.type === 'series') playSeries(item)
              }}
              onCoverClick={() => {
                if (item.type === 'series' && item.seriesId) openSeries(item.seriesId)
                else if (item.type === 'single' && item.story) playSingle(item.story.id)
              }}
              onTogglePlaylist={() => togglePlaylist(item.key)}
              onRate={() => {
                if (item.type === 'single' && item.story) {
                  setReviewTarget({
                    id: item.story.id,
                    title: item.story.title,
                    genre: item.story.genre || 'Story',
                    duration_mins: item.story.duration_mins || 0,
                    cover_url: item.story.cover_url,
                  })
                }
              }}
            />
          )
        })}
      </div>

      {/* Playlist bar */}
      {validPlaylist.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#172b4f',
            borderTop: '1px solid rgba(147,197,253,0.8)',
            borderRadius: '14px 14px 0 0',
            padding: '9px 12px',
            boxShadow: '0 -8px 24px rgba(37,99,235,0.28), 0 -2px 12px rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 40,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: 700 }}>Your playlist</div>
            <div style={{ color: 'white', fontSize: '12px', fontWeight: 600 }}>
              {validPlaylist.length} {validPlaylist.length === 1 ? 'story' : 'stories'} ·{' '}
              {formatMinutes(playlistTotalMins)}
            </div>
          </div>
          <button
            onClick={savePlaylistToHome}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Save to home
          </button>
          <button
            onClick={playPlaylistFromBar}
            style={{
              background: '#f97316',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ▶ Play now
          </button>
        </div>
      )}

      {reviewTarget && user?.id && (
        <ReviewModal
          storyId={reviewTarget.id}
          storyTitle={reviewTarget.title}
          userId={user.id}
          genre={reviewTarget.genre}
          duration_mins={reviewTarget.duration_mins}
          coverUrl={reviewTarget.cover_url}
          onClose={() => setReviewTarget(null)}
          onSubmitted={() => {
            setUserReviewedIds((prev) => {
              const next = new Set(prev)
              next.add(reviewTarget.id)
              return next
            })
          }}
        />
      )}
    </div>
  )
}

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}hs` : `${h}hs-${m}min`
}

function StoryCard({
  item,
  state,
  onPlay,
  onCoverClick,
  onTogglePlaylist,
  onRate,
}: {
  item: CardItem
  state: {
    inPlaylist: boolean
    progress: number
    completed: boolean
    isNotForMe: boolean
    reviewed: boolean
  }
  onPlay: () => void
  onCoverClick: () => void
  onTogglePlaylist: () => void
  onRate: () => void
}) {
  const isSeries = item.type === 'series'
  const duration = isSeries
    ? `Avg. ${formatMinutes(item.avgDuration || 0)}`
    : formatMinutes(item.story?.duration_mins || 0)
  const ratingValue = Math.round(item.avgRating || 0)
  const stars = '★'.repeat(ratingValue) + '☆'.repeat(5 - ratingValue)
  const description = item.description || ''
  const truncatedDescription =
    description.length > 70 ? description.slice(0, 67) + '…' : description
  const showProgress = !isSeries && state.progress > 0 && !state.completed
  const inProgress = isSeries ? !!item.seriesInProgress : showProgress
  const showRate = state.completed && !state.reviewed
  const showPlayAgain = !isSeries && state.completed && state.reviewed
  const cardOpacity = state.isNotForMe ? 0.65 : 1

  return (
    <div
      style={{
        background: '#2b313d',
        borderRadius: '12px',
        padding: '10px',
        marginBottom: '10px',
        opacity: cardOpacity,
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        {/* Cover */}
        <div
          onClick={onCoverClick}
          style={{
            width: '108px',
            minHeight: '126px',
            borderRadius: '8px',
            backgroundColor: '#1e1b4b',
            backgroundImage: item.cover ? `url(${item.cover})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 0 12px rgba(255,255,255,0.2)',
            alignSelf: 'stretch',
            cursor: 'pointer',
          }}
        />
        {/* Copy column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {/* Row 1: type pill + special pill + duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                background: isSeries ? '#a855f7' : '#3b82f6',
                color: 'white',
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '8px',
                fontWeight: 500,
              }}
            >
              {isSeries ? `Series · ${item.episodeCount} eps` : 'Story'}
            </span>
            {item.flag && (
              <span
                style={{
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '8px',
                  fontWeight: 500,
                }}
              >
                {item.flag}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 500 }}>{duration}</span>
          </div>

          {/* Row 2: title */}
          <div style={{ color: 'white', fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>
            {isSeries ? item.seriesName : item.story?.title}
          </div>

          {/* Row 3: author/genre/stars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
            <span style={{ color: '#4ade80', fontWeight: 500 }}>{item.author || 'Unknown'}</span>
            {item.genre && <span style={{ color: '#4ade80' }}>· {item.genre}</span>}
            <div style={{ flex: 1 }} />
            {(item.avgRating || 0) > 0 && (
              <span style={{ color: '#ef4444', fontSize: '10px' }}>{stars}</span>
            )}
          </div>

          {/* Row 4-5: description (cap 70 chars) */}
          {truncatedDescription && (
            <div style={{ color: 'white', fontSize: '11px', lineHeight: 1.4 }}>
              {truncatedDescription}
            </div>
          )}

          {/* Row 6: buttons */}
          <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
            {showRate ? (
              <button
                onClick={onRate}
                style={{
                  flex: 1,
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  lineHeight: 1,
                  minHeight: '32px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '14px' }}>☺</span>
                <span>Rate this {isSeries ? 'series' : 'story'}</span>
                <span style={{ fontSize: '14px' }}>☹</span>
              </button>
            ) : state.inPlaylist ? (
              <button
                onClick={onTogglePlaylist}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: '#93c5fd',
                  border: '0.5px solid #3b82f6',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  lineHeight: 1,
                  minHeight: '32px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                ✓ In your playlist · Remove
              </button>
            ) : (
              <>
                <button
                  onClick={onPlay}
                  style={{
                    flex: 1,
                    background: showPlayAgain ? '#fb923c' : inProgress ? '#16a34a' : '#f97316',
                    color: 'white',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    lineHeight: 1,
                    minHeight: '32px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {showPlayAgain ? '▶ Play Again' : inProgress ? '▶ Continue' : isSeries ? '▶ Play series' : '▶ Play now'}
                </button>
                <button
                  onClick={onTogglePlaylist}
                  style={{
                    flex: 1,
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    lineHeight: 1,
                    minHeight: '32px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  + Queue
                </button>
              </>
            )}
          </div>

          {/* Row 7: progress bar */}
          <div
            style={{
              height: '3px',
              background: state.completed ? '#16a34a' : 'rgba(148,163,184,0.15)',
              borderRadius: '2px',
              marginTop: '2px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {showProgress && item.story?.duration_mins && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${Math.min(
                    100,
                    (state.progress / (item.story.duration_mins * 60)) * 100
                  )}%`,
                  background: '#f97316',
                  borderRadius: '2px',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
