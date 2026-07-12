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
// SUS/ATL-LANDING-001 rev A: the ONE curated free sample story on /go.
// Swap the sample by editing THIS CONST ONLY — nothing else references a
// story id. Chosen row: landing_stories slot 2 (id 49730f36…), "The Grave
// He Dug Himself":
//   - audio verified publicly playable (HTTP 206, 16 MB, dedicated landing
//     final_mix at audio/landing/<id>/final_mix.mp3)
//   - 14 min — long enough that visitors sign up to CONTINUE (slot 1
//     "When Rosie Came Home" is only 3 min and finishes pre-signup;
//     slot 3's audio_url returns 400)
//   - cover_url for ALL landing_stories rows currently 400s, so no cover
//     is rendered (add coverUrl here when fixed).
// ============================================================================
export const GO_SAMPLE_STORY = {
  /** landing_stories.id */
  id: '49730f36-46a9-4309-927c-6b9140afac79',
  title: 'The Grave He Dug Himself',
  author: 'Dale Harmon',
  genre: 'Adventure',
  durationMins: 14,
  audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/49730f36-46a9-4309-927c-6b9140afac79/final_mix.mp3',
} as const

// ============================================================================
// SUS/ATL-LANDING-001 rev B (localStorage variant): anonymous listening
// position for the /go sample. Written throttled while playing; read back on
// /go mount so the story resumes where the visitor left off — including
// after the signup round-trip in the same browser. Server-side merge and
// in-app resume are fast-follow (the sample is not in the main stories
// catalog yet, so the app player has nothing to resume into).
// ============================================================================

export const SAMPLE_PROGRESS_KEY = 'et_go_sample_progress'

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
    localStorage.setItem(SAMPLE_PROGRESS_KEY, serializeSampleProgress(storyId, seconds))
  } catch { /* never break the page over storage */ }
}

/** localStorage read — returns resume seconds or null. Never throws. */
export function loadSampleProgress(storyId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    return parseSampleProgress(localStorage.getItem(SAMPLE_PROGRESS_KEY), storyId)
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
