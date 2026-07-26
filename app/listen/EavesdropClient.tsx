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
  | 'continuing'  // post-submit, Ep4 loading/playing
  | 'done'        // Ep4 ended or user dismissed

type Props = {
  episodes: EpisodeData[]  // [ep1, ep2, ep3, ep4]
  arm: 1 | 2 | 3
  utmSource: string | null
  utmCampaign: string | null
  promo: string | null
}

// Fallback hook text if description is null
const FALLBACK_HOOK = 'Something in Greenville is wearing a familiar face.'

function getHookText(ep1: EpisodeData | undefined): string {
  return ep1?.description ?? FALLBACK_HOOK
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

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackerRef = useRef<GoListenTracker | null>(null)
  const sessionIdRef = useRef<string>(newSessionId())
  const wallFiredRef = useRef(false)
  const epCompleteFiredRef = useRef(new Set<number>())
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    setSubmitting(true)
    setSubmitError(null)

    try {
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

      // Success — auto-continue Ep4
      setPhase('continuing')
      if (data.continueAudioUrl && audioRef.current) {
        audioRef.current.src = data.continueAudioUrl
        audioRef.current.play().catch(() => {})
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
          {/* Hook card (dark, visible when morphProgress < 1 or phase=hook) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #1a1428 0%, #0f0f1a 100%)',
            border: '1px solid rgba(240,220,180,0.12)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            opacity: phase === 'hook' ? 1 : Math.max(0, 1 - morphProgress),
            transition: phase === 'hook' ? 'none' : 'opacity 0.05s',
          }}>
            {/* Keyhole / ear aesthetic SVG */}
            <div style={{ marginBottom: 24, opacity: 0.5 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="20" r="10" stroke="#f0dcb4" strokeWidth="2"/>
                <path d="M18 20c0-3.31 2.69-6 6-6s6 2.69 6 6c0 2.5-1.54 4.66-3.75 5.57L28 38H20l1.75-12.43C19.54 24.66 18 22.5 18 20z" fill="#f0dcb4" opacity="0.4"/>
              </svg>
            </div>
            <p style={{
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.4,
              textAlign: 'center',
              color: '#f5f0e8',
              margin: 0,
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}>
              {hookText}
            </p>
            <p style={{ marginTop: 16, fontSize: 13, color: '#a09080', textAlign: 'center', fontFamily: 'sans-serif' }}>
              Greenville, SC · Mystery · Episode 1
            </p>
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

          {/* Now playing indicator */}
          {phase === 'playing' && morphProgress >= 1 && (
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
              <span style={{ fontSize: 10, color: '#f97316', letterSpacing: '0.1em', fontFamily: 'sans-serif', textTransform: 'uppercase' }}>
                ▶ Listening
              </span>
            </div>
          )}
        </div>

        {/* Phase: HOOK — eavesdrop button */}
        {phase === 'hook' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
            <button
              onClick={handleEavesdropPress}
              style={{
                background: 'transparent',
                border: '2px solid rgba(240,220,180,0.35)',
                borderRadius: 40,
                padding: '16px 40px',
                color: '#f5f0e8',
                fontSize: 18,
                fontFamily: "'Georgia', serif",
                cursor: 'pointer',
                letterSpacing: '0.04em',
                position: 'relative',
                overflow: 'hidden',
                animation: 'pulse-border 2.4s ease-in-out infinite',
              }}
            >
              Listen in…
            </button>
            <p style={{ fontSize: 12, color: '#6b6070', fontFamily: 'sans-serif', textAlign: 'center' }}>
              No account needed · Just press and hear what happened
            </p>
          </div>
        )}

        {/* Phase: PLAYING — story info + progress hint */}
        {phase === 'playing' && (
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
        )}

        {/* Phase: CONTINUING — Ep4 auto-playing */}
        {phase === 'continuing' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: '#f5f0e8', marginBottom: 8 }}>
              Welcome to Endless Tales.
            </p>
            <p style={{ fontSize: 13, color: '#a09080', fontFamily: 'sans-serif' }}>
              The story continues — {ep4?.episodeTitle ?? 'Episode 4'} is playing now.
            </p>
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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f5f0e8', margin: '0 0 6px' }}>
            You&rsquo;re in. Where should we continue?
          </h2>
          <p style={{ fontSize: 13, color: '#a09080', fontFamily: 'sans-serif', marginBottom: 24 }}>
            Enter your name and email to keep listening — no credit card.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(240,220,180,0.2)',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#f5f0e8',
                fontSize: 16,
                fontFamily: 'sans-serif',
                outline: 'none',
              }}
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(240,220,180,0.2)',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#f5f0e8',
                fontSize: 16,
                fontFamily: 'sans-serif',
                outline: 'none',
              }}
            />

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

            <p style={{ fontSize: 11, color: '#6b6070', textAlign: 'center', fontFamily: 'sans-serif', margin: 0 }}>
              7-day free trial. No credit card.
            </p>
          </form>
        </div>
      </div>

      {/* CSS animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(240,220,180,0.35); box-shadow: 0 0 0 0 rgba(240,220,180,0.1); }
          50% { border-color: rgba(240,220,180,0.65); box-shadow: 0 0 0 12px rgba(240,220,180,0.05); }
        }
        input::placeholder { color: #6b6070; }
        input:focus { border-color: rgba(240,220,180,0.45) !important; }
        * { box-sizing: border-box; }
      ` }} />
    </div>
  )
}
