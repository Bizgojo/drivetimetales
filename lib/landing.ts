// lib/landing.ts — SUS/ATL-LANDING-001
// Pure display logic for the /go campaign landing page's trial copy.
// Extracted from the page so it is unit-testable (__tests__/landing-go-001).
//
// Mirrors the signup page's ATL-PROMO-UI-001 pattern: a promo only changes
// the DISPLAYED trial length after server-truth validation via
// GET /api/promo/validate. Missing/invalid/endpoint-error all fall back to
// the default 14-day copy (GO_BASE_TRIAL_DAYS) — quietly, never blocking
// the page.

import { applyPromoTrialDays } from './promo'

// ATL-GO-LISTEN-001 final rev (Marc msg 2868): the /go ad funnel's Stripe
// checkout grants a 14-day trial (verified in smoke tests), so ALL trial
// copy on /go — including the fail-quiet default when /api/promo/validate
// is slow or down — must say 14-day. /go-ONLY base: signup/subscribe keep
// BASE_TRIAL_DAYS (7) from lib/promo.ts; do not point them here.
export const GO_BASE_TRIAL_DAYS = 14

// UX-GO-001 revision (Marc verdict, msg 3015, 2026-07-19): the card line now
// states the post-trial price. FLAG: no dollar-amount plan config exists in
// this codebase — subscription prices are Stripe env price IDs only
// (lib/stripe.ts PRODUCTS.subscriptions carries no amounts; the dollar figure
// lives in the Stripe dashboard) and every other surface hardcodes "$7.99"
// (signup, subscribe, manage-subscription fallback, retention emails). So
// this is a HARDCODE (accepted by Marc), centralized + test-pinned here as
// /go's single source.
export const GO_MONTHLY_PRICE_DISPLAY = '$7.99'

// ============================================================================
// SUS/ATL-LANDING-002 rev C: /go story variants (Greenville A/B test).
// The DEFAULT story (Grave — live today) always renders while GO_AB_LIVE is
// false. Variants A/B are pre-staged for the Greenville test but GATED:
// Marc has not approved the Greenville stories yet. Flipping GO_AB_LIVE to
// true is the one-line follow-up that activates ?v=a|b selection.
//
// Default story provenance (rev A/B, unchanged): landing_stories slot 2
// (id 49730f36…), "The Grave He Dug Himself" — audio verified publicly
// playable (HTTP 206, dedicated landing final_mix), QA'd portrait cover in
// the public Covers bucket. The page renders a dark-gradient fallback if
// the image errors.
// ============================================================================

/**
 * Cumulative listened seconds that reveal the trial CTA — DEFAULT only.
 * WALK-BUG-0713 #1 (Marc, 2026-07-13): the reveal is PER-STORY, keyed to when
 * each sample's hook actually lands (GoStory.ctaRevealSeconds); this constant
 * is the fallback. Declared above the story literals — they reference it.
 */
export const CTA_REVEAL_LISTEN_SEC = 45

/**
 * UX-GO-001 revision (Marc verdict, msg 3015): variant-aware completion
 * heading for SERIES-OPENER samples (variants a/b — both play an Episode 1).
 * Declared above the GoStory literals — they reference it. Stories without
 * a completedHeading fall back to the standalone-safe default
 * (GO_CTA_COPY_COMPLETED.heading below).
 */
export const GO_COMPLETED_HEADING_SERIES = "That's where Episode 1 ends — for now."

