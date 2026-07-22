/*
================================================================================
🚗 /go — GVL CAMPAIGN LANDING PAGE (SUS/ATL-LANDING-002 rev C — Marc final)
Location: app/go/page.tsx

GO-PREVIEW-001 (Marc authorization, msg 3662, 2026-07-22):
Muted autoplay preview clip for variants with previewClipUrl configured.
- Preview plays automatically (muted) on page load via an HTML5 audio element
  (muted + autoplay attributes) — managed in components/GoPreviewOverlay.tsx
- Captions rendered via custom overlay synchronized to audio.currentTime
  (NOT a <track> element — Meta in-app browser doesn't render <track>)
- Single "Tap for sound" unmute button — one tap sets audio.muted = false
  (requires user gesture; works in Meta iOS WebKit in-app browser)
- On preview complete (15s): transition to full episode from 0:00
  OPEN DECISION (logged to Marc, 2026-07-22): start at 0:00 or 2:02 (previewStartSec)
  Currently defaults to 0:00. See comment below in handlePreviewEnded.
- If user taps main play button during preview: stop preview, start full episode
- New go_listen_events: preview_started, preview_completed, preview_unmuted
  (fired to GO_LISTEN_ENDPOINT alongside existing play_start / pct / complete)

Meta in-app browser (FBAN/FBIOS) requirements:
- UA: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15
       (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]
- muted autoplay: allowed with muted+autoplay attributes, no gesture needed
- unmute: MUST be inside a user gesture (touchend/click) — .muted=false inside
  a React onClick handler satisfies this requirement
- <track> captions: not reliably rendered in in-app browsers — using custom overlay
- Audio load failures: graceful fallback to normal page (no preview UI visible)

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
- UX-GO-001 (Marc approval msg 2942; copy revised per Marc verdict
  msg 3015, 2026-07-19):
  · CTA-001 Option A — both CTA surfaces render the honest card-required
    line via getTrialDisplay().subtext (card required · no charge before
    trial ends · then just $7.99/month · cancel anytime); days stay on the
    fail-quiet GO_BASE_TRIAL_DAYS/promo path, never hardcoded; price from
    lib/landing GO_MONTHLY_PRICE_DISPLAY.
  · CTA-002 — on the sample's 'ended' (existing onPlaybackEnded hook) the
    bottom sheet latches ONCE into a completion state (getGoCtaCopy):
    heading/button pivot — heading is VARIANT-AWARE (msg 3015): series
    openers (a/b) get the episode heading via GoStory.completedHeading,
    the standalone default (bare /go) gets the hundreds-more heading —
    footnote removed (CTA-004), one-time ~300ms scale/glow attention
    pulse. No audio-element interaction; cta_click
    event unchanged. Completion also shows the CTAs even if the 45s+
    listen latch never fired (seek-to-end) — the sheet must not be a
    dead end at the highest-intent moment.
- CTA-HEADING-002 (Marc approval, 2026-07-21):
  · Progress-aware CTA heading: the bottom sheet heading advances with
    the listener at pct_50 and pct_75, replacing the static
    'Keep the story going' that normalizes into background noise after
    8+ minutes on screen.
- TRUST-SIGNALS-001 (Marc approval, 2026-07-21):
  · Social proof: '60+ original stories across 10 genres' displayed in the
    page body, always visible (no reveal gate). Signals catalog depth
    before the listener commits.
  · Trial reminder: 'We'll email you a heads-up before your trial ends.'
    displayed in the bottom sheet (both states) and static footer.
    Accurate to the real email cadence (Day 3 / Day 10 / Day 13 —
    see app/api/cron/trial-emails/route.ts). Addresses the
    'I'll forget and get charged' fear without overpromising a specific
    day. No auth calls; no new beacons; copy-only addition.
  · Series openers (a/b): pct_50 → 'You're halfway through Episode 1.',
    pct_75 → 'The ending is 2 minutes away.'
  · Standalone (bare): pct_50 → 'Halfway through.', pct_75 → 'Almost
    at the ending.'
  · Heading div uses key=activeHeading to re-mount on each change,
    replaying the existing goCtaCompletionPulse animation once per
    transition. Animation gated on any milestone reached (never fires
    on initial reveal). No new events, no new beacons, no auth calls.
    Measurement: existing cta_click.position_seconds disambiguates
    which heading state converted.
- GO-ACCURACY-001 (Marc authorization, msg 3691, 2026-07-22):
  · Social proof corrected to '60+ original stories across 10 genres'
    (actual counts: 61 published, 10 genres).
  · generateMetadata added: story-specific OG/Twitter tags per ?v= param.
    Client component extracted to GoLandingPageClient.tsx; this file is
    now a server component so Next.js can call generateMetadata at request
    time. Page render behaviour is identical.
================================================================================
*/

import type { Metadata } from 'next'
import { resolveGoStory, GO_LIVE_VARIANTS } from '@/lib/landing'
import GoLandingPage from './GoLandingPageClient'

// GO-ACCURACY-001 (Marc authorization, msg 3691, 2026-07-22):
// Story-specific OG + Twitter card meta tags for /go. resolveGoStory is called
// server-side with the same logic the client component uses at runtime, so the
// crawler always sees the correct story for a given ?v= variant. The default
// (bare /go or unknown v=) resolves to GO_SAMPLE_STORY ("The Grave He Dug
// Himself"). coverUrl drives the social card image (1200×630 crop target).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { v?: string }
}): Promise<Metadata> {
  const story = resolveGoStory(
    new URLSearchParams(searchParams as Record<string, string>).toString(),
    GO_LIVE_VARIANTS,
  )

  return {
    title: `${story.title} — Listen Free | Endless Tales`,
    description: story.hook,
    openGraph: {
      title: `${story.title} — Listen Free | Endless Tales`,
      description: story.hook,
      url: `https://app.endless-tales.com/go?v=${searchParams.v ?? ''}`,
      images: story.coverUrl
        ? [{ url: story.coverUrl, width: 1200, height: 630, alt: story.title }]
        : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${story.title} — Listen Free | Endless Tales`,
      description: story.hook,
      images: story.coverUrl ? [story.coverUrl] : undefined,
    },
  }
<<<<<<< HEAD
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
  // cta_click: fired from the bottom sheet CTA — latched to once per session
  // by the tracker. Never preventDefault / never blocks the navigation
  // (sendBeacon survives the page exit by design).
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
  // SECURITY FIX (feat/funnel-fixes-001 rev 2, Marc msg 3732, 2026-07-22):
  // Pass source=go so the CHECKOUT SERVER determines trial days (14 via
  // GO_BASE_TRIAL_DAYS). Never pass trialDays= as a client URL param —
  // client-controlled billing input is the same class as the May entitlement
  // regression (attacker could set ?trialDays=3650 for a 10-year trial).
  const _baseHref = buildCampaignSignupHref(searchParams)
  const ctaHref = _baseHref.includes('?')
    ? `${_baseHref}&source=go`
    : `${_baseHref}?source=go`

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

        {/* Static duplicate CTA removed (feat/funnel-fixes-001): the
            bottom sheet (UX-GO-001 CTA-002) is the single canonical CTA.
            Having two Links to /signup caused ambiguous cta_click attribution
            and contradictory button copy when trialDays differed. */}

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
=======
>>>>>>> origin/main
}

export default GoLandingPage
