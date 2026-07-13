// lib/tracking/events.ts — ATL-PIXEL-001 (conversion tracking, Jul 13 launch)
//
// Pure, isomorphic definitions shared by the browser pixels (lib/tracking/client.ts)
// and the server-side CAPI senders (lib/tracking/capi.ts). NO node imports here —
// this module is bundled client-side.
//
// Event spec (Marc, via Orion — identical mapping both platforms):
//   1. PageView             — base pixel, all pages, client-side only
//   2. ViewContent          — /go landing views (both GVL variants), client-side
//   3. CompleteRegistration — account created; client + server (dedup by event_id)
//   4. StartTrial           — Stripe checkout completed, trial begun. PRIMARY
//                             optimization event. Client (success redirect) +
//                             server (Stripe webhook), dedup by event_id.
//   5. Subscribe            — first paid invoice after trial (Meta: Subscribe,
//                             TikTok: CompletePayment). SERVER-SIDE ONLY.
//
// Deduplication: any event that can fire client+server derives its event_id
// deterministically from the same underlying entity on both sides:
//   CompleteRegistration → reg_<supabase user id>
//   StartTrial           → st_<stripe checkout session id>
//   Subscribe            → sub_<stripe invoice id>
// Meta dedups on (event_name, event_id); TikTok dedups on event_id.

export type TrackedEventName =
  | 'PageView'
  | 'ViewContent'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'StartTrial'
  | 'Subscribe'

// Meta paid-conversion event name — DECISION PENDING WITH MARC
// (GVL_ADS_PLAYBOOK v1 reconciliation, 2026-07-13): his ticket says
// 'Subscribe'; Susan proposes standard 'Purchase' for optimization strength.
// Isolated here so the swap is ONE line either way. value+currency are sent
// regardless (webhook passes invoice amount).
export const META_PAID_CONVERSION_EVENT: 'Subscribe' | 'Purchase' = 'Subscribe'

// Meta standard events otherwise map 1:1.
export function metaEventName(name: TrackedEventName): string {
  return name === 'Subscribe' ? META_PAID_CONVERSION_EVENT : name
}

// TikTok event architecture — FINALIZED (Orion, 2026-07-13, supersedes the
// earlier standard-Subscribe-for-trial-start recommendation):
//  - OPTIMIZATION event = CompleteRegistration (standard) at account
//    creation — at $10/day, trial starts can't hit 50 conversions/week to
//    exit learning phase; registrations have the volume.
//  - StartTrial → CUSTOM event 'StartTrial' at Stripe checkout completion.
//    Attribution/reporting only, NOT the optimization target.
//  - Subscribe (first paid inv.) → 'CompletePayment' (standard). Rejected
//    for optimization: 14-day trial lag ≈ zero signals in the 30-day window.
//  - PageView → 'Pageview' (TikTok casing); InitiateCheckout standard.
// Firing moments and the event_id scheme (st_<cs>, sub_<invoice>, reg_<user>)
// are IDENTICAL across platforms — only names/roles differ per platform.
export function tiktokEventName(name: TrackedEventName): string {
  switch (name) {
    case 'PageView': return 'Pageview'
    case 'Subscribe': return 'CompletePayment'
    default: return name
  }
}

// ── Deterministic event ids (client+server dedup keys) ──────────────────────

export function registrationEventId(userId: string): string {
  return `reg_${userId}`
}

export function startTrialEventId(checkoutSessionId: string): string {
  return `st_${checkoutSessionId}`
}

export function subscribeEventId(invoiceId: string): string {
  return `sub_${invoiceId}`
}

// Client-only events (ViewContent, InitiateCheckout) have no server twin; a
// random id is still attached so retries/replays within a platform dedup.
export function randomEventId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${rand}`
}

// ── PII normalization (pre-hash; hashing itself is server-only) ─────────────
// Meta and TikTok both require lowercase/trimmed email before SHA-256.

export function normalizeEmailForHash(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : null
}

// Digits only, keep leading country code; both platforms want E.164-ish
// digits without formatting. Returns null when too short to be a phone.
export function normalizePhoneForHash(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}