export interface GoStory {
  /** landing_stories.id (default) or synthetic variant id. */
  id: string
  title: string
  genre: string
  /** One-line selling sentence shown under the title (below the art). */
  hook: string
  coverUrl: string
  audioUrl: string
  /**
   * ORION-HOME-WALK-001: main-catalog stories.id for this landing sample, so
   * post-signup /home can offer "Continue listening" into the app player
   * (which already supports /player/<id>?resume=<seconds>). null = sample has
   * no catalog counterpart yet (Grave/control — fast-follow).
   */
  catalogStoryId: string | null
  /**
   * WALK-BUG-0713 #1 (Marc, 2026-07-13): cumulative listened seconds before
   * ANY trial CTA (sheet + static footer) appears — per-story, keyed to when
   * the sample's hook lands. No CTA of any kind renders before this.
   */
  ctaRevealSeconds: number
  /**
   * UX-GO-001 revision (Marc msg 3015): per-variant completion-state sheet
   * heading. Set on series-opener samples (GO_COMPLETED_HEADING_SERIES);
   * absent/undefined → getGoCtaCopy renders the standalone-safe default.
   */
  completedHeading?: string
}

/** DEFAULT — live today. Always renders while GO_AB_LIVE is false. */
export const GO_SAMPLE_STORY: GoStory = {
  id: '49730f36-46a9-4309-927c-6b9140afac79',
  title: 'The Grave He Dug Himself',
  genre: 'Adventure',
  // SUSAN-PASS: placeholder hook, Susan owns final copy.
  hook: 'A retired sheriff comes home to bury a friend — and finds the grave already dug.',
  audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/49730f36-46a9-4309-927c-6b9140afac79/final_mix.mp3',
  coverUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/49730f36-46a9-4309-927c-6b9140afac79/cover_20260712.jpg',
  // Grave is a landing-only sample (not in the main catalog) — continue-on-home
  // for the control variant is an honest fast-follow (Marc walk, 2026-07-12).
  catalogStoryId: null,
  // Hook not yet timed for the control sample — default threshold.
  ctaRevealSeconds: CTA_REVEAL_LISTEN_SEC,
}

/** Greenville test variants — inert until GO_AB_LIVE flips to true. */
export const GO_STORY_VARIANTS: Record<string, GoStory> = {
  a: {
    id: 'go-variant-a',
    title: 'Commuter of the Year',
    genre: 'Comedy',
    // SUSAN-PASS: placeholder hook, Susan owns final copy.
    hook: 'Greenville\u2019s Commuter of the Year has never once made the drive.',
    // "The Borrowed Buick" — Commuter of the Year ep1, published 2026-07-12.
    catalogStoryId: 'fe23bfd4-d6c9-4ad9-b833-37657287c0f3',
    // Whisper transcript timing: fraud clear at 0:41, plaque read completes
    // 1:09 → CTA at 70s (Marc confirmed 2026-07-14, WALK-BUG-0713 #1).
    ctaRevealSeconds: 70,
    // Series opener (Commuter of the Year ep1) — episode-aware completion copy.
    completedHeading: GO_COMPLETED_HEADING_SERIES,
    coverUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/go-variant-a/cover.jpg',
    audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/go-variant-a/final_mix.mp3',
  },
  b: {
    id: 'go-variant-b',
    title: 'Murder at Falls Park',
    genre: 'Mystery',
    // SUSAN-PASS: placeholder hook, Susan owns final copy.
    hook: 'A shopkeeper lies dead below Liberty Bridge — and all of Greenville has a theory.',
    // "The Wrong Quote" — Murder at Falls Park ep1, published 2026-07-12.
    catalogStoryId: '09457ef0-e32f-48e2-a1bb-3311ddd68a49',
    // Falls Park hook lands at 1:36 in the sample — CTA at ~100s (Marc,
    // 2026-07-13, WALK-BUG-0713 #1 amendment).
    ctaRevealSeconds: 100,
    // Series opener (Murder at Falls Park ep1) — episode-aware completion copy.
    completedHeading: GO_COMPLETED_HEADING_SERIES,
    // Liberty Bridge corrected art (Marc redo directive 2026-07-12): curved
    // single-side-cable pedestrian suspension bridge, vision-QA PASS.
    coverUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/go-variant-b/cover_20260712_liberty.jpg',
    audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/go-variant-b/final_mix.mp3',
  },
}

