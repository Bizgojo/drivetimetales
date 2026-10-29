// GET /api/admin/marketing/approvals/[campaignId] — Campaign Approval Card data.
// Spec Sec 2. Recomputes the version hash from LIVE Meta data on every load
// (Sec 7.4 launch gate uses the same function); compares against the stored
// approval to surface "CHANGED SINCE APPROVAL".

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import { fetchAdDetail, metaAdsConfigured } from '@/lib/marketing/metaAds'
import {
  computeVersionHash,
  shortHash,
  allChecksPass,
  AMENDMENT1_CHECKS,
  type CheckResult,
} from '@/lib/marketing/amendment1'
import { getApproval, getLatestApproval, getLatestTestRun } from '@/lib/marketing/approvalsStore'

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

function adIdsFor(campaignId: string, req: NextRequest): string[] {
  // Airtable campaign record id → Meta ad ids mapping arrives via ?ad_ids=.
  // Susan stores the PAUSED draft ad ids on the campaign; the card passes
  // them through. Single-ad campaigns pass one id.
  const raw = req.nextUrl.searchParams.get('ad_ids') || ''
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin
  const { campaignId } = params

  const adIds = adIdsFor(campaignId, req)
  if (!adIds.length) {
    return noStore({
      success: false,
      error: 'MISSING_AD_IDS',
      message: 'Pass ?ad_ids=<meta_ad_id,...> for the PAUSED draft ads Susan built for this campaign.',
    }, 400)
  }
  if (!metaAdsConfigured()) {
    return noStore({
      success: false,
      error: 'META_ADS_MANAGEMENT_TOKEN not configured',
      missing: ['META_ADS_MANAGEMENT_TOKEN'],
    }, 503)
  }

  try {
    const ads = await Promise.all(adIds.map((id) => fetchAdDetail(id)))
    const first = ads[0]
    const creative = first.creative || {}
    const linkUrl =
      creative.link_url ||
      creative.object_story_spec?.link_data?.link ||
      ''
    const claims = (req.nextUrl.searchParams.get('claims') || '')
      .split('|').map((s) => s.trim()).filter(Boolean)
    const budgetCeiling = req.nextUrl.searchParams.get('spend_ceiling') || ''

    const versionHash = await computeVersionHash({
      metaAdIds: adIds,
      creativeIds: ads.map((a) => a.creative?.id || '').filter(Boolean),
      videoAssetHash: creative.video_id || creative.image_hash || '',
      headline: creative.title || creative.object_story_spec?.link_data?.name || '',
      primaryText: creative.body || creative.object_story_spec?.link_data?.message || '',
      ctaType: creative.call_to_action_type || creative.object_story_spec?.link_data?.call_to_action?.type || '',
      destinationUrl: linkUrl,
      claims,
      budgetCeiling,
    })

    const approval = await getApproval(campaignId, versionHash)
    const latestApproval = await getLatestApproval(campaignId)
    const testResults = (await getLatestTestRun(campaignId, versionHash)) || {
      video_audio: 'not_tested',
      destination_url: 'not_tested',
      signup: 'not_tested',
      checkout: 'not_tested',
      tracking: 'not_tested',
      mobile: 'not_tested',
    } as Record<(typeof AMENDMENT1_CHECKS)[number], CheckResult>

    // Spec Sec 4.3: any field change produces a new hash. If a prior approval
    // exists on a DIFFERENT hash, the live creative changed since approval.
    const changedSinceApproval = Boolean(
      latestApproval && latestApproval.version_hash !== versionHash
    )
    const approveEnabled = allChecksPass(testResults)
    const liveStatuses = ads.map((a) => a.effective_status)

    return noStore({
      success: true,
      campaignId,
      versionHash,
      shortHash: shortHash(versionHash),
      changedSinceApproval,
      approveEnabled,
      approval,
      testResults,
      destinationUrl: linkUrl,
      shareablePreviewLink: first.previewable_share_link || null,
      ads: ads.map((a) => ({
        adId: a.adId,
        name: a.name,
        configured_status: a.configured_status,
        effective_status: a.effective_status,
        headline: a.creative?.title,
        primaryText: a.creative?.body,
        ctaType: a.creative?.call_to_action_type,
        videoId: a.creative?.video_id || null,
      })),
      live: liveStatuses.some((s) => s === 'ACTIVE'),
    })
  } catch (err: any) {
    return noStore({ success: false, error: err?.message || String(err) }, 502)
  }
}

// POST — Marc's decision buttons (Sec 7.1–7.3).
// Body: { version_hash, action: 'approve'|'request_changes'|'reject',
//         spend_ceiling?, notes?, owner_tested_personally? }
import { upsertApproval } from '@/lib/marketing/approvalsStore'

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin
  const { campaignId } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return noStore({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const versionHash = String(body.version_hash || '')
  const action = String(body.action || '')
  if (!versionHash || !['approve', 'request_changes', 'reject'].includes(action)) {
    return noStore({ success: false, error: 'version_hash + action (approve|request_changes|reject) required' }, 400)
  }

  // Approve requires all six checks passing on THIS hash (Sec 7.1).
  if (action === 'approve') {
    const testResults = await getLatestTestRun(campaignId, versionHash)
    if (!testResults || !allChecksPass(testResults)) {
      return noStore({
        success: false,
        error: 'APPROVE_BLOCKED',
        message: 'All six checks must Pass on the current version hash before approval.',
      }, 409)
    }
  }

  const status =
    action === 'approve' ? 'approved'
    : action === 'request_changes' ? 'changes_requested'
    : 'rejected'

  await upsertApproval({
    campaignId,
    versionHash,
    status,
    decidedBy: admin,
    spendCeiling: typeof body.spend_ceiling === 'string' ? body.spend_ceiling : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  return noStore({ success: true, campaignId, version_hash: versionHash, status })
}
