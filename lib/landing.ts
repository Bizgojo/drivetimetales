// lib/landing.ts — SUS/ATL-LANDING-001
// Pure display logic for the /go campaign landing page's trial copy.
// Extracted from the page so it is unit-testable (__tests__/landing-go-001).
//
// Mirrors the signup page's ATL-PROMO-UI-001 pattern: a promo only changes
// the DISPLAYED trial length after server-truth validation via
// GET /api/promo/validate. Missing/invalid/endpoint-error all fall back to
// the default 7-day copy — quietly, never blocking the page.

import { BASE_TRIAL_DAYS, applyPromoTrialDays } from './promo'

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

/** Cumulative listened seconds that reveal the trial CTA. */
export const CTA_REVEAL_LISTEN_SEC = 45

export interface CtaRevealInput {
  /** Cumulative seconds of actual playback (timeupdate deltas while playing). */
  listenedSec: number
  /** Latch: once shown, stays shown. */
  alreadyRevealed?: boolean
}

export function shouldRevealTrialCta(input: CtaRevealInput): boolean {
  if (input.alreadyRevealed) return true
  return Number.isFinite(input.listenedSec) && input.listenedSec >= CTA_REVEAL_LISTEN_SEC
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
  // Same max(base, promoDays) math as checkout (lib/promo.ts), so the number
  // shown matches what Stripe will actually grant at signup.
  const days = promoStatus === 'valid'
    ? applyPromoTrialDays(BASE_TRIAL_DAYS, validatedDays)
    : BASE_TRIAL_DAYS
  return {
    days,
    ctaLabel: `Start Your ${days}-Day Free Trial`,
    subtext: `Free for ${days} days. Cancel anytime — you won't be charged before your trial ends.`,
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