// APPROVAL GATE (Marc): per-variant allowlist. A variant serves ONLY after
// Marc has listened to the story and approved its hook line.
//   'a' (Commuter of the Year): APPROVED — published + hook approved,
//        Marc 2026-07-12 13:57 EDT ("Hook approved — flip variant A live").
//   'b' (Murder at Falls Park): APPROVED — published + hook + Liberty Bridge
//        cover PASS, Marc 2026-07-12 15:50 EDT ("flip variant B live — full A/B active").
// GO_AB_LIVE retained for compatibility: true = at least one variant live.
export const GO_LIVE_VARIANTS: ReadonlyArray<string> = ['a', 'b']
export const GO_AB_LIVE = GO_LIVE_VARIANTS.length > 0

/**
 * Resolve which story /go renders from the URL query string (?v=a|b).
 * Pure: accepts the search string ('?v=a' or 'v=a' both fine). Only
 * variants in the live allowlist serve; unknown, junk, or not-yet-approved
 * ?v values fall back to the default. Never throws.
 */
export function resolveGoStory(search: string, liveVariants: ReadonlyArray<string> = GO_LIVE_VARIANTS): GoStory {
  try {
    const v = new URLSearchParams(search ?? '').get('v')
    const key = (v ?? '').trim().toLowerCase()
    if (!liveVariants.includes(key)) return GO_SAMPLE_STORY
    return GO_STORY_VARIANTS[key] ?? GO_SAMPLE_STORY
  } catch {
    return GO_SAMPLE_STORY
  }
}

// ============================================================================
// SUS/ATL-LANDING-002 rev C: trial CTA reveal logic (Marc final spec).
// The bottom-sheet trial CTA is HIDDEN on arrival and slides up ONLY when
// cumulative REAL listening reaches 45s. Rev C REMOVED the pause-after-play
// trigger and the 20s idle fallback (the idle timer fired while Marc was
// still reading, before he ever pressed play). Once revealed, it stays
// revealed (alreadyRevealed latch). Pure + exported so it is unit-testable
// (__tests__/landing-go-002).
// ============================================================================

// CTA_REVEAL_LISTEN_SEC is declared above the GoStory literals (they
// reference it); per-story values live on GoStory.ctaRevealSeconds.

export interface CtaRevealInput {
  /** Cumulative seconds of actual playback (timeupdate deltas while playing). */
  listenedSec: number
  /** Latch: once shown, stays shown. */
  alreadyRevealed?: boolean
  /** Per-story reveal threshold (GoStory.ctaRevealSeconds). Default 45. */
  revealAfterSec?: number
}

export function shouldRevealTrialCta(input: CtaRevealInput): boolean {
  if (input.alreadyRevealed) return true
  const threshold =
    Number.isFinite(input.revealAfterSec) && (input.revealAfterSec as number) > 0
      ? (input.revealAfterSec as number)
      : CTA_REVEAL_LISTEN_SEC
  return Number.isFinite(input.listenedSec) && input.listenedSec >= threshold
}

// ============================================================================
// UX-GO-001 / CTA-002 (Marc approval, msg 2942, 2026-07-19): completion-
// triggered CTA state. When the sample's <audio> fires 'ended', the bottom
// sheet transitions ONCE into a distinct completion state: the heading and
// button pivot to what-happens-next copy and the "keeps playing" footnote is
// REMOVED (it is false once the audio has ended — CTA-004). The pre-
// completion copy is unchanged. Pure + exported so the byte-exact strings
// and the latch are unit-testable without a DOM (__tests__/ux-go-001).
// ============================================================================

export interface GoCtaCopy {
  heading: string
  buttonLabel: string
  /** Footnote under the button; null = render nothing (completion state — CTA-004). */
  footnote: string | null
}

/** Pre-completion sheet copy (unchanged from rev C except the trial line,
 *  which now renders TrialDisplay.subtext — see getTrialDisplay). */
export const GO_CTA_COPY_DEFAULT: GoCtaCopy = {
  heading: 'Keep the story going',
  buttonLabel: 'Start free trial',
  footnote: 'Your story keeps playing while you sign up.',
}

