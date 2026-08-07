'use client'

// =============================================================================
// LANDING-GATE-001 — Bell Beneath Falls Park invitation funnel
// Route: /go?arm=1|2|3
//
// Campaign entry path — Belle welcome plays here. Library path (EP1→EP2)
// does not route through this component.
//
// Arm A (arm=1): PV1 (84.96s)    → wall (name+email) → signup → Belle welcome → EP2
// Arm B (arm=2): PV2 (188.25s)   → wall (name+email) → signup → Belle welcome → EP2
// Arm C (arm=3): PV3-B1 (76.44s) → "Continue →" button → PV3-B2 (193.70s)
//               → wall (name+email) → signup → Belle welcome → EP2
//
// HOOK-CARD-001 (Marc design ruling, 2026-08-07):
// · Hook text is the DOMINANT element — first thing the eye lands on
// · Cover art is secondary — dim background blur, never competing
// · Button: "Listen in…" + ear cue — NOT a play triangle, no scrubber
// · NO autoplay on load — listener taps/clicks to start
// · NO Belle name visible anywhere on page
// · WHITE text only (#ffffff) — no gray-on-dark
// · Mobile first — phone traffic, one-handed
// · Hook line placeholder: Marc to confirm PV1 or PV3-B1 line
//
// EP2 BLOCKER (2026-08-07): "The Bell Beneath Falls Park — Episode 2" does
// NOT exist in the stories table. EP2_FALLBACK_URL = '/home' until EP2 is
// seeded. Update EP2_FALLBACK_URL to the real story URL when ready.
//
// Item 3 — Belle welcome (personalized):
//   Name provided → GET /api/name-audio?name={name} → audio_url → play it.
//   Name blank or /api/name-audio fails → fall back to welcome_B.mp3.
//
// Styling: dark bg (#0f0f0f), WHITE text only, inline styles.
// =============================================================================

import { useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Bell promo audio URLs (Supabase public storage, status=audio_ready) ─────
const BELL_BASE =
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3'

const AUDIO_PV1   = `${BELL_BASE}/a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e/story_body.mp3`
const AUDIO_PV2   = `${BELL_BASE}/a88084ab-62e3-47f4-9b7a-5cbc32943349/story_body.mp3`
const AUDIO_PV3B1 = `${BELL_BASE}/a37fdc46-24d0-49a7-b749-320076978c3b/story_body.mp3`
const AUDIO_PV3B2 = `${BELL_BASE}/4784f4d6-cae4-48ce-a094-73415c700380/story_body.mp3`

// Cover images — PV1 and PV2 have art; PV3-B1 has none (build without)
const COVER_PV1 =
  `${BELL_BASE}/a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e/cover_1785337095142.jpg`
const COVER_PV2 =
  `${BELL_BASE}/a88084ab-62e3-47f4-9b7a-5cbc32943349/cover_1785337196082.jpg`

// Hook lines per arm
// HOOK-CARD-001 PLACEHOLDER — Marc to confirm which line to use
// PV1 cold open:    "The water rushed beneath Greenville's Liberty Bridge."
// PV3-B1 cold open: "In Greenville, the Reedy River keeps its secrets beneath Falls Park, especially after dark."
const HOOK_LINES: Record<1 | 2 | 3, string> = {
  1: "\u201CThe water rushed beneath Greenville\u2019s Liberty Bridge.\u201D",
  2: "\u201CThe water rushed beneath Greenville\u2019s Liberty Bridge.\u201D",
  3: "\u201CIn Greenville, the Reedy River keeps its secrets beneath Falls Park, especially after dark.\u201D",
}

function getCoverUrl(arm: 1 | 2 | 3): string | null {
  if (arm === 2) return COVER_PV2
  if (arm === 1) return COVER_PV1
  return null // PV3-B1 has no cover art — build without
}

// Item 3: Belle welcome clip (personalized via /api/name-audio, fallback to welcome_B.mp3)
const BELLE_WELCOME_URL =
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/welcome/welcome_B.mp3'

// TODO EP2: replace with real EP2 player URL once Bell EP2 is in the stories table.
const EP2_FALLBACK_URL = '/home'

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase =
  | 'hook'        // Arrival: hook text + "Listen in…" button
  | 'playing'     // Arm A/B: promo playing; Arm C: B1 playing
  | 'b1_continue' // Arm C only: B1 ended, showing "Continue →" button
  | 'b2_playing'  // Arm C only: B2 playing
  | 'wall'        // Name+email capture wall
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

  const phaseRef = useRef<Phase>('hook')
  const [phase, setPhase] = useState<Phase>('hook')
  const goTo = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const welcomeRef = useRef<HTMLAudioElement | null>(null)

  // ── "Listen in…" pressed → load + play arm's first promo ────────────────────
  const handleStart = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = arm === 2 ? AUDIO_PV2 : arm === 3 ? AUDIO_PV3B1 : AUDIO_PV1
    audio.load()
    audio.play().catch(() => { /* autoplay policy — listener can tap again */ })
    goTo('playing')
  }, [arm, goTo])

  // ── Promo audio ended ────────────────────────────────────────────────────────
  const handleAudioEnded = useCallback(() => {
    const cur = phaseRef.current
    if (cur === 'playing') {
      goTo(arm === 3 ? 'b1_continue' : 'wall')
    } else if (cur === 'b2_playing') {
      goTo('wall')
    }
  }, [arm, goTo])

  // ── Arm C: "Continue →" → play B2 ───────────────────────────────────────────
  const handleContinue = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = AUDIO_PV3B2
    audio.load()
    audio.play().catch(() => {})
    goTo('b2_playing')
  }, [goTo])

  // ── Wall submit → signup → Belle welcome → auth-link → EP2 ──────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !email.trim()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/go/invite-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
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

      goTo('welcome')
      const capturedEmail = email.trim()
      const capturedName  = name.trim()

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

      let welcomeUrl = BELLE_WELCOME_URL
      if (capturedName) {
        try {
          const nameAudioResp = await fetch(`/api/name-audio?name=${encodeURIComponent(capturedName)}`)
          if (nameAudioResp.ok) {
            const nameData = await nameAudioResp.json() as { audio_url?: string }
            if (nameData.audio_url) welcomeUrl = nameData.audio_url
          }
        } catch {
          // fallback to welcome_B.mp3
        }
      }

      const wa = welcomeRef.current
      if (wa) {
        wa.src = welcomeUrl
        wa.load()
        wa.play().catch(() => { void routeToEp2() })
        wa.onended = () => { void routeToEp2() }
        setTimeout(() => { void routeToEp2() }, 12_000)
      } else {
        void routeToEp2()
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }, [email, name, arm, submitting, searchParams, goTo])

  const coverUrl = getCoverUrl(arm)
  const hookLine = HOOK_LINES[arm]

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f0f',
      color: '#ffffff',
      fontFamily: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Hidden audio elements */}
      <audio ref={audioRef}   onEnded={handleAudioEnded} style={{ display: 'none' }} />
      <audio ref={welcomeRef}                            style={{ display: 'none' }} />

      {/* ── HOOK CARD (arrival phase) ─────────────────────────────────────── */}
      {phase === 'hook' && (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
        }}>
          {/* Cover art — background only, dim, never competes with hook */}
          {coverUrl && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                opacity: 0.07,
                filter: 'blur(14px)',
                transform: 'scale(1.06)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Hook text — DOMINANT, first thing the eye lands on */}
          <p style={{
            fontSize: 'clamp(22px, 5vw, 36px)',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '600px',
            margin: '0 0 40px 0',
            position: 'relative',
            zIndex: 1,
          }}>
            {hookLine}
          </p>

          {/* "Listen in…" button — ear cue, no triangle, no scrubber */}
          <button
            type="button"
            onClick={handleStart}
            aria-label="Start listening"
            style={{
              background: '#1a1a1a',
              border: '1.5px solid rgba(255,255,255,0.2)',
              color: '#ffffff',
              fontSize: '18px',
              fontWeight: 600,
              padding: '16px 40px',
              borderRadius: '50px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              position: 'relative',
              zIndex: 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: '20px' }}>👂</span>
            Listen in…
          </button>
        </div>
      )}

      {/* ── PLAYING (audio active) ────────────────────────────────────────── */}
      {(phase === 'playing' || phase === 'b2_playing') && (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
        }}>
          {/* Cover art — visible during playback, still secondary */}
          {coverUrl && (
            <>
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url(${coverUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center top',
                  opacity: 0.18,
                  filter: 'blur(6px)',
                  transform: 'scale(1.04)',
                  pointerEvents: 'none',
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, rgba(15,15,15,0.4) 0%, rgba(15,15,15,0.85) 100%)',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {/* Story hook — still visible, white, dominant */}
          <p style={{
            fontSize: 'clamp(20px, 4.5vw, 30px)',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '580px',
            margin: '0 0 28px 0',
            position: 'relative',
            zIndex: 1,
          }}>
            {hookLine}
          </p>

          {/* Minimal listening cue — no scrubber, no controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            position: 'relative',
            zIndex: 1,
          }}>
            <span style={{ fontSize: '20px' }}>👂</span>
            <span style={{ fontSize: '15px', color: '#ffffff', fontWeight: 500 }}>
              Listening…
            </span>
          </div>
        </div>
      )}

      {/* ── ARM C: CONTINUE (B1 ended) ────────────────────────────────────── */}
      {phase === 'b1_continue' && (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 'clamp(20px, 4.5vw, 30px)',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '580px',
            margin: '0 0 36px 0',
          }}>
            {hookLine}
          </p>

          <button
            type="button"
            onClick={handleContinue}
            style={{
              background: '#1a1a1a',
              border: '1.5px solid rgba(255,255,255,0.25)',
              color: '#ffffff',
              fontSize: '18px',
              fontWeight: 600,
              padding: '16px 40px',
              borderRadius: '50px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Continue →
          </button>

          <p style={{ fontSize: '13px', color: '#ffffff', marginTop: '14px', opacity: 0.6 }}>
            The story continues…
          </p>
        </div>
      )}

      {/* ── WELCOME / ROUTING overlay (post-signup) ───────────────────────── */}
      {(phase === 'welcome' || phase === 'routing') && (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px' }}>
            You&rsquo;re in! 🎧
          </p>
          <p style={{ fontSize: '0.95rem', color: '#ffffff', opacity: 0.75, margin: 0 }}>
            Your story is starting…
          </p>
        </div>
      )}

      {/* ── EMAIL CAPTURE WALL (slides up after audio ends) ──────────────── */}
      {/* Covers the playing/hook view when wall phase is active */}
      {phase === 'wall' && (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0',
        }}>
          {/* Blurred hook text background */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
          }}>
            <p style={{
              fontSize: 'clamp(18px, 4vw, 28px)',
              fontWeight: 700,
              color: '#ffffff',
              opacity: 0.35,
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: '560px',
              margin: 0,
            }}>
              {hookLine}
            </p>
          </div>
        </div>
      )}

      {/* ── WALL SHEET (fixed bottom, slides in) ─────────────────────────── */}
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
          backgroundColor: '#141414',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.65)',
          padding: '1.25rem 1.5rem calc(1.25rem + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.35rem' }}>
            The story continues…
          </div>
          <div style={{ fontSize: '0.9rem', color: '#ffffff', marginBottom: '0.85rem' }}>
            Enter your name and email to keep listening.
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Name field: friendly/first name — fills welcome greeting */}
            <input
              type="text"
              placeholder="Your first name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="given-name"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: 'none',
                background: 'rgba(255,255,255,0.12)',
                color: '#ffffff',
                fontSize: '16px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <input
              type="email"
              placeholder="Your email"
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

          <p style={{ fontSize: '0.75rem', color: '#ffffff', opacity: 0.45, margin: '0.5rem 0 0', lineHeight: 1.4 }}>
            Free to start · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}
