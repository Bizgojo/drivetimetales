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
- Promo trial display mirrors app/signup/page.tsx's ATL-PROMO-UI-001
  pattern: server-truth via GET /api/promo/validate, fail-quiet to the
  14-day default (GO_BASE_TRIAL_DAYS — the ad funnel's Stripe checkout
  grants 14 days; Marc msg 2868). Raw promo codes never shown
  (ORION-GO-OFFER-COPY-001).
- UX-GO-001 (Marc approval, msg 2942, 2026-07-19):
  · CTA-001 Option A — both CTA surfaces render the honest card-required
    line via getTrialDisplay().subtext (card required · no charge before
    trial ends · cancel anytime); days stay on the fail-quiet
    GO_BASE_TRIAL_DAYS/promo path, never hardcoded.
  · CTA-002 — on the sample's 'ended' (existing onPlaybackEnded hook) the
    bottom sheet latches ONCE into a completion state (getGoCtaCopy):
    heading/button pivot, footnote removed (CTA-004), one-time ~300ms
    scale/glow attention pulse. No audio-element interaction; cta_click
    event unchanged. Completion also shows the CTAs even if the 45s+
    listen latch never fired (seek-to-end) — the sheet must not be a
    dead end at the highest-intent moment.
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
  getGoCtaCopy,
  nextCompletedState,
  PromoStatus,
  resolveGoStory,
  shouldRevealTrialCta,
  CTA_REVEAL_LISTEN_SEC,
} from '@/lib/landing'
import GoSamplePlayer from '@/components/GoSamplePlayer'
import { trackClientEvent } from '@/lib/tracking/client'
import { randomEventId } from '@/lib/tracking/events'
import { createGoListenTracker, resolveGoVariant, GoListenTracker } from '@/lib/goListen'

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

  // UX-GO-001 CTA-002: completion latch — flips true ONCE on the sample's
  // 'ended' and never unsets (nextCompletedState), so the sheet transitions
  // to its completion state exactly once (a replay can't re-trigger the
  // pulse). Render-only state: the <audio> element is never touched.
  const [completed, setCompleted] = useState(false)

  // A/B story selection — gated by GO_AB_LIVE in lib/landing.ts (currently
  // OFF: the default Grave story always renders regardless of ?v=).
  const story = resolveGoStory(searchParams.toString())

  // ===== ATL-GO-LISTEN-001: first-party listen analytics =====
  // One tracker per page visit (lazy ref — session_id = crypto.randomUUID(),
  // never persisted). The tracker latches every event to at-most-once and is
  // swallow-all: no failure in here can reach the audio element. The variant
  // recorded is what's actually SERVED (unknown/gated ?v= → 'bare').
  const listenTrackerRef = useRef<GoListenTracker | null>(null)
  const lastAudioPositionRef = useRef(0)
  if (listenTrackerRef.current === null) {
    listenTrackerRef.current = createGoListenTracker({
      variant: resolveGoVariant(searchParams.toString()),
      utmSource: searchParams.get('utm_source'),
      utmCampaign: searchParams.get('utm_campaign'),
    })
  }
  const listenTracker = listenTrackerRef.current
  const handlePlaybackStart = useCallback((pos: number) => {
    lastAudioPositionRef.current = pos
    listenTracker.onPlayStart(pos)
  }, [listenTracker])
  const handlePlaybackProgress = useCallback((pos: number, dur: number) => {
    lastAudioPositionRef.current = pos
    listenTracker.onTimeUpdate(pos, dur)
  }, [listenTracker])
  const handlePlaybackEnded = useCallback((pos: number) => {
    lastAudioPositionRef.current = pos
    listenTracker.onEnded(pos)
    // UX-GO-001 CTA-002: latch the completion CTA state (once, render-only).
    setCompleted(prev => nextCompletedState(prev, true))
  }, [listenTracker])
  // cta_click: fired from BOTH CTAs (bottom sheet + static footer) — latched
  // to once per session by the tracker. Never preventDefault / never blocks
  // the navigation (sendBeacon survives the page exit by design).
  const handleCtaClick = useCallback(() => {
    listenTracker.onCtaClick(lastAudioPositionRef.current)
  }, [listenTracker])

  // WALK-BUG-0713 #1: per-story reveal threshold — the CTA appears only once
  // this sample's hook has landed (GoStory.ctaRevealSeconds), not a fixed 45s.
  const revealAfterSec = story.ctaRevealSeconds
  const handleListenedSeconds = useCallback((cum: number) => {
    if (cum < revealAfterSec) return
    setCtaRevealed(prev => shouldRevealTrialCta({ listenedSec: cum, alreadyRevealed: prev, revealAfterSec }))
  }, [revealAfterSec])

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
  // or endpoint down/slow → quietly keep the 14-day default (this funnel's
  // Stripe checkout grants 14 days — Marc msg 2868). Never blocking.
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
      .catch(() => { /* fail quiet — default 14-day display */ })
      .finally(() => clearTimeout(timer))
    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [promoCode])

  const trial = getTrialDisplay(promoCode, promoStatus, promoDays)

  // UX-GO-001 CTA-002: state-dependent sheet copy + visibility. The 45s+
  // listen reveal latch (shouldRevealTrialCta → ctaRevealed) is UNCHANGED;
  // completion additionally shows the CTAs (seek-to-end must not dead-end).
  const ctaCopy = getGoCtaCopy(completed)
  const sheetVisible = ctaRevealed || completed

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
        paddingBottom: sheetVisible ? '230px' : '0',
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
          onPlaybackStart={handlePlaybackStart}
          onPlaybackProgress={handlePlaybackProgress}
          onPlaybackEnded={handlePlaybackEnded}
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

        {/* ===== STATIC BOTTOM CTA — WALK-BUG-0713 #1 (Marc, 2026-07-13):
            NO trial CTA of any kind before the hook lands. This block now
            renders only after the same per-story reveal latch as the sheet
            (was: always present from arrival — that was the walk bug). */}
        {sheetVisible && (
        <div style={{ marginTop: 'auto', width: '100%', padding: '3rem 1.5rem 0' }}>
          <Link
            href={ctaHref}
            onClick={handleCtaClick}
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
          {/* UX-GO-001 CTA-001 Option A: honest card-required trial line. */}
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.55rem' }}>
            {trial.subtext}
          </div>
        </div>
        )}

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
        aria-hidden={!sheetVisible}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'center',
          transform: sheetVisible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: sheetVisible ? 'auto' : 'none',
        }}
      >
        {/* UX-GO-001 CTA-002: one-time ~300ms attention pulse when the sheet
            enters its completion state. iteration-count 1 + the completed
            latch = it can never replay. Pure CSS — no audio interaction. */}
        <style dangerouslySetInnerHTML={{ __html: '@keyframes goCtaCompletionPulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); box-shadow: 0 -12px 48px rgba(249,115,22,0.45); } 100% { transform: scale(1); } }' }} />
        <div style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#16162a',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
          padding: '1.25rem 1.5rem calc(1.25rem + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center',
          animation: completed ? 'goCtaCompletionPulse 300ms ease-out 1' : 'none',
        }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.35rem' }}>
            {ctaCopy.heading}
          </div>

          {/* Promo applied badge (only after server-truth validation; never raw codes) */}
          {trial.appliedBadge && (
            <div style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              {trial.appliedBadge}
            </div>
          )}

          {/* UX-GO-001 CTA-001 Option A: honest card-required trial line
              (getTrialDisplay().subtext — replaces the bare days-line). */}
          <div style={{ fontSize: '0.9rem', color: '#ffffff', marginBottom: '0.85rem' }}>
            {trial.subtext}
          </div>

          {/* THE one CTA — same href/promo/utm in both states; cta_click unchanged */}
          <Link
            href={ctaHref}
            onClick={handleCtaClick}
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
            {ctaCopy.buttonLabel}
          </Link>

          {/* CTA-004: footnote only while the claim is true (pre-completion). */}
          {ctaCopy.footnote && (
            <p style={{ fontSize: '0.8rem', color: '#ffffff', margin: '0.7rem 0 0', lineHeight: 1.45 }}>
              {ctaCopy.footnote}
            </p>
          )}
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
