// lib/marketing/pausedBuildNov09.ts — campaign-6plus2-nov09-20261104 paused-build spec.
// Commission: option1-atlas-paused-endpoint (Marc 2026-11-04). Admin endpoint
// creates 1 campaign + 1 ad set + 5 ads ALL PAUSED from the Susan mapping.
// NO ACTIVE path exists in this module. Budgets mirror
// outbox/governed-6-build-20261103/campaign-approval-card-nov09.md ($4k ceiling,
// tranche-1 $1,000–1,500); any caller-supplied budget/status/schedule/objective
// that differs is REFUSED (400), never coerced.
//
// SERVER-ONLY: no token values here; Meta calls go through metaAds.ts which
// reads META_ADS_MANAGEMENT_TOKEN server-side only.

export const PAUSED_BUILD = {
  campaignName: 'ET_Governed6_TrialStart_20261104',
  objective: 'OUTCOME_SALES',
  // Claude-review fix (endpoint-fixes-7): app StartTrial event — pixel +
  // custom_event_type START_TRIAL. No customConversionId anywhere.
  customEventType: 'START_TRIAL',
  optimizationEvent: 'Trial Start',
  adSetName: 'ET_G6_US2554_AdvPlus_Broad',
  // Cents. $50/day ≈ $1,500 / 30d — tranche-1 cap per approval card.
  dailyBudgetCents: 5000,
  // Cents. Hard ceiling for the whole 6+2 test.
  totalCeilingCents: 400000,
  // Cents. Enforced ON the campaign object as Meta spend_cap ($4,000).
  // Claude-review fix (endpoint-fixes-7): ceiling was paper-only; now API-set.
  spendCapCents: 400000,
  // Cents. Tranche-1 learning gate: $1,000–1,500 before hard review.
  tranche1MinCents: 100000,
  tranche1MaxCents: 150000,
  status: 'PAUSED',
  country: 'US',
  ageMin: 25,
  ageMax: 54,
} as const

export interface HookCreative {
  hook: string
  adName: string
  primary: string
  headline: string
  description: string
  utm: string
}

// Susan 5-ad PAUSED mapping (paper log susan-build-log-nov09-5ads.md).
// Hook-6 is SPEC-ONLY / deferred — never wired here.
export const HOOK_CREATIVES: HookCreative[] = [
  {
    hook: 'hook1',
    adName: 'ET_G6_Hook1_CaseWentCold_PAUSED',
    primary: 'She came back to Greenville with one question. Thirty years of silence is about to end.',
    headline: 'The bell. The ledger. The truth.',
    description: 'Free 14-day trial.',
    utm: '?utm_source=meta&utm_medium=paid&utm_campaign=governed6&utm_content=hook1',
  },
  {
    hook: 'hook2',
    adName: 'ET_G6_Hook2_BellRangOnce_PAUSED',
    primary: 'A missing woman. A secret ledger. A bell no one can explain.',
    headline: 'Seven episodes. Start free today.',
    description: 'Cancel anytime.',
    utm: '?utm_source=meta&utm_medium=paid&utm_campaign=governed6&utm_content=hook2',
  },
  {
    hook: 'hook3',
    adName: 'ET_G6_Hook3_LedgerBell_PAUSED',
    primary: "It starts with a sound Mara can't shake. She's not done until you know the rest.",
    headline: 'Listen to part one. Then decide.',
    description: 'Start free. No commitment.',
    utm: '?utm_source=meta&utm_medium=paid&utm_campaign=governed6&utm_content=hook3',
  },
  {
    hook: 'hook4',
    adName: 'ET_G6_Hook4_FallsPark_PAUSED',
    primary: "Falls Park has a beautiful face. What's underneath is darker than the water.",
    headline: 'Hear what happens next.',
    description: 'Free 14-day trial.',
    utm: '?utm_source=meta&utm_medium=paid&utm_campaign=governed6&utm_content=hook4',
  },
  {
    hook: 'hook5',
    adName: 'ET_G6_Hook5_StayQuiet_PAUSED',
    primary: "Greenville's most beautiful park is hiding something. Mara knows what.",
    headline: 'Start listening free.',
    description: 'Cancel anytime.',
    utm: '?utm_source=meta&utm_medium=paid&utm_campaign=governed6&utm_content=hook5',
  },
]

// Per-hook thumbnail for video_data: exactly ONE of image_hash (ad-account
// library hash) or image_url (public https). Five thumbs, one per hook.
export interface HookThumbnail {
  image_hash?: string
  image_url?: string
}

export interface PausedBuildInput {
  videoIds: Record<string, string>
  thumbnails: Record<string, HookThumbnail>
  pageId: string
  pixelId: string
  gateUrl: string
  confirmPaused: boolean
  // Resume (Claude-review fix endpoint-fixes-7): re-POST with IDs from a
  // prior piece report to continue instead of duplicating. Each optional,
  // independent, digits-only. Omitted → that object is created fresh PAUSED.
  campaignId?: string
  adSetId?: string
  // Any of these present → REFUSED (budgets/status are hard-coded, never caller-set).
  daily_budget?: unknown
  dailyBudget?: unknown
  lifetime_budget?: unknown
  budget?: unknown
  status?: unknown
  configured_status?: unknown
  start_time?: unknown
  end_time?: unknown
  schedule?: unknown
  objective?: unknown
  hook6?: unknown
  hook_6?: unknown
  videoId6?: unknown
}

