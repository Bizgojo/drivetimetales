// POST /api/admin/marketing/paused-build-nov09
// Commission campaign-6plus2-nov09-20261104 = option1-atlas-paused-endpoint.
// Creates 1 campaign + 1 ad set + 6 ads ALL PAUSED from the Susan mapping
// (hooks 1–5 + hook6 romance slot).
// - Auth: admin allowlist (requireAdminEmail), same as other Amendment-1 routes.
// - Token: META_ADS_MANAGEMENT_TOKEN server-side only (via lib/marketing/metaAds).
// - No ACTIVE path exists. No schedule, no CBO, no spend released ($0).
// - Budgets hard-coded from campaign-approval-card-nov09.md ($4k ceiling,
//   tranche-1 $50/day); caller-supplied budget/status/schedule → 400 REFUSED.
// - Video wiring requires all 6 Hal-captioned Meta video IDs (hook1..hook6),
//   each PAUSED-only; refused if not paused.
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
    campaign_spend_cap_cents: PAUSED_BUILD.spendCapCents,
    adSet: {
      name: PAUSED_BUILD.adSetName,
      daily_budget_cents: PAUSED_BUILD.dailyBudgetCents,
      total_ceiling_cents: PAUSED_BUILD.totalCeilingCents,
      tranche1_cents: [PAUSED_BUILD.tranche1MinCents, PAUSED_BUILD.tranche1MaxCents],
      targeting: `Advantage+ audience + placements, ${PAUSED_BUILD.country} ${PAUSED_BUILD.ageMin}-${PAUSED_BUILD.ageMax} suggestions`,
      optimization_event: PAUSED_BUILD.optimizationEvent,
      promoted_object: { pixel_id: input.pixelId, custom_event_type: PAUSED_BUILD.customEventType },
      status: PAUSED_BUILD.status,
    },
    ads: HOOK_CREATIVES.map((h) => ({
      name: h.adName,
      hook: h.hook,
      video_id: input.videoIds[h.hook],
      thumbnail: input.thumbnails[h.hook],
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
    resume: 'Re-POST with campaignId and/or adSetId from a prior piece report to continue instead of duplicating.',
    note: 'POST with {videoIds hook1..hook6, thumbnails hook1..hook6 (image_hash|xor image_url), pageId, pixelId, gateUrl, confirmPaused:true}. ?dryRun=1 validates without Meta calls.',
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
    // Piece 1: campaign shell, PAUSED (+ $4k spend_cap). Skipped when resuming.
    let campaignId = input.campaignId
    let campaignReused = false
    if (!campaignId) {
      campaignId = await createPausedCampaign(PAUSED_BUILD.campaignName, PAUSED_BUILD.spendCapCents)
    } else {
      campaignReused = true
    }
    // Piece 2: single ad set, PAUSED. Skipped when resuming.
    let adSetId = input.adSetId
    let adSetReused = false
    if (!adSetId) {
      adSetId = await createPausedAdSet({
        name: PAUSED_BUILD.adSetName,
        campaignId,
        dailyBudgetCents: String(PAUSED_BUILD.dailyBudgetCents),
        pixelId: input.pixelId,
      })
    } else {
      adSetReused = true
    }
    // Piece 3: 6 hook creatives, one at a time, each PAUSED.
    const ads = []
    for (const h of HOOK_CREATIVES) {
      const thumb = input.thumbnails[h.hook]
      const r = await createPausedAd({
        name: h.adName,
        adSetId,
        pageId: input.pageId,
        videoId: input.videoIds[h.hook],
        ...(thumb.image_hash ? { thumbnailHash: thumb.image_hash } : { thumbnailUrl: thumb.image_url }),
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
      campaignReused,
      adSetId,
      adSetReused,
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