/** Completion-state sheet copy (CTA-002; strings revised per Marc verdict,
 *  msg 3015, 2026-07-19). The heading here is the STANDALONE-safe default
 *  (bare /go — The Grave He Dug Himself, plus any unknown/fallback story);
 *  series-opener variants override it via GoStory.completedHeading. The
 *  button ("Hear what happens next →", Marc verbatim — replaces the earlier build's
 *  "Hear what happens next →") is identical in BOTH cases. */
export const GO_CTA_COPY_COMPLETED: GoCtaCopy = {
  heading: "And that's the story — there are hundreds more.",
  buttonLabel: "Hear what happens next →",
  // CTA-004: no footnote — "keeps playing while you sign up" is false once
  // the sample has ended.
  footnote: null,
}

/**
 * State + variant → sheet copy. Pre-completion copy is story-independent;
 * completion copy uses the story's per-variant heading when configured
 * (series openers) and the standalone-safe default otherwise. Button and
 * footnote never vary by story.
 */
export function getGoCtaCopy(completed: boolean, story?: Pick<GoStory, 'completedHeading'>): GoCtaCopy {
  if (!completed) return GO_CTA_COPY_DEFAULT
  return story?.completedHeading
    ? { ...GO_CTA_COPY_COMPLETED, heading: story.completedHeading }
    : GO_CTA_COPY_COMPLETED
}

/**
 * Completion latch: once the sample has ended, the sheet stays in its
 * completion state (a replay reaching 'ended' again must NOT re-transition
 * or re-run the attention pulse). Pure — mirrors the alreadyRevealed latch.
 */
export function nextCompletedState(alreadyCompleted: boolean, endedFired: boolean): boolean {
  return alreadyCompleted === true || endedFired === true
}

// ============================================================================
// CTA-HEADING-002 (Marc approval, 2026-07-21): progress-aware mid-listen CTA
// heading. At pct_50 and pct_75 the bottom sheet heading updates to reflect
// the listener's actual position — breaking temporal normalization and
// creating genuine urgency before completion. Static copy per Marc decision.
// Series openers (variants a/b, completedHeading set) get episode-framed copy;
// standalone bare /go gets simpler copy. Pure + exported for unit testing
// (__tests__/cta-heading-002.test.ts).
// ============================================================================

/** Series-opener mid-listen headings (variants a/b — both Episode 1 openers). */
export const GO_MID_HEADING_PCT50_SERIES = "You're halfway through Episode 1."
export const GO_MID_HEADING_PCT75_SERIES = "The ending is 2 minutes away."

/** Standalone mid-listen headings (bare /go — The Grave He Dug Himself, fallback). */
export const GO_MID_HEADING_PCT50_STANDALONE = 'Halfway through.'
export const GO_MID_HEADING_PCT75_STANDALONE = 'Almost at the ending.'

/**
 * Active CTA heading for the pre-completion sheet, keyed to the listener's
 * pct milestone state. Returns the appropriate static copy based on progress
 * and whether the story is a series opener (identified by completedHeading
 * being set — all series-opener variants define one).
 *
 * Priority: pct75 > pct50 > default ("Keep the story going").
 * Caller is responsible for gating behind !completed (completion heading is
 * managed separately by getGoCtaCopy).
 */
export function getGoMidHeading(
  pct50Reached: boolean,
  pct75Reached: boolean,
  story?: Pick<GoStory, 'completedHeading'>,
): string {
  const isSeries = Boolean(story?.completedHeading)
  if (pct75Reached) return isSeries ? GO_MID_HEADING_PCT75_SERIES : GO_MID_HEADING_PCT75_STANDALONE
  if (pct50Reached) return isSeries ? GO_MID_HEADING_PCT50_SERIES : GO_MID_HEADING_PCT50_STANDALONE
  return GO_CTA_COPY_DEFAULT.heading
}

