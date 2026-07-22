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
}

export default GoLandingPage
