'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import ReviewModal from '@/components/ReviewModal'
import { buildSeriesPlaybackTarget, storeSeriesPlayback } from '@/lib/seriesPlayback'
import { getAllLocalPlayerProgress, mergePlayerProgress } from '@/lib/playerProgress'
import LibraryStoryCard, { formatMinutes } from '@/components/LibraryStoryCard'
import { downloadQueuedItemOffline, removeQueuedItemOffline, type QueueDownloadTarget } from '@/lib/offline/queueDownload'
import {
  ACTIVE_PLAYLIST_KEY,
  LIBRARY_PLAYLIST_KEY,
  clearActivePlaylist,
  saveActivePlaylist,
} from '@/lib/playlistState'

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

type ReadingProgressRow = {
  story_id: string
  paragraph_index: number | null
  completed: boolean | null
}

type CardItem = {
  key: string
  type: 'single' | 'series'
  story?: Story
  seriesId?: string
  seriesName?: string
  episodeCount?: number
  avgDuration?: number
  totalDuration?: number
  cover?: string | null
  author?: string | null
  genre?: string | null
  description?: string | null
  flag?: string | null
  avgRating?: number | null
  reviewCount?: number | null
  firstEpisodeId?: string
  playEpisodeId?: string
  resumeSeconds?: number
  seriesInProgress?: boolean
  episodePlaylist?: Array<{ id: string; episode_number: number }>
  durationForSort: number
  notForMe: boolean
  readingInProgress: boolean
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
  // WALK-BUG-0713 #8b (Marc, 2026-07-13): stray glyph before the label — clean.
  Drama: 'Drama',
  // Marc 2026-07-13: 'Heartwarming' too long for the pill — split into two
  // words so it wraps to two lines (pill whiteSpace allows wrapping).
  Heartwarming: 'Heart Warming',
}

function mergeLibraryWithLocalProgress(serverRows: LibraryRow[], userId?: string | null): LibraryRow[] {
  const byStoryId = new Map<string, LibraryRow>()
  serverRows.forEach((row) => byStoryId.set(row.story_id, row))

  const localRows = getAllLocalPlayerProgress(userId)
  Object.entries(localRows).forEach(([storyId, local]) => {
    if (!storyId || !local) return
    const existing = byStoryId.get(storyId)
    const merged = mergePlayerProgress(existing, local)
    byStoryId.set(storyId, {
      story_id: storyId,
      progress: merged.progress,
      completed: merged.completed,
      not_for_me: existing?.not_for_me || false,
    })
  })

  return Array.from(byStoryId.values())
}

function parsePlaylistKeys(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((key): key is string => typeof key === 'string')
  } catch {
    return []
  }
}

