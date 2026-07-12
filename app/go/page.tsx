/*
================================================================================
🚗 /go — GVL CAMPAIGN LANDING PAGE (SUS/ATL-LANDING-002 redesign of 001)
Location: app/go/page.tsx

PURPOSE:
Dedicated landing page for paid ad traffic (Greenville launch). The story's
COVER ART is the hero with one big play button; the trial CTA is a bottom
sheet that reveals only after engagement (see lib/landing.ts
shouldRevealTrialCta). Single CTA to /signup carrying promo + full utm_*.

HARD RULES:
- NO auth calls of any kind. Renders identically for anonymous and
  signed-in visitors. '/go' is in PUBLIC_ROUTES (middleware.ts) so the
  middleware never touches Supabase for this path.
- Dark background, WHITE text only (standing UI rule). Orange (#f97316) is
  allowed only as the CTA/play-button accent.
- ONE CTA. No nav, no header menu, no footer link farm. Terms/privacy
  links only.
- ABOVE THE FOLD ≤ ~12 words (Marc): one headline, no feature bullets,
  no paragraphs.
- CTA REVEAL (Marc): hidden on arrival; slides up (translateY bottom sheet)
  when 45s cumulative listening OR pause-after-play OR 20s idle with no
  play. Once shown it stays shown. Audio keeps playing when the sheet
  appears (sheet is an overlay; the <audio> element is untouched).
- UTM capture: root layout mounts <UtmCapture /> (verified in
  app/layout.tsx), which fires captureUtmFromUrl() on this route too. The
  CTA href additionally carries the full utm_* set directly, so attribution
  survives even if localStorage capture fails.
- Promo trial display mirrors app/signup/page.tsx (ATL-PROMO-UI-001):
  server-truth via GET /api/promo/validate, fail-quiet to 7-day default.
  Raw promo codes never shown (ORION-GO-OFFER-COPY-001).
================================================================================
*/

'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { buildCampaignSignupHref, normalizePromoCode } from '@/lib/utm'
import {
  getTrialDisplay,
  PromoStatus,
  GO_SAMPLE_STORY,
  shouldRevealTrialCta,
  CTA_REVEAL_LISTEN_SEC,
  CTA_REVEAL_IDLE_SEC,
} from '@/lib/landing'
import GoSamplePlayer from '@/components/GoSamplePlayer'

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