// ============================================================================
// SUS/ATL-LANDING-001 rev B (localStorage variant): anonymous listening
// position for the /go sample. Written throttled while playing; read back on
// /go mount so the story resumes where the visitor left off — including
// after the signup round-trip in the same browser. Server-side merge and
// in-app resume are fast-follow (the sample is not in the main stories
// catalog yet, so the app player has nothing to resume into).
// ============================================================================

export const SAMPLE_PROGRESS_KEY = 'et_go_sample_progress'

/**
 * rev C (per-story resume): variants must not collide in localStorage, so
 * the progress key includes the story id. CHOICE: the default Grave story
 * KEEPS the original bare key, so resume positions saved by the live page
 * survive this deploy with zero migration; only variant stories get the
 * suffixed per-story key.
 */
export function sampleProgressKey(storyId: string): string {
  return storyId === GO_SAMPLE_STORY.id
    ? SAMPLE_PROGRESS_KEY
    : `${SAMPLE_PROGRESS_KEY}:${storyId}`
}

/** Saved progress older than this is ignored (stale ad-click sessions). */
export const SAMPLE_PROGRESS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** Min seconds of playback movement between persisted writes (throttle). */
export const SAMPLE_PROGRESS_MIN_DELTA_S = 5

export interface SampleProgress {
  storyId: string
  seconds: number
  updatedAt: number
}

export function serializeSampleProgress(storyId: string, seconds: number, now: number = Date.now()): string {
  return JSON.stringify({ storyId, seconds: Math.max(0, Math.floor(seconds)), updatedAt: now })
}

/**
 * Parse a stored progress payload. Returns resume seconds, or null when the
 * payload is missing, corrupt, for a different story, expired, or nonsense
 * (negative/NaN/non-numeric). Never throws.
 */
export function parseSampleProgress(
  raw: string | null | undefined,
  expectedStoryId: string,
  now: number = Date.now(),
  maxAgeMs: number = SAMPLE_PROGRESS_MAX_AGE_MS
): number | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SampleProgress> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.storyId !== expectedStoryId) return null
    if (typeof parsed.seconds !== 'number' || !Number.isFinite(parsed.seconds) || parsed.seconds <= 0) return null
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) return null
    if (now - parsed.updatedAt > maxAgeMs) return null
    return parsed.seconds
  } catch {
    return null
  }
}

/** Throttle: persist only when playback moved ≥ minDelta since last write. */
export function shouldPersistProgress(
  lastSavedSeconds: number | null,
  currentSeconds: number,
  minDeltaSeconds: number = SAMPLE_PROGRESS_MIN_DELTA_S
): boolean {
  if (!Number.isFinite(currentSeconds) || currentSeconds <= 0) return false
  if (lastSavedSeconds === null) return true
  return Math.abs(currentSeconds - lastSavedSeconds) >= minDeltaSeconds
}

/** localStorage write — swallow-all (private mode / quota must never break playback). */
export function saveSampleProgress(storyId: string, seconds: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(sampleProgressKey(storyId), serializeSampleProgress(storyId, seconds))
  } catch { /* never break the page over storage */ }
}

/** localStorage read — returns resume seconds or null. Never throws. */
export function loadSampleProgress(storyId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    return parseSampleProgress(localStorage.getItem(sampleProgressKey(storyId)), storyId)
  } catch {
    return null
  }
}

export type PromoStatus = 'none' | 'valid' | 'invalid'

export interface TrialDisplay {
  days: number
  ctaLabel: string
  subtext: string
  appliedBadge: string | null
}

