'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trackPlayStart, trackPlayEnd } from '@/lib/analytics'
import { useAuth } from '@/contexts/AuthContext'
import type { AutoAdvanceCandidate, AutoAdvanceDisabledReason, PlayerMode, PlayerStory } from './playerTypes'

interface QueueItem { url: string; type: 'intro' | 'story' | 'outro'; label: string }

// ── VOLUME LEVELS ─────────────────────────────────────────────────────────────
// All values 0–1. Music stays BELOW these while voice is playing.
const VOL_INTRO_MUSIC = 0.06   // under Belle B announcer  (6%)
const VOL_STORY_MUSIC = 0.06   // under story voices        (6%)
const VOL_SWELL       = 0.10   // brief rise between lines  (10%)
const DUCK_TARGET     = 0.015  // music while voice is active (1.5%)
const DUCK_MS         = 250    // ms to duck
const RAISE_MS        = 600    // ms to raise after voice ends
const AUTO_ADVANCE_STORY_SELECT = 'id,title,author,genre,audio_url,cover_url,duration_mins,episode_number,series_id,series_name,is_free,prose_text,author_id,narrator_voice_id,narrator_voice_name,status,is_hidden,published_on'
const ADMIN_REVIEW_EMAILS = new Set(['marc@endless-tales.com', 'm.postlewaite@gmail.com'])

interface CanonicalPlayerProps {
  storyId: string
  resumeParam?: string | null
  mode?: PlayerMode
}

