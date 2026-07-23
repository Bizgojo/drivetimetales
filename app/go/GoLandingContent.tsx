/*
================================================================================
🚗 GoLandingContent — client component for /go
CTA-INSTRUMENTATION-001 (2026-07-22): extracted to own file so that
app/go/page.tsx can be a server component that fetches GoVariantConfig
at render time.

BUILD 1: cta_rendered event — fires once when ctaRevealed transitions
false→true (bottom sheet first becomes visible at 45s cumulative listening).
Guarded by ctaRenderedFiredRef; never fires on completion-pulse or
heading changes.

BUILD 2: GoVariantConfig prop — heading / cta_label / reveal_sec may be
overridden by the go_variant_config table row fetched server-side.
Hardcoded values remain as fallback when variantConfig is null or a field
is null (table pre-migration, DB unavailable, row missing).
================================================================================
*/

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { buildCampaignSignupHref, normalizePromoCode } from '@/lib/utm'
import {
  getTrialDisplay,
  getGoCtaCopy,
  getGoMidHeading,
  nextCompletedState,
  PromoStatus,
  resolveGoStory,
  shouldRevealTrialCta,
  GO_CTA_COPY_DEFAULT,
  GO_SOCIAL_PROOF_LINE,
  GO_TRIAL_REMINDER_LINE,
} from '@/lib/landing'
import GoSamplePlayer from '@/components/GoSamplePlayer'
import { trackClientEvent } from '@/lib/tracking/client'
import { randomEventId } from '@/lib/tracking/events'
import { createGoListenTracker, resolveGoVariant, GoListenTracker } from '@/lib/goListen'
import type { GoVariantConfigRow } from '@/lib/goVariantConfig'

interface GoLandingContentProps {
  /** BUILD 2: server-fetched variant config row; null = use hardcoded fallbacks. */
  variantConfig?: GoVariantConfigRow | null
}

