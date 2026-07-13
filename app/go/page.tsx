/*
================================================================================
🚗 /go — GVL CAMPAIGN LANDING PAGE (SUS/ATL-LANDING-002 rev C — Marc final)
Location: app/go/page.tsx

PURPOSE:
Dedicated landing page for paid ad traffic (Greenville launch). The story's
COVER ART is the hero with one big play button; below the art: story title,
one-line hook, and 'Genre · Listen free'. The trial CTA is a bottom sheet
that reveals ONLY after 45s of real listening (lib/landing.ts
shouldRevealTrialCta), plus a static always-present CTA at the very bottom
for scrollers. CTAs go to /signup carrying promo + full utm_*.

HARD RULES:
- NO auth calls of any kind. Renders identically for anonymous and
  signed-in visitors. '/go' is in PUBLIC_ROUTES (middleware.ts) so the
  middleware never touches Supabase for this path.
- Dark background, white-first text (standing UI rule; Marc rev C allows
  the small gray genre line). Orange (#f97316) is the CTA/play accent only.
- No nav, no header menu, no footer link farm. Terms/privacy links only.
- NO duration/timeline anywhere pre-play (Marc rev C): times appear only
  in the player's progress row once playing.
- NO marketing headline (rev C removed the rev-B one); the below-art
  title/hook stack is the selling copy.
- CTA REVEAL (Marc rev C): hidden on arrival; slides up (translateY bottom
  sheet) ONLY when cumulative real listening ≥ 45s, latched once shown.
  The rev-B pause-after-play and 20s-idle triggers were REMOVED (the idle
  timer fired while Marc was still reading, before play). Audio keeps
  playing when the sheet appears (sheet is an overlay; the <audio> element
  is untouched).
- A/B VARIANTS (rev C, gated): story selection via resolveGoStory(?v=a|b)
  — INERT while GO_AB_LIVE is false in lib/landing.ts (Marc has not
  approved the Greenville stories); the default Grave story always renders.
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

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { buildCampaignSignupHref, normalizePromoCode } from '@/lib/utm'
import {
  getTrialDisplay,
  PromoStatus,
  resolveGoStory,
  shouldRevealTrialCta,
  CTA_REVEAL_LISTEN_SEC,
} from '@/lib/landing'
import GoSamplePlayer from '@/components/GoSamplePlayer'
import { trackClientEvent } from '@/lib/tracking/client'
import { randomEventId } from '@/lib/tracking/events'

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

  // ===== SUS/ATL-LANDING-002 rev C: trial CTA reveal state =====
  // The sheet is hidden on arrival; the ONLY trigger is 45s of cumulative
  // real listening (player onListenedSeconds → shouldRevealTrialCta). The
  // latch (once shown, stays shown) lives here.
  const [ctaRevealed, setCtaRevealed] = useState(false)

  const handleListenedSeconds = useCallback((cum: number) => {
    if (cum < CTA_REVEAL_LISTEN_SEC) return
    setCtaRevealed(prev => shouldRevealTrialCta({ listenedSec: cum, alreadyRevealed: prev }))
  }, [])

  // A/B story selection — gated by GO_AB_LIVE in lib/landing.ts (currently
  // OFF: the default Grave story always renders regardless of ?v=).
  const story = resolveGoStory(searchParams.toString())

  // CTA href: promo + full utm_* set from the current URL → /signup.
  const ctaHref = buildCampaignSignupHref(searchParams)

  // ATL-PIXEL-001: ViewContent on landing view (both GVL variants), carrying
  // UTM params so ad platforms attribute the view. Client-only event — random
  // event_id; ref guards React 18 strict-mode double-mount in dev.
  const viewContentFired = useRef(false)
  useEffect(() => {
    if (viewContentFired.current) return
    viewContentFired.current = true
    trackClientEvent('ViewContent', {
      content_name: story.title,
      content_category: 'landing',
      content_id: story.id,
      utm_source: searchParams.get('utm_source'),
      utm_medium: searchParams.get('utm_medium'),
      utm_campaign: searchParams.get('utm_campaign'),
      utm_content: searchParams.get('utm_content'),
      utm_term: searchParams.get('utm_term'),
    }, randomEventId('vc'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

        {/* ===== HERO: cover art + big play + pill =====
            Story resolved via resolveGoStory (lib/landing.ts) — the page
            hardcodes NO story id / URL. */}
        <GoSamplePlayer
          storyId={story.id}
          audioUrl={story.audioUrl}
          coverUrl={story.coverUrl}
          title={story.title}
          onListenedSeconds={handleListenedSeconds}
        />

        {/* ===== BELOW-ART STACK (rev C): title → hook → genre line =====
            Replaces the rev-B headline. No duration anywhere pre-play. */}
        <div style={{ margin: '1.1rem 1.25rem 1.2rem' }}>
          <div style={{
            fontSize: '19px',
            fontWeight: 700,
            lineHeight: 1.25,
            color: '#ffffff',
          }}>
            {story.title}
          </div>
          <div style={{
            fontSize: '15px',
            lineHeight: 1.4,
            color: '#ffffff',
            margin: '0.45rem 0 0',
          }}>
            {story.hook}
          </div>
          <div style={{
            fontSize: '12.5px',
            color: '#9ca3af',
            marginTop: '0.5rem',
          }}>
            {story.genre} · Listen free
          </div>
        </div>

        {/* Brand mark — small, below the story stack (art owns the top) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <Image src="/images/et-logo.png" alt="" width={24} height={24} style={{ objectFit: 'contain' }} priority />
          <span style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#ffffff' }}>Endless </span>
            <span style={{ color: '#f97316' }}>Tales</span>
          </span>
        </div>

        {/* ===== STATIC BOTTOM CTA (rev C) — plain in-flow block at the very
            bottom for scrollers. Always present from arrival, never animates.
            Modest styling so it doesn't compete with the hero. */}
        <div style={{ marginTop: 'auto', width: '100%', padding: '3rem 1.5rem 0' }}>
          <Link
            href={ctaHref}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.85rem 1.25rem',
              borderRadius: '12px',
              backgroundColor: '#f97316',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Start free trial
          </Link>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.55rem' }}>
            {trial.days}-day free trial · cancel anytime
          </div>
        </div>

        {/* Legal — small, bottom */}
        <div style={{ paddingTop: '1.6rem', fontSize: '0.75rem', color: '#ffffff' }}>
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