export default function CanonicalPlayer({ storyId, resumeParam = null, mode = 'story' }: CanonicalPlayerProps) {
  const router  = useRouter()
  const { user, loading: authLoading } = useAuth()
  const userEmail = String(user?.email || '').trim().toLowerCase()
  const [returnContext, setReturnContext] = useState({ returnUrl: '', approvalReview: false })
  const safeReturnUrl = returnContext.returnUrl

  const audioRef = useRef<HTMLAudioElement>(null)  // voice
  const musicRef = useRef<HTMLAudioElement>(null)  // single music track
  const nextSegRef = useRef<HTMLAudioElement | null>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const volTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const schedTimer = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const resumeRef  = useRef(0)
  const typeRef    = useRef<'intro' | 'story' | 'outro'>('intro')
  const switchingRef = useRef(false) // true while swapping music src
  const analyticsTrackedRef = useRef(false) // true after first play tracked
  const scrubbingRef = useRef(false)
  const finalMixRetryCountRef = useRef(0)
  const finalMixRetryResumeRef = useRef<number | null>(null)
  const finalMixRetryAutoplayRef = useRef(false)
  const seriesContinueAutoplayAttemptedRef = useRef(false)

  const [story, setStory]       = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [hasProgress, setHasProgress] = useState(false)
  const [queue, setQueue]           = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isASC3, setIsASC3]         = useState(false)
  const [sectionLabel, setSectionLabel] = useState('')
  const introMusicRef = useRef('')
  const bgMusicRef    = useRef<string | null>(null)
  const noMusicRef    = useRef(true)   // music disabled globally — voice only
  const [audioSrc, setAudioSrc] = useState('')  // resolved single-file URL (state so init effect re-runs)
  const segDursRef    = useRef<number[]>([])
  const completedRef  = useRef(0)
  const activeQueueIndexRef = useRef(0)
  const pendingQueueSeekRef = useRef<number | null>(null)
  const pendingQueueSeekPlayRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const playlistRef      = useRef<{id:string,episode_number:number}[]>([])
  const playlistIndexRef = useRef<number>(-1)
  const [nowPlayingLabel, setNowPlayingLabel] = useState<string | null>(null)
  const [totalDur, setTotalDur] = useState(0)
  const welcomeQueueRef = useRef<string[]>([])  // [welcome_A, name_clip, welcome_B]
  const welcomeIndexRef = useRef(0)
  const inWelcomeRef    = useRef(false)
  const [cumTime, setCumTime]   = useState(0)
  const [audioErrorMessage, setAudioErrorMessage] = useState('')
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const isAdvancingRef = useRef(false)
  const mountedRef = useRef(false)
  const autoAdvanceEnabledRef = useRef(true)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stillListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unrequestedAutoStartsRef = useRef(0)
  const [autoAdvanceCandidate, setAutoAdvanceCandidate] = useState<AutoAdvanceCandidate | null>(null)
  const [catalogExhausted, setCatalogExhausted] = useState(false)
  const [stillListeningPrompt, setStillListeningPrompt] = useState(false)
  const [autoAdvanceDisabledReason, setAutoAdvanceDisabledReason] = useState<AutoAdvanceDisabledReason | null>(null)

  // ── Pills state ────────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<'author' | 'narrator' | 'prose' | null>(null)
  const [proseDark, setProseDark] = useState(false)
  const [proseFontSize, setProseFontSize] = useState(17)
  const [prosePage, setProsePage] = useState(1)
  const [proseControlsOpen, setProseControlsOpen] = useState(false)
  const [proseHintVisible, setProseHintVisible] = useState(false)
  const [proseHintSeen, setProseHintSeen] = useState(false)
  const proseScrollRef = useRef<HTMLDivElement>(null)
  const [seriesBookTitle, setSeriesBookTitle] = useState('')
  const [seriesProseChapters, setSeriesProseChapters] = useState<Array<{ id: string; title: string; episode_number: number; prose_text: string }>>([])
  const [authorData, setAuthorData]   = useState<any | null>(null)
  const [narratorData, setNarratorData] = useState<any | null>(null)

  // ── Volume helpers ─────────────────────────────────────────────────────────

  const animVol = (el: HTMLAudioElement, from: number, to: number, ms: number, done?: () => void) => {
    if (volTimer.current) clearInterval(volTimer.current)
    el.volume = Math.max(0, Math.min(1, from))
    const steps = Math.max(6, ms / 20); const stepMs = ms / steps; let s = 0
    volTimer.current = setInterval(() => {
      s++; el.volume = Math.max(0, Math.min(1, from + (to - from) * s / steps))
      if (s >= steps) { clearInterval(volTimer.current!); volTimer.current = null; done?.() }
    }, stepMs)
  }

  const duck  = () => { const m = musicRef.current; if (m && !switchingRef.current) animVol(m, m.volume, DUCK_TARGET, DUCK_MS) }
  const raise = (target: number) => { const m = musicRef.current; if (m && !switchingRef.current) animVol(m, m.volume, target, RAISE_MS) }

  /** Fade to 0, swap src, fade back to target */
  const swapMusic = (newSrc: string, targetVol: number, fadeDuration = 1500) => {
    const m = musicRef.current; if (!m) return
    switchingRef.current = true
    animVol(m, m.volume, 0, fadeDuration / 2, () => {
      m.src = newSrc; m.loop = true
      m.play().catch(() => {})
      animVol(m, 0, targetVol, fadeDuration / 2, () => { switchingRef.current = false })
    })
  }

  /** Schedule a music swap leadSec seconds before the current voice audio ends */
  const schedSwap = (newSrc: string, targetVol: number, leadSec: number) => {
    if (schedTimer.current) clearTimeout(schedTimer.current)
    const a = audioRef.current; if (!a?.duration || isNaN(a.duration) || a.paused) return
    const delay = Math.max(0, (a.duration - a.currentTime - leadSec) * 1000)
    schedTimer.current = setTimeout(() => swapMusic(newSrc, targetVol, leadSec * 1000), delay)
  }

  const bustAudioUrl = (url: string) => {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}et_retry=${Date.now()}`
  }

  const canPreviewReviewStory = () => {
    return ADMIN_REVIEW_EMAILS.has(userEmail)
  }

  const canLoadStory = (candidate: any) => {
    if (candidate?.status === 'published' && candidate?.is_hidden === false) return true
    return candidate?.status === 'audio_ready' && candidate?.is_hidden === true && canPreviewReviewStory()
  }

  const disableAutoAdvanceForSession = (reason: AutoAdvanceDisabledReason) => {
    autoAdvanceEnabledRef.current = false
    setAutoAdvanceDisabledReason(reason)
    setAutoAdvanceCandidate(null)
    setStillListeningPrompt(false)
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    if (stillListeningTimerRef.current) {
      clearTimeout(stillListeningTimerRef.current)
      stillListeningTimerRef.current = null
    }
  }

  const returnToSource = (fallback = '/library') => {
    router.push(safeReturnUrl || fallback)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') || ''
    setReturnContext({
      returnUrl: returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '',
      approvalReview: params.get('approvalReview') === '1',
    })
  }, [])

  useEffect(() => {
    if (!returnContext.approvalReview) return
    disableAutoAdvanceForSession('navigation')
  }, [returnContext.approvalReview])

  const getQueueCompletedSeconds = (targetIndex: number) => {
    return segDursRef.current
      .slice(0, Math.max(0, targetIndex))
      .reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0)
  }

  const hasAllQueueDurations = () => {
    return queue.length > 0 && queue.every((_, index) => Number.isFinite(segDursRef.current[index]) && segDursRef.current[index] > 0)
  }

  const getQueueTotalSeconds = () => {
    const measuredTotal = segDursRef.current.reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0)
    return hasAllQueueDurations() && measuredTotal > 0 ? measuredTotal : totalDur
  }

  const getProgressSeconds = () => {
    return isASC3 ? cumTime : currentTime
  }

  const getProgressTotalSeconds = () => {
    return isASC3 ? getQueueTotalSeconds() : (duration || (story as any)?.duration_mins * 60 || 0)
  }

  const findQueuePositionForTime = (globalTime: number) => {
    const safeTime = Math.max(0, globalTime)
    let elapsed = 0
    for (let index = 0; index < queue.length; index += 1) {
      const segmentDuration = segDursRef.current[index] || 0
      if (segmentDuration > 0 && safeTime <= elapsed + segmentDuration) {
        return { index, offset: Math.max(0, safeTime - elapsed), completed: elapsed }
      }
      elapsed += segmentDuration
    }
    const lastIndex = Math.max(0, queue.length - 1)
    const lastDuration = segDursRef.current[lastIndex] || 0
    return {
      index: lastIndex,
      offset: Math.max(0, lastDuration - 0.25),
      completed: getQueueCompletedSeconds(lastIndex),
    }
  }

  const seekASC3ToGlobalTime = (globalTime: number, shouldPlay = isPlaying) => {
    const audio = audioRef.current
    if (!audio || !queue.length) return

    const total = getQueueTotalSeconds()
    if (total <= 0) return
    const targetTime = total > 0 ? Math.min(Math.max(0, globalTime), total) : Math.max(0, globalTime)
    const target = findQueuePositionForTime(targetTime)
    const targetSegment = queue[target.index]
    if (!targetSegment) return

    completedRef.current = target.completed
    activeQueueIndexRef.current = target.index
    setQueueIndex(target.index)
    setSectionLabel(targetSegment.label)
    typeRef.current = targetSegment.type
    setCumTime(target.completed + target.offset)
    setCurrentTime(target.offset)

    const currentSrc = audio.currentSrc || audio.src || ''
    const sameSegment = currentSrc === targetSegment.url || currentSrc.includes(targetSegment.url.split('/').pop() || '')
    if (sameSegment && audio.readyState >= 1) {
      audio.currentTime = target.offset
      if (shouldPlay) audio.play().catch(() => {})
      return
    }

    pendingQueueSeekRef.current = target.offset
    pendingQueueSeekPlayRef.current = shouldPlay
    audio.src = targetSegment.url
    audio.load()
  }

  const startAutoAdvanceTo = (candidate: AutoAdvanceCandidate) => {
    if (!mountedRef.current || !autoAdvanceEnabledRef.current) return
    setAutoAdvanceCandidate(candidate)
    setCatalogExhausted(false)
    autoAdvanceTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !autoAdvanceEnabledRef.current) return
      unrequestedAutoStartsRef.current += 1
      const isSeriesContinuation = candidate.reason === 'next_series_episode'
      if (mode === 'playlist') {
        const nextIndex = playlistRef.current.findIndex((item) => item.id === candidate.story.id)
        if (nextIndex >= 0) localStorage.setItem('dtt_playlist_index', String(nextIndex))
      }
      router.push(`/player/${candidate.story.id}?autoplay=1&${isSeriesContinuation ? 'seriesContinue=1' : 'autoAdvance=1'}`)
    }, 2500)
  }

  const getSeriesPlaylistAutoAdvanceCandidate = (): AutoAdvanceCandidate | null => {
    const playlist = playlistRef.current || []
    if (!playlist.length) return null

    const currentIndex = playlist.findIndex((episode) => episode.id === storyId)
    if (currentIndex < 0 || currentIndex >= playlist.length - 1) return null

    const nextEpisode = playlist[currentIndex + 1]
    if (!nextEpisode?.id) return null

    playlistIndexRef.current = currentIndex
    return {
      story: {
        id: nextEpisode.id,
        title: nextEpisode.episode_number ? `Episode ${nextEpisode.episode_number}` : 'Next episode',
        episode_number: nextEpisode.episode_number,
        series_id: (story as any)?.series_id || null,
        series_name: (story as any)?.series_name || null,
        status: 'published',
        is_hidden: false,
      },
      reason: 'next_series_episode',
      reasonLabel: 'Next episode',
      score: 0,
    }
  }

  const fetchDirectSeriesAutoAdvanceCandidate = async (): Promise<AutoAdvanceCandidate | null> => {
    if (!(story as any)?.series_id || !Number.isFinite((story as any)?.episode_number)) return null

    const { data, error } = await supabase
      .from('stories')
      .select(AUTO_ADVANCE_STORY_SELECT)
      .eq('series_id', (story as any).series_id)
      .gt('episode_number', Number((story as any).episode_number))
      .order('episode_number', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[player] direct series next lookup failed:', { storyId, error })
      return null
    }

    if (!data || !canLoadStory(data)) return null

    return {
      story: data as PlayerStory,
      reason: 'next_series_episode',
      reasonLabel: 'Next episode',
      score: 0,
    }
  }

  const maybeAutoAdvanceFromNaturalEnd = async (source: 'natural_ended') => {
    if (source !== 'natural_ended') return
    if (!mountedRef.current) return
    if (isAdvancingRef.current) return
    if (!autoAdvanceEnabledRef.current) {
      setTimeout(() => returnToSource('/library'), 1500)
      return
    }

    isAdvancingRef.current = true
    const seriesPlaylistCandidate = getSeriesPlaylistAutoAdvanceCandidate()
    if (seriesPlaylistCandidate) {
      startAutoAdvanceTo(seriesPlaylistCandidate)
      return
    }

    if (mode === 'playlist') {
      localStorage.removeItem('dtt_active_playlist')
      localStorage.removeItem('dtt_playlist_index')
      isAdvancingRef.current = false
      setCatalogExhausted(true)
      return
    }

    const directSeriesCandidate = await fetchDirectSeriesAutoAdvanceCandidate()
    if (!mountedRef.current || !autoAdvanceEnabledRef.current) return
    if (directSeriesCandidate) {
      startAutoAdvanceTo(directSeriesCandidate)
      return
    }

    setCatalogExhausted(true)
    isAdvancingRef.current = false
  }

  useEffect(() => {
    mountedRef.current = true
    autoAdvanceEnabledRef.current = true
    return () => {
      mountedRef.current = false
      autoAdvanceEnabledRef.current = false
      isAdvancingRef.current = false
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
      if (stillListeningTimerRef.current) clearTimeout(stillListeningTimerRef.current)
    }
  }, [])

  useEffect(() => {
    isAdvancingRef.current = false
    seriesContinueAutoplayAttemptedRef.current = false
    activeQueueIndexRef.current = 0
    completedRef.current = 0
    pendingQueueSeekRef.current = null
    pendingQueueSeekPlayRef.current = false
    segDursRef.current = []
    setTotalDur(0)
    setCumTime(0)
    setCurrentTime(0)
    setAutoAdvanceCandidate(null)
    setCatalogExhausted(false)
    setStillListeningPrompt(false)
    setAutoAdvanceDisabledReason(null)
    setAutoplayBlocked(false)
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    if (stillListeningTimerRef.current) {
      clearTimeout(stillListeningTimerRef.current)
      stillListeningTimerRef.current = null
    }
  }, [storyId])


  // Guest minute save on tab close / app background
  useEffect(() => {
    const saveGuestMinutes = () => {
      if (!user && sessionStartRef.current) {
        const mins = (Date.now() - sessionStartRef.current) / 60000
        const prev = parseFloat(localStorage.getItem('et_guest_minutes') || '0')
        localStorage.setItem('et_guest_minutes', String(prev + mins))
        sessionStartRef.current = Date.now()
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveGuestMinutes()
      if (document.visibilityState === 'visible' && !user) sessionStartRef.current = Date.now()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', saveGuestMinutes)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', saveGuestMinutes)
    }
  }, [user])

  // ── Load playlist from localStorage ──────────────────────────────────────────
  useEffect(() => {
    try {
      if (mode === 'playlist') {
        const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
        const idx = localStorage.getItem('dtt_playlist_index')
        if (!raw) return
        const parsed = JSON.parse(raw)
        const items = parsed.items
          ? parsed.items
          : Array.isArray(parsed)
            ? parsed
            : (parsed.stories || [])
        const playlist = items.flatMap((item: any, itemIndex: number) => {
          if (item.type === 'series' && Array.isArray(item.episodes)) {
            return item.episodes
              .map((episode: any, episodeIndex: number) => ({
                id: episode?.id,
                episode_number: episode?.episode_number || episodeIndex + 1,
              }))
              .filter((episode: any) => episode.id)
          }
          return item.id ? [{ id: item.id, episode_number: itemIndex + 1 }] : []
        })
        playlistRef.current = playlist
        const savedIndex = idx ? parseInt(idx) : 0
        playlistIndexRef.current = Number.isFinite(savedIndex) ? savedIndex : 0
        const found = playlist.findIndex((item: any) => item.id === storyId)
        if (found >= 0) {
          playlistIndexRef.current = found
          localStorage.setItem('dtt_playlist_index', String(found))
        }
        return
      }

      const pl = localStorage.getItem('dtt_series_playlist')
      const idx = localStorage.getItem('dtt_series_index')
      if (pl) {
        const parsed = JSON.parse(pl)
        playlistRef.current = parsed
        const i = idx ? parseInt(idx) : 0
        playlistIndexRef.current = i
        // Sync index to current storyId in case user navigated directly
        const found = parsed.findIndex((ep: any) => ep.id === storyId)
        if (found >= 0) playlistIndexRef.current = found
      }
    } catch(_) {}
  }, [mode, storyId])

  // ── Load story ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      let redirected = false
      let waitingForAuth = false
      let stage = 'start'
      try {
        setLoading(true)
        setAudioErrorMessage('')
        stage = 'story-row'
        const { data, error } = await supabase
          .from('stories')
          .select('id,title,author,genre,audio_url,cover_url,duration_mins,intro_audio_url,outro_audio_url,background_music_url,episode_number,series_id,series_name,is_free,prose_text,author_id,narrator_voice_id,narrator_voice_name,status,is_hidden,published_on')
          .eq('id', storyId)
          .maybeSingle()

        if (error) {
          console.error('[player] load story-row failed:', { storyId, error })
        }

        if (cancelled) return

        if (data && (data as any).status === 'audio_ready' && (data as any).is_hidden === true && authLoading) {
          waitingForAuth = true
          return
        }

        if (!data || !canLoadStory(data)) {
          setStory(null)
          return
        }

        if (data) {
          setStory(data)

          stage = 'resume-query'
          const resumeFromUrl = Number(resumeParam || 0)
          if (Number.isFinite(resumeFromUrl) && resumeFromUrl > 0) {
            resumeRef.current = resumeFromUrl
            setHasProgress(true)
          }

          stage = 'series-playlist'
          const existingSeriesPlaylist = playlistRef.current
          const hasCurrentInSeriesPlaylist = existingSeriesPlaylist.some(ep => ep.id === storyId)
          if ((data as any).series_id) {
            const { data: seriesEpisodes } = await supabase
              .from('stories')
              .select('id, title, episode_number, prose_text, series_name')
              .eq('series_id', (data as any).series_id)
              .eq('status', 'published')
              .eq('is_hidden', false)
              .order('episode_number', { ascending: true })

            const proseChapters = (seriesEpisodes || [])
              .filter(ep => ep.id && ep.title && ep.episode_number && ep.prose_text)
              .map(ep => ({
                id: ep.id,
                title: ep.title,
                episode_number: ep.episode_number,
                prose_text: ep.prose_text,
              }))
            setSeriesBookTitle((seriesEpisodes?.[0] as any)?.series_name || (data as any).series_name || data.title || '')
            setSeriesProseChapters(proseChapters)

            if (!existingSeriesPlaylist.length || !hasCurrentInSeriesPlaylist) {
              const playlist = (seriesEpisodes || [])
                .filter(ep => ep.id && ep.episode_number)
                .map(ep => ({ id: ep.id, episode_number: ep.episode_number }))
              const currentIndex = playlist.findIndex(ep => ep.id === storyId)

              if (currentIndex >= 0) {
                playlistRef.current = playlist
                playlistIndexRef.current = currentIndex
                localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
                localStorage.setItem('dtt_series_index', String(currentIndex))
              }
            }
          } else {
            setSeriesBookTitle('')
            setSeriesProseChapters([])
          }
        }

        // Resolve audio mode from API FIRST — single decision, no races, no overrides
        stage = 'audio-playlist'
        let resolvedQueue: QueueItem[] = []
        let resolvedIsASC3 = false
        try {
          const playlistParams = new URLSearchParams({ storyId })
          const firstName = String((user as any)?.first_name || '').trim()
          if (firstName) playlistParams.set('firstName', firstName)
          const res = await fetch(`/api/asc3/story-playlist?${playlistParams.toString()}`)
          if (res.ok) {
            const pl = await res.json()
            if (pl.useFinalMix && pl.finalMixUrl) {
              // Plain single-file audio — store URL in ref for init useEffect
              finalMixRetryCountRef.current = 0
              setAudioSrc(pl.finalMixUrl)
              noMusicRef.current = true
              introMusicRef.current = ''
              bgMusicRef.current = null
            } else if (pl.queue?.length > 0) {
              // Multi-segment ASC mode
              introMusicRef.current = pl.introOutroMusicUrl || ''
              bgMusicRef.current    = pl.backgroundMusicUrl || null
              noMusicRef.current    = false
              resolvedQueue  = pl.queue
              resolvedIsASC3 = true
            } else {
              setAudioSrc(data?.audio_url || '')
              noMusicRef.current = true
            }
          } else {
            setAudioSrc(data?.audio_url || '')
            noMusicRef.current = true
          }
        } catch (error) {
          console.error('[player] story-playlist failed; falling back to story audio_url:', { storyId, error })
          setAudioSrc(data?.audio_url || '')
          noMusicRef.current = true
        }
        setQueue(resolvedQueue)
        setIsASC3(resolvedIsASC3)

        // ── Paywall check ──────────────────────────────────────────────────────
        stage = 'paywall'
        if (data && !data.is_free) {
          if (!user) {
            // Not logged in — middleware should have caught this, but belt+suspenders
            redirected = true
            router.replace(`/signin?returnTo=/player/${storyId}`)
            return
          }
          const isMarc = user.email === 'marc@endless-tales.com' || user.email === 'm.postlewaite@gmail.com'
          if (!isMarc) {
            const { data: dbUser } = await supabase
              .from('users')
              .select('plan, subscription_ends_at')
              .eq('id', user.id)
              .single()
            const hasAccess = (
              dbUser?.plan && dbUser.plan !== 'free' &&
              (!dbUser?.subscription_ends_at || new Date(dbUser.subscription_ends_at) > new Date())
            )
            if (!hasAccess) {
              redirected = true
              router.replace(`/subscribe?returnTo=/player/${storyId}`)
              return
            }
          }
        }

        if (user?.id) {
          stage = 'user-progress'
          const { data: lib } = await supabase.from('user_library')
            .select('progress,completed,not_for_me').eq('user_id', user.id).eq('story_id', storyId).single()
          if (lib?.progress > 0 && !lib?.not_for_me) { resumeRef.current = lib.completed ? 0 : Math.max(0, lib.progress); setHasProgress(true) }

          // ── Welcome experience — first play only ─────────────────────────────
          stage = 'welcome-check'
          const { data: dbUser } = await supabase.from('users')
            .select('first_name, welcome_played').eq('id', user.id).single()
          if (dbUser && !dbUser.welcome_played && !lib?.progress) {
            try {
              const firstName = dbUser.first_name || 'friend'
              const welcomeText = `Hey ${firstName}! I'm Belle. I'll be here before every story. Just a friend who knows what's worth your time. You're going to love this one.`
              const res = await fetch('/api/admin/generate-belle-intro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'welcome', firstName, introText: welcomeText })
              })
              const data = res.ok ? await res.json() : null
              if (data?.url) {
                welcomeQueueRef.current = [data.url]
                inWelcomeRef.current = true
                welcomeIndexRef.current = 0
              }
            } catch (_) { /* welcome fails silently — story plays normally */ }
          }
        }
      } catch (error) {
        console.error('[player] load failed:', { storyId, stage, error })
      } finally {
        if (!cancelled && !redirected && !waitingForAuth) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [storyId, user, userEmail, authLoading, resumeParam])

  // Init audio once loaded
  useEffect(() => {
    if (loading || !audioRef.current) return
    if (inWelcomeRef.current && welcomeQueueRef.current.length > 0) {
      // Welcome mode — load first welcome clip
      audioRef.current.src = welcomeQueueRef.current[0]
      audioRef.current.load()
    } else if (isASC3 && queue.length) {
      // ASC3 mode — load first segment
      activeQueueIndexRef.current = 0
      completedRef.current = 0
      audioRef.current.src = queue[0].url; audioRef.current.load()
      setSectionLabel(queue[0].label); typeRef.current = 'intro'
      // Music src set on Play tap only -- prevents audio leaking on page load
    } else if (!isASC3 && audioSrc) {
      // Single file — audioSrcRef set by load() before setLoading(false),
      // so audioRef is guaranteed mounted here. No race possible.
      audioRef.current.src = audioSrc
      audioRef.current.load()
    }
  }, [isASC3, queue, loading, audioSrc])

  useEffect(() => {
    if (!isASC3 || !queue.length) {
      setTotalDur(0)
      return
    }

    let cancelled = false
    setTotalDur(0)
    Promise.all(queue.map((segment, index) => new Promise<{ index: number; duration: number }>((resolve) => {
      const probe = new Audio()
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => {
        const segmentDuration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0
        resolve({ index, duration: segmentDuration })
      }
      probe.onerror = () => resolve({ index, duration: 0 })
      probe.src = segment.url
      probe.load()
    }))).then((durations) => {
      if (cancelled) return
      durations.forEach(({ index, duration: segmentDuration }) => {
        if (segmentDuration > 0) segDursRef.current[index] = segmentDuration
      })
      const total = segDursRef.current.reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0)
      if (total > 0) setTotalDur(total)
    })

    return () => {
      cancelled = true
    }
  }, [isASC3, queue])

  useEffect(() => {
    if (!isASC3 || !queue.length || loading || resumeRef.current <= 0 || totalDur <= 0) return
    seekASC3ToGlobalTime(resumeRef.current, false)
    resumeRef.current = 0
  }, [isASC3, queue, loading, totalDur])

  useEffect(() => {
    if (loading || !audioRef.current || seriesContinueAutoplayAttemptedRef.current) return
    const params = new URLSearchParams(window.location.search)
    const hasInternalAutoplayIntent =
      params.get('seriesContinue') === '1' ||
      params.get('autoAdvance') === '1' ||
      params.get('playNow') === '1' ||
      params.get('playlist') === '1'
    if (params.get('autoplay') !== '1' || !hasInternalAutoplayIntent) return
    if (isASC3 && !queue.length) return
    if (!isASC3 && !audioSrc) return

    seriesContinueAutoplayAttemptedRef.current = true
    const audio = audioRef.current
    const attemptPlay = () => {
      audio.play()
        .then(() => {
          setIsPlaying(true)
          setAutoplayBlocked(false)
        })
        .catch((error) => {
          console.warn('[player] series continuation autoplay blocked:', error)
          setAutoplayBlocked(true)
          setIsPlaying(false)
        })
    }

    if (audio.readyState >= 2) {
      attemptPlay()
    } else {
      audio.addEventListener('canplay', attemptPlay, { once: true })
      return () => audio.removeEventListener('canplay', attemptPlay)
    }
  }, [loading, isASC3, queue, audioSrc, storyId])

  useEffect(() => {
    if (activeModal !== 'prose') return
    try { if (localStorage.getItem('et_prose_hint_seen')) return } catch(_) {}
    const t = setTimeout(() => setProseHintVisible(true), 800)
    return () => clearTimeout(t)
  }, [activeModal])
  function dismissProseHint() {
    try { localStorage.setItem('et_prose_hint_seen', '1') } catch(_) {}
    setProseHintVisible(false)
  }
  // ── Fetch author + narrator data for pills ─────────────────────────────────
  useEffect(() => {
    if (!story) return
    // Author
    if ((story as any).author_id) {
      supabase.from('authors').select('name,description,bio,techniques,audio_adaptation,photo_url,follower_count').eq('id', (story as any).author_id).single()
        .then(({ data }) => { if (data) setAuthorData(data) })
    }
    // Narrator
    if ((story as any).narrator_voice_id) {
      supabase.from('narrator_voices').select('name,description,bio,tone,accent,gender,tone_tags,photo_url,follower_count').eq('elevenlabs_voice_id', (story as any).narrator_voice_id).single()
        .then(({ data }) => { if (data) setNarratorData(data) })
    } else if ((story as any).narrator_voice_name) {
      supabase.from('narrator_voices').select('name,description,bio,tone,accent,gender,tone_tags,photo_url,follower_count').eq('name', (story as any).narrator_voice_name).single()
        .then(({ data }) => { if (data) setNarratorData(data) })
    }
  }, [story])
  const advancePlaylist = () => {
    const pl = playlistRef.current
    const ci = playlistIndexRef.current
    if (!pl || ci < 0 || ci >= pl.length - 1) {
      // No more direct-opened series episodes — return to the public library surface.
      returnToSource('/library')
      return
    }
    const next = pl[ci + 1]
    playlistIndexRef.current = ci + 1
    localStorage.setItem('dtt_series_index', String(ci + 1))
    // Show "Now Playing" overlay
    const epNum = next.episode_number ? `Episode ${next.episode_number}` : 'Next Episode'
    setNowPlayingLabel(epNum)
    setTimeout(() => setNowPlayingLabel(null), 3000)
    setTimeout(() => router.push(`/player/${next.id}?autoplay=1&seriesContinue=1`), 2500)
  }

  // ── Queue advance ──────────────────────────────────────────────────────────

  const advanceQueue = (source: 'natural_ended' | 'error_skip' = 'natural_ended') => {
    completedRef.current += segDursRef.current[queueIndex] || duration
    const ni = queueIndex + 1
    if (ni < queue.length) {
      activeQueueIndexRef.current = ni
      setQueueIndex(ni)
      const next = queue[ni]; setSectionLabel(next.label); typeRef.current = next.type
      if (audioRef.current) {
        if (nextSegRef.current?.src?.includes(next.url.split('/').pop() || '')) {
          audioRef.current.src = nextSegRef.current.src; nextSegRef.current = null
        } else { audioRef.current.src = next.url; audioRef.current.load() }
        audioRef.current.play().catch(() => {})
        // Brief swell on segment boundary then duck again
        const m = musicRef.current
        if (m) {
          if (volTimer.current) clearInterval(volTimer.current)
          m.volume = Math.min(VOL_SWELL, m.volume + 0.02)
          setTimeout(() => duck(), 120)
        }
      }
    } else if (source === 'natural_ended') {
      const completedSeconds = getQueueTotalSeconds() || completedRef.current || duration
      setCumTime(completedSeconds)
      raise(0); setIsPlaying(false); saveProgress(completedSeconds, true)
      maybeAutoAdvanceFromNaturalEnd('natural_ended')
    } else {
      const completedSeconds = getQueueTotalSeconds() || completedRef.current || duration
      setCumTime(completedSeconds)
      raise(0); setIsPlaying(false); saveProgress(completedSeconds, true)
    }
  }

  // ── Play / Pause ───────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      disableAutoAdvanceForSession('manual_pause')
      audioRef.current.pause(); musicRef.current?.pause()
      saveProgress(getProgressSeconds()); setIsPlaying(false)
    } else {
      // src is pre-loaded in useEffect — play directly to preserve user gesture
      audioRef.current.play().then(() => {
        setIsPlaying(true)
        if (!user && !sessionStartRef.current) { sessionStartRef.current = Date.now() }
        if (user?.id) supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, not_for_me: false, last_played: new Date().toISOString() }, { onConflict: 'user_id,story_id' }).then(() => {})
        // Analytics: track play start (only once per session)
        if (!analyticsTrackedRef.current) {
          analyticsTrackedRef.current = true
          trackPlayStart({
            userId: user?.id,
            storyId,
            genre: (story as any)?.genre,
            author: (story as any)?.author,
            narrator: (story as any)?.narrator_voice_name,
            durationMins: (story as any)?.duration_mins,
          }).catch(() => {})
        }
        const m = musicRef.current
        if (!noMusicRef.current && m && introMusicRef.current) {
          if (!m.src || m.src === 'about:blank' || m.src === window.location.href) {
            m.src = introMusicRef.current; m.loop = true
          }
          m.volume = 0; m.play().catch(() => {})
          animVol(m, 0, VOL_INTRO_MUSIC, 2000)
        }
      }).catch((e) => { console.error('[player] play() failed:', e) })
    }
  }

  const saveProgress = async (t: number, done = false) => {
    // Analytics: track play end on completion
    if (done && analyticsTrackedRef.current) {
      trackPlayEnd({
        userId: user?.id,
        storyId,
        currentTime: t,
        totalDuration: getProgressTotalSeconds(),
        stopReason: 'completed',
      }).catch(() => {})
      analyticsTrackedRef.current = false
    }
    if (user?.id) await supabase.from('user_library').upsert({
      user_id: user.id, story_id: storyId, progress: Math.floor(t), completed: done,
      hide_from_home: false,  // Reset dismiss if user plays again
      not_for_me: false,      // Clear not_for_me if user plays again
      last_played: new Date().toISOString()
    })
  }

  const seekToClientX = (clientX: number) => {
    const audio = audioRef.current
    const bar = progressBarRef.current
    if (!audio || !bar) return

    const actualDuration = isASC3
      ? getQueueTotalSeconds()
      : (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration)
    if (!actualDuration || !Number.isFinite(actualDuration)) return

    const rect = bar.getBoundingClientRect()
    if (!rect.width) return

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const nextTime = ratio * actualDuration
    if (isASC3) {
      seekASC3ToGlobalTime(nextTime)
      return
    }
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return
    seekToClientX(e.clientX)
  }

  const handleSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    scrubbingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }

  const handleSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    e.preventDefault()
    seekToClientX(e.clientX)
  }

  const handleSeekPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    e.preventDefault()
    seekToClientX(e.clientX)
    scrubbingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleNotForMe = async () => {
    disableAutoAdvanceForSession('not_for_me')
    audioRef.current?.pause(); musicRef.current?.pause()
    // Analytics: track not_for_me
    if (analyticsTrackedRef.current) {
      trackPlayEnd({
        userId: user?.id,
        storyId,
        currentTime: getProgressSeconds(),
        totalDuration: getProgressTotalSeconds(),
        stopReason: 'not_for_me',
      }).catch(() => {})
      analyticsTrackedRef.current = false
    }
    if (user?.id) {
      // Mark this episode as not_for_me
      const { error } = await supabase.from('user_library').upsert(
        { user_id: user.id, story_id: storyId, not_for_me: true, progress: Math.floor(getProgressSeconds()), last_played: new Date().toISOString() },
        { onConflict: 'user_id,story_id' }
      )
      if (error) console.error('[NotForMe] upsert error:', error)
      else console.log('[NotForMe] saved successfully')
      // If this is episode 1 of a series, mark ALL episodes of the series
      const seriesId = (story as any)?.series_id
      if (seriesId) {
        const { data: seriesEps } = await supabase
          .from('stories')
          .select('id')
          .eq('series_id', seriesId)
        if (seriesEps) {
          for (const ep of seriesEps) {
            if (ep.id === storyId) continue
            await supabase.from('user_library').upsert(
              { user_id: user.id, story_id: ep.id, not_for_me: true, last_played: new Date().toISOString() },
              { onConflict: 'user_id,story_id' }
            )
          }
          console.log('[NotForMe] marked', seriesEps.length, 'series episodes')
        }
      }
    }
    returnToSource('/library')
  }
  const handleBack = () => {
    disableAutoAdvanceForSession('navigation')
    audioRef.current?.pause(); musicRef.current?.pause(); saveProgress(getProgressSeconds())
    // Analytics: track navigated_away
    if (analyticsTrackedRef.current) {
      trackPlayEnd({
        userId: user?.id,
        storyId,
        currentTime: getProgressSeconds(),
        totalDuration: getProgressTotalSeconds(),
        stopReason: 'navigated_away',
      }).catch(() => {})
      analyticsTrackedRef.current = false
    }
    if (!user && sessionStartRef.current) {
      const mins = (Date.now() - sessionStartRef.current) / 60000
      const prev = parseFloat(localStorage.getItem('et_guest_minutes') || '0')
      localStorage.setItem('et_guest_minutes', String(prev + mins))
      sessionStartRef.current = null
    }
    if (safeReturnUrl) returnToSource('/library')
    else router.back()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const fmtMin = (s: number) => (s / 60).toFixed(1) + ' min'
  const actualAudioDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const effTotal = isASC3
    ? (totalDur > 0 ? totalDur : (story?.duration_mins || 0) * 60)
    : (actualAudioDuration || (story?.duration_mins || 0) * 60)
  const effCur   = isASC3 ? cumTime : currentTime
  const pct      = effTotal > 0 ? Math.min(100, (effCur / effTotal) * 100) : 0
  const autoAdvanceReasonCopy =
    autoAdvanceCandidate?.reason === 'next_series_episode' ? 'Next episode' :
    autoAdvanceCandidate?.reason === 'same_genre_duration_match' ? 'Same genre, similar length' :
    autoAdvanceCandidate?.reason === 'same_genre' ? 'Same genre' :
    autoAdvanceCandidate?.reason === 'user_taste_duration_match' || autoAdvanceCandidate?.reason === 'user_taste' ? 'Based on your listening' :
    autoAdvanceCandidate?.reason === 'untouched_catalog' ? 'Fresh pick' :
    autoAdvanceCandidate?.reasonLabel || ''

  if (loading) return <div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><p style={{ color:'rgba(255,255,255,0.72)', fontSize:'14px', fontWeight:600, margin:0 }}>Loading story...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
  if (!story)   return <div style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px', textAlign:'center' }}><p style={{ marginBottom:'16px' }}>This story isn’t available yet.</p><button onClick={() => { disableAutoAdvanceForSession('navigation'); returnToSource('/library') }} style={{ color:'#f97316', background:'none', border:'1px solid rgba(249,115,22,0.35)', borderRadius:'10px', padding:'10px 16px', cursor:'pointer', fontWeight:700 }}>{safeReturnUrl ? 'Back to Approval' : 'Back to Library'}</button></div>

  const isSeriesReadIt = Boolean((story as any).series_id && seriesProseChapters.length > 0)
  const proseAvailable = isSeriesReadIt || Boolean((story as any).prose_text)
  const proseBookTitle = isSeriesReadIt ? (seriesBookTitle || (story as any).series_name || story.title) : story.title
  const standaloneProseParagraphs = String((story as any).prose_text || '').split('\n\n').filter(Boolean)
  const playerSeriesTitle = (story as any).series_id ? (seriesBookTitle || (story as any).series_name || '') : ''

  return (
    <div data-auto-advance-disabled-reason={autoAdvanceDisabledReason || undefined} style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <audio ref={audioRef}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration; setDuration(d)
          const activeIndex = isASC3 ? activeQueueIndexRef.current : queueIndex
          segDursRef.current[activeIndex] = d
          const tot = segDursRef.current.reduce((a,b) => a+(b||0), 0); if (tot>0 && (!isASC3 || hasAllQueueDurations())) setTotalDur(tot)
          if (isASC3 && pendingQueueSeekRef.current !== null) {
            const seekOffset = Math.min(Math.max(0, pendingQueueSeekRef.current), Number.isFinite(d) && d > 0 ? d : pendingQueueSeekRef.current)
            e.currentTarget.currentTime = seekOffset
            setCurrentTime(seekOffset)
            setCumTime(completedRef.current + seekOffset)
            pendingQueueSeekRef.current = null
            if (pendingQueueSeekPlayRef.current) {
              pendingQueueSeekPlayRef.current = false
              e.currentTarget.play().catch(() => {})
            }
          }
          // 3s before intro ends → swap to background story music (only if playing)
          if (isPlaying && typeRef.current === 'intro' && bgMusicRef.current) schedSwap(bgMusicRef.current, VOL_STORY_MUSIC, 3)
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime; setCurrentTime(t); setCumTime(completedRef.current + t)
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => saveProgress(isASC3 ? completedRef.current + t : t), 5000)
          const rem = e.currentTarget.duration - t
          if (rem < 6 && rem > 0 && isASC3) {
            const ni = queueIndex + 1
            if (ni < queue.length && !nextSegRef.current) { const p = new Audio(queue[ni].url); p.preload='auto'; p.load(); nextSegRef.current = p }
          }
        }}
        onPlay={() => {
          setIsPlaying(true)
          if (!noMusicRef.current) duck()
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          // ── Welcome chain ────────────────────────────────────────────────
          if (inWelcomeRef.current) {
            const nextIdx = welcomeIndexRef.current + 1
            if (nextIdx < welcomeQueueRef.current.length) {
              // Play next welcome clip
              welcomeIndexRef.current = nextIdx
              if (audioRef.current) {
                audioRef.current.src = welcomeQueueRef.current[nextIdx]
                audioRef.current.load()
                audioRef.current.play().catch(() => {})
              }
            } else {
              // Welcome finished — mark played, start story
              inWelcomeRef.current = false
              if (user?.id) {
                supabase.from('users').update({ welcome_played: true }).eq('id', user.id).then(() => {})
              }
              // Start the actual story
              if (audioRef.current) {
	                if (isASC3 && queue.length) {
	                  activeQueueIndexRef.current = 0
	                  completedRef.current = 0
	                  audioRef.current.src = queue[0].url; audioRef.current.load()
	                  setSectionLabel(queue[0].label); typeRef.current = 'intro'
                } else if (audioSrc) {
                  audioRef.current.src = audioSrc; audioRef.current.load()
                }
                audioRef.current.play().catch(() => {})
              }
            }
            return
          }
          if (!isASC3) {
            setIsPlaying(false); saveProgress(duration, true)
            maybeAutoAdvanceFromNaturalEnd('natural_ended')
            return
          }
          const ni = queueIndex + 1
          const lastStory = typeRef.current === 'story' && ni < queue.length && queue[ni]?.type === 'outro'
          if (lastStory) {
            // 3s musical swell, then swap to outro music, then advance
            raise(VOL_SWELL)
            setTimeout(() => swapMusic(introMusicRef.current, VOL_INTRO_MUSIC, 2000), 500)
            setTimeout(() => advanceQueue(), 3000)
          } else advanceQueue()
        }}
        onCanPlay={() => {
          if (isASC3 && resumeRef.current > 0 && getQueueTotalSeconds() > 0) {
            seekASC3ToGlobalTime(resumeRef.current, false)
            resumeRef.current = 0
            return
          }
          if (!isASC3 && audioRef.current) {
            if (finalMixRetryResumeRef.current !== null) {
              audioRef.current.currentTime = finalMixRetryResumeRef.current
              finalMixRetryResumeRef.current = null
              if (finalMixRetryAutoplayRef.current) {
                finalMixRetryAutoplayRef.current = false
                audioRef.current.play().catch((err) => console.error('[player] final mix retry play failed:', err))
              }
              return
            }
            if (resumeRef.current > 0) audioRef.current.currentTime = resumeRef.current
          }
        }}
        onError={(e) => {
          if (!isASC3 && audioSrc && audioRef.current) {
            const audio = audioRef.current
            const retryAt = Math.max(0, Number.isFinite(audio.currentTime) ? audio.currentTime : currentTime)
            const shouldAutoplay = isPlaying || !audio.paused
            if (finalMixRetryCountRef.current < 2) {
              finalMixRetryCountRef.current += 1
              finalMixRetryResumeRef.current = retryAt
              finalMixRetryAutoplayRef.current = shouldAutoplay
              console.warn('[player] Final mix playback error; retrying source', {
                storyId,
                retry: finalMixRetryCountRef.current,
                retryAt,
                code: audio.error?.code,
                message: audio.error?.message,
              })
              audio.src = bustAudioUrl(audioSrc)
              audio.load()
            } else {
              console.error('[player] Final mix playback failed after retries:', {
                storyId,
                audioSrc,
                code: audio.error?.code,
                message: audio.error?.message,
              })
              setIsPlaying(false)
              setAudioErrorMessage('Couldn’t load audio. Try again.')
            }
            return
          }
          // If a segment fails to load, skip to next segment instead of dying
          if (isASC3 && queue.length > 0) {
            const failedUrl = queue[queueIndex]?.url || ''
            console.error('[player] Segment failed:', failedUrl, e)
            // For intro segments (sting/Belle), retry once before skipping
            const isIntro = queue[queueIndex]?.type === 'intro'
            if (isIntro && audioRef.current && !audioRef.current.dataset.retried) {
              console.warn('[player] Retrying intro segment:', failedUrl)
              audioRef.current.dataset.retried = '1'
              audioRef.current.src = failedUrl
              audioRef.current.load()
              audioRef.current.play().catch(() => advanceQueue('error_skip'))
            } else {
              if (audioRef.current) delete audioRef.current.dataset.retried
              const ni = queueIndex + 1
              if (ni < queue.length) {
                console.warn('[player] Skipping failed segment to next:', failedUrl)
                advanceQueue('error_skip')
              }
            }
          }
        }}
      />
      <audio ref={musicRef} loop style={{ display:'none' }} />

      {/* Header */}
      <div style={{ padding:'calc(10px + env(safe-area-inset-top)) 16px 10px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0f172a', borderBottom:'1px solid rgba(148,163,184,0.06)' }}>
        <button onClick={handleBack} style={{ width:'40px', height:'40px', borderRadius:'50%', backgroundColor:'#3b82f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div onClick={() => { disableAutoAdvanceForSession('navigation'); router.push('/home') }} style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ width:'28px', height:'28px', objectFit:'contain' }} />
          <span style={{ fontWeight:800, fontSize:'18px', color:'white' }}>Endless <span style={{ color:'#f97316' }}>Tales</span></span>
        </div>
        <div style={{ width:'40px', height:'40px', borderRadius:'50%', backgroundColor:'#f97316', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'16px', color:'white' }}>
          {user?.email?.[0]?.toUpperCase() || 'M'}
        </div>
      </div>

      {/* Cover */}
      <div style={{ width:'100vw', height:'min(46vh, 360px)', minHeight:'260px', flexShrink:0, overflow:'hidden' }}>
        {story.cover_url
          ? <img src={story.cover_url} alt={story.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#475569,#1e293b)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'64px' }}>🎧</div>}
      </div>

      {/* ── Info Pills — between cover and title ─────────────────────────── */}
      <div style={{ display:'flex', gap:'8px', justifyContent:'center', padding:'10px 20px 0' }}>

        {/* Author pill */}
        <button onClick={() => setActiveModal('author')} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 14px', borderRadius:'14px', border:'1px solid rgba(255,255,255,0.18)', background:'rgba(255,255,255,0.12)', color:'white', cursor:'pointer', minWidth:90 }}>
          <span style={{ fontSize:'12px', fontWeight:700, whiteSpace:'nowrap' }}>✍️ The Author</span>
          {authorData && (
            <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.8)', marginTop:'2px' }}>{(authorData.follower_count||0).toLocaleString()} followers</span>
          )}
        </button>

        {/* Narrator pill */}
        <button onClick={() => setActiveModal('narrator')} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 14px', borderRadius:'14px', border:'1px solid rgba(255,255,255,0.18)', background:'rgba(255,255,255,0.12)', color:'white', cursor:'pointer', minWidth:90 }}>
          <span style={{ fontSize:'12px', fontWeight:700, whiteSpace:'nowrap' }}>🎙️ The Narrator</span>
          {narratorData && (
            <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.8)', marginTop:'2px' }}>{(narratorData.follower_count||0).toLocaleString()} followers</span>
          )}
        </button>

        {/* Read It pill */}
        <button onClick={() => setActiveModal('prose')} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 14px', borderRadius:'14px', border:'1px solid rgba(255,255,255,0.18)', background:'rgba(255,255,255,0.12)', color:'white', cursor:'pointer', minWidth:90 }}>
          <span style={{ fontSize:'12px', fontWeight:700, whiteSpace:'nowrap' }}>📖 Read It</span>
          {proseAvailable && <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.6)', marginTop:'2px' }}>Available</span>}
        </button>

      </div>

      {/* Controls */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'10px 20px calc(14px + env(safe-area-inset-bottom))', gap:'10px', minHeight:0 }}>
        <div>
          {playerSeriesTitle && (
            <div style={{ color:'white', fontSize:'22px', fontWeight:900, margin:'0 0 6px', textAlign:'center', lineHeight:1.08, fontFamily:'Inter, system-ui, sans-serif' }}>{playerSeriesTitle}</div>
          )}
          {(story as any).episode_number && (
            <p style={{ color:'white', fontSize:'13px', margin:'0 0 2px', textAlign:'center', fontWeight:700, opacity:0.9 }}>Episode {(story as any).episode_number}</p>
          )}
          <h1 style={{ fontSize: playerSeriesTitle ? '18px' : '20px', fontWeight:800, margin:0, color:'white', textAlign:'center', lineHeight:1.2 }}>{story.title}</h1>
          <p style={{ color:'white', fontSize:'13px', margin:'3px 0 0', textAlign:'center', opacity:0.7 }}>by {story.author || 'Endless Tales'}</p>
          {isASC3 && sectionLabel && isPlaying && (
            <p style={{ color:'#f97316', fontSize:'11px', margin:'4px 0 0', textAlign:'center', fontWeight:600 }}>
              🎙️ {sectionLabel} · {queueIndex+1}/{queue.length}
            </p>
          )}
          {/* Now Playing overlay — shown during playlist advance */}
          {nowPlayingLabel && (
            <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'rgba(0,0,0,0.85)', borderRadius:16, padding:'20px 32px', textAlign:'center', zIndex:999, backdropFilter:'blur(8px)', border:'1px solid rgba(249,115,22,0.3)' }}>
              <div style={{ color:'#f97316', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Up Next</div>
              <div style={{ color:'white', fontSize:18, fontWeight:800 }}>{nowPlayingLabel}</div>
            </div>
          )}
        </div>
        {autoAdvanceCandidate && !stillListeningPrompt && (
          <div style={{ border:'1px solid rgba(34,197,94,0.28)', background:'rgba(34,197,94,0.08)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'12px', fontWeight:700, margin:'0 0 4px' }}>Up Next</p>
            <p style={{ color:'rgba(255,255,255,0.86)', fontSize:'13px', margin:'0 0 10px' }}>{autoAdvanceCandidate.story.title}</p>
            <p style={{ color:'#86efac', fontSize:'12px', fontWeight:700, margin:'0 0 4px' }}>{autoAdvanceReasonCopy}</p>
            <p style={{ color:'rgba(255,255,255,0.58)', fontSize:'11px', margin:'0 0 10px' }}>Starting in a moment...</p>
            <div style={{ display:'flex', gap:'8px' }}>
              <button
                onClick={() => {
                  if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
                  unrequestedAutoStartsRef.current += 1
                  const isSeriesContinuation = autoAdvanceCandidate.reason === 'next_series_episode'
                  router.push(`/player/${autoAdvanceCandidate.story.id}?autoplay=1&${isSeriesContinuation ? 'seriesContinue=1' : 'autoAdvance=1'}`)
                }}
                style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'none', background:'#22c55e', color:'white', fontSize:'13px', fontWeight:800, cursor:'pointer' }}
              >Play now</button>
              <button
                onClick={() => {
                  disableAutoAdvanceForSession('stop')
                  isAdvancingRef.current = false
                }}
                style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.06)', color:'white', fontSize:'13px', fontWeight:700, cursor:'pointer' }}
              >Stop</button>
            </div>
          </div>
        )}
        {stillListeningPrompt && autoAdvanceCandidate && (
          <div style={{ border:'1px solid rgba(249,115,22,0.32)', background:'rgba(249,115,22,0.1)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:800, margin:'0 0 4px' }}>Still listening?</p>
            <p style={{ color:'rgba(255,255,255,0.78)', fontSize:'12px', margin:'0 0 10px' }}>Continue with {autoAdvanceCandidate.story.title}?</p>
            <div style={{ display:'flex', gap:'8px' }}>
              <button
                onClick={() => {
                  if (stillListeningTimerRef.current) clearTimeout(stillListeningTimerRef.current)
                  setStillListeningPrompt(false)
                  startAutoAdvanceTo(autoAdvanceCandidate)
                }}
                style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'none', background:'#f97316', color:'white', fontSize:'13px', fontWeight:800, cursor:'pointer' }}
              >Continue</button>
              <button
                onClick={() => {
                  disableAutoAdvanceForSession('stop')
                  isAdvancingRef.current = false
                }}
                style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.06)', color:'white', fontSize:'13px', fontWeight:700, cursor:'pointer' }}
              >Stop</button>
            </div>
          </div>
        )}
        {catalogExhausted && (
          <div style={{ border:'1px solid rgba(148,163,184,0.24)', background:'rgba(148,163,184,0.08)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:800, margin:'0 0 4px' }}>Catalog exhausted</p>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'12px', margin:0 }}>No untouched story is ready to play next.</p>
          </div>
        )}
        {audioErrorMessage && (
          <div style={{ border:'1px solid rgba(249,115,22,0.28)', background:'rgba(249,115,22,0.08)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:700, margin:'0 0 10px' }}>{audioErrorMessage}</p>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => { disableAutoAdvanceForSession('navigation'); window.location.reload() }} style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'none', background:'#f97316', color:'white', fontSize:'13px', fontWeight:800, cursor:'pointer' }}>Try again</button>
              <button onClick={() => { disableAutoAdvanceForSession('navigation'); returnToSource('/library') }} style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.06)', color:'white', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>{safeReturnUrl ? 'Back to Approval' : 'Back to Library'}</button>
            </div>
          </div>
        )}
        {autoplayBlocked && (
          <div style={{ border:'1px solid rgba(34,197,94,0.28)', background:'rgba(34,197,94,0.08)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:800, margin:'0 0 4px' }}>Ready to continue</p>
            <p style={{ color:'rgba(255,255,255,0.72)', fontSize:'12px', margin:'0 0 10px' }}>Tap to start the next episode.</p>
            <button
              onClick={() => {
                audioRef.current?.play()
                  .then(() => { setIsPlaying(true); setAutoplayBlocked(false) })
                  .catch(() => setAutoplayBlocked(true))
              }}
              style={{ width:'100%', padding:'10px 12px', borderRadius:'10px', border:'none', background:'#22c55e', color:'white', fontSize:'13px', fontWeight:800, cursor:'pointer' }}
            >Tap to continue</button>
          </div>
        )}
        <div>
          <div
            ref={progressBarRef}
            onClick={handleSeek}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
            style={{ height:'22px', display:'flex', alignItems:'center', cursor:'pointer', touchAction:'none' }}
          >
            <div style={{ height:'6px', width:'100%', backgroundColor:'rgba(255,255,255,0.15)', borderRadius:'3px', overflow:'hidden' }}>
              <div style={{ height:'100%', backgroundColor:'#f97316', width:`${pct}%`, transition:'width 0.1s', borderRadius:'3px' }} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'white', marginTop:'5px' }}>
            <span style={{ opacity:0.9 }}>{fmtMin(effTotal)} total</span>
            <span style={{ opacity:0.9 }}>{fmtMin(Math.max(0, effTotal - effCur))} left</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={handlePlayPause} style={{ flex:2, padding:'16px', borderRadius:'14px', border:'none', fontSize:'16px', fontWeight:700, cursor:'pointer', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color:'white' }}>
            {isPlaying ? '⏸ Pause' : hasProgress ? '▶ Continue' : '▶ Play'}
          </button>
          {hasProgress && (
            <button onClick={() => {
                disableAutoAdvanceForSession('stop')
                if (!isASC3 && story?.audio_url) {
                  resumeRef.current = 0
                  setHasProgress(false)
                  const a = audioRef.current
                  if (a) { a.currentTime = 0; a.play().catch(() => {}) }
                  setCurrentTime(0); setCumTime(0); setIsPlaying(true)
                } else {
                  completedRef.current=0; activeQueueIndexRef.current=0; setQueueIndex(0); setSectionLabel(queue[0]?.label||''); typeRef.current='intro'
                  const m=musicRef.current; if(m){m.src=introMusicRef.current;m.loop=true;m.volume=0}
                  if(audioRef.current){audioRef.current.src=queue[0]?.url||'';audioRef.current.load()}
                  setTimeout(()=>{audioRef.current?.play().catch(()=>{});const mu=musicRef.current;if(mu){mu.play().catch(()=>{});animVol(mu,0,VOL_INTRO_MUSIC,2000)};setIsPlaying(true)},100)
                  setCurrentTime(0); setCumTime(0)
                }
              }} style={{ flex:1, padding:'16px', borderRadius:'14px', border:'none', fontSize:'13px', fontWeight:600, cursor:'pointer', backgroundColor:'rgba(255,255,255,0.08)', color:'white' }}>Start Over</button>
          )}
        </div>
        {!hasProgress && !((story as any)?.episode_number && (story as any).episode_number > 1) && (
          <button onClick={handleNotForMe} style={{ alignSelf:'center', marginTop:'-2px', padding:'6px 12px', border:'none', background:'transparent', color:'rgba(255,255,255,0.45)', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>Not for me</button>
        )}
      </div>

      {/* ── Info Modal Sheet ─────────────────────────────────────────────────── */}
      {activeModal && (
        <div
          onClick={() => setActiveModal(null)}
          style={{ position:'fixed', inset:0, background:'#000', zIndex:200, display:'flex', alignItems:'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width:'100%', height:'100dvh', maxHeight:'100dvh', background: activeModal === 'prose' ? (proseDark ? '#0f172a' : '#faf7f2') : '#020617', borderRadius:'0', border:'none', display:'flex', flexDirection:'column', overflow:'hidden', transition:'background 0.2s', position:'relative' }}
          >
            {/* Modal handle — hidden in prose */}
            {activeModal !== 'prose' && (
              <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 4px' }}>
                <div style={{ width:'40px', height:'4px', borderRadius:'2px', background:'rgba(148,163,184,0.3)' }} />
              </div>
            )}

            {/* Modal header — hidden in prose (prose has its own controls) */}
            {activeModal !== 'prose' && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 20px 16px' }}>
                <span style={{ fontSize:'16px', fontWeight:800, color:'white' }}>
                  {activeModal === 'author'   && `✍️ About ${authorData?.name || story.author || 'the Author'}`}
                  {activeModal === 'narrator' && `🎙️ About ${narratorData?.name || (story as any).narrator_voice_name || 'the Narrator'}`}
                </span>
                <button onClick={() => setActiveModal(null)} style={{ background:'rgba(148,163,184,0.15)', border:'none', borderRadius:'50%', width:'32px', height:'32px', color:'#94a3b8', fontSize:'18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
              </div>
            )}

            {/* Modal body */}
            <div style={{ overflowY: activeModal === 'prose' ? 'hidden' : 'auto', padding: activeModal === 'prose' ? '0' : '0 20px 32px', flex:1, display:'flex', flexDirection:'column' }}>

              {/* AUTHOR */}
              {activeModal === 'author' && (
                authorData ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                    {/* Portrait + follow row */}
                    <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                      {authorData.photo_url
                        ? <img src={authorData.photo_url} alt={authorData.name} style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(249,115,22,0.4)', flexShrink:0 }} />
                        : <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>✍️</div>
                      }
                      <div style={{ flex:1 }}>
                        <p style={{ color:'white', fontSize:'17px', fontWeight:800, margin:'0 0 2px' }}>{authorData.name}</p>
                        <p style={{ color:'#64748b', fontSize:'12px', margin:'0 0 8px' }}>{(authorData.follower_count || 0).toLocaleString()} followers</p>
                        <button
                          onClick={async () => {
                            if (!user) { router.push('/signin'); return }
                            let existing = null
                            try { const r = await supabase.from('user_follows').select('id').eq('user_id', user.id).eq('entity_type', 'author').eq('entity_id', (story as any).author_id).single(); existing = r.data } catch(_) {}
                            if (existing) {
                              await supabase.from('user_follows').delete().eq('user_id', user.id).eq('entity_type', 'author').eq('entity_id', (story as any).author_id)
                              setAuthorData((p: any) => ({ ...p, _following: false }))
                            } else {
                              await supabase.from('user_follows').insert({ user_id: user.id, entity_type: 'author', entity_id: (story as any).author_id })
                              setAuthorData((p: any) => ({ ...p, _following: true }))
                            }
                          }}
                          style={{ padding:'6px 16px', borderRadius:'999px', border: authorData._following ? '1px solid #f97316' : 'none', background: authorData._following ? 'transparent' : '#f97316', color: authorData._following ? '#f97316' : 'white', fontSize:'12px', fontWeight:700, cursor:'pointer' }}
                        >{authorData._following ? '✓ Following' : '+ Follow'}</button>
                      </div>
                    </div>
                    <p style={{ color:'#f97316', fontSize:'12px', fontWeight:700, margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>{authorData.description}</p>
                    {authorData.bio && <p style={{ color:'#cbd5e1', fontSize:'14px', lineHeight:1.7, margin:0 }}>{authorData.bio}</p>}
                    {authorData.techniques && (
                      <div>
                        <p style={{ color:'#64748b', fontSize:'11px', fontWeight:700, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.08em' }}>Writing Style</p>
                        <p style={{ color:'#94a3b8', fontSize:'13px', lineHeight:1.6, margin:0 }}>{authorData.techniques}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color:'#475569', fontSize:'14px', textAlign:'center', marginTop:'24px' }}>Author profile coming soon.</p>
                )
              )}

              {/* NARRATOR */}
              {activeModal === 'narrator' && (
                narratorData ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                    {/* Portrait + follow row */}
                    <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                      {narratorData.photo_url
                        ? <img src={narratorData.photo_url} alt={narratorData.name} style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(249,115,22,0.4)', flexShrink:0 }} />
                        : <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>🎙️</div>
                      }
                      <div style={{ flex:1 }}>
                        <p style={{ color:'white', fontSize:'17px', fontWeight:800, margin:'0 0 2px' }}>{narratorData.name}</p>
                        <p style={{ color:'#64748b', fontSize:'12px', margin:'0 0 8px' }}>{(narratorData.follower_count || 0).toLocaleString()} followers</p>
                        <button
                          onClick={async () => {
                            if (!user) { router.push('/signin'); return }
                            const nvId = (story as any).narrator_voice_id
                            const { data: nvRow } = await supabase.from('narrator_voices').select('id').eq('elevenlabs_voice_id', nvId).single().catch(() => ({ data: null }))
                            if (!nvRow) return
                            const { data: existing } = await supabase.from('user_follows').select('id').eq('user_id', user.id).eq('entity_type', 'narrator').eq('entity_id', nvRow.id).single().catch(() => ({ data: null }))
                            if (existing) {
                              await supabase.from('user_follows').delete().eq('user_id', user.id).eq('entity_type', 'narrator').eq('entity_id', nvRow.id)
                              setNarratorData((p: any) => ({ ...p, _following: false }))
                            } else {
                              await supabase.from('user_follows').insert({ user_id: user.id, entity_type: 'narrator', entity_id: nvRow.id })
                              setNarratorData((p: any) => ({ ...p, _following: true }))
                            }
                          }}
                          style={{ padding:'6px 16px', borderRadius:'999px', border: narratorData._following ? '1px solid #f97316' : 'none', background: narratorData._following ? 'transparent' : '#f97316', color: narratorData._following ? '#f97316' : 'white', fontSize:'12px', fontWeight:700, cursor:'pointer' }}
                        >{narratorData._following ? '✓ Following' : '+ Follow'}</button>
                      </div>
                    </div>
                    <p style={{ color:'#f97316', fontSize:'12px', fontWeight:700, margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>{narratorData.gender} · {narratorData.accent} accent · {narratorData.tone} tone</p>
                    {narratorData.bio && <p style={{ color:'#cbd5e1', fontSize:'14px', lineHeight:1.7, margin:0 }}>{narratorData.bio}</p>}
                    {narratorData.tone_tags?.length > 0 && (
                      <div>
                        <p style={{ color:'#64748b', fontSize:'11px', fontWeight:700, margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'0.08em' }}>Best For</p>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                          {narratorData.tone_tags.map((g: string) => (
                            <span key={g} style={{ padding:'4px 10px', borderRadius:'999px', background:'rgba(249,115,22,0.15)', color:'#f97316', fontSize:'12px', fontWeight:600 }}>{g}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color:'#475569', fontSize:'14px', textAlign:'center', marginTop:'24px' }}>Narrator profile coming soon.</p>
                )
              )}

              {/* PROSE — full-screen ebook reader */}
              {activeModal === 'prose' && (
                proseAvailable ? (
                  <div style={{ position:'relative', flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>


                    {/* Sticky header: × | title | book */}
                    <div style={{ flexShrink:0, display:'flex', alignItems:'center', padding:'10px 12px', borderBottom: proseDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.07)', background: proseDark ? '#0f172a' : '#faf7f2' }}>
                      <button onClick={() => setActiveModal(null)} style={{ width:34, height:34, flexShrink:0, borderRadius:'50%', border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.13)', background: proseDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: proseDark ? 'rgba(255,255,255,0.7)' : '#555', fontSize:'17px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                      <div style={{ flex:1, textAlign:'center', padding:'0 8px' }}>
                        <div style={{ fontSize:'15px', fontWeight:800, color: proseDark ? 'white' : '#1a1a1a', fontFamily:'Inter, system-ui, sans-serif' }}>{proseBookTitle}</div>
                        <div style={{ fontSize:'11px', color: proseDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)', marginTop:1, fontFamily:'Inter, system-ui, sans-serif' }}>{isSeriesReadIt ? `${seriesProseChapters.length} chapters` : `by ${story.author || 'Endless Tales'}`}</div>
                      </div>
                      <div style={{ position:'relative', flexShrink:0 }}>
                      <button
                        onClick={() => { setProseControlsOpen(o => !o); setProseHintSeen(true) }}
                        style={{ width:34, height:34, borderRadius:'50%', border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.13)', background: proseDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', fontSize:17, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                      >📖</button>
                      {proseControlsOpen && (
                        <div style={{ position:'absolute', top:42, right:0, background: proseDark ? '#1e293b' : '#fff', border: proseDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:14, minWidth:190, boxShadow:'0 6px 24px rgba(0,0,0,0.18)', zIndex:40 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ fontSize:'12px', fontWeight:600, color: proseDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}>Text Size</span>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <button onClick={() => setProseFontSize(s => Math.max(13, s - 1))} style={{ width:32, height:32, borderRadius:6, border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', background:'transparent', color: proseDark ? 'white' : '#222', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>A−</button>
                              <span style={{ fontSize:'12px', color: proseDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', minWidth:22, textAlign:'center' }}>{proseFontSize}</span>
                              <button onClick={() => setProseFontSize(s => Math.min(26, s + 1))} style={{ width:32, height:32, borderRadius:6, border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', background:'transparent', color: proseDark ? 'white' : '#222', fontSize:'17px', fontWeight:700, cursor:'pointer' }}>A+</button>
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ fontSize:'12px', fontWeight:600, color: proseDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}>Theme</span>
                            <button onClick={() => setProseDark(d => !d)} style={{ padding:'5px 12px', borderRadius:'999px', border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)', background: proseDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', color: proseDark ? 'white' : '#333', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>{proseDark ? '☀️ Light' : '🌙 Dark'}</button>
                          </div>
                        </div>
                      )}
                    </div>

                    </div>
                    {/* Scrollable text */}
                    <div
                      ref={proseScrollRef}
                      onClick={() => proseControlsOpen && setProseControlsOpen(false)}
                      onScroll={() => {
                        const el = proseScrollRef.current
                        if (!el || el.scrollHeight <= el.clientHeight) return
                        try { localStorage.setItem('et_prose_'+storyId, String(el.scrollTop)) } catch(_) {}
                        const pct = el.scrollTop / (el.scrollHeight - el.clientHeight)
                        const total = isSeriesReadIt ? seriesProseChapters.length : standaloneProseParagraphs.length
                        setProsePage(Math.max(1, Math.min(total, Math.round(pct * total) || 1)))
                      }}
                      style={{ flex:1, overflowY:'auto', padding:'20px 24px 72px', fontFamily:'Literata, Georgia, "Times New Roman", serif' }}
                    >
                      {isSeriesReadIt ? (
                        <>
                          <h1 style={{ fontSize: proseFontSize + 9 + 'px', lineHeight: 1.12, color: proseDark ? '#f8f1e7' : '#1a1a1a', margin:'0 0 28px', letterSpacing:0, fontWeight:700 }}>{proseBookTitle}</h1>
                          {seriesProseChapters.map((chapter, chapterIndex) => (
                            <section key={chapter.id} style={{ marginTop: chapterIndex === 0 ? 0 : 42, paddingTop: chapterIndex === 0 ? 0 : 28, borderTop: chapterIndex === 0 ? 'none' : proseDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.12)' }}>
                              <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:'11px', fontWeight:900, color: proseDark ? '#fb923c' : '#9a3412', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>
                                Chapter {chapterIndex + 1}
                              </div>
                              <h2 style={{ fontSize: proseFontSize + 5 + 'px', lineHeight:1.18, color: proseDark ? '#f8f1e7' : '#1a1a1a', margin:'0 0 22px', letterSpacing:0, fontWeight:700 }}>
                                {chapter.title}
                              </h2>
                              {chapter.prose_text.split('\n\n').filter(Boolean).map((para: string, i: number) => (
                                <p key={`${chapter.id}-${i}`} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? '#e2d9c8' : '#2c2c2c', margin:'0 0 20px', textIndent: i === 0 ? 0 : '1.5em', letterSpacing:'0.01em' }}>{para}</p>
                              ))}
                            </section>
                          ))}
                        </>
                      ) : standaloneProseParagraphs.map((para: string, i: number) => {
                        if (i === 0) {
                          const first = para.charAt(0)
                          const rest  = para.slice(1)
                          return (
                            <p key={0} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? '#e2d9c8' : '#2c2c2c', margin:'0 0 20px', letterSpacing:'0.01em', overflow:'hidden' }}>
                              <span style={{ float:'left', fontSize:(proseFontSize * 3.6) + 'px', lineHeight:0.82, fontWeight:700, color: proseDark ? '#e2d9c8' : '#1a1a1a', marginRight:'5px', marginTop:'4px', fontFamily:'Literata, Georgia, serif' }}>{first}</span>
                              {rest}
                            </p>
                          )
                        }
                        return <p key={i} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? '#e2d9c8' : '#2c2c2c', margin:'0 0 20px', textIndent:'1.5em', letterSpacing:'0.01em' }}>{para}</p>
                      })}
                    </div>

                    {/* Page counter — pinned bottom */}
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:52, display:'flex', alignItems:'center', justifyContent:'center', background: proseDark ? 'linear-gradient(to top,#0f172a 55%,transparent)' : 'linear-gradient(to top,#faf7f2 55%,transparent)', pointerEvents:'none' }}>
                      <span style={{ fontSize:'13px', fontWeight:600, color: proseDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)', letterSpacing:'0.04em' }}>
                        {prosePage} of {Math.max(1, isSeriesReadIt ? seriesProseChapters.length : standaloneProseParagraphs.length)}
                      </span>
                    </div>

                  </div>
                ) : (
                  <p style={{ color:'#475569', fontSize:'14px', textAlign:'center', marginTop:'24px' }}>Prose version coming soon.</p>
                )
              )}

            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
