'use client'

import * as Sentry from '@sentry/nextjs'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { trackPlayStart, trackPlayEnd, trackSpuriousEndedRecovered, trackCardWallView, type PlayStartSource } from '@/lib/analytics'
import { useAuth } from '@/contexts/AuthContext'
import ReviewModal from '@/components/ReviewModal'
import PlayerTransport from './PlayerTransport'
import { getPlayerGenres, shouldAutoStartPlayer } from '@/lib/playerControls'
import InstallAppBanner from '@/components/InstallAppBanner'
import { requestInstallReoffer } from '@/lib/installReoffer'
import { welcomeClipCompleted } from '@/lib/welcomePlayback'
import {
  attachMediaSession, claimMediaSession, refreshMediaHandlers, releaseMediaSession, setMediaPlaybackState,
  setMediaPosition, updateMediaTrack, MEDIA_ALBUM, SEEK_BACKWARD_SECONDS, SEEK_FORWARD_SECONDS, type MediaActionHandlers,
} from '@/lib/mediaSession'
import { isEntitled } from '@/lib/entitlement'
// QUEUE-OFFLINE-001 (Marc, 2026-10-04): playlist-mode "started" flag (Play -> Continue)
// and per-episode cleanup once an episode finishes (removed from playlist + offline store).
import { markPlaylistStarted, removeEpisodeFromActivePlaylist } from '@/lib/playlistState'
import { deleteEpisode } from '@/lib/offline/store'
import type { AutoAdvanceCandidate, AutoAdvanceDisabledReason, PlayerMode, PlayerStory } from './playerTypes'
import { clearLocalPlayerProgress, getLocalPlayerProgress, mergePlayerProgress, saveLocalPlayerProgress } from '@/lib/playerProgress'
import { MONTHLY_PRICE_LABEL } from '@/lib/pricing'
import {
  flushReadingProgressKeepalive,
  loadReadingProgress,
  saveReadingProgress,
  type ReadingProgress,
} from '@/lib/readingProgress'

interface QueueItem { url: string; type: 'intro' | 'story' | 'outro'; label: string }

// ── VOLUME LEVELS ─────────────────────────────────────────────────────────────
// All values 0–1. Music stays BELOW these while voice is playing.
const VOL_INTRO_MUSIC = 0.06   // under Belle B announcer  (6%)
const VOL_STORY_MUSIC = 0.06   // under story voices        (6%)
const VOL_SWELL       = 0.10   // brief rise between lines  (10%)
const DUCK_TARGET     = 0.015  // music while voice is active (1.5%)
const DUCK_MS         = 250    // ms to duck
const RAISE_MS        = 600    // ms to raise after voice ends
const AUTO_ADVANCE_STORY_SELECT = 'id,title,author,genre,audio_url,cover_url,duration_mins,episode_number,series_id,series_name,is_free,prose_text,content_start_ms,content_end_ms,author_id,narrator_voice_id,narrator_voice_name,status,is_hidden,published_on'
const ADMIN_REVIEW_EMAILS = new Set(['marc@endless-tales.com', 'm.postlewaite@gmail.com'])

// ── ORION-PLAYER-ENDSTATE-001 §3 — RE-ARM TOGGLE (Marc ruling A, 2026-07-15) ──
// RULED A by Marc (2026-07-15 16:40 EDT, msg 2634): in-page resume after a
// manual pause RE-ARMS auto-advance. Rationale (spec log): hands-free is the
// product promise; a pause is an interruption, resume is the intent signal;
// the 10-second countdown remains the escape hatch. This CONSCIOUSLY
// SUPERSEDES the pause-path spec accepted 2026-07-15 AM (soak-validated
// 2026-07-14): pause no longer disarms for the whole session once resumed.
// Scope guard below: re-arm clears ONLY the 'manual_pause' disable reason —
// an explicit auto-advance Stop is never silently re-armed.
// One-line switch only; do not add further conditions without a ruling.
const REARM_AUTO_ADVANCE_ON_RESUME = true

interface CanonicalPlayerProps {
  storyId: string
  resumeParam?: string | null
  mode?: PlayerMode
  // MARC-PLAYLIST-HANDSFREE-001 (2026-10-07): when provided, a playlist
  // natural-end advance calls this with the next story's id instead of
  // router.push()-ing to /player/[nextId]. That keeps this same component
  // instance — and critically the same <audio> DOM element — mounted
  // across the whole playlist run. A full page navigation unmounts and
  // recreates the <audio> element, and mobile Safari/Chrome require a
  // fresh user gesture to autoplay a brand-new media element; they do NOT
  // require one to keep playing on an element that was already playing
  // under an earlier gesture. Only /player/playlist/page.tsx (the actual
  // playlist entry point) supplies this; without it, behavior is unchanged.
  onAdvanceInPlace?: (nextId: string) => void
}

