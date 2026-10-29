// POST /api/admin/marketing/approvals/[campaignId]/pause
// Spec Sec 10.5: pausing needs no approval. Resuming needs a new LAUNCH on
// an approved, unchanged hash. Body: { version_hash, ad_ids: string[] }

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import { setAdStatus, metaAdsConfigured } from '@/lib/marketing/metaAds'
import { upsertApproval } from '@/lib/marketing/approvalsStore'

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
  if (!metaAdsConfigured()) {
    return noStore({ success: false, error: 'META_ADS_MANAGEMENT_TOKEN not configured' }, 503)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return noStore({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const versionHash = String(body.version_hash || '')
  const adIds = Array.isArray(body.ad_ids) ? body.ad_ids.map(String).filter(Boolean) : []
  if (!versionHash || !adIds.length) {
    return noStore({ success: false, error: 'version_hash + ad_ids[] required' }, 400)
  }

  try {
    for (const id of adIds) {
      await setAdStatus(id, 'PAUSED')
    }
    await upsertApproval({
      campaignId: params.campaignId,
      versionHash,
      status: 'paused',
      notes: `Paused by ${admin} at ${new Date().toISOString()}`,
    })
    return noStore({
      success: true,
      campaignId: params.campaignId,
      version_hash: versionHash,
      status: 'paused',
    })
  } catch (err: any) {
    return noStore({ success: false, error: err?.message || String(err) }, 502)
  }
}
