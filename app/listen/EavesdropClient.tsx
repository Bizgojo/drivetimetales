'use client'

// EavesdropClient.tsx — GVL-EAVESDROP-001
// Eavesdrop UX for /listen acquisition route.
// Spec: ACQUISITION-RETENTION-001 Part E2 + A3 + A3b.
//
// UX flow:
//   1. Hook card shown (dark card with Ep1 hook text + eavesdrop button)
//   2. On button press: audio starts, hero morphs from hook card to cover art
//   3. Episode progression by arm (1/2/3 eps before wall)
//   4. Wall slides up: name+email form
//   5. On submit: account created, auto-continue Ep4

import { useState, useEffect, useRef, useCallback } from 'react'
import { createGoListenTracker, GoListenTracker, newSessionId } from '@/lib/goListen'
import type { EpisodeData } from './page'

type Phase =
  | 'hook'        // initial hook card, before button press
  | 'playing'     // audio playing, cover art visible
  | 'wall'        // name+email wall
  | 'confirmed'   // stays until user taps "Go to Endless Tales"; Ep4 plays during this phase
  | 'continuing'  // reserved (unused in current flow)
  | 'done'        // Ep4 ended — show one-tap login CTA

type Props = {
  episodes: EpisodeData[]  // [ep1, ep2, ep3, ep4]
  arm: 1 | 2 | 3
  utmSource: string | null
  utmCampaign: string | null
  promo: string | null
}

// Hook line confirmed by Marc (2026-07-26 5:22 PM)
const EP1_HOOK = "She's wearing my face \u2014 right here in Greenville, under Liberty Bridge"

function getHookText(_ep1: EpisodeData | undefined): string {
  return EP1_HOOK
}

// How many pre-wall episodes to play per arm
const ARM_EP_COUNTS: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 }