export default function LibraryPage() {
  const router = useRouter()
  const { user, session, loading: authLoading } = useAuth()

  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<LibraryRow[]>([])
  const [userReviewedIds, setUserReviewedIds] = useState<Set<string>>(new Set())
  const [readingProgressRows, setReadingProgressRows] = useState<ReadingProgressRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [libraryReady, setLibraryReady] = useState(false)
  const [activeGenre, setActiveGenre] = useState('All')
  const [showMoreGenres, setShowMoreGenres] = useState(false)
  const [genreSlots, setGenreSlots] = useState<string[]>([])
  const [playlist, setPlaylist] = useState<string[]>([])
  const [playlistHydrated, setPlaylistHydrated] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [canonicalGenres, setCanonicalGenres] = useState<CanonicalGenre[]>([])

  // User-scoped playlist key — prevents one user's queue bleeding into another on same device
  const playlistKey = user ? `et_current_playlist_${user.id}` : LIBRARY_PLAYLIST_KEY

  // Hydrate playlist from localStorage
  useEffect(() => {
    if (!user) return
    const syncPlaylist = () => {
      try {
        const storedKeys = parsePlaylistKeys(localStorage.getItem(playlistKey))
        if (storedKeys) {
          setPlaylist(storedKeys)
          setPlaylistHydrated(true)
          return
        }
        const activeRaw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
        if (!activeRaw) {
          setPlaylist([])
          setPlaylistHydrated(true)
          return
        }
        const active = JSON.parse(activeRaw)
        const items = active.items || active.stories || []
        setPlaylist((Array.isArray(items) ? items : [])
          .map((item: any) => item.type === 'series'
            ? item.series_id || item.id ? `series-${item.series_id || item.id}` : null
            : item.id ? `single-${item.id}` : null)
          .filter((key: string | null): key is string => Boolean(key)))
        setPlaylistHydrated(true)
      } catch {
        setPlaylist([])
        setPlaylistHydrated(true)
      }
    }
    syncPlaylist()
    window.addEventListener('focus', syncPlaylist)
    window.addEventListener('et_playlist_saved', syncPlaylist)
    window.addEventListener('et_playlist_cleared', syncPlaylist)
    window.addEventListener('storage', syncPlaylist)
    return () => {
      window.removeEventListener('focus', syncPlaylist)
      window.removeEventListener('et_playlist_saved', syncPlaylist)
      window.removeEventListener('et_playlist_cleared', syncPlaylist)
      window.removeEventListener('storage', syncPlaylist)
    }
  }, [user, playlistKey])

  // Persist playlist
  useEffect(() => {
    if (!playlistHydrated || !user) return
    try {
      if (playlist.length > 0) localStorage.setItem(playlistKey, JSON.stringify(playlist))
      else {
        // UX-PLAYLIST-002 (2026-07-15): the user-scoped key must be removed too.
        // clearActivePlaylist() only clears the unscoped keys, then fires
        // et_playlist_cleared/saved — which syncPlaylist() answers by rehydrating
        // from this stale user-scoped key, silently resurrecting the removed item.
        // Net effect: tapping "✓ Remove" on the LAST playlist item did nothing.
        localStorage.removeItem(playlistKey)
        clearActivePlaylist()
      }
    } catch {}
  }, [playlistHydrated, playlist])

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
          if (!cancelled && libraryData) {
            setUserLibrary(mergeLibraryWithLocalProgress(libraryData as LibraryRow[], user.id))
          }
          setLibraryReady(true)

          const { data: reviewsData, error: reviewsError } = await supabase
            .from('reviews')
            .select('story_id')
            .eq('user_id', user.id)
          if (reviewsError) throw new Error(`reviews failed: ${reviewsError.message}`)
          if (!cancelled && reviewsData) {
            setUserReviewedIds(new Set(reviewsData.map((r: any) => r.story_id)))
          }

          // Marc 2026-10-07: lets the card's main button go green/"Continue
          // Reading" off eBook progress alone, same as it already does for
          // audio — non-fatal if this fails (warn + leave list empty), since
          // the card still works fine without it, just without that state.
          const { data: readingData, error: readingError } = await supabase
            .from('reading_progress')
            .select('story_id, paragraph_index, completed')
            .eq('user_id', user.id)
          if (readingError) {
            console.warn('[Library] reading_progress lookup failed:', readingError.message)
          } else if (!cancelled && readingData) {
            setReadingProgressRows(readingData as ReadingProgressRow[])
          }
        }
      } catch (err) {
        console.error('[Library] load failed:', err)
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Library failed to load')
        }
      } finally {
        if (!cancelled) { setLoading(false); setLibraryReady(true) }
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

  // Marc 2026-10-07: "has unfinished eBook progress" per story, same shape as
  // libraryLookup's audio progress — a row exists, past paragraph 0, not
  // marked completed.
  const readingLookup = useMemo(() => {
    const m = new Map<string, ReadingProgressRow>()
    readingProgressRows.forEach((r) => m.set(r.story_id, r))
    return m
  }, [readingProgressRows])
  const isReadingInProgress = (storyId: string) => {
    const rp = readingLookup.get(storyId)
    return !!rp && (rp.paragraph_index || 0) > 0 && !rp.completed
  }

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
          reviewCount: s.review_count,
          durationForSort: s.duration_mins || 0,
          notForMe: !!lib?.not_for_me,
          readingInProgress: isReadingInProgress(s.id),
        })
      }
    })

    seriesGroups.forEach((eps, seriesId) => {
      const sorted = eps.slice().sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
      const first = sorted[0]
      const totalDuration = sorted.reduce((sum, e) => sum + (e.duration_mins || 0), 0)
      const avgDuration = sorted.length > 0 ? Math.round(totalDuration / sorted.length) : 0
      const allEpisodesNotForMe =
        sorted.length > 0 && sorted.every((e) => !!libraryLookup.get(e.id)?.not_for_me)
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
        totalDuration,
        cover: first.cover_url,
        author: first.author,
        genre: first.genre,
        description: first.description,
        flag: first.flag,
        avgRating: first.avg_rating,
        reviewCount: first.review_count,
        firstEpisodeId: first.id,
        playEpisodeId: playbackTarget.episodeId || first.id,
        resumeSeconds: playbackTarget.resumeSeconds,
        seriesInProgress: playbackTarget.isInProgress,
        episodePlaylist: playbackTarget.playlist,
        durationForSort: totalDuration,
        notForMe: allEpisodesNotForMe,
        readingInProgress: sorted.some((e) => isReadingInProgress(e.id)),
      })
    })

    return items
  }, [stories, libraryLookup, readingLookup])

  // Filter by genre, then sort by episode count first (fewest first; singles
  // count as 1), total story length second (shortest first) — Marc 2026-10-04.
  // Not-for-me items still sink to the bottom regardless of count/length.
  const filteredItems = useMemo(() => {
    const filtered =
      activeGenre === 'All'
        ? cardItems
        : cardItems.filter((i) => (i.genre || '').toLowerCase() === activeGenre.toLowerCase())
    return filtered.slice().sort((a, b) => {
      if (a.notForMe !== b.notForMe) return a.notForMe ? 1 : -1
      const aCount = a.type === 'single' ? 1 : a.episodeCount || 0
      const bCount = b.type === 'single' ? 1 : b.episodeCount || 0
      if (aCount !== bCount) return aCount - bCount
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

  // QUEUE-OFFLINE-001 (Marc, 2026-10-04): queueing a story/series auto-saves
  // it for offline playback (all episodes, for a series); un-queueing removes
  // the offline copy. Best-effort — a failed/capped save never blocks the
  // queue action itself.
  function togglePlaylist(key: string) {
    const adding = !playlist.includes(key)
    setPlaylist((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))

    const item = cardItems.find((i) => i.key === key)
    if (!item) return
    const target: QueueDownloadTarget =
      item.type === 'single' && item.story
        ? { type: 'single', id: item.story.id }
        : { type: 'series', episodeIds: (item.episodePlaylist || []).map((e) => e.id) }

    if (adding) {
      if (user && session?.access_token) {
        downloadQueuedItemOffline(target, { accessToken: session.access_token, firstName: (user as any)?.first_name || null }).catch(() => {})
      }
    } else {
      removeQueuedItemOffline(target).catch(() => {})
    }
  }

  function navigateToPlayer(targetUrl: string, payload: Record<string, unknown>) {
    console.info('[Library] Play tapped', payload)
    router.push(targetUrl)

    window.setTimeout(() => {
      if (window.location.pathname === '/library') {
        console.warn('[Library] router.push did not leave Library; falling back to hard navigation', {
          targetUrl,
          payload,
        })
        window.location.assign(targetUrl)
      }
    }, 700)
  }

  function playSingle(storyId: string) {
    const story = stories.find((item) => item.id === storyId)
    const targetUrl = `/player/${storyId}?autoplay=1&playNow=1`
    navigateToPlayer(targetUrl, {
      type: 'single',
      storyId,
      title: story?.title || null,
      hasCover: Boolean(story?.cover_url),
      durationMins: story?.duration_mins || null,
    })
  }

  function playSeries(item: CardItem) {
    if (!item.playEpisodeId) {
      console.warn('[Library] Series play tapped but no playable episode was resolved', {
        seriesId: item.seriesId,
        seriesName: item.seriesName,
        episodeCount: item.episodeCount,
      })
      return
    }
    try {
      storeSeriesPlayback({
        episodeId: item.playEpisodeId,
        resumeSeconds: item.resumeSeconds || 0,
        isInProgress: !!item.seriesInProgress,
        playlist: item.episodePlaylist || [],
      })
    } catch {}
    const params = new URLSearchParams({ autoplay: '1', playNow: '1' })
    if (item.resumeSeconds && item.resumeSeconds > 0) params.set('resume', String(item.resumeSeconds))
    const targetUrl = `/player/${item.playEpisodeId}?${params.toString()}`
    navigateToPlayer(targetUrl, {
      type: 'series',
      seriesId: item.seriesId,
      seriesName: item.seriesName,
      episodeId: item.playEpisodeId,
      episodeCount: item.episodeCount,
      resumeSeconds: item.resumeSeconds || 0,
      playlistLength: item.episodePlaylist?.length || 0,
    })
  }

  function openSeries(seriesId: string) {
    // Same hard-navigation fallback as navigateToPlayer: router.push from
    // /library intermittently no-ops (see 80d9d775) — View Episodes was the
    // last button still relying on bare router.push (Marc report 2026-07-13).
    const targetUrl = `/series/${seriesId}`
    router.push(targetUrl)
    window.setTimeout(() => {
      if (window.location.pathname === '/library') {
        console.warn('[Library] View Episodes router.push did not leave Library; falling back to hard navigation', { targetUrl, seriesId })
        window.location.assign(targetUrl)
      }
    }, 700)
  }

  // Marc 2026-10-04: cover tap on a single-story card → its own detail page
  // (mirrors openSeries' hard-navigation fallback).
  function openStory(storyId: string) {
    const targetUrl = `/story/${storyId}`
    router.push(targetUrl)
    window.setTimeout(() => {
      if (window.location.pathname === '/library') {
        console.warn('[Library] Cover-tap router.push did not leave Library; falling back to hard navigation', { targetUrl, storyId })
        window.location.assign(targetUrl)
      }
    }, 700)
  }

  // Marc 2026-10-07: "Read eBook" button → reader deep link (same hard-nav
  // fallback pattern as openStory/openSeries). playerStoryOrEpisodeId is the
  // single's own story id, or the series' resume episode (item.playEpisodeId
  // — the same episode audio resumes to).
  function openEbook(playerStoryOrEpisodeId: string) {
    const targetUrl = `/player/${playerStoryOrEpisodeId}?openReader=1`
    router.push(targetUrl)
    window.setTimeout(() => {
      if (window.location.pathname === '/library') {
        console.warn('[Library] Read eBook router.push did not leave Library; falling back to hard navigation', { targetUrl })
        window.location.assign(targetUrl)
      }
    }, 700)
  }

  const [playlistStarted, setPlaylistStarted] = useState(false)
  useEffect(() => {
    function syncStarted() {
      try {
        const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
        setPlaylistStarted(Boolean(raw && JSON.parse(raw)?.started))
      } catch {
        setPlaylistStarted(false)
      }
    }
    syncStarted()
    window.addEventListener('et_playlist_saved', syncStarted)
    window.addEventListener('et_playlist_cleared', syncStarted)
    return () => {
      window.removeEventListener('et_playlist_saved', syncStarted)
      window.removeEventListener('et_playlist_cleared', syncStarted)
    }
  }, [])

  function playPlaylistFromBar() {
    if (validPlaylist.length === 0) return
    const first = cardItems.find((i) => i.key === validPlaylist[0])
    if (!first) return
    const id = first.type === 'single' ? first.story?.id : first.firstEpisodeId
    if (id) {
      navigateToPlayer(`/player/${id}?playlist=1&autoplay=1`, {
        type: 'playlist',
        firstItemKey: first.key,
        firstStoryId: id,
        playlistLength: validPlaylist.length,
      })
    }
  }

  function buildActivePlaylistItems() {
    return validPlaylist
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
  }

  function syncQueueToHome() {
    const savedPlaylist = {
      id: `library-${Date.now()}`,
      items: buildActivePlaylistItems(),
      remaining_mins: playlistTotalMins,
      completed: 0,
    }
    saveActivePlaylist(savedPlaylist, validPlaylist)
  }

  function savePlaylistToHome() {
    try {
      syncQueueToHome()
      router.push('/home')
    } catch {}
  }

  // Marc 2026-07-13: queueing in the library must show up on /home without the
  // extra "Save to home" tap — auto-sync the queue to the home playlist card
  // whenever it changes. Equality guard prevents save-event feedback loops and
  // preserves the existing playlist's completed count when nothing changed.
  useEffect(() => {
    if (loading || !playlistHydrated || validPlaylist.length === 0) return
    try {
      const raw = localStorage.getItem(ACTIVE_PLAYLIST_KEY)
      if (raw) {
        const active = JSON.parse(raw)
        const items = active?.items || active?.stories || []
        const existingKeys = (Array.isArray(items) ? items : [])
          .map((item: any) => item?.type === 'series'
            ? (item.series_id || item.id ? `series-${item.series_id || item.id}` : null)
            : (item?.id ? `single-${item.id}` : null))
          .filter(Boolean)
        if (existingKeys.length === validPlaylist.length && existingKeys.every((k: string, i: number) => k === validPlaylist[i])) return
      }
      syncQueueToHome()
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, playlistHydrated, validPlaylist, playlistTotalMins])

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
    return { inPlaylist, progress, completed, isNotForMe, reviewed, readingInProgress: item.readingInProgress }
  }

  if (loading || !libraryReady || (authLoading && !authWaitExpired)) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
        <div style={{ padding: '40px 16px', color: 'white', textAlign: 'center', fontSize: '14px' }}>
          Loading library…
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
        <div style={{ padding: '40px 16px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Library failed to load</div>
          <div style={{ color: 'white', fontSize: '12px', lineHeight: 1.5 }}>{loadError}</div>
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
                  whiteSpace: 'normal',
                  textAlign: 'center',
                  lineHeight: 1.15,
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
              color: 'white',
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
            <LibraryStoryCard
              key={item.key}
              item={item}
              state={state}
              onPlay={() => {
                if (item.type === 'single' && item.story) playSingle(item.story.id)
                else if (item.type === 'series') playSeries(item)
              }}
              onCoverClick={() => {
                if (item.type === 'series' && item.seriesId) openSeries(item.seriesId)
                else if (item.type === 'single' && item.story) openStory(item.story.id)
              }}
              onTogglePlaylist={() => togglePlaylist(item.key)}
              onReadEbook={() => {
                if (item.type === 'series' && item.playEpisodeId) openEbook(item.playEpisodeId)
                else if (item.type === 'single' && item.story) openEbook(item.story.id)
              }}
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

      {/* QUEUE-OFFLINE-001 (Marc, 2026-10-04): informational-only status bar —
          no buttons, distinct color so it reads as "stuff is downloaded",
          not an action bar. Tap-through to /playlist (My Downloads) for
          remove/reorder. */}
      {validPlaylist.length > 0 && (
        <div
          onClick={() => router.push('/playlist')}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#ffffff',
            borderTop: '1px solid rgba(0,0,0,0.12)',
            borderRadius: '14px 14px 0 0',
            padding: '12px 16px',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.2), 0 -2px 12px rgba(0,0,0,0.12)',
            zIndex: 40,
            cursor: 'pointer',
          }}
        >
          <div style={{ color: '#000', fontSize: '13px', fontWeight: 700 }}>
            {validPlaylist.length} {validPlaylist.length === 1 ? 'story' : 'stories'} ({formatMinutes(playlistTotalMins)}) downloaded to your playlist for offline playing
          </div>
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