function GoLandingContent() {
  const searchParams = useSearchParams()
  // Same param precedence as app/signup/page.tsx: ?promo= wins over ?code=.
  const promoCode = normalizePromoCode(searchParams.get('promo') || searchParams.get('code'))
  // 'none' = no code or validation unavailable (fail quiet → default display)
  const [promoStatus, setPromoStatus] = useState<PromoStatus>('none')
  const [promoDays, setPromoDays] = useState<number | null>(null)

  // ===== SUS/ATL-LANDING-002: trial CTA reveal state =====
  // The sheet is hidden on arrival; engagement facts come from the player
  // callbacks, the decision is lib/landing.ts shouldRevealTrialCta, and the
  // latch (once shown, stays shown) lives here.
  const [ctaRevealed, setCtaRevealed] = useState(false)
  const everPlayedRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const evaluateReveal = useCallback((facts: { listenedSec?: number; pausedAfterPlay?: boolean; idleSec?: number }) => {
    setCtaRevealed(prev => shouldRevealTrialCta({
      listenedSec: facts.listenedSec ?? 0,
      everPlayed: everPlayedRef.current,
      pausedAfterPlay: facts.pausedAfterPlay ?? false,
      idleSec: facts.idleSec ?? 0,
      alreadyRevealed: prev,
    }))
  }, [])

  // (c) idle fallback: ~20s with NO play ever pressed → reveal. The timer is
  // cleared on first play, so an engaged listener never hits this path.
  useEffect(() => {
    idleTimerRef.current = setTimeout(() => {
      evaluateReveal({ idleSec: CTA_REVEAL_IDLE_SEC })
    }, CTA_REVEAL_IDLE_SEC * 1000)
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [evaluateReveal])

  const handleFirstPlay = useCallback(() => {
    everPlayedRef.current = true
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])

  // (a) cumulative listening reaches threshold (timeupdate-driven, playing only)
  const handleListenedSeconds = useCallback((cum: number) => {
    if (cum >= CTA_REVEAL_LISTEN_SEC) evaluateReveal({ listenedSec: cum })
  }, [evaluateReveal])

  // (b) paused after having played (ended counts too)
  const handlePauseAfterPlay = useCallback(() => {
    evaluateReveal({ pausedAfterPlay: true })
  }, [evaluateReveal])

  // CTA href: promo + full utm_* set from the current URL → /signup.
  const ctaHref = buildCampaignSignupHref(searchParams)

  // ATL-PROMO-UI-001 pattern: server-truth promo validation for honest trial
  // display. Valid → real trial length + "applied" badge. Invalid, missing,
  // or endpoint down/slow → quietly keep the 7-day default. Never blocking.
  useEffect(() => {
    if (!promoCode) { setPromoStatus('none'); return }
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    fetch(`/api/promo/validate?code=${encodeURIComponent(promoCode)}`, { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { valid?: boolean; days?: number | null } | null) => {
        if (cancelled || !data) return
        if (data.valid === true) {
          setPromoStatus('valid')
          setPromoDays(typeof data.days === 'number' ? data.days : null)
        } else if (data.valid === false) {
          setPromoStatus('invalid')
        }
      })
      .catch(() => { /* fail quiet — default 7-day display */ })
      .finally(() => clearTimeout(timer))
    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [promoCode])

  const trial = getTrialDisplay(promoCode, promoStatus, promoDays)

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
      // No top padding: the cover art is full-bleed at the very top (mobile).
      padding: '0 0 2rem',
      position: 'relative',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: '480px', // desktop: art capped, centered card
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        // Room so the fixed CTA sheet never covers the legal links when open.
        paddingBottom: ctaRevealed ? '230px' : '0',
      }}>

        {/* ===== HERO: cover art + big play + pill + slim info bar =====
            Swappable via the single GO_SAMPLE_STORY const in lib/landing.ts —
            the page hardcodes NO story id / URL. */}
        <GoSamplePlayer
          storyId={GO_SAMPLE_STORY.id}
          audioUrl={GO_SAMPLE_STORY.audioUrl}
          coverUrl={GO_SAMPLE_STORY.coverUrl}
          title={GO_SAMPLE_STORY.title}
          genre={GO_SAMPLE_STORY.genre}
          durationMins={GO_SAMPLE_STORY.durationMins}
          onFirstPlay={handleFirstPlay}
          onPauseAfterPlay={handlePauseAfterPlay}
          onListenedSeconds={handleListenedSeconds}
        />

        {/* ===== THE headline (≤12 words above the fold — this is 5) ===== */}
        <h1 style={{
          fontSize: 'clamp(1.7rem, 7.5vw, 2.4rem)',
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: '#ffffff',
          margin: '1.4rem 1.25rem 0.9rem',
        }}>
          Stories made for the drive.
        </h1>

        {/* Brand mark — small, below the headline (art owns the top) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <Image src="/images/et-logo.png" alt="" width={24} height={24} style={{ objectFit: 'contain' }} priority />
          <span style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#ffffff' }}>Endless </span>
            <span style={{ color: '#f97316' }}>Tales</span>
          </span>
        </div>

        {/* Legal — small, bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '2rem', fontSize: '0.75rem', color: '#ffffff' }}>
          <Link href="/terms" style={{ color: '#ffffff', textDecoration: 'underline' }}>Terms</Link>
          <span style={{ margin: '0 0.6rem' }}>·</span>
          <Link href="/privacy" style={{ color: '#ffffff', textDecoration: 'underline' }}>Privacy</Link>
        </div>
      </div>

      {/* ===== TRIAL CTA — bottom sheet, hidden on arrival =====
          Slides up via translateY once shouldRevealTrialCta fires; the audio
          element lives outside this overlay and is never interrupted. */}
      <div
        aria-hidden={!ctaRevealed}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'center',
          transform: ctaRevealed ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: ctaRevealed ? 'auto' : 'none',
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
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.35rem' }}>
            Keep the story going
          </div>

          {/* Promo applied badge (only after server-truth validation; never raw codes) */}
          {trial.appliedBadge && (
            <div style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              {trial.appliedBadge}
            </div>
          )}

          <div style={{ fontSize: '0.9rem', color: '#ffffff', marginBottom: '0.85rem' }}>
            {trial.days}-day free trial · cancel anytime
          </div>

          {/* THE one CTA */}
          <Link
            href={ctaHref}
            style={{
              display: 'block',
              width: '100%',
              padding: '1rem 1.5rem',
              borderRadius: '12px',
              backgroundColor: '#f97316',
              color: '#ffffff',
              fontSize: '1.1rem',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 8px 30px rgba(249,115,22,0.35)',
            }}
          >
            Start free trial
          </Link>

          <p style={{ fontSize: '0.8rem', color: '#ffffff', margin: '0.7rem 0 0', lineHeight: 1.45 }}>
            Your story keeps playing while you sign up.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function GoLandingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoLandingContent />
    </Suspense>
  )
}
