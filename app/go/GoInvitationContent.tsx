'use client'

// =============================================================================
// LANDING-GATE-001 — Bell Beneath Falls Park invitation funnel
// Route: /go?arm=1|2|3
//
// Arm A (arm=1): PV1 (84.96s)   → email wall → signup → Belle welcome → EP2
// Arm B (arm=2): PV2 (188.25s)  → email wall → signup → Belle welcome → EP2
// Arm C (arm=3): PV3-B1 (76.44s) → "Continue →" button → PV3-B2 (193.70s)
//               → email wall → signup → Belle welcome → EP2
//
// EP2 BLOCKER (2026-08-07): "The Bell Beneath Falls Park — Episode 2" does
// NOT exist in the stories table. EP2_FALLBACK_URL = '/home' until EP2 is
// seeded. Update EP2_FALLBACK_URL to the real story URL when ready.
//
// Item 3 — Belle welcome:
//   /api/name-audio requires a non-empty name; email-only capture has none.
//   Using welcome_B.mp3 directly from Supabase storage instead.
//   TODO: switch to a name-less welcome API if one is added later.
//
// Styling: dark bg (#0f0f1a), WHITE text only, inline styles.
// =============================================================================

import { useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Bell promo audio URLs (Supabase public storage, status=audio_ready) ──────
const BELL_BASE =
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3'

const AUDIO_PV1   = `${BELL_BASE}/a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e/story_body.mp3`
const AUDIO_PV2   = `${BELL_BASE}/a88084ab-62e3-47f4-9b7a-5cbc32943349/story_body.mp3`
const AUDIO_PV3B1 = `${BELL_BASE}/a37fdc46-24d0-49a7-b749-320076978c3b/story_body.mp3`
const AUDIO_PV3B2 = `${BELL_BASE}/4784f4d6-cae4-48ce-a094-73415c700380/story_body.mp3`

// Item 3: Belle B welcome clip (Supabase storage/audio/welcome/welcome_B.mp3)
const BELLE_WELCOME_URL =
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/welcome/welcome_B.mp3'

// TODO EP2: replace with real EP2 player URL once Bell EP2 is in the stories table.
// Auth callback will log the user in; /home redirects authenticated users to their library.
const EP2_FALLBACK_URL = '/home'

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase =
  | 'hook'        // Arrival: invitation button visible, no audio loaded
  | 'playing'     // Arm A/B: promo playing; Arm C: B1 playing
  | 'b1_continue' // Arm C only: B1 ended, showing "Continue →" button
  | 'b2_playing'  // Arm C only: B2 playing
  | 'wall'        // Email-only capture wall
  | 'welcome'     // Belle welcome audio playing post-signup
  | 'routing'     // Generating auth link + navigating to EP2

interface GoInvitationContentProps {
  /** arm passed from server component (page.tsx); falls back to useSearchParams if omitted. */
  arm?: 1 | 2 | 3
}

export default function GoInvitationContent({ arm: armProp }: GoInvitationContentProps = {}) {
  const searchParams = useSearchParams()
  const armRaw = searchParams.get('arm')
  const arm: 1 | 2 | 3 = armProp ?? (
    armRaw === '2' ? 2 : armRaw === '3' ? 3 : 1
  )

  // Phase: use ref + state pair so audio callbacks see current value without
  // stale closures (ref is mutated, state drives re-render).
  const phaseRef = useRef<Phase>('hook')
  const [phase, setPhase] = useState<Phase>('hook')
  const goTo = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const welcomeRef = useRef<HTMLAudioElement | null>(null)

  // ── Invitation button pressed → load + play arm's first promo ───────────────
  const handleStart = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = arm === 2 ? AUDIO_PV2 : arm === 3 ? AUDIO_PV3B1 : AUDIO_PV1
    audio.load()
    audio.play().catch(() => { /* autoplay policy — user can tap again */ })
    goTo('playing')
  }, [arm, goTo])

  // ── Promo audio ended ────────────────────────────────────────────────────────
  const handleAudioEnded = useCallback(() => {
    const cur = phaseRef.current
    if (cur === 'playing') {
      // Arm C: B1 ended → show Continue button; Arms A/B: direct to email wall
      goTo(arm === 3 ? 'b1_continue' : 'wall')
    } else if (cur === 'b2_playing') {
      // Arm C: B2 ended → email wall
      goTo('wall')
    }
  }, [arm, goTo])

  // ── Arm C: user presses "Continue →" → play B2 ──────────────────────────────
  const handleContinue = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = AUDIO_PV3B2
    audio.load()
    audio.play().catch(() => { /* autoplay policy */ })
    goTo('b2_playing')
  }, [goTo])

  // ── Email wall submit → signup → Belle welcome → auth-link → EP2 ─────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !email.trim()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/listen/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // firstName omitted — email-only capture (LANDING-GATE-001)
          email: email.trim(),
          arm,
          utmSource:   searchParams.get('utm_source'),
          utmCampaign: searchParams.get('utm_campaign'),
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      // Signup OK. Play Belle welcome, then generate auth link → EP2.
      goTo('welcome')
      const capturedEmail = email.trim()

      const routeToEp2 = async () => {
        goTo('routing')
        try {
          const linkRes = await fetch('/api/listen/auth-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: capturedEmail }),
          })
          if (linkRes.ok) {
            const linkData = (await linkRes.json()) as { magicToken?: string }
            if (linkData.magicToken) {
              window.location.href =
                `/auth/callback?token_hash=${encodeURIComponent(linkData.magicToken)}&type=magiclink`
              return
            }
          }
        } catch { /* fallthrough */ }
        window.location.href = EP2_FALLBACK_URL
      }

      const wa = welcomeRef.current
      if (wa) {
        wa.src = BELLE_WELCOME_URL
        wa.load()
        wa.play().catch(() => { void routeToEp2() })
        wa.onended = () => { void routeToEp2() }
        // Safety: navigate after 12s even if welcome audio hangs
        setTimeout(() => { void routeToEp2() }, 12_000)
      } else {
        void routeToEp2()
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }, [email, arm, submitting, searchParams, goTo])

  const isAudioActive = phase === 'playing' || phase === 'b2_playing'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f1a',
      color: '#ffffff',
      fontFamily: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '0 0 2rem',
      position: 'relative',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Hidden audio elements */}
      <audio ref={audioRef}   onEnded={handleAudioEnded} style={{ display: 'none' }} />
      <audio ref={welcomeRef}                            style={{ display: 'none' }} />

      <div style={{
        maxWidth: '480px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: phase === 'wall' ? '260px' : '0',
        transition: 'padding-bottom 420ms',
      }}>

        {/* ── Cover art hero ── */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          maxHeight: '58vh',
          borderRadius: '16px',
          overflow: 'hidden',
          backgroundColor: '#141422',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}>
          {/* Dark gradient backdrop (no cover art yet for Bell) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(160deg, #1b1b30 0%, #0f0f1a 55%, #241627 100%)',
          }} />

          {/* Top pill */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.35rem 0.85rem',
            borderRadius: '999px',
            backgroundColor: 'rgba(15,15,26,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            color: '#ffffff',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Free sample — no account needed
          </div>

          {/* Item 1: Invitation button (hook phase only) */}
          {phase === 'hook' && (
            <button
              type="button"
              onClick={handleStart}
              aria-label="Hear the first episode"
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'calc(100% - 40px)',
                maxWidth: '340px',
                padding: '15px 24px',
                borderRadius: '40px',
                border: 'none',
                backgroundColor: '#f97316',
                color: '#ffffff',
                fontSize: '1.05rem',
                fontWeight: 800,
                lineHeight: 1.2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 34px rgba(0,0,0,0.55), 0 4px 16px rgba(249,115,22,0.45)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}
            >
              Hear the First Episode →
            </button>
          )}

          {/* Now playing indicator */}
          {isAudioActive && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15,15,26,0.75)',
              borderRadius: '20px',
              padding: '4px 12px',
            }}>
              <span style={{
                fontSize: '10px',
                color: '#f97316',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                ▶ Listening
              </span>
            </div>
          )}

          {/* Welcome / routing overlay */}
          {(phase === 'welcome' || phase === 'routing') && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(15,15,26,0.80)',
              gap: '12px',
            }}>
              <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                You&rsquo;re in! 🎧
              </p>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                Your story is starting…
              </p>
            </div>
          )}
        </div>

        {/* Story info */}
        <div style={{ margin: '1.1rem 1.25rem 1.2rem' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, lineHeight: 1.25, color: '#ffffff' }}>
            The Bell Beneath Falls Park
          </div>
          <div style={{ fontSize: '15px', lineHeight: 1.4, color: '#ffffff', margin: '0.45rem 0 0' }}>
            Something is wrong in Greenville. Follow every clue.
          </div>
          <div style={{ fontSize: '12.5px', color: '#9ca3af', marginTop: '0.5rem' }}>
            Mystery · Listen free
          </div>
        </div>

        {/* Item 4 — Arm C: "Continue →" after B1 ends */}
        {phase === 'b1_continue' && (
          <div style={{ width: '100%', padding: '0 1.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={handleContinue}
              style={{
                display: 'block',
                width: '100%',
                padding: '1rem 1.5rem',
                borderRadius: '40px',
                border: 'none',
                backgroundColor: '#f97316',
                color: '#ffffff',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 30px rgba(249,115,22,0.35)',
                letterSpacing: '0.01em',
              }}
            >
              Continue →
            </button>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.75rem', textAlign: 'center' }}>
              The story continues…
            </p>
          </div>
        )}

        {/* Legal */}
        <div style={{ paddingTop: '1.6rem', fontSize: '0.75rem', color: '#ffffff' }}>
          <a href="/terms"   style={{ color: '#ffffff', textDecoration: 'underline' }}>Terms</a>
          <span style={{ margin: '0 0.6rem' }}>·</span>
          <a href="/privacy" style={{ color: '#ffffff', textDecoration: 'underline' }}>Privacy</a>
        </div>
      </div>

      {/* ── Email capture wall (slides up after audio ends) ── */}
      <div
        aria-hidden={phase !== 'wall'}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'center',
          transform: phase === 'wall' ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: phase === 'wall' ? 'auto' : 'none',
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#16162a',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
          padding: '1.25rem 1.5rem calc(1.25rem + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center',
        }}>
          {/* Item 2: single-field email capture */}
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.35rem' }}>
            The story continues…
          </div>
          <div style={{ fontSize: '0.9rem', color: '#ffffff', marginBottom: '0.85rem' }}>
            Enter your email to keep listening — no credit card needed.
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '16px',
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            {submitError && (
              <p style={{ color: '#f97316', fontSize: '13px', margin: '0' }}>
                {submitError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'block',
                width: '100%',
                padding: '1rem 1.5rem',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: submitting ? '#7c3d12' : '#f97316',
                color: '#ffffff',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 30px rgba(249,115,22,0.35)',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? 'Starting your story…' : 'Keep listening →'}
            </button>
          </form>

          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
            7-day free trial · No credit card · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}
