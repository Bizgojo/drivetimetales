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
  optimizationEvent: 'Trial Start',
  adSetName: 'ET_G6_US2554_AdvPlus_Broad',
  // Cents. $50/day ≈ $1,500 / 30d — tranche-1 cap per approval card.
  dailyBudgetCents: 5000,
  // Cents. Hard ceiling for the whole 6+2 test.
  totalCeilingCents: 400000,
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

export interface PausedBuildInput {
  videoIds: Record<string, string>
  pageId: string
  pixelId: string
  customConversionId: string
  gateUrl: string
  confirmPaused: boolean
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

  const videoIds = body.videoIds as Record<string, string> | undefined
  const expectedHooks = HOOK_CREATIVES.map((h) => h.hook)
  if (!videoIds || typeof videoIds !== 'object') return fail('REFUSED: videoIds {hook1..hook5} (Meta video IDs of Hal-captioned uploads) required.')
  for (const h of expectedHooks) {
    if (!videoIds[h] || !/^\d+$/.test(String(videoIds[h]))) return fail(`REFUSED: videoIds.${h} must be a Meta video ID (digits only).`)
  }
  const extra = Object.keys(videoIds).filter((k) => !expectedHooks.includes(k))
  if (extra.length) return fail(`REFUSED: unexpected videoIds keys: ${extra.join(',')} — exactly hook1..hook5.`)

  for (const k of ['pageId', 'pixelId', 'customConversionId'] as const) {
    if (!body[k] || !/^\d+$/.test(String(body[k]))) return fail(`REFUSED: ${k} (Meta ID, digits only) required.`)
  }
  const gateUrl = String(body.gateUrl || '')
  if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(gateUrl)) return fail('REFUSED: gateUrl must be a live https URL — PLACEHOLDER is not runnable.')
  if (/placeholder/i.test(gateUrl)) return fail('REFUSED: gateUrl is still PLACEHOLDER — confirm the live gate URL first.')

  return {
    ok: true,
    input: {
      videoIds,
      pageId: String(body.pageId),
      pixelId: String(body.pixelId),
      customConversionId: String(body.customConversionId),
      gateUrl,
      confirmPaused: true,
    },
  }
}