export default function CanonicalPlayer({ storyId, resumeParam = null, mode = 'story', onAdvanceInPlace }: CanonicalPlayerProps) {
  const router  = useRouter()
  const { user, session, loading: authLoading } = useAuth()
  const userEmail = String(user?.email || '').trim().toLowerCase()
  const [returnContext, setReturnContext] = useState({ returnUrl: '', approvalReview: false })
  const safeReturnUrl = returnContext.returnUrl

  // BELL-ONBOARD-004: consolidated onboard state — initialized false so SSR and hydration match.
  // Set to true in a useEffect so the 'Continue your story' button only appears after mount,
  // eliminating the hydration mismatch where isOnboarding (window-dependent const) was false
  // on the server but true on the client, causing the conditional to flip unreliably.
  const [onboardActive, setOnboardActive] = useState(false)
  const isOnboardingRef = useRef(false) // readable in async load() without adding deps
  const [onboardWelcomeUrl, setOnboardWelcomeUrl] = useState<string | null>(null)
  const onboardAudioRef = useRef<HTMLAudioElement | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)  // voice
  const musicRef = useRef<HTMLAudioElement>(null)  // single music track
  const nextSegRef = useRef<HTMLAudioElement | null>(null)
  const preloadRef = useRef<HTMLAudioElement | null>(null)

  const volTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const schedTimer = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const resumeRef  = useRef(0)
  const typeRef    = useRef<'intro' | 'story' | 'outro'>('intro')
  const switchingRef = useRef(false) // true while swapping music src
  const analyticsTrackedRef = useRef(false) // true after first play tracked
  const finalMixRetryCountRef = useRef(0)
  const finalMixRetryResumeRef = useRef<number | null>(null)
  const finalMixRetryAutoplayRef = useRef(false)
  const seriesContinueAutoplayAttemptedRef = useRef(false)
  const reviewPromptHandledRef = useRef(false)
  const lastLocalProgressWriteRef = useRef(0)

  const [story, setStory]       = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [hasProgress, setHasProgress] = useState(false)
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false)
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
  // RETENTION-PATH-001: re-offer install banner at most once per completed story session
  const installReofferFiredRef = useRef(false)
  const activeQueueIndexRef = useRef(0)
  const pendingQueueSeekRef = useRef<number | null>(null)
  const pendingQueueSeekPlayRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const playlistRef      = useRef<{id:string,episode_number:number}[]>([])
  const playlistIndexRef = useRef<number>(-1)
  // MARC-PLAYLIST-HANDSFREE-001: set true right before an in-place advance;
  // consumed by the autoplay effect once the new story's audio is ready.
  const playlistAutoplayPendingRef = useRef(false)
  // MARC-PLAYLIST-FRESH-001 (2026-10-07): true when this story is becoming
  // the playlist's active item for the FIRST time in this run (a brand-new
  // playlist launch, or an advance to a different item) — as opposed to
  // re-entering the item the run was already on (a pause/stop and return).
  // Only the former should start at 0:00; see the "Load playlist from
  // localStorage" effect for how this gets set.
  const forceFreshStartRef = useRef(false)
  const [nowPlayingLabel, setNowPlayingLabel] = useState<string | null>(null)
  const [totalDur, setTotalDur] = useState(0)
  const welcomeQueueRef = useRef<string[]>([])  // [welcome_A, name_clip, welcome_B]
  const welcomeIndexRef = useRef(0)
  const inWelcomeRef    = useRef(false)
  const [cumTime, setCumTime]   = useState(0)
  const [audioErrorMessage, setAudioErrorMessage] = useState('')
  // ORION-PLAYER-STALL-001: true while playback is data-starved (button shows
  // Buffering… instead of lying with a playing state).
  const [isBuffering, setIsBuffering] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [showSeriesContinueOverlay, setShowSeriesContinueOverlay] = useState(false)
  const isAdvancingRef = useRef(false)
  const mountedRef = useRef(false)
  const autoAdvanceEnabledRef = useRef(true)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stillListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unrequestedAutoStartsRef = useRef(0)
  const [autoAdvanceCandidate, setAutoAdvanceCandidate] = useState<AutoAdvanceCandidate | null>(null)
  const [catalogExhausted, setCatalogExhausted] = useState(false)
  // ORION-PLAYER-ENDSTATE-001 (2026-07-15): true only after a TRUSTED natural
  // end (the onEnded spurious-ended guards have already passed). Drives the
  // completed end-state card (Play Again / Next episode) and the CTA label —
  // a finished episode must never show "▶ Continue" at 0.0 min left.
  const [playbackEnded, setPlaybackEnded] = useState(false)
  // Display-only next-episode candidate for the end-state card when
  // auto-advance is disarmed (e.g. after a manual pause). Fetched via the same
  // live-validated fetchDirectSeriesAutoAdvanceCandidate() query; navigation
  // from it is ALWAYS a user gesture — never a timer.
  const [endStateCandidate, setEndStateCandidate] = useState<AutoAdvanceCandidate | null>(null)
  const [stillListeningPrompt, setStillListeningPrompt] = useState(false)
  const [autoAdvanceDisabledReason, setAutoAdvanceDisabledReason] = useState<AutoAdvanceDisabledReason | null>(null)
  const [showReview, setShowReview] = useState(false)

  // ── POST-TRIAL-BELLE-001: post-trial experience state ─────────────────────
  // isLapsedUser: authenticated user whose trial has ended (subscription_ends_at
  // is in the past AND subscription_type !== 'active'). These users get a taste
  // instead of an immediate redirect. Active subscribers and in-trial users
  // (subscription_type === 'active') are NEVER lapsed — they are served before
  // the lapsed check is reached. Unauthenticated users go to signin.
  const [isLapsedUser, setIsLapsedUser] = useState(false)
  const isLapsedRef = useRef(false) // mirror for onTimeUpdate / seekToClientX event handlers
  // trialWallVisible: true when the wall overlay is shown
  const [trialWallVisible, setTrialWallVisible] = useState(false)
  // trialWallType: which wall variant ('standalone' = 60s cutoff, 'series_ep1_end' = full EP1 played,
  // 'series_ep2plus' = blocked immediately).
  // GO-REROUTE-V2 (Marc, 2026-10-05): 'onboard_card_capture' is a NEW, DISTINCT
  // variant — it is NOT a lapsed-user wall. It fires for an in-trial onboarding
  // user with NO card on file when they finish EP2, and its CTA starts hosted
  // Checkout to vault a card. All existing lapsed-user variants above are
  // untouched; this one never changes their trigger or copy.
  const [trialWallType, setTrialWallType] = useState<'standalone' | 'series_ep1_end' | 'series_ep2plus' | 'onboard_card_capture' | null>(null)
  // Belle audio URL for the wall (loaded asynchronously — wall shows immediately without it)
  const [belleWallAudioUrl, setBelleWallAudioUrl] = useState<string | null>(null)
  const belleWallAudioRef = useRef<HTMLAudioElement | null>(null)
  const trialWallFiredRef = useRef(false) // prevent duplicate 60s triggers

  // GO-REROUTE-V2: onboarding no-card detection + card-wall state.
  // noCardTrialRef is true ONLY for an in-trial user who signed up email-only at
  // /go (subscription_type === 'trial', no stripe_subscription_id) — i.e. no card
  // vaulted yet. Set during load() from the same users-table read that decides
  // access. Card-on-file users (subscription_type 'active' / stripe_subscription_id
  // present) leave this false, so they NEVER see the card wall.
  const noCardTrialRef = useRef(false)
  const onboardCardWallFiredRef = useRef(false) // prevent duplicate EP2-end fires
  const [onboardCheckoutError, setOnboardCheckoutError] = useState(false)
  const [onboardCheckoutPending, setOnboardCheckoutPending] = useState(false)

  // ── Pills state ────────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<'author' | 'narrator' | 'prose' | null>(null)
  const [proseDark, setProseDark] = useState(false)
  // MARC-EBOOK-FONTSIZE-001 (2026-10-07): text size is a per-user default that
  // carries across every story (until the user changes it again), not a
  // per-story setting — see the load/persist effects below. Dark/light mode
  // is deliberately left out of this: it stays exactly as before, session-only.
  const [proseFontSize, setProseFontSize] = useState(17)
  const [prosePage, setProsePage] = useState(1)
  const [proseControlsOpen, setProseControlsOpen] = useState(false)
  const [proseHintVisible, setProseHintVisible] = useState(false)
  const [proseHintSeen, setProseHintSeen] = useState(false)
  const [proseResumeToast, setProseResumeToast] = useState<{ pageNumber: number; totalPages: number } | null>(null)
  const [readingProgressState, setReadingProgressState] = useState<ReadingProgress | null>(null)
  const proseScrollRef = useRef<HTMLDivElement>(null)
  const proseSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proseResumeAppliedRef = useRef(false)
  const proseLastSavedKeyRef = useRef('')
  // Marc 2026-10-04: "Read eBook" buttons on the series/single-story detail
  // pages navigate here with ?openReader=1 instead of reimplementing this
  // reader — this is the one canonical prose reader. Guard ref so it only
  // auto-opens once per navigation, not on every proseAvailable re-render.
  const openReaderAppliedRef = useRef(false)
  // Marc 2026-10-07: when the reader was opened via the ?openReader=1 deep
  // link (tapped "Read eBook" from the library/home card), closing it ("x")
  // should return to wherever that tap came from — not reveal this player
  // page's own info view underneath. Set alongside openReaderAppliedRef, read
  // by closeProseReader() below.
  const openedReaderViaDeepLinkRef = useRef(false)
  const [seriesBookTitle, setSeriesBookTitle] = useState('')
  const [seriesProseChapters, setSeriesProseChapters] = useState<Array<{ id: string; title: string; episode_number: number; prose_text: string }>>([])
  const [authorData, setAuthorData]   = useState<any | null>(null)
  const [narratorData, setNarratorData] = useState<any | null>(null)

  // ── BELL-ONBOARD-004: onboarding gate ─────────────────────────────────────
  // Detect ?onboard=1 on mount only (client-side). Scroll to top so the play
  // button (issue 2) is always fully visible on landing. Using state + effect
  // (not a render-time const) eliminates the SSR/client hydration mismatch that
  // caused the 'Continue your story' button to never appear (issue 1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('onboard') === '1') {
      isOnboardingRef.current = true
      setOnboardActive(true)
      // Fix 2a: scroll to top on mount so player controls are in view
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fix 2b: re-scroll after loading completes — mount-time scroll fires before player
  // content renders; by the time loading=false the page may have shifted and the
  // Continue button scrolled below fold. Run again once the button is actually live.
  useEffect(() => {
    if (!loading && onboardActive) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [loading, onboardActive])

  // Fix 4: resolve onboarding welcome URL in parallel with main load(), not sequentially
  // after it. Runs as soon as user is available so the URL is ready before the user taps
  // Continue — eliminates the race where tapping before Tier-3 API completes left no welcome.
  useEffect(() => {
    if (!onboardActive || !user || onboardWelcomeUrl !== null) return
    let cancelled = false
    const resolve = async () => {
      // Tier 1: pre-generated at signup — validate still alive before trusting
      const metaUrl = user.user_metadata?.welcome_seg1_url as string | undefined
      if (metaUrl) {
        try {
          const check = await fetch(metaUrl, { method: 'HEAD' })
          if (!cancelled && check.ok) { setOnboardWelcomeUrl(metaUrl); return }
        } catch { /* fall through */ }
      }
      // Tier 2: cached name clip in names bucket
      try {
        const { data: dbUser } = await supabase.from('users')
          .select('first_name').eq('id', user.id).single()
        const normalizedName = (dbUser?.first_name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        if (normalizedName) {
          const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/names/welcome-seg1-${normalizedName}.mp3`
          const headRes = await fetch(storageUrl, { method: 'HEAD' })
          if (!cancelled && headRes.ok) { setOnboardWelcomeUrl(storageUrl); return }
        }
        // Tier 3: generate on-demand
        if (!cancelled) {
          const firstName = dbUser?.first_name || 'friend'
          const welcomeText = `Hi ${firstName}. Glad you decided to join us. I'm Belle, your personal assistant — now let's continue with Episode 2 of The Bell Beneath Falls Park.`
          const res = await fetch('/api/admin/generate-belle-intro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'welcome', firstName, introText: welcomeText }),
          })
          const genData = res.ok ? await res.json() : null
          if (!cancelled && genData?.url) setOnboardWelcomeUrl(genData.url)
        }
      } catch { /* welcome fails silently — story plays directly on Continue tap */ }
    }
    void resolve()
    return () => { cancelled = true }
  }, [onboardActive, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOnboardContinue = useCallback(() => {
    setOnboardActive(false)
    // Fix 3: start story with proper player state — setIsPlaying(true) + music fade-in.
    // Previous version called audioRef.current.play() but never updated isPlaying or started
    // music, so the first tap appeared to do nothing (overlay dismissed but no audible playback
    // and button still showed green ▶ Play state).
    const startStory = () => {
      const a = audioRef.current
      if (!a) return
      a.play().then(() => {
        setIsPlaying(true)
        const mu = musicRef.current
        if (mu && !noMusicRef.current && introMusicRef.current) {
          if (!mu.src || mu.src === 'about:blank' || mu.src === window.location.href) {
            mu.src = introMusicRef.current; mu.loop = true
          }
          mu.volume = 0; mu.play().catch(() => {})
          animVol(mu, 0, VOL_INTRO_MUSIC, 2000)
        }
      }).catch(() => {
        // Audio not ready yet (still buffering) — retry once after short delay
        setTimeout(() => {
          a.play().then(() => { setIsPlaying(true) }).catch(() => {})
        }, 250)
      })
    }
    if (onboardWelcomeUrl) {
      // Play Belle's ~9s welcome line, then seamlessly into EP2 audio
      const welcomeAudio = new Audio(onboardWelcomeUrl)
      onboardAudioRef.current = welcomeAudio
      // CAR-MEDIA-001: own the car/lock-screen controls while Belle speaks;
      // released on 'ended', handing control to the story's claim.
      attachMediaSession(welcomeAudio, { title: 'A welcome from Belle', artist: MEDIA_ALBUM, artworkUrl: (story as any)?.cover_url })
      welcomeAudio.onended = () => {
        // WELCOME-PLAYED-GUARD-001: only mark it played if the clip really
        // reached its end. A spurious/empty 'ended' (iOS) must leave the flag
        // false so the listener is offered the welcome again.
        if (user?.id && welcomeClipCompleted(welcomeAudio)) {
          supabase.from('users').update({ welcome_played: true }).eq('id', user.id).then(() => {})
        }
        startStory()
      }
      welcomeAudio.play().catch(() => {
        // Welcome audio failed — start story directly
        startStory()
      })
    } else {
      startStory()
    }
  }, [onboardWelcomeUrl, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── ORION-PLAYER-STALL-001 (Marc walk bug, 2026-07-14) ───────────────────
  // A stalled stream (data starvation — e.g. failed range fetch after a resume
  // seek) previously looked IDENTICAL to playback: isPlaying stayed true, the
  // button said Pause, and nothing recovered — a silent player. The watchdog
  // samples currentTime every 2s while playing: frozen ≥4s → Buffering UI;
  // frozen ≥8s → reload the same src cache-busted at the same position and
  // resume (2 attempts); still frozen → explicit stall card via
  // audioErrorMessage. Natural advancement resets everything.
  const stallSampleRef = useRef<{ t: number; at: number } | null>(null)
  const stallRecoveryCountRef = useRef(0)
  const stallRecoveringRef = useRef(false)

  const recoverFromStall = () => {
    const audio = audioRef.current
    if (!audio || stallRecoveringRef.current) return
    stallRecoveringRef.current = true
    stallRecoveryCountRef.current += 1
    const src = audio.currentSrc || audio.src || ''
    const pos = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    console.warn('[player] stall watchdog: recovering', {
      storyId,
      attempt: stallRecoveryCountRef.current,
      pos,
      src: src.slice(-80),
      readyState: audio.readyState,
      networkState: audio.networkState,
    })
    // PLAYER-P0-001 (2026-08-26): 12-second timeout guards against loadedmetadata
    // never firing (CDN hiccup, 5xx, network drop during reload). Without this,
    // stallRecoveringRef stays true forever and the watchdog is permanently blinded.
    let metaTimeout: ReturnType<typeof setTimeout> | null = null
    const onMeta = () => {
      if (metaTimeout !== null) { clearTimeout(metaTimeout); metaTimeout = null }
      audio.removeEventListener('loadedmetadata', onMeta)
      try { audio.currentTime = pos } catch (_) {}
      audio.play().then(() => {
        stallRecoveringRef.current = false
        stallSampleRef.current = null
      }).catch((err) => {
        stallRecoveringRef.current = false
        console.error('[player] stall recovery play() failed:', err)
        Sentry.captureException(err, {
          tags: {
            event_type: 'player_reliability',
            p0_id: 'PLAYER-P0-001b',
            story_id: storyId,
            handled: 'true',
          },
          extra: {
            attempt: stallRecoveryCountRef.current,
          },
        })
      })
    }
    metaTimeout = setTimeout(() => {
      audio.removeEventListener('loadedmetadata', onMeta)
      stallRecoveringRef.current = false
      console.error('[player] stall recovery: loadedmetadata timed out after 12s', {
        storyId,
        attempt: stallRecoveryCountRef.current,
        src: src.slice(-80),
        readyState: audio.readyState,
        networkState: audio.networkState,
      })
      Sentry.captureEvent({
        message: 'player.stall_recovery.loadedmetadata_timeout',
        level: 'warning',
        tags: {
          event_type: 'player_reliability',
          p0_id: 'PLAYER-P0-001a',
          story_id: storyId,
        },
        extra: {
          attempt: stallRecoveryCountRef.current,
          src: src.slice(-80),
          readyState: audio.readyState,
          networkState: audio.networkState,
        },
      })
      // Retry if still under the 2-attempt cap; otherwise surface the error card.
      if (stallRecoveryCountRef.current < 2) {
        recoverFromStall()
      } else {
        audio.pause()
        setIsPlaying(false)
        setIsBuffering(false)
        setAudioErrorMessage('Audio stalled — check your connection and try again.')
        endAnalyticsSession('playback_error')
        stallSampleRef.current = null
        stallRecoveryCountRef.current = 0
      }
    }, 12000)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.src = bustAudioUrl(src.replace(/[?&]et_retry=\d+/, ''))
    audio.load()
  }

  const canPreviewReviewStory = () => {
    return ADMIN_REVIEW_EMAILS.has(userEmail)
  }

  const canLoadStory = (candidate: any) => {
    if (candidate?.status === 'published' && candidate?.is_hidden === false) return true
    // LANDING-STORY-001 / acquisition-test stories: playable via direct link or ContinueListening
    // card when accessed by a user who has the story in their library. Does NOT appear in
    // browse, search, or New Arrivals — those queries require status='published'. Marc ruling 2026-07-27.
    if (candidate?.status === 'ready_for_review') return true
    return candidate?.status === 'audio_ready' && candidate?.is_hidden === true && canPreviewReviewStory()
  }

  const episodeNumberFor = (candidate: any) => {
    const episodeNumber = Number(candidate?.episode_number)
    return Number.isFinite(episodeNumber) && episodeNumber > 0 ? episodeNumber : null
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

  const closeReviewAndReturn = () => {
    setShowReview(false)
    returnToSource('/library')
  }

  const isFinalEpisodeForReview = async () => {
    if (!(story as any)?.series_id) return true

    const currentEpisodeNumber = episodeNumberFor(story)
    if (currentEpisodeNumber === null) {
      const pl = playlistRef.current
      const playlistIndex = pl.findIndex((episode) => episode.id === storyId)
      return playlistIndex >= 0 && pl.length > 0 && playlistIndex === pl.length - 1
    }

    // REVIEW-PROMPT-001: prefer the explicit series_is_finale flag as the authoritative
    // signal. A mid-series episode with a broken status (e.g. validator_failed) would
    // otherwise make canLoadStory() return false and trick the fallback query into
    // thinking the current episode is the last one.
    const seriesIsFinale = (story as any)?.series_is_finale
    if (seriesIsFinale === true) return true
    if (seriesIsFinale === false) return false

    // Fallback for stories where series_is_finale is null/undefined: query for the
    // next published+visible episode. Only count episodes the user can actually play
    // (status=published AND is_hidden=false) so a validator_failed mid-series episode
    // does not falsely terminate the series here.
    const { data, error } = await supabase
      .from('stories')
      .select(AUTO_ADVANCE_STORY_SELECT)
      .eq('series_id', (story as any).series_id)
      .eq('status', 'published')
      .eq('is_hidden', false)
      .not('episode_number', 'is', null)
      .gt('episode_number', currentEpisodeNumber)
      .order('episode_number', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[player] review final-episode lookup failed:', { storyId, error })
      return false
    }

    return !data || !canLoadStory(data)
  }

  const maybeShowCompletionReviewPrompt = async () => {
    if (reviewPromptHandledRef.current || !user?.id || !story) return false
    reviewPromptHandledRef.current = true

    const finalEpisode = await isFinalEpisodeForReview()
    if (!finalEpisode) return false

    const { data, error } = await supabase
      .from('reviews')
      .select('id')
      .eq('user_id', user.id)
      .eq('story_id', storyId)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[player] review lookup failed:', { storyId, error })
      return false
    }
    if (data) return false

    setShowReview(true)
    return true
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

  // ORION-PLAYER-ENDSTATE-001 §2: a completed/at-end player (trusted natural
  // end, or position within 2s of total) must never present resume semantics
  // ("▶ Continue" · 0.0 min left) — the CTA becomes Play Again and restarts
  // from 0 instead of resuming into the final seconds.
  const isAtNaturalEnd = () => {
    if (playbackEnded) return true
    const total = getProgressTotalSeconds()
    const cur = getProgressSeconds()
    return Number.isFinite(total) && total > 2 && cur >= total - 2
  }

  const persistLocalProgress = (progressSeconds: number, done = false) => {
    if (!Number.isFinite(progressSeconds) || progressSeconds <= 0) return
    const totalSeconds = getProgressTotalSeconds()
    saveLocalPlayerProgress(storyId, progressSeconds, {
      userId: user?.id,
      completed: done,
      durationSecs: Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : null,
    })
  }

  // ORION-ANALYTICS-GAP-001 (2026-07-15): single entry point for STARTING an
  // analytics play session. Proven gap (walk account gvlwalk0715a/69c3ab3a):
  // only the gesture play button called trackPlayStart, so auto-advanced and
  // autoplay episode starts created ZERO play_events rows — Ep2/Ep3 of a series
  // listen were invisible and the Ep1→Ep2 continuation metric (the spine of the
  // GVL A/B/C ad test) was blind. Every playback start path now calls this with
  // its start source ('gesture' | 'autoplay' | 'auto_advance').
  const startAnalyticsSession = (startSource: PlayStartSource) => {
    if (analyticsTrackedRef.current) return
    analyticsTrackedRef.current = true
    trackPlayStart({
      userId: user?.id,
      storyId,
      genre: (story as any)?.genre,
      author: (story as any)?.author,
      narrator: (story as any)?.narrator_voice_name,
      durationMins: (story as any)?.duration_mins,
      // CAPI-PLAYSTART-001 custom data
      seriesId: (story as any)?.series_id || null,
      episodeNumber: (story as any)?.episode_number ?? null,
      storyTitle: story?.title || null,
      startSource,
    }).catch(() => {})
  }

  const endAnalyticsSession = (
    stopReason: 'completed' | 'not_for_me' | 'navigated_away' | 'network_error' | 'app_closed' | 'manual_pause' | 'tab_hidden' | 'playback_error',
    keepalive = false
  ) => {
    if (!analyticsTrackedRef.current) return
    trackPlayEnd({
      userId: user?.id,
      storyId,
      currentTime: getProgressSeconds(),
      totalDuration: getProgressTotalSeconds(),
      stopReason,
      keepalive,
    }).catch(() => {})
    analyticsTrackedRef.current = false
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

  const navigateToAutoAdvanceCandidate = async (candidate: AutoAdvanceCandidate) => {
    if (!mountedRef.current || !autoAdvanceEnabledRef.current) return
    unrequestedAutoStartsRef.current += 1
    const isSeriesContinuation = candidate.reason === 'next_series_episode'

    // P1 — Pre-create next episode user_library row before navigation so that
    // Continue Listening can find it even if the user closes the app before
    // EP2's audio play() fires (which is the only other place the row is created).
    // Rules:
    //  - Series continuations only (standalone auto-advance excluded)
    //  - Only when current episode had meaningful progress (> 60s played, or
    //    natural end where saveProgress(completed=true) already fired)
    //  - Check-then-insert: if a row already exists, leave it completely untouched
    //    (preserves existing progress, completed, hide_from_home, not_for_me)
    //  - Silent on failure — pre-creation never blocks navigation
    if (isSeriesContinuation && user?.id && candidate.story.id) {
      const currentProgressSeconds = getProgressSeconds()
      const worthPrecreating = currentProgressSeconds > 60 || getProgressTotalSeconds() > 0
      if (worthPrecreating) {
        try {
          const { data: existingRow } = await supabase
            .from('user_library')
            .select('story_id, progress, completed, hide_from_home')
            .eq('user_id', user.id)
            .eq('story_id', candidate.story.id)
            .maybeSingle()

          // Re-check mount state after async DB call
          if (!mountedRef.current || !autoAdvanceEnabledRef.current) return

          if (!existingRow) {
            // No row exists — insert one so Continue Listening survives an immediate app close
            await supabase.from('user_library').insert({
              user_id:        user.id,
              story_id:       candidate.story.id,
              progress:       0,
              completed:      false,
              hide_from_home: false,
              not_for_me:     false,
              last_played:    new Date().toISOString(),
            })
          }
          // Row already exists — leave every field exactly as-is
          // (progress, completed, hide_from_home, not_for_me all preserved)
        } catch (_) {
          // Silent — pre-creation failure must never block navigation
        }
      }
    }

    if (mode === 'playlist') {
      const nextIndex = playlistRef.current.findIndex((item) => item.id === candidate.story.id)
      if (nextIndex >= 0) localStorage.setItem('dtt_playlist_index', String(nextIndex))
    }
    router.push(`/player/${candidate.story.id}?autoplay=1&playNow=1&${isSeriesContinuation ? 'seriesContinue=1' : 'autoAdvance=1'}`)
  }

  const startAutoAdvanceTo = (candidate: AutoAdvanceCandidate) => {
    if (!mountedRef.current || !autoAdvanceEnabledRef.current) return
    setCatalogExhausted(false)

    if (candidate.reason === 'next_series_episode') {
      setAutoAdvanceCandidate(null)
      void navigateToAutoAdvanceCandidate(candidate)
      return
    }

    setAutoAdvanceCandidate(candidate)
    autoAdvanceTimerRef.current = setTimeout(() => {
      void navigateToAutoAdvanceCandidate(candidate)
    }, 2500)
  }

  // P3: getSeriesPlaylistAutoAdvanceCandidate() removed.
  // It used a localStorage-cached playlist and hard-coded status:'published' / is_hidden:false
  // without any DB check. If the next episode was unpublished or hidden after caching,
  // auto-advance would navigate to an unavailable story.
  // fetchDirectSeriesAutoAdvanceCandidate() (below) always queries live and calls canLoadStory().

  const fetchDirectSeriesAutoAdvanceCandidate = async (): Promise<AutoAdvanceCandidate | null> => {
    const currentEpisodeNumber = episodeNumberFor(story)
    if (!(story as any)?.series_id || currentEpisodeNumber === null) return null

    const { data, error } = await supabase
      .from('stories')
      .select(AUTO_ADVANCE_STORY_SELECT)
      .eq('series_id', (story as any).series_id)
      .not('episode_number', 'is', null)
      .gt('episode_number', currentEpisodeNumber)
      .order('episode_number', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[player] direct series next lookup failed:', { storyId, error })
      return null
    }

    if (!data || !canLoadStory(data)) return null
    const nextEpisodeNumber = episodeNumberFor(data)
    if (nextEpisodeNumber === null || nextEpisodeNumber <= currentEpisodeNumber) return null

    return {
      story: data as PlayerStory,
      reason: 'next_series_episode',
      reasonLabel: 'Next episode',
      score: 0,
    }
  }

  // ── GO-REROUTE-V2: EP2-end card-capture wall ──────────────────────────────
  // Marc (2026-10-05): the card ask moved from the up-front /go wall to AFTER the
  // EP2 taste. A brand-new onboarding user (arrived at EP2 via ?onboard=1,
  // in-trial, NO card on file) who reaches the END of EP2 is at peak intent —
  // show the EXISTING trial-wall overlay with a card-capture CTA that starts
  // hosted Checkout to vault a card, converting an email-only trial into a
  // card-on-file trial.
  //
  // This reuses the POST-TRIAL-BELLE-001 overlay via a NEW trialWallType
  // ('onboard_card_capture'). It is a DIFFERENT trigger from the lapsed-user
  // walls: lapsed = trial ENDED; this = in-trial, no-card, EP2 just completed.
  // The lapsed paths ('standalone'/'series_ep1_end'/'series_ep2plus') are never
  // touched by this code.
  //
  // Returns true if it fired the card wall (so callers skip auto-advance).
  //
  // ▼▼▼ SINGLE ADJUSTABLE TRIGGER POINT ▼▼▼
  // Default policy (this build) = fire at EP2 natural end.
  // STRATEGOS RECOMMENDATION (2026-10-05, logged): move the ask to the EP2→EP3
  // CLIFFHANGER rather than flat EP2-end — ride the unresolved hook (30s-hook
  // canon + 75% retention = narrative pull converts curiosity→card better than a
  // flat "trial over", and far better than a mid-EP2 pct interrupt). Pending Marc.
  // Make-or-break metric = EP2-reach (68% never activated); the gate must be paired
  // with reach-driving reminders or B is structurally capped at the EP2-reach rate.
  // To change WHEN it fires, change only where maybeFireOnboardCardWall() is CALLED
  // (the two natural-end sites) and/or the eligibility predicate below — the wall
  // UI and checkout handler stay the same.
  const maybeFireOnboardCardWall = (): boolean => {
    // Eligibility (ALL must hold):
    //  - isOnboardingRef: this player session is the EP2 onboarding landing
    //    (?onboard=1). The onboarding flow only ever sets ?onboard=1 on the EP2
    //    player, so this is the "just finished EP2" signal.
    //  - noCardTrialRef: in-trial user with no card vaulted (see load()).
    //  - not already fired this session.
    if (!isOnboardingRef.current) return false
    if (!noCardTrialRef.current) return false
    if (onboardCardWallFiredRef.current) return false
    onboardCardWallFiredRef.current = true
    setIsPlaying(false)
    try { audioRef.current?.pause() } catch {}
    try { musicRef.current?.pause() } catch {}
    setPlaybackEnded(true)
    setTrialWallVisible(true)
    setTrialWallType('onboard_card_capture')
    // REACH-REMINDERS-001 / #290: emit a card-wall-view event so we can measure
    // card-wall-view rate. Fire-and-forget; the ...FiredRef guard above makes
    // this at-most-once per player session, so the marker is not double-counted.
    try { void trackCardWallView({ userId: user?.id, storyId }) } catch {}
    return true
  }
  // ▲▲▲ SINGLE ADJUSTABLE TRIGGER POINT ▲▲▲

  // GO-REROUTE-V2: card-capture CTA. Auth is ALREADY established here (the user
  // is logged in in the player), so — unlike the old up-front version — there is
  // NO magic-token round-trip. We just POST /api/checkout and redirect to the
  // hosted Checkout url, exactly like app/signup/page.tsx (~214). returnTo sends
  // them back to the player with onboard disabled (card now on file).
  const startOnboardCardCheckout = async () => {
    if (onboardCheckoutPending) return
    setOnboardCheckoutError(false)
    setOnboardCheckoutPending(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          email: user?.email,
          source: 'go', // server sets GO_BASE_TRIAL_DAYS for the trial
          // Land back on this EP2 player with onboarding off (card vaulted).
          returnTo: `/player/${storyId}?onboard=0`,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      // …26688 tokens truncated… disableAutoAdvanceForSession('stop')
                  isAdvancingRef.current = false
                }}
                style={{ flex:1, padding:'10px 12px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.06)', color:'white', fontSize:'13px', fontWeight:700, cursor:'pointer' }}
              >Stop</button>
            </div>
          </div>
        )}
        {/* ORION-PLAYER-ENDSTATE-001 §1 (2026-07-15): completed end-state. After
            ORION-PLAYER-QUIT-001 correctly removed the /library yank, a natural end
            with auto-advance disarmed (e.g. manual pause earlier in the session)
            dead-ended — no Play Again, no next-episode affordance (Marc looped the
            tail 3×). Both buttons are explicit USER gestures: Next episode navigates
            exactly like the auto-advance path and re-arms auto-advance via the fresh
            mount's autoAdvanceDisabledReason reset; Play Again restarts from 0.
            Nothing here ever fires on a timer. */}
        {playbackEnded && !isPlaying && !autoAdvanceCandidate && !stillListeningPrompt && !audioErrorMessage && (
          <div data-testid="player-end-state" style={{ border:'1px solid rgba(249,115,22,0.32)', background:'rgba(249,115,22,0.10)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:800, margin:'0 0 10px' }}>Story complete</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {endStateCandidate && (
                <button
                  data-testid="end-state-next-episode"
                  onClick={() => {
                    // Explicit user gesture (allowed under ORION-PLAYER-QUIT-001 —
                    // this is not the player navigating on its own initiative).
                    router.push(`/player/${endStateCandidate.story.id}?autoplay=1&playNow=1&seriesContinue=1`)
                  }}
                  style={{ padding:'12px', borderRadius:'10px', border:'none', background:'#22c55e', color:'white', fontSize:'14px', fontWeight:800, cursor:'pointer' }}
                >Next episode: {endStateCandidate.story.title} →</button>
              )}
              <button
                data-testid="end-state-play-again"
                onClick={restartFromBeginning}
                style={ endStateCandidate
                  ? { padding:'12px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.06)', color:'white', fontSize:'13px', fontWeight:700, cursor:'pointer' }
                  : { padding:'12px', borderRadius:'10px', border:'none', background:'#f97316', color:'white', fontSize:'14px', fontWeight:800, cursor:'pointer' } }
              >↺ Play Again</button>
            </div>
          </div>
        )}
        {catalogExhausted && (
          <div style={{ border:'1px solid rgba(148,163,184,0.24)', background:'rgba(148,163,184,0.08)', borderRadius:'14px', padding:'12px', textAlign:'center' }}>
            <p style={{ color:'white', fontSize:'13px', fontWeight:800, margin:'0 0 4px' }}>{(story as any)?.series_id ? 'Series complete' : 'Catalog exhausted'}</p>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'12px', margin:0 }}>{(story as any)?.series_id ? 'You have reached the final episode.' : 'No untouched story is ready to play next.'}</p>
            <button
              onClick={() => { disableAutoAdvanceForSession('navigation'); returnToSource('/library') }}
              style={{ marginTop: 12, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(249,115,22,0.5)', borderRadius: 10, color: '#f97316', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              Back to Library
            </button>
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
        {/* autoplayBlocked: "Ready to continue" card removed — bottom ▶ Continue button handles this */}
        <PlayerTransport
          key={storyId}
          currentTime={effCur} duration={effTotal}
          seekEnabled={(isASC3 ? getQueueTotalSeconds() : actualAudioDuration) > 0}
          isPlaying={isPlaying} isBuffering={isBuffering}
          hasStarted={hasPlaybackStarted || hasProgress || effCur > 0 || playbackEnded}
          ended={isAtNaturalEnd()} autoplayBlocked={autoplayBlocked}
          onboarding={onboardActive}
          onToggle={onboardActive ? handleOnboardContinue : handlePlayPause}
          onSeek={seekToSeconds}
          onRestart={restartFromBeginning}
        />
        {!hasProgress && !((story as any)?.episode_number && (story as any).episode_number > 1) && (
          <button onClick={handleNotForMe} style={{ alignSelf:'center', marginTop:'-2px', padding:'6px 12px', border:'none', background:'transparent', color:'rgba(255,255,255,0.45)', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>Not for me</button>
        )}
      </div>

      {/* ── Info Modal Sheet ─────────────────────────────────────────────────── */}
      {activeModal && (
        <div
          onClick={() => activeModal === 'prose' ? closeProseReader() : setActiveModal(null)}
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
                        ? <div style={{ width:'33%', aspectRatio:'1/1', overflow:'hidden', flexShrink:0 }}><img src={authorData.photo_url} alt={authorData.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>
                        : <div style={{ width:'33%', aspectRatio:'1/1', background:'linear-gradient(135deg,#f97316,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>✍️</div>
                      }
                      <div style={{ flex:1 }}>
                        <p style={{ color:'white', fontSize:'17px', fontWeight:800, margin:'0 0 2px' }}>{authorData.name}</p>
                        <p style={{ color:'white', fontSize:'12px', margin:'0 0 8px' }}>{(authorData.follower_count || 0).toLocaleString()} followers</p>
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
                    {authorData.bio && <p style={{ color:'white', fontSize:'14px', lineHeight:1.7, margin:0 }}>{authorData.bio}</p>}
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
                        ? <div style={{ width:'33%', aspectRatio:'1/1', overflow:'hidden', flexShrink:0 }}><img src={narratorData.photo_url} alt={narratorData.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>
                        : <div style={{ width:'33%', aspectRatio:'1/1', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>🎙️</div>
                      }
                      <div style={{ flex:1 }}>
                        <p style={{ color:'white', fontSize:'17px', fontWeight:800, margin:'0 0 2px' }}>{narratorData.name}</p>
                        <p style={{ color:'white', fontSize:'12px', margin:'0 0 8px' }}>{(narratorData.follower_count || 0).toLocaleString()} followers</p>
                        <button
                          onClick={async () => {
	                            if (!user) { router.push('/signin'); return }
	                            const nvId = (story as any).narrator_voice_id
	                            let nvRow: any = null
	                            try { const r = await supabase.from('narrator_voices').select('id').eq('elevenlabs_voice_id', nvId).single(); nvRow = r.data } catch(_) {}
	                            if (!nvRow) return
	                            let existing: any = null
	                            try { const r = await supabase.from('user_follows').select('id').eq('user_id', user.id).eq('entity_type', 'narrator').eq('entity_id', nvRow.id).single(); existing = r.data } catch(_) {}
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
                    {narratorData.bio && <p style={{ color:'white', fontSize:'14px', lineHeight:1.7, margin:0 }}>{narratorData.bio}</p>}
                    {narratorData.tone_tags?.length > 0 && (
                      <p style={{ color:'white', fontSize:'14px', lineHeight:1.7, margin:0 }}>
                        {(() => {
                          const tags = (narratorData.tone_tags as string[]).slice(0, 4);
                          const listed = tags.length === 1 ? tags[0] : tags.slice(0, -1).join(', ') + ', and ' + tags[tags.length - 1];
                          return `${narratorData.name} narrates mostly ${listed}.`;
                        })()}
                      </p>
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
                      <button onClick={closeProseReader} style={{ width:34, height:34, flexShrink:0, borderRadius:'50%', border: proseDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.13)', background: proseDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: proseDark ? 'rgba(255,255,255,0.7)' : '#555', fontSize:'17px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
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
                    {proseResumeToast && (
                      <div style={{ position:'absolute', top:62, left:'50%', transform:'translateX(-50%)', zIndex:35, background:'#1a1a1a', color:'#fff', borderRadius:'999px', padding:'10px 14px', boxShadow:'0 8px 24px rgba(0,0,0,0.28)', display:'flex', alignItems:'center', gap:12, maxWidth:'calc(100% - 32px)', fontFamily:'Inter, system-ui, sans-serif' }}>
                        <span style={{ color:'#fff', fontSize:'17px', fontWeight:800, whiteSpace:'nowrap' }}>Resuming on page {proseResumeToast.pageNumber} of {proseResumeToast.totalPages}</span>
                        <button onClick={startProseOver} style={{ border:'none', background:'transparent', color:'#fff', fontSize:'17px', fontWeight:900, textDecoration:'underline', cursor:'pointer', padding:0, whiteSpace:'nowrap' }}>Start over</button>
                      </div>
                    )}
                    {/* Scrollable text */}
                    <div
                      ref={proseScrollRef}
                      onClick={() => proseControlsOpen && setProseControlsOpen(false)}
                      onScroll={() => {
                        const el = proseScrollRef.current
                        if (!el || el.scrollHeight <= el.clientHeight) return
                        const position = currentProsePosition()
                        if (!position) return
                        setProsePage(position.pageNumber || 1)
                        if (position.completed) flushCurrentReadingProgress(true)
                        else scheduleReadingProgressSave()
                      }}
                      style={{ flex:1, overflowY:'auto', padding:'20px 24px 72px', fontFamily:'Literata, Georgia, "Times New Roman", serif' }}
                    >
                      {/* Marc 2026-10-04 (EBOOK-COVER-001): the story/series cover photo
                          as the ebook's front "page", like a real book cover — shown once,
                          before any chapter/paragraph text. */}
                      {story.cover_url && (
                        <div style={{ display:'flex', justifyContent:'center', margin:'4px 0 36px' }}>
                          <img
                            src={story.cover_url}
                            alt={`${proseBookTitle} cover`}
                            style={{ width:'72%', maxWidth:320, aspectRatio:'2/3', objectFit:'cover', borderRadius:10, boxShadow: proseDark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(0,0,0,0.22)' }}
                          />
                        </div>
                      )}
                      {isSeriesReadIt ? (
                        <>
                          <h1 style={{ fontSize: proseFontSize + 9 + 'px', lineHeight: 1.12, color: proseDark ? 'white' : '#1a1a1a', margin:'0 0 28px', letterSpacing:0, fontWeight:700 }}>{proseBookTitle}</h1>
                          {seriesProseSections.map((chapter, chapterIndex) => (
                            <section key={chapter.id} style={{ marginTop: chapterIndex === 0 ? 0 : 42, paddingTop: chapterIndex === 0 ? 0 : 28, borderTop: chapterIndex === 0 ? 'none' : proseDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.12)' }}>
                              <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:'11px', fontWeight:900, color: proseDark ? '#fb923c' : '#9a3412', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>
                                Chapter {chapterIndex + 1}
                              </div>
                              <h2 style={{ fontSize: proseFontSize + 5 + 'px', lineHeight:1.18, color: proseDark ? 'white' : '#1a1a1a', margin:'0 0 22px', letterSpacing:0, fontWeight:700 }}>
                                {chapter.title}
                              </h2>
                              {chapter.paragraphs.map((para: string, i: number) => {
                                const globalIndex = chapter.startIndex + i
                                const isBookmark = globalIndex === bookmarkParaIndex
                                return (
                                  <p key={`${chapter.id}-${i}`} data-para-index={globalIndex} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? 'white' : '#2c2c2c', margin:'0 0 20px', textIndent: i === 0 ? 0 : '1.5em', letterSpacing:'0.01em', position: isBookmark ? 'relative' : undefined }}>
                                    {isBookmark && renderBookmarkMark()}
                                    {para}
                                  </p>
                                )
                              })}
                            </section>
                          ))}
                        </>
                      ) : standaloneProseParagraphs.map((para: string, i: number) => {
                        const isBookmark = i === bookmarkParaIndex
                        if (i === 0) {
                          const first = para.charAt(0)
                          const rest  = para.slice(1)
                          return (
                            <p key={0} data-para-index={i} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? 'white' : '#2c2c2c', margin:'0 0 20px', letterSpacing:'0.01em', overflow:'hidden', position: isBookmark ? 'relative' : undefined }}>
                              {isBookmark && renderBookmarkMark()}
                              <span style={{ float:'left', fontSize:(proseFontSize * 3.6) + 'px', lineHeight:0.82, fontWeight:700, color: proseDark ? 'white' : '#1a1a1a', marginRight:'5px', marginTop:'4px', fontFamily:'Literata, Georgia, serif' }}>{first}</span>
                              {rest}
                            </p>
                          )
                        }
                        return (
                          <p key={i} data-para-index={i} style={{ fontSize: proseFontSize + 'px', lineHeight:1.85, color: proseDark ? 'white' : '#2c2c2c', margin:'0 0 20px', textIndent:'1.5em', letterSpacing:'0.01em', position: isBookmark ? 'relative' : undefined }}>
                            {isBookmark && renderBookmarkMark()}
                            {para}
                          </p>
                        )
                      })}
                    </div>

                    {/* Page counter — pinned bottom */}
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:52, display:'flex', alignItems:'center', justifyContent:'center', background: proseDark ? 'linear-gradient(to top,#0f172a 55%,transparent)' : 'linear-gradient(to top,#faf7f2 55%,transparent)', pointerEvents:'none' }}>
                      <span style={{ fontSize:'13px', fontWeight:600, color: proseDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)', letterSpacing:'0.04em' }}>
                        {prosePage} of {proseTotalPages}
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

      {/* POST-TRIAL-BELLE-001: Trial wall overlay
          Shown for lapsed users when playback should stop.
          MUST appear before Belle audio is loaded — audio is an enhancement only.
          Never blocks the subscribe button behind a loading state. */}
      {trialWallVisible && (
        <div
          data-testid="trial-wall"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2,6,23,0.96)',
            zIndex: 500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Belle mark */}
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎙️</div>

          {/* Main message */}
          <p style={{
            color: 'white',
            fontSize: '20px',
            fontWeight: 800,
            lineHeight: 1.3,
            margin: '0 0 12px',
            maxWidth: '340px',
          }}>
            {trialWallType === 'standalone'
              ? "That\u2019s a taste of it."
              : trialWallType === 'series_ep1_end'
              ? "That\u2019s where episode one ends."
              : trialWallType === 'onboard_card_capture'
              // GO-REROUTE-V2: EP2-end card ask (in-trial onboarding, no card yet)
              ? "You\u2019re two episodes in."
              : "There\u2019s more of this story."}
          </p>

          <p style={{
            color: 'rgba(255,255,255,0.72)',
            fontSize: '15px',
            lineHeight: 1.5,
            margin: '0 0 28px',
            maxWidth: '320px',
          }}>
            {trialWallType === 'standalone'
              // PRICING-TRIAL-001: the old "no credit card required for your first week"
              // was false — this button leads to card-required checkout.
              ? `Continue listening for ${MONTHLY_PRICE_LABEL}. Cancel anytime.`
              : trialWallType === 'series_ep1_end'
              ? `There\u2019s more of this story. Continue for ${MONTHLY_PRICE_LABEL}.`
              : trialWallType === 'onboard_card_capture'
              // GO-REROUTE-V2: keep the trial, add a card so it continues
              // seamlessly. They already have access — this is an upgrade ask,
              // not a block.
              ? (onboardCheckoutError
                  ? "We couldn\u2019t open checkout just now — your trial is still active. You can keep listening and add a card later."
                  : `Add a card to keep the story going after your free trial — ${MONTHLY_PRICE_LABEL} after it ends. Cancel anytime.`)
              : "Subscribe to unlock the rest of this series and everything in the library."}
          </p>

          {/* GO-REROUTE-V2: card-capture CTA fires hosted Checkout in-session
              (user is already authenticated here). Every other wall type keeps
              the original /subscribe link — untouched. */}
          {trialWallType === 'onboard_card_capture' ? (
            <>
              <button
                onClick={() => { void startOnboardCardCheckout() }}
                disabled={onboardCheckoutPending}
                data-testid="onboard-card-cta"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: '320px',
                  padding: '18px 24px',
                  background: '#f97316',
                  color: 'white',
                  fontSize: '17px',
                  fontWeight: 800,
                  borderRadius: '14px',
                  border: 'none',
                  textAlign: 'center',
                  marginBottom: '16px',
                  cursor: onboardCheckoutPending ? 'default' : 'pointer',
                  opacity: onboardCheckoutPending ? 0.7 : 1,
                }}
              >
                {onboardCheckoutPending
                  ? 'Opening checkout\u2026'
                  : onboardCheckoutError
                  ? 'Try again'
                  : 'Add a card & keep listening'}
              </button>

              {/* Graceful escape: they ALREADY have trial access, so a checkout
                  outage must never trap them. Dismiss the wall and let them
                  continue (e.g. to the next episode / library). */}
              <button
                onClick={() => {
                  setTrialWallVisible(false)
                  disableAutoAdvanceForSession('navigation')
                  returnToSource('/home')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px',
                }}
              >
                Not now — keep my free trial
              </button>
            </>
          ) : (
            <>
              {/* Subscribe button — always visible, never disabled */}
              <a
                href="/subscribe"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: '320px',
                  padding: '18px 24px',
                  background: '#f97316',
                  color: 'white',
                  fontSize: '17px',
                  fontWeight: 800,
                  borderRadius: '14px',
                  textDecoration: 'none',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                Start Your Free Week
              </a>

              {/* Back link */}
              <button
                onClick={() => { disableAutoAdvanceForSession('navigation'); returnToSource('/library') }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px',
                }}
              >
                Back to Library
              </button>
            </>
          )}

          {/* Belle audio plays once URL arrives — audio element is handled by the
              belleWallAudioUrl useEffect above; nothing to render here. */}
        </div>
      )}

      {/* BELL-ONBOARD-003: overlay removed — gate is now the inline play button; see play button below */}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