export function getTrialDisplay(
  promoCode: string | null,
  promoStatus: PromoStatus,
  validatedDays: number | null | undefined
): TrialDisplay {
  // Same max(base, promoDays) math as checkout (lib/promo.ts), against the
  // /go ad-funnel base of 14 days (GO_BASE_TRIAL_DAYS, Marc msg 2868), so
  // the number shown matches what Stripe actually grants on this funnel.
  const days = promoStatus === 'valid'
    ? applyPromoTrialDays(GO_BASE_TRIAL_DAYS, validatedDays)
    : GO_BASE_TRIAL_DAYS
  return {
    days,
    ctaLabel: `Start Your ${days}-Day Free Trial`,
    // UX-GO-001 / CTA-001 Option A, revised per Marc verdict (msg 3015,
    // 2026-07-19) — Marc verbatim FINAL for BOTH /go CTA surfaces (sheet +
    // static footer): "Card required — you won't be charged before your
    // 14-day free trial ends. Then just $7.99/month. Cancel anytime." Days
    // come from the same fail-quiet GO_BASE_TRIAL_DAYS/promo math as `days`
    // — never hardcoded; price from GO_MONTHLY_PRICE_DISPLAY (see its flag).
    subtext: `Card required — you won't be charged before your ${days}-day free trial ends. Then just ${GO_MONTHLY_PRICE_DISPLAY}/month. Cancel anytime.`,
    // ORION-GO-OFFER-COPY-001 (Marc, 2026-07-12): never show raw promo codes
    // in customer-facing copy — generic offer language only.
    appliedBadge: promoStatus === 'valid' && promoCode ? `Special offer applied — ${days}-day free trial ✓` : null,
  }
}

// ============================================================================
// ORION-HOME-WALK-001 (Marc walk feedback, 2026-07-12): post-signup /home must
// LEAD with a "Continue listening" hero for the story the visitor was sampling
// on /go. The sample progress lives in localStorage (per-story keys above);
// these helpers find the freshest resumable sample that has a main-catalog
// counterpart, so /home can deep-link /player/<catalogStoryId>?resume=<s>.
// ============================================================================

export interface ResumableSample {
  /** Landing sample id (localStorage key owner). */
  sampleId: string
  /** Main-catalog stories.id to play in the app player. */
  catalogStoryId: string
  title: string
  genre: string
  coverUrl: string
  seconds: number
  updatedAt: number
}

/** All landing samples /home should consider (control + variants). */
export function goSampleCandidates(): GoStory[] {
  return [GO_SAMPLE_STORY, ...Object.values(GO_STORY_VARIANTS)]
}

/**
 * Parse a stored progress payload into {seconds, updatedAt}. Same validation
 * rules as parseSampleProgress (which returns seconds only — kept for the /go
 * player); never throws.
 */
export function parseSampleProgressEntry(
  raw: string | null | undefined,
  expectedStoryId: string,
  now: number = Date.now(),
  maxAgeMs: number = SAMPLE_PROGRESS_MAX_AGE_MS
): { seconds: number; updatedAt: number } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SampleProgress> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.storyId !== expectedStoryId) return null
    if (typeof parsed.seconds !== 'number' || !Number.isFinite(parsed.seconds) || parsed.seconds <= 0) return null
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) return null
    if (now - parsed.updatedAt > maxAgeMs) return null
    return { seconds: parsed.seconds, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

/**
 * Pure core: given a key→raw-payload snapshot, return the freshest resumable
 * sample that maps into the main catalog, or null. Samples without a
 * catalogStoryId (Grave/control today) are skipped — no dead-end heroes.
 */
export function pickFreshestResumableSample(
  read: (key: string) => string | null | undefined,
  now: number = Date.now()
): ResumableSample | null {
  let best: ResumableSample | null = null
  for (const story of goSampleCandidates()) {
    if (!story.catalogStoryId) continue
    const entry = parseSampleProgressEntry(read(sampleProgressKey(story.id)), story.id, now)
    if (!entry) continue
    if (!best || entry.updatedAt > best.updatedAt) {
      best = {
        sampleId: story.id,
        catalogStoryId: story.catalogStoryId,
        title: story.title,
        genre: story.genre,
        coverUrl: story.coverUrl,
        seconds: entry.seconds,
        updatedAt: entry.updatedAt,
      }
    }
  }
  return best
}

/** Browser wrapper — reads localStorage; returns null on server / any error. */
export function loadFreshestResumableSample(): ResumableSample | null {
  if (typeof window === 'undefined') return null
  try {
    return pickFreshestResumableSample((key) => localStorage.getItem(key))
  } catch {
    return null
  }
}
