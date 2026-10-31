// GET /api/admin/marketing/approvals/[campaignId]/previews?ad_ids=...,...&ad_id=...
// Spec Sec 3: fresh Meta previews on EVERY load; never cached.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import { fetchAdDetail, fetchAdPreviews, metaAdsConfigured } from '@/lib/marketing/metaAds'
import { AMENDMENT1_PLACEMENTS } from '@/lib/marketing/amendment1'

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin
  if (!metaAdsConfigured()) {
    return noStore({
      success: false,
      error: 'META_ADS_MANAGEMENT_TOKEN not configured',
      internalSimulation: true,
    }, 503)
  }
  const adId = req.nextUrl.searchParams.get('ad_id') || ''
  if (!adId) return noStore({ success: false, error: 'ad_id required' }, 400)

  try {
    const [detail, previews] = await Promise.all([
      fetchAdDetail(adId),
      fetchAdPreviews(adId, AMENDMENT1_PLACEMENTS),
    ])
    const unavailable = previews.filter((p) => !p.iframe_html)
    return noStore({
      success: true,
      campaignId: params.campaignId,
      adId,
      // Spec Sec 3.5: native player for the source video (preview iframes may
      // not play audio reliably). video_id resolves to a playable file via
      // the shareable preview link / Ads Manager; surfaced here for the card.
      videoId: detail.creative?.video_id || null,
      shareablePreviewLink: detail.previewable_share_link || null,
      destinationUrl:
        detail.creative?.link_url ||
        detail.creative?.object_story_spec?.link_data?.link ||
        null,
      internalSimulation: unavailable.length === previews.length,
      unavailableNote:
        unavailable.length === previews.length
          ? 'INTERNAL SIMULATION — NOT META\u2019S PREVIEW. Approve stays disabled until a real Meta preview loads (Marc may override in writing).'
          : null,
      previews,
    })
  } catch (err: any) {
    return noStore({ success: false, error: err?.message || String(err) }, 502)
  }
}