export function validatePausedBuildInput(body: Record<string, unknown>): { ok: true; input: PausedBuildInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })

  if (body.confirmPaused !== true) return fail('REFUSED: confirmPaused must be true — this endpoint only builds PAUSED.')
  for (const k of ['daily_budget', 'dailyBudget', 'lifetime_budget', 'budget', 'status', 'configured_status', 'start_time', 'end_time', 'schedule', 'objective']) {
    if (body[k] !== undefined) return fail(`REFUSED: field '${k}' is hard-coded from the approval card and cannot be caller-set.`)
  }
  if (body.hook6 !== undefined || body.hook_6 !== undefined || body.videoId6 !== undefined)
    return fail('REFUSED: Hook-6 is SPEC-ONLY / deferred to a later round — not wired in the Nov 9 build.')

  // Claude-review fix (endpoint-fixes-7): customConversionId is GONE — pixel
  // START_TRIAL only. Refuse if supplied so nobody miswires a conversion ID.
  if (body.customConversionId !== undefined || body.custom_conversion_id !== undefined)
    return fail('REFUSED: customConversionId dropped per review — promoted_object is pixel_id + custom_event_type START_TRIAL only.')

  const videoIds = body.videoIds as Record<string, string> | undefined
  const expectedHooks = HOOK_CREATIVES.map((h) => h.hook)
  if (!videoIds || typeof videoIds !== 'object') return fail('REFUSED: videoIds {hook1..hook5} (Meta video IDs of Hal-captioned uploads) required.')
  for (const h of expectedHooks) {
    if (!videoIds[h] || !/^\d+$/.test(String(videoIds[h]))) return fail(`REFUSED: videoIds.${h} must be a Meta video ID (digits only).`)
  }
  const extra = Object.keys(videoIds).filter((k) => !expectedHooks.includes(k))
  if (extra.length) return fail(`REFUSED: unexpected videoIds keys: ${extra.join(',')} — exactly hook1..hook5.`)

  // Claude-review fix (endpoint-fixes-7): video_data thumbnail per hook.
  const thumbnails = body.thumbnails as Record<string, HookThumbnail> | undefined
  if (!thumbnails || typeof thumbnails !== 'object') return fail('REFUSED: thumbnails {hook1..hook5} (one image_hash or image_url per hook) required.')
  for (const h of expectedHooks) {
    const t = thumbnails[h]
    if (!t || typeof t !== 'object') return fail(`REFUSED: thumbnails.${h} required (image_hash or image_url).`)
    const hasHash = typeof t.image_hash === 'string' && t.image_hash.length > 0
    const hasUrl = typeof t.image_url === 'string' && t.image_url.length > 0
    if (hasHash === hasUrl) return fail(`REFUSED: thumbnails.${h} needs exactly ONE of image_hash / image_url.`)
    if (hasHash && !/^[0-9a-fA-F]{16,64}$/.test(t.image_hash!)) return fail(`REFUSED: thumbnails.${h}.image_hash must be a Meta image hash (hex).`)
    if (hasUrl && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(t.image_url!)) return fail(`REFUSED: thumbnails.${h}.image_url must be a live https URL.`)
  }
  const extraT = Object.keys(thumbnails).filter((k) => !expectedHooks.includes(k))
  if (extraT.length) return fail(`REFUSED: unexpected thumbnails keys: ${extraT.join(',')} — exactly hook1..hook5.`)

  for (const k of ['pageId', 'pixelId'] as const) {
    if (!body[k] || !/^\d+$/.test(String(body[k]))) return fail(`REFUSED: ${k} (Meta ID, digits only) required.`)
  }
  // Resume IDs: optional, digits-only when present.
  for (const k of ['campaignId', 'adSetId'] as const) {
    if (body[k] !== undefined && !/^\d+$/.test(String(body[k]))) return fail(`REFUSED: ${k} must be a Meta ID (digits only) when resuming.`)
  }
  const gateUrl = String(body.gateUrl || '')
  if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(gateUrl)) return fail('REFUSED: gateUrl must be a live https URL — PLACEHOLDER is not runnable.')
  if (/placeholder/i.test(gateUrl)) return fail('REFUSED: gateUrl is still PLACEHOLDER — confirm the live gate URL first.')

  return {
    ok: true,
    input: {
      videoIds,
      thumbnails,
      pageId: String(body.pageId),
      pixelId: String(body.pixelId),
      gateUrl,
      confirmPaused: true,
      ...(body.campaignId !== undefined ? { campaignId: String(body.campaignId) } : {}),
      ...(body.adSetId !== undefined ? { adSetId: String(body.adSetId) } : {}),
    },
  }
}

// ---- Pure Meta-payload builders (Claude-review fix endpoint-fixes-7) ----
// Kept here (not in metaAds.ts) so unit tests pin the review corrections
// without touching the network.

/** promoted_object: pixel + app StartTrial event. No customConversionId. */
export function buildPromotedObject(pixelId: string): Record<string, string> {
  return { pixel_id: pixelId, custom_event_type: PAUSED_BUILD.customEventType }
}

/**
 * Adv+ audience + Adv+ placements. US 25-54 (+en_US) are SUGGESTIONS under
 * advantage_audience:1 — no fixed position lists (dropped per review).
 */
export function buildAdSetTargeting(): Record<string, unknown> {
  return {
    geo_locations: { countries: ['US'] },
    locales: ['en_US'],
    age_min: PAUSED_BUILD.ageMin,
    age_max: PAUSED_BUILD.ageMax,
    targeting_automation: { advantage_audience: 1 },
  }
}
