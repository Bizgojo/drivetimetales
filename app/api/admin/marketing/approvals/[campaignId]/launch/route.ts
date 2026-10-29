// POST /api/admin/marketing/approvals/[campaignId]/launch
// Spec Sec 7.4 (launch gate) + Sec 10 (launch/pause). The ONLY path that
// switches an ad from PAUSED to ACTIVE. Recomputes the hash from LIVE Meta
// data and refuses unless it matches an approved hash with all tests passing.
// Body: { version_hash, ad_ids: string[] }

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail, isLaunchAuthorized } from '@/lib/marketing/adminAuth'
import { fetchAdDetail, setAdStatus, metaAdsConfigured } from '@/lib/marketing/metaAds'
import { computeVersionHash, allChecksPass } from '@/lib/marketing/amendment1'
import { getApproval, getLatestTestRun, upsertApproval } from '@/lib/marketing/approvalsStore'

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin
  // Spec Sec 10.1: LAUNCH visible to Susan and Orion only (Marc included via allowlist).
  const susanToken = process.env.SUSAN_MARKETING_TOKEN
  const callerIsSusan =
    Boolean(susanToken) &&
    (req.headers.get('x-susan-api-key') === susanToken ||
      req.headers.get('authorization') === `Bearer ${susanToken}`)
  if (!callerIsSusan && !isLaunchAuthorized(admin)) {
    return noStore({ success: false, error: 'LAUNCH_NOT_AUTHORIZED' }, 403)
  }
  if (!metaAdsConfigured()) {
    return noStore({ success: false, error: 'META_ADS_MANAGEMENT_TOKEN not configured' }, 503)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return noStore({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const claimedHash = String(body.version_hash || '')
  const adIds = Array.isArray(body.ad_ids) ? body.ad_ids.map(String).filter(Boolean) : []
  if (!claimedHash || !adIds.length) {
    return noStore({ success: false, error: 'version_hash + ad_ids[] required' }, 400)
  }

  try {
    // 1. Recompute hash from LIVE Meta data.
    const ads = await Promise.all(adIds.map((id) => fetchAdDetail(id)))
    const first = ads[0]
    const creative = first.creative || {}
    const liveHash = await computeVersionHash({
      metaAdIds: adIds,
      creativeIds: ads.map((a) => a.creative?.id || '').filter(Boolean),
      videoAssetHash: creative.video_id || creative.image_hash || '',
      headline: creative.title || creative.object_story_spec?.link_data?.name || '',
      primaryText: creative.body || creative.object_story_spec?.link_data?.message || '',
      ctaType:
        creative.call_to_action_type ||
        creative.object_story_spec?.link_data?.call_to_action?.type ||
        '',
      destinationUrl:
        creative.link_url || creative.object_story_spec?.link_data?.link || '',
      claims: [],
      budgetCeiling: String(body.spend_ceiling || ''),
    })

    // 2. Claimed hash must match live hash.
    if (liveHash !== claimedHash) {
      return noStore({
        success: false,
        error: 'HASH_MISMATCH',
        message: 'Live Meta data changed since approval — needs re-approval. Launch refused.',
      }, 409)
    }

    // 3. Hash must be approved.
    const approval = await getApproval(params.campaignId, liveHash)
    if (!approval || approval.status !== 'approved') {
      return noStore({
        success: false,
        error: 'NOT_APPROVED',
        message: 'No approval on the current version hash. Launch refused.',
      }, 409)
    }

    // 4. All six tests must pass on this hash.
    const tests = await getLatestTestRun(params.campaignId, liveHash)
    if (!tests || !allChecksPass(tests)) {
      return noStore({
        success: false,
        error: 'TESTS_NOT_PASSING',
        message: 'All six checks must Pass on the current hash. Launch refused.',
      }, 409)
    }

    // 5. Gate passed — switch PAUSED → ACTIVE via the management token.
    for (const id of adIds) {
      await setAdStatus(id, 'ACTIVE')
    }
    await upsertApproval({
      campaignId: params.campaignId,
      versionHash: liveHash,
      status: 'live',
      launchedBy: callerIsSusan ? 'maya' : admin,
    })
    return noStore({
      success: true,
      campaignId: params.campaignId,
      version_hash: liveHash,
      status: 'live',
      launched_by: callerIsSusan ? 'maya' : admin,
    })
  } catch (err: any) {
    return noStore({ success: false, error: err?.message || String(err) }, 502)
  }
}
