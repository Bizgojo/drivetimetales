// POST /api/admin/marketing/paused-build-nov09
// Commission campaign-6plus2-nov09-20261104 = option1-atlas-paused-endpoint.
// Creates 1 campaign + 1 ad set + 5 ads ALL PAUSED from the Susan mapping.
// - Auth: admin allowlist (requireAdminEmail), same as other Amendment-1 routes.
// - Token: META_ADS_MANAGEMENT_TOKEN server-side only (via lib/marketing/metaAds).
// - No ACTIVE path exists. No schedule, no CBO, no spend released ($0).
// - Budgets hard-coded from campaign-approval-card-nov09.md ($4k ceiling,
//   tranche-1 $50/day); caller-supplied budget/status/schedule → 400 REFUSED.
// - Video wiring requires all 5 Hal-captioned Meta video IDs; Hook-6 refused.
// - GET (or POST ?dryRun=1) returns the exact payloads WITHOUT touching Meta.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import {
  metaAdsConfigured,
  createPausedCampaign,
  createPausedAdSet,
  createPausedAd,
} from '@/lib/marketing/metaAds'
import {
  PAUSED_BUILD,
  HOOK_CREATIVES,
  validatePausedBuildInput,
  type PausedBuildInput,
} from '@/lib/marketing/pausedBuildNov09'

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

function plannedPayloads(input: PausedBuildInput) {
  return {
    campaign: {
      name: PAUSED_BUILD.campaignName,
      objective: PAUSED_BUILD.objective,
      status: PAUSED_BUILD.status,
      budgetMode: 'ad-set-level (no CBO)',
      start_time: null,
      end_time: null,
    },
    adSet: {
      name: PAUSED_BUILD.adSetName,
      daily_budget_cents: PAUSED_BUILD.dailyBudgetCents,
      total_ceiling_cents: PAUSED_BUILD.totalCeilingCents,
      tranche1_cents: [PAUSED_BUILD.tranche1MinCents, PAUSED_BUILD.tranche1MaxCents],
      targeting: `Advantage+ broad ${PAUSED_BUILD.country} ${PAUSED_BUILD.ageMin}-${PAUSED_BUILD.ageMax}`,
      optimization_event: PAUSED_BUILD.optimizationEvent,
      status: PAUSED_BUILD.status,
    },
    ads: HOOK_CREATIVES.map((h) => ({
      name: h.adName,
      hook: h.hook,
      video_id: input.videoIds[h.hook],
      link_url: input.gateUrl + h.utm,
      status: PAUSED_BUILD.status,
    })),
  }
}

/** GET: spec + budget proof. No Meta calls, no credentials needed. */
export async function GET() {
  return noStore({
    success: true,
    build: 'campaign-6plus2-nov09-20261104',
    status: 'ALL_PAUSED_HARDCODED',
    campaign: PAUSED_BUILD.campaignName,
    adSet: PAUSED_BUILD.adSetName,
    ads: HOOK_CREATIVES.map((h) => ({ hook: h.hook, adName: h.adName })),
    budgets_cents: {
      daily: PAUSED_BUILD.dailyBudgetCents,
      tranche1: [PAUSED_BUILD.tranche1MinCents, PAUSED_BUILD.tranche1MaxCents],
      total_ceiling: PAUSED_BUILD.totalCeilingCents,
    },
    spend: 0,
    note: 'POST with {videoIds hook1..hook5, pageId, pixelId, customConversionId, gateUrl, confirmPaused:true}. ?dryRun=1 validates without Meta calls.',
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return noStore({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const v = validatePausedBuildInput(body)
  if (!v.ok) return noStore({ success: false, error: v.error }, 400)
  const input = v.input

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  if (dryRun) {
    return noStore({ success: true, dryRun: true, planned: plannedPayloads(input), spend: 0 })
  }

  if (!metaAdsConfigured()) {
    return noStore({ success: false, error: 'META_ADS_MANAGEMENT_TOKEN not configured' }, 503)
  }

  try {
    // Piece 1: campaign shell, PAUSED.
    const campaignId = await createPausedCampaign(PAUSED_BUILD.campaignName)
    // Piece 2: single ad set, PAUSED.
    const adSetId = await createPausedAdSet({
      name: PAUSED_BUILD.adSetName,
      campaignId,
      dailyBudgetCents: String(PAUSED_BUILD.dailyBudgetCents),
      pixelId: input.pixelId,
      customConversionId: input.customConversionId,
    })
    // Piece 3: 5 hook creatives, one at a time, each PAUSED.
    const ads = []
    for (const h of HOOK_CREATIVES) {
      const r = await createPausedAd({
        name: h.adName,
        adSetId,
        pageId: input.pageId,
        videoId: input.videoIds[h.hook],
        linkUrl: input.gateUrl + h.utm,
        message: h.primary,
        title: h.headline,
        linkDescription: h.description,
      })
      ads.push({ hook: h.hook, ...r, status: PAUSED_BUILD.status })
    }
    return noStore({
      success: true,
      campaignId,
      adSetId,
      ads,
      status: 'ALL_PAUSED',
      spend: 0,
      budgets_cents: {
        daily: PAUSED_BUILD.dailyBudgetCents,
        total_ceiling: PAUSED_BUILD.totalCeilingCents,
      },
    })
  } catch (err: any) {
    return noStore({ success: false, error: String(err?.message || err).slice(0, 300) }, 502)
  }
}