export default function GoLandingContent({ variantConfig }: GoLandingContentProps) {
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

  // CTA-HEADING-002: mid-listen pct milestone state. Refs guard the set calls
  // against stale-closure double-fires inside the progress callback; the
  // booleans drive the heading render. Both latch once (never reset).
  const pct50FiredRef = useRef(false)
  const pct75FiredRef = useRef(false)
  const [pct50Reached, setPct50Reached] = useState(false)
  const [pct75Reached, setPct75Reached] = useState(false)

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
    // CTA-HEADING-002: detect pct_50 / pct_75 position milestones to update
    // the mid-listen CTA heading. Refs guard against stale-closure double-fire;
    // setState is stable and safe to call inside useCallback. Position-based
    // (pos/dur) mirrors how the tracker fires pct events internally.
    if (dur > 0) {
      if (!pct50FiredRef.current && pos / dur >= 0.5) {
        pct50FiredRef.current = true
        setPct50Reached(true)
      }
      if (!pct75FiredRef.current && pos / dur >= 0.75) {
        pct75FiredRef.current = true
        setPct75Reached(true)
      }
    }
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

  // ===== BUILD 1: cta_rendered one-shot event =====
  // Fires exactly once per session when the bottom sheet first becomes visible
  // (ctaRevealed transitions false→true via the 45s listen latch).
  // The ref guard prevents double-fire in React 18 strict-mode double-mount.
  // Does NOT fire on completed (seek-to-end without meeting the listen latch)
  // — that's a different signal (completion without reveal).
  const ctaRenderedFiredRef = useRef(false)
  useEffect(() => {
    if (!ctaRevealed || ctaRenderedFiredRef.current) return
    ctaRenderedFiredRef.current = true
    listenTracker.onCtaRendered(lastAudioPositionRef.current)
  }, [ctaRevealed, listenTracker])

  // WALK-BUG-0713 #1: per-story reveal threshold — the CTA appears only once
  // this sample's hook has landed (GoStory.ctaRevealSeconds), not a fixed 45s.
  // BUILD 2: variantConfig.reveal_sec overrides the story default when set.
  const revealAfterSec =
    variantConfig?.reveal_sec != null && variantConfig.reveal_sec > 0
      ? variantConfig.reveal_sec
      : story.ctaRevealSeconds
  const handleListenedSeconds = useCallback((cum: number) => {
    if (cum < revealAfterSec) return
    setCtaRevealed(prev => shouldRevealTrialCta({ listenedSec: cum, alreadyRevealed: prev, revealAfterSec }))
  }, [revealAfterSec])

  // CTA href: promo + full utm_* set from the current URL → /signup.
  // source=go tells /signup to display + grant a 14-day trial for this funnel
  // (server-side; DO NOT pass trialDays= client-side — billing injection vector).
  const ctaHref = (() => {
    const base = buildCampaignSignupHref(searchParams)
    return base.includes('?') ? `${base}&source=go` : `${base}?source=go`
  })()

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
  // msg 3015: the served story picks the variant-aware completion heading.
  const ctaCopy = getGoCtaCopy(completed, story)
  const sheetVisible = ctaRevealed || completed

  // CTA-HEADING-002 + BUILD 2: progress-aware heading with config override.
  // Pre-completion: heading advances with the listener (pct75 > pct50 > default).
  // BUILD 2: when at the pre-milestone default heading, variantConfig.heading
  // (Susan's copy) may override it. Milestone and completion headings are
  // NOT overridable by Susan (those are story-specific / progress-driven).
  // Completion: ctaCopy.heading takes over (variant-aware episode/standalone).
  const preCompletionHeading =
    !pct50Reached && !pct75Reached
      ? (variantConfig?.heading ?? GO_CTA_COPY_DEFAULT.heading)
      : getGoMidHeading(pct50Reached, pct75Reached, story)
  const activeHeading = completed ? ctaCopy.heading : preCompletionHeading

  // BUILD 2: config-driven CTA button label for the pre-completion state.
  // Post-completion label ("Hear what happens next →") is story-specific
  // and not Susan-editable via the config table.
  const sheetButtonLabel = completed
    ? ctaCopy.buttonLabel
    : (variantConfig?.cta_label ?? ctaCopy.buttonLabel)
  const footerCtaLabel = variantConfig?.cta_label ?? 'Start free trial'

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

        {/* TRUST-SIGNALS-001: catalog depth social proof — displayed in the
            page body, always visible once the page loads (no reveal gate).
            Signals product substance before the listener commits. */}
        <div style={{
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center',
          marginBottom: '0.75rem',
          letterSpacing: '0.01em',
        }}>
          {GO_SOCIAL_PROOF_LINE}
        </div>

        {/* STATIC BOTTOM CTA REMOVED — Marc ruling 2026-07-22 18:27 EDT (msg 3866).
            Duplicate of bottom sheet CTA. One CTA only: the bottom sheet below.
            Removal re-applied to GoLandingContent in fix/go-landing-content-source-and-cta
            (originally fixed in GoLandingPageClient but GoLandingContent was written before
            that fix existed — regression caught 2026-07-23). */}

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
          {/* CTA-HEADING-002: key on heading text forces a fresh DOM node on
              each milestone transition (pct50 → pct75 → completion), replaying
              the attention pulse animation exactly once per heading change.
              Animation gated on any milestone reached so it never fires on
              the initial reveal (before any milestone). */}
          <div
            key={activeHeading}
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#ffffff',
              marginBottom: '0.35rem',
              animation: (pct50Reached || pct75Reached || completed)
                ? 'goCtaCompletionPulse 300ms ease-out 1'
                : 'none',
            }}
          >
            {activeHeading}
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
            {sheetButtonLabel}
          </Link>

          {/* CTA-004: footnote only while the claim is true (pre-completion). */}
          {ctaCopy.footnote && (
            <p style={{ fontSize: '0.8rem', color: '#ffffff', margin: '0.7rem 0 0', lineHeight: 1.45 }}>
              {ctaCopy.footnote}
            </p>
          )}

          {/* TRUST-SIGNALS-001: trial reminder reassurance — always shown in
              the sheet (both pre-completion and completion states). Accurate
              to the actual email cadence (Day 3 / Day 10 / Day 13). */}
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
            {GO_TRIAL_REMINDER_LINE}
          </p>
        </div>
      </div>
    </div>
  )
}