export default function EavesdropClient({ episodes, arm, utmSource, utmCampaign }: Props) {
  const ep1 = episodes[0]
  const ep4 = episodes[3]

  const [phase, setPhase] = useState<Phase>('hook')
  const [currentEpIndex, setCurrentEpIndex] = useState(0) // 0-based index into episodes[]
  const [morphProgress, setMorphProgress] = useState(0)    // 0..1 for crossfade

  // Signup form state
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; email?: boolean }>({})

  // Audio playback state (kept in sync via onPlay/onPause events)
  const [isPlaying, setIsPlaying] = useState(false)

  // magicToken removed — token is now generated fresh at tap time in handleGoToApp

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackerRef = useRef<GoListenTracker | null>(null)
  const sessionIdRef = useRef<string>(newSessionId())
  const wallFiredRef = useRef(false)
  const epCompleteFiredRef = useRef(new Set<number>())
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ep4 audio URL stored in a ref so the confirmed-phase timer always sees the latest value
  const continueAudioUrlRef = useRef<string | null>(null)
  // True once Ep4 is playing — used by handleAudioEnded to detect Ep4-ended vs pre-wall-ended
  const isContinuingRef = useRef(false)
  // (confirmedTimerRef removed — confirmed phase no longer auto-advances)

  // Variant string for tracking
  const variant = `listen-arm${arm}` as const

  // Initialize tracker once
  useEffect(() => {
    if (trackerRef.current) return
    trackerRef.current = createGoListenTracker({
      variant: variant as Parameters<typeof createGoListenTracker>[0]['variant'],
      utmSource,
      utmCampaign,
      // Override session id so wall_submit also uses the same session
      // (createGoListenTracker generates its own UUID internally, but we
      // expose it via tracker.sessionId and pass it to the signup API)
    })
    sessionIdRef.current = trackerRef.current.sessionId
    trackerRef.current.onPageView()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Kick off morph animation when audio starts
  const startMorph = useCallback(() => {
    if (morphTimerRef.current) clearTimeout(morphTimerRef.current)
    setMorphProgress(0)
    // Animate 0→1 over 800ms via a rAF loop
    const start = performance.now()
    const DURATION = 800
    function tick() {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / DURATION, 1)
      setMorphProgress(progress)
      if (progress < 1) {
        morphTimerRef.current = setTimeout(() => requestAnimationFrame(tick), 16)
      }
    }
    requestAnimationFrame(tick)
  }, [])

  // "Go to Endless Tales" — generates a FRESH magic token at tap time (not at signup time),
  // saves playback position to sessionStorage, then navigates via auth callback.
  // Lazy generation avoids OTP expiry during the listen session and any race with createUser.
  const handleGoToApp = useCallback(async () => {
    const audio = audioRef.current
    const ep4 = episodes[3]
    if (ep4?.id && continueAudioUrlRef.current) {
      try {
        sessionStorage.setItem('gvl_nowplaying', JSON.stringify({
          storyId: ep4.id,
          storyAudioUrl: continueAudioUrlRef.current,
          currentTime: Math.floor(audio?.currentTime ?? 0),
          episodeTitle: ep4.episodeTitle ?? ep4.title ?? 'Episode 4',
          seriesTitle: 'Wearing My Face',
        }))
      } catch {}
    }
    // Generate a fresh token at tap time (token is seconds old when consumed — no expiry risk)
    let freshToken: string | null = null
    try {
      const res = await fetch('/api/listen/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        const data = await res.json()
        freshToken = data.magicToken ?? null
      }
    } catch {}
    window.location.href = freshToken
      ? `/auth/callback?token_hash=${encodeURIComponent(freshToken)}&type=magiclink`
      : 'https://app.endless-tales.com'
  }, [email, episodes])

  // Pause/play toggle — usable in 'playing', 'confirmed', and 'done' phases
  const handlePausePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [])

  // Handle eavesdrop button press
  const handleEavesdropPress = useCallback(() => {
    trackerRef.current?.onPlayStart(0)
    // Fire eavesdrop_pressed via raw payload (not in GoListenTracker interface directly,
    // but we can fire it by extending the tracker — use internal fire via play_start proxy)
    // Actually: send it directly via fetch (fire-and-forget)
    void fetch('/api/go-listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        variant,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        event: 'eavesdrop_pressed',
        position_seconds: 0,
      }),
    }).catch(() => {})

    setPhase('playing')
    startMorph()

    // Start audio
    const audio = audioRef.current
    if (!audio) return
    const ep = episodes[0]
    if (ep?.storyAudioUrl) {
      audio.src = ep.storyAudioUrl
    }
    audio.play().catch(() => {
      // Autoplay blocked — phase stays 'playing', user must interact
    })
  }, [episodes, startMorph, utmSource, utmCampaign, variant])

  // Audio event: onEnded — advance episode or show wall
  const handleAudioEnded = useCallback(() => {
    // If Ep4 is playing (continuing phase), transition to done screen
    if (isContinuingRef.current) {
      setPhase('done')
      return
    }

    const epCount = ARM_EP_COUNTS[arm]
    const nextIndex = currentEpIndex + 1

    // Fire ep_complete for this episode (once)
    if (!epCompleteFiredRef.current.has(currentEpIndex)) {
      epCompleteFiredRef.current.add(currentEpIndex)
      const audio = audioRef.current
      void fetch('/api/go-listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          variant,
          utm_source: utmSource,
          utm_campaign: utmCampaign,
          event: 'ep_complete',
          position_seconds: Math.floor(audio?.duration ?? 0),
        }),
      }).catch(() => {})
    }

    if (currentEpIndex + 1 < epCount) {
      // Auto-continue to next pre-wall episode
      const nextEp = episodes[nextIndex]
      setCurrentEpIndex(nextIndex)
      if (audioRef.current && nextEp?.storyAudioUrl) {
        audioRef.current.src = nextEp.storyAudioUrl
        audioRef.current.play().catch(() => {})
      } else if (audioRef.current && !nextEp?.storyAudioUrl) {
        // Audio not yet available — show wall anyway
        showWall()
      }
    } else {
      // All pre-wall episodes done — show wall
      showWall()
    }
  }, [arm, currentEpIndex, episodes, utmSource, utmCampaign, variant])

  function showWall() {
    if (wallFiredRef.current) return
    wallFiredRef.current = true
    void fetch('/api/go-listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        variant,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        event: 'wall_shown',
        position_seconds: 0,
      }),
    }).catch(() => {})
    setPhase('wall')
  }

  // Audio timeupdate — pass to tracker for pct milestones
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    trackerRef.current?.onTimeUpdate(audio.currentTime, audio.duration)
  }, [])

  // Submit handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    // #7 Client-side validation — block and highlight empty fields
    const nameEmpty = !firstName.trim()
    const emailEmpty = !email.trim()
    if (nameEmpty || emailEmpty) {
      setFieldErrors({ name: nameEmpty, email: emailEmpty })
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    setSubmitError(null)

    try {
      // Fire wall_submit before calling signup (client-side, same session)
      void fetch('/api/go-listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          variant: `listen-arm${arm}`,
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          event: 'wall_submit',
          position_seconds: Math.floor(audioRef.current?.currentTime ?? 0),
        }),
      })

      const res = await fetch('/api/listen/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          email: email.trim(),
          arm,
          sessionId: sessionIdRef.current,
          utmSource,
          utmCampaign,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      // Success — start Ep4 immediately, show confirmed screen (stays until user taps)
      continueAudioUrlRef.current = data.continueAudioUrl ?? null
      isContinuingRef.current = true  // Ep4 is now the active audio
      setPhase('confirmed')
      const ep4Audio = audioRef.current
      if (ep4Audio && data.continueAudioUrl) {
        ep4Audio.src = data.continueAudioUrl
        ep4Audio.play().catch(() => {})
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }, [arm, email, firstName, submitting, utmSource, utmCampaign])

  // Current episode for display
  const currentEp = episodes[currentEpIndex] ?? ep1
  const hookText = getHookText(ep1)

  // Cover image — prefer cover_image_url then cover_url
  const coverSrc = currentEp?.coverImageUrl ?? currentEp?.coverUrl ?? null

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Georgia', serif",
      color: '#f5f0e8',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Brand mark */}
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ fontSize: 13, letterSpacing: '0.2em', color: '#a09080', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
          Endless Tales
        </span>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />

      {/* Main content area */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
      }}>
        {/* Hero: hook card morphs to cover art */}
        <div style={{
          width: '100%',
          aspectRatio: '4/3',
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {/* Hook card — fake news article masthead + photo (GVL-EAVESDROP-001 news format) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#111118',
            border: '1px solid rgba(240,220,180,0.12)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            padding: '12px 16px',
            opacity: phase === 'hook' ? 1 : Math.max(0, 1 - morphProgress),
            transition: phase === 'hook' ? 'none' : 'opacity 0.05s',
            overflow: 'hidden',
          }}>
            {/* Newspaper masthead */}
            <div style={{
              borderBottom: '2px solid rgba(245,240,232,0.55)',
              paddingBottom: 6,
              marginBottom: 4,
              textAlign: 'center',
            }}>
              <p style={{
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: 20,
                fontWeight: 700,
                color: '#f5f0e8',
                margin: 0,
                letterSpacing: '0.06em',
                lineHeight: 1.2,
              }}>The Greenville Herald</p>
            </div>
            {/* DISCLAIMER — visible on load, required for Meta ad review (spec: under masthead) */}
            <p style={{
              fontSize: 11,
              color: '#6b6070',
              margin: '0 0 8px',
              fontFamily: 'sans-serif',
              textAlign: 'center',
              letterSpacing: '0.01em',
            }}>A dramatized story from Endless Tales.</p>
            {/* Photo placeholder — real photo swap later, 16:9 aspect ratio */}
            <div style={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              background: '#2a2a3c',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-start',
              padding: '0 6px 5px',
              overflow: 'hidden',
            }}>
              <p style={{
                fontSize: 11,
                color: '#7a7080',
                margin: 0,
                fontFamily: 'sans-serif',
                fontStyle: 'italic',
              }}>Photo: Falls Park / Liberty Bridge</p>
            </div>
          </div>

          {/* Cover art (visible after morph, when audio playing) */}
          {coverSrc && (
            <div style={{
              position: 'absolute',
              inset: 0,
              opacity: phase === 'hook' ? 0 : morphProgress,
              transition: 'opacity 0.05s',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc}
                alt="Wearing My Face cover art"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}

          {/* Stub placeholder if no cover art yet */}
          {!coverSrc && phase !== 'hook' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, #2a1e3a 0%, #1a1428 100%)',
              opacity: morphProgress,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <p style={{ color: '#a09080', fontSize: 14, fontFamily: 'sans-serif' }}>Wearing My Face</p>
            </div>
          )}

          {/* Now playing / paused indicator */}
          {(phase === 'playing' || phase === 'continuing' || phase === 'confirmed') && morphProgress >= 1 && (
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(15,15,26,0.75)',
              borderRadius: 20,
              padding: '4px 12px',
            }}>
              <span style={{ fontSize: 10, color: isPlaying ? '#f97316' : '#a09080', letterSpacing: '0.1em', fontFamily: 'sans-serif', textTransform: 'uppercase' }}>
                {isPlaying ? '▶ Listening' : '⏸ Paused'}
              </span>
            </div>
          )}
        </div>

        {/* Phase: HOOK — article headline, subhead, Listen In CTA */}
        {phase === 'hook' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12, width: '100%' }}>
            {/* Article headline — large bold sans-serif per spec */}
            <p style={{
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1.25,
              textAlign: 'left',
              color: '#ffffff',
              margin: 0,
              fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
            }}>
              Police say suitcase found beneath Liberty Bridge may be linked to three missing Greenville women.
            </p>
            {/* Subhead — muted white */}
            <p style={{
              fontSize: 15,
              color: '#c8b89a',
              fontFamily: 'sans-serif',
              margin: 0,
              lineHeight: 1.5,
              textAlign: 'left',
            }}>
              Authorities closed part of Falls Park early this morning after a city worker discovered the suitcase near the Reedy River.
            </p>
            {/* Listen In button — orange, pill shape, min 52px height */}
            <button
              onClick={handleEavesdropPress}
              style={{
                width: '100%',
                background: '#f97316',
                border: 'none',
                borderRadius: 40,
                padding: '16px 24px',
                minHeight: 52,
                color: '#fff',
                fontSize: 18,
                fontFamily: 'sans-serif',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Listen In →
            </button>
          </div>
        )}

        {/* Phase: CONFIRMED — Ep4 plays here; screen stays until user taps "Go to Endless Tales" */}
        {phase === 'confirmed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
            <button
              onClick={handlePausePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(240,220,180,0.1)',
                border: '2px solid rgba(240,220,180,0.3)',
                color: '#f5f0e8', fontSize: 26, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, WebkitTapHighlightColor: 'transparent',
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#f5f0e8', margin: '0 0 8px', lineHeight: 1.3, fontFamily: "'Georgia', serif" }}>
                You&rsquo;re in{firstName ? `, ${firstName}` : ''}.
              </p>
              <p style={{ fontSize: 16, color: '#f5f0e8', fontFamily: 'sans-serif', margin: 0 }}>
                Your 7-day free week has started. No credit card.
              </p>
            </div>
            <button
              onClick={handleGoToApp}
              style={{
                width: '100%', background: '#f97316', border: 'none',
                borderRadius: 8, padding: '16px 24px',
                color: '#fff', fontSize: 18, fontWeight: 700,
                fontFamily: 'sans-serif', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Go to Endless Tales →
            </button>
          </div>
        )}

        {/* Phase: PLAYING — story info + pause/play control */}
        {phase === 'playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
            {/* Pause / play button — large tap target for mobile */}
            <button
              onClick={handlePausePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(240,220,180,0.1)',
                border: '2px solid rgba(240,220,180,0.3)',
                color: '#f5f0e8',
                fontSize: 26,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, color: '#c8b89a', margin: 0 }}>
                {currentEp?.episodeTitle ?? currentEp?.title ?? 'Wearing My Face'}
              </p>
              <p style={{ fontSize: 12, color: '#6b6070', fontFamily: 'sans-serif', marginTop: 6 }}>
                {arm > 1
                  ? `Episode ${currentEpIndex + 1} of ${ARM_EP_COUNTS[arm]} before the story continues`
                  : 'The story continues after this episode'}
              </p>
            </div>
          </div>
        )}

        {/* 'continuing' phase intentionally unused — Ep4 now plays during 'confirmed' */}

        {/* Phase: DONE — Ep4 finished, one-tap login CTA */}
        {phase === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#f5f0e8', margin: '0 0 8px', lineHeight: 1.3, fontFamily: "'Georgia', serif" }}>
                You&rsquo;re in{firstName ? `, ${firstName}` : ''}.
              </p>
              <p style={{ fontSize: 16, color: '#f5f0e8', fontFamily: 'sans-serif', margin: 0 }}>
                Your 7-day free week has started. No credit card.
              </p>
            </div>
            {/* One-tap login: handleGoToApp generates a fresh token at tap time and navigates. */}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); void handleGoToApp() }}
              style={{
                display: 'block',
                width: '100%',
                background: '#f97316',
                borderRadius: 8,
                padding: '16px 24px',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'sans-serif',
                textDecoration: 'none',
                textAlign: 'center',
                WebkitTapHighlightColor: 'transparent',
                boxSizing: 'border-box',
              }}
            >
              Open Endless Tales →
            </a>
          </div>
        )}
      </div>

      {/* Wall: slides up from bottom */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#1a1428',
        borderTop: '1px solid rgba(240,220,180,0.15)',
        borderRadius: '20px 20px 0 0',
        padding: '28px 24px 40px',
        transform: phase === 'wall' ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 100,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f5f0e8', margin: '0 0 10px' }}>
            Want to keep listening?
          </h2>
          <p style={{ fontSize: 16, color: '#f5f0e8', fontFamily: 'sans-serif', marginBottom: 24 }}>
            Enter your name and email to get a 7-day free trial — no credit card needed.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => { setFirstName(e.target.value); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: false })) }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${fieldErrors.name ? '#ef4444' : 'rgba(240,220,180,0.2)'}`,
                borderRadius: 8,
                padding: '12px 16px',
                color: '#f5f0e8',
                fontSize: 16,
                fontFamily: 'sans-serif',
                outline: 'none',
              }}
            />
            {fieldErrors.name && <p style={{ color: '#ef4444', fontSize: 13, fontFamily: 'sans-serif', margin: '-4px 0 0' }}>Please enter your first name.</p>}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: false })) }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${fieldErrors.email ? '#ef4444' : 'rgba(240,220,180,0.2)'}`,
                borderRadius: 8,
                padding: '12px 16px',
                color: '#f5f0e8',
                fontSize: 16,
                fontFamily: 'sans-serif',
                outline: 'none',
              }}
            />
            {fieldErrors.email && <p style={{ color: '#ef4444', fontSize: 13, fontFamily: 'sans-serif', margin: '-4px 0 0' }}>Please enter your email.</p>}

            {submitError && (
              <p style={{ color: '#f97316', fontSize: 13, fontFamily: 'sans-serif', margin: 0 }}>
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                background: submitting ? '#4a3f60' : '#f97316',
                border: 'none',
                borderRadius: 8,
                padding: '14px 24px',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: 'sans-serif',
                cursor: submitting ? 'not-allowed' : 'pointer',
                marginTop: 4,
              }}
            >
              {submitting ? 'Starting your story…' : 'Continue the story'}
            </button>

            {/* #6: duplicate 'no credit card' line removed — it's already in the wall subheading */}
          </form>
        </div>
      </div>

      {/* CSS animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(240,220,180,0.35); box-shadow: 0 0 0 0 rgba(240,220,180,0.1); }
          50% { border-color: rgba(240,220,180,0.65); box-shadow: 0 0 0 12px rgba(240,220,180,0.05); }
        }
        input::placeholder { color: #8b8095; }
        input:focus { border-color: rgba(240,220,180,0.45) !important; }
        * { box-sizing: border-box; }
      ` }} />
    </div>
  )
}
