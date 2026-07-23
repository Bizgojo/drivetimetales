'use client'

import { useState, useEffect, useCallback, useRef, Suspense, Component } from 'react'
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
  CTA_REVEAL_LISTEN_SEC,
  GO_SOCIAL_PROOF_LINE,
  GO_TRIAL_REMINDER_LINE,
} from '@/lib/landing'
import GoSamplePlayer from '@/components/GoSamplePlayer'
import GoPreviewOverlay from '@/components/GoPreviewOverlay'
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
  //
  // TRACKER-TIMING-001 (2026-07-23): Use window.location.search instead of
  // useSearchParams() for tracker init. See GoLandingContent.tsx for details.
  const listenTrackerRef = useRef<GoListenTracker | null>(null)
  const lastAudioPositionRef = useRef(0)
  if (listenTrackerRef.current === null) {
    const rawSearch =
      typeof window !== 'undefined' ? window.location.search : searchParams.toString()
    listenTrackerRef.current = createGoListenTracker({
      variant: resolveGoVariant(rawSearch),
      utmSource: new URLSearchParams(rawSearch).get('utm_source'),
      utmCampaign: new URLSearchParams(rawSearch).get('utm_campaign'),
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

  // WALK-BUG-0713 #1: per-story reveal threshold — the CTA appears only once
  // this sample's hook has landed (GoStory.ctaRevealSeconds), not a fixed 45s.
  const revealAfterSec = story.ctaRevealSeconds
  const handleListenedSeconds = useCallback((cum: number) => {
    if (cum < revealAfterSec) return
    setCtaRevealed(prev => shouldRevealTrialCta({ listenedSec: cum, alreadyRevealed: prev, revealAfterSec }))
  }, [revealAfterSec])

  // CTA href: promo + full utm_* set from the current URL → /signup.
  // source=go tells the /signup page to display + grant a 14-day trial for
  // this funnel (PR #9 server-side fix — DO NOT pass trialDays= client-side,
  // that is a billing injection vector fixed in app/api/checkout/route.ts).
  const ctaHref = (() => {
    const base = buildCampaignSignupHref(searchParams)
    return base.includes('?') ? `${base}&source=go` : `${base}?source=go`
  })()

  // ===========================================================================
  // GO-PREVIEW-001: preview state
  // ===========================================================================

  // Whether the preview is currently showing. True if the story has a
  // previewClipUrl configured. Flips to false when:
  //   a) Preview completes naturally (onPreviewEnded → transition to full ep)
  //   b) User taps the main play button (handleMainPlayDuringPreview)
  //   c) Audio load error (handlePreviewLoadError)
  const hasPreview = Boolean(story.previewClipUrl)
  const [previewActive, setPreviewActive] = useState(hasPreview)
  // shouldStopPreview: signal to GoPreviewOverlay to pause/clear the audio.
  // Separate from previewActive so the overlay can clean up before unmounting.
  const [shouldStopPreview, setShouldStopPreview] = useState(false)

  // Unmuting is tracked here for the event fire, not for gating the preview.
  // (The preview continues playing — the muted state lives inside the overlay.)

  const handlePreviewEnded = useCallback(() => {
    // Marc ruling 2026-07-22 13:14 (msg 3666): full episode continues at
    // story.previewContinueSec (138 = 2:18, end of clip). Do NOT restart at
    // 0:00 — that replays a confirmed NO-HOOK opener (HOOK-REWORK-001).
    // Secondary "Start from the beginning" control is in GoPreviewOverlay.
    setPreviewActive(false)
    listenTracker?.fireOnce('preview_to_play', story.previewContinueSec ?? 138)
    // GoSamplePlayer will auto-play from previewContinueSec when it appears.
    // The existing play_start event fires through handlePlaybackStart.
  }, [listenTracker, story.previewContinueSec])

  const handlePreviewLoadError = useCallback(() => {
    // Graceful fallback: audio failed to load. Remove preview UI; normal page.
    setPreviewActive(false)
    setShouldStopPreview(false)
  }, [])

  // User tapped main play during preview: stop preview, start full episode.
  const handleMainPlayDuringPreview = useCallback(() => {
    if (!previewActive) return
    listenTracker?.fireOnce('preview_skipped', 0)
    setShouldStopPreview(true)
    // Small delay to let the overlay's cleanup run before unmounting.
    setTimeout(() => setPreviewActive(false), 80)
  }, [previewActive, listenTracker])

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

  // CTA-HEADING-002: progress-aware heading. Pre-completion: heading advances
  // with the listener (pct75 > pct50 > default). Completion: ctaCopy.heading
  // takes over (variant-aware episode/standalone copy from getGoCtaCopy).
  // The key on the heading div re-mounts it on each change, replaying the
  // attention pulse animation exactly once per transition.
  const activeHeading = completed ? ctaCopy.heading : getGoMidHeading(pct50Reached, pct75Reached, story)

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
            hardcodes NO story id / URL.

            GO-PREVIEW-001: If the story has a previewClipUrl AND the preview
            is still active, show GoPreviewOverlay instead of GoSamplePlayer.
            When previewActive flips false (completed/stopped/error), the
            normal GoSamplePlayer mounts and the user can play from 0:00.
            Backward compat: stories without previewClipUrl always render
            GoSamplePlayer (previewActive = false from the start). */}
        {previewActive && story.previewClipUrl ? (
          <GoPreviewOverlay
            coverUrl={story.coverUrl}
            clipUrl={story.previewClipUrl}
            captionsUrl={story.previewCaptionsUrl ?? ''}
            onPreviewStarted={() => listenTracker.onPreviewStarted()}
            onPreviewCompleted={() => listenTracker.onPreviewCompleted()}
            onPreviewUnmuted={(pos) => listenTracker.onPreviewUnmuted(pos)}
            onPreviewEnded={handlePreviewEnded}
            onLoadError={handlePreviewLoadError}
            shouldStop={shouldStopPreview}
          />
        ) : (
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
        )}

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

        {/* DUPLICATE-CTA-REMOVED (Marc ruling 2026-07-22): static in-flow
            'Start free trial' block removed. The fixed bottom sheet is the
            single canonical CTA. Two identical buttons produced split
            cta_click attribution and UI confusion. */}

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
            {ctaCopy.buttonLabel}
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

// =============================================================================
// DEBUG-BOUNDARY-001: temporary client error boundary — surfaces error.message
// and stack on-screen so iOS FBAV crashes can be diagnosed without Vercel logs.
// REMOVE once the root cause is confirmed and fixed.
// =============================================================================
interface GoErrorBoundaryState { error: Error | null }
class GoErrorBoundary extends Component<{ children: React.ReactNode }, GoErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error): GoErrorBoundaryState {
    return { error }
  }
  render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f1a',
          color: '#ffffff',
          padding: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '13px',
          wordBreak: 'break-all',
          overflowY: 'auto',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.75rem', color: '#f97316', fontSize: '15px' }}>
            ⚙️ DEBUG — client error (screenshot this)
          </div>
          <div style={{ marginBottom: '1rem', color: '#ff6b6b', fontSize: '14px', fontWeight: 700 }}>
            {error.message || '(no message)'}
          </div>
          <div style={{ color: '#9ca3af', fontSize: '11px', lineHeight: 1.5 }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {error.stack || '(no stack)'}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function GoLandingPage() {
  return (
    <GoErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <GoLandingContent />
      </Suspense>
    </GoErrorBoundary>
  )
}
