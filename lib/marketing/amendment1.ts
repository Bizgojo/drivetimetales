// lib/marketing/amendment1.ts — Amendment 1 shared types, version hash, constants.
// Spec: docs/specs/amendment-1-ad-preview-and-testing-spec.md
// Isomorphic (Web Crypto only — no node imports) so the approval card can
// use it client-side and API routes can use it server-side.

export const AMENDMENT1_PLACEMENTS = [
  'MOBILE_FEED_STANDARD',
  'INSTAGRAM_STANDARD',
  'INSTAGRAM_STORY',
  'INSTAGRAM_REELS',
  'FACEBOOK_REELS_MOBILE',
  'DESKTOP_FEED_STANDARD',
] as const

export type Amendment1Placement = (typeof AMENDMENT1_PLACEMENTS)[number]

export const AMENDMENT1_CHECKS = [
  'video_audio',
  'destination_url',
  'signup',
  'checkout',
  'tracking',
  'mobile',
] as const

export type Amendment1Check = (typeof AMENDMENT1_CHECKS)[number]

export type CheckResult = 'pass' | 'fail' | 'not_tested'

export const CHECK_LABELS: Record<Amendment1Check, string> = {
  video_audio: 'Video/audio — video loads, has an audio stream, correct duration',
  destination_url: 'Destination URL — exact production URL returns 200, hero + play above the fold',
  signup: 'Signup — magic-link signup completes (test inbox or admin-generated link)',
  checkout: 'Subscription checkout — $9.99/mo, $79.99/yr, 14-day trial, card required; Stripe test-mode 4242 completes',
  tracking: 'Conversion tracking — test events land in Supabase flagged test + Meta Test Events tab; nothing in production analytics',
  mobile: 'Mobile experience — whole flow passes on iPhone profile and desktop',
}

export interface VersionHashInput {
  metaAdIds: string[]
  creativeIds: string[]
  videoAssetHash: string
  headline: string
  primaryText: string
  ctaType: string
  destinationUrl: string
  claims: string[]
  budgetCeiling: string
}

/**
 * Spec Sec 4.1: SHA-256 over Meta ad IDs, creative IDs, video asset hash,
 * headline, primary text, CTA type, full destination URL, claims list,
 * budget ceiling. Sorted arrays so field order can't change the hash.
 */
function canonicalJson(input: VersionHashInput): string {
  return JSON.stringify({
    metaAdIds: [...input.metaAdIds].sort(),
    creativeIds: [...input.creativeIds].sort(),
    videoAssetHash: input.videoAssetHash,
    headline: input.headline,
    primaryText: input.primaryText,
    ctaType: input.ctaType,
    destinationUrl: input.destinationUrl,
    claims: [...input.claims].sort(),
    budgetCeiling: input.budgetCeiling,
  })
}

export async function computeVersionHash(input: VersionHashInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function shortHash(hash: string): string {
  return hash.slice(0, 10)
}

export function allChecksPass(results: Record<Amendment1Check, CheckResult>): boolean {
  return AMENDMENT1_CHECKS.every((c) => results[c] === 'pass')
}

// Env var NAMES referenced by Amendment 1 (values live in Vercel; never printed).
// Spec Sec 11.4. Preview/Stripe-test wiring per spec Sec 6.3 + task meta:
//   - Launches use META_ADS_MANAGEMENT_TOKEN only — never META_ACCESS_TOKEN.
//   - Stripe test keys apply to Preview only (STRIPE_TEST_SECRET_KEY).
export const AMENDMENT1_ENV_NAMES = [
  'NEXT_PUBLIC_META_PIXEL_ID',
  'META_CAPI_TOKEN',
  'META_TEST_EVENT_CODE',
  'META_ADS_MANAGEMENT_TOKEN',
  'META_AD_ACCOUNT_ID',
  'STRIPE_TEST_SECRET_KEY',
] as const

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'live'
  | 'paused'
