// lib/marketing/metaAds.ts — Amendment 1 server-only Meta Marketing API client.
// Spec Sec 3 (previews), Sec 7.4 + Sec 10 (gated launch/pause).
//
// SERVER-ONLY (uses process.env). Write operations (ACTIVE/PAUSED status
// changes) authenticate with META_ADS_MANAGEMENT_TOKEN ONLY — never with
// META_ACCESS_TOKEN (the read-only insights token). Read paths (previews,
// creative fetch) prefer the management token too; the read-only token is
// never used for launches.

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

function managementToken(): string | null {
  return (process.env.META_ADS_MANAGEMENT_TOKEN || '').trim() || null
}

function adAccountId(): string | null {
  return (process.env.META_AD_ACCOUNT_ID || '').trim() || null
}

export function metaAdsConfigured(): boolean {
  return Boolean(managementToken())
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const token = managementToken()
  if (!token) throw new Error('META_ADS_MANAGEMENT_TOKEN not configured')
  const url = new URL(`${META_GRAPH_BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'User-Agent': 'EndlessTales-Amendment1/1.0' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 500)
    throw new Error(`Meta Graph GET ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

async function graphPost(path: string, body: Record<string, string>): Promise<any> {
  const token = managementToken()
  if (!token) throw new Error('META_ADS_MANAGEMENT_TOKEN not configured')
  const params = new URLSearchParams({ ...body, access_token: token })
  const res = await fetch(`${META_GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'EndlessTales-Amendment1/1.0',
    },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 500)
    throw new Error(`Meta Graph POST ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

export interface MetaAdDetail {
  adId: string
  name?: string
  configured_status?: string
  effective_status?: string
  creative?: {
    id?: string
    object_story_spec?: any
    asset_feed_spec?: any
    image_hash?: string
    video_id?: string
    title?: string
    body?: string
    call_to_action_type?: string
    link_url?: string
  }
  previewable_share_link?: string
}

/** Fetch live ad + creative fields needed for the version hash and card. */
export async function fetchAdDetail(adId: string): Promise<MetaAdDetail> {
  const data = await graphGet(adId, {
    fields: [
      'name',
      'configured_status',
      'effective_status',
      'creative{object_story_spec,asset_feed_spec,image_hash,video_id,title,body,call_to_action_type,link_url}',
      'previewable_share_link',
    ].join(','),
  })
  return {
    adId,
    name: data.name,
    configured_status: data.configured_status,
    effective_status: data.effective_status,
    creative: data.creative
      ? {
          id: data.creative.id,
          object_story_spec: data.creative.object_story_spec,
          asset_feed_spec: data.creative.asset_feed_spec,
          image_hash: data.creative.image_hash,
          video_id: data.creative.video_id,
          title: data.creative.title,
          body: data.creative.body,
          call_to_action_type: data.creative.call_to_action_type,
          link_url: data.creative.link_url,
        }
      : undefined,
    previewable_share_link: data.previewable_share_link,
  }
}

export interface PlacementPreview {
  placement: string
  iframe_html: string | null
  error: string | null
}

/**
 * Spec Sec 3.2–3.3: fresh previews on every page load; never cached.
 * Uses GET /{ad_id}/previews with ad_format per placement.
 */
export async function fetchAdPreviews(
  adId: string,
  placements: readonly string[]
): Promise<PlacementPreview[]> {
  const results = await Promise.all(
    placements.map(async (placement) => {
      try {
        const data = await graphGet(`${adId}/previews`, { ad_format: placement })
        const iframe = data?.data?.[0]?.body ?? null
        return { placement, iframe_html: iframe, error: iframe ? null : 'empty preview body' }
      } catch (err: any) {
        return { placement, iframe_html: null, error: err?.message || String(err) }
      }
    })
  )
  return results
}

/** Spec Sec 10.2: gated status change. Only called after hash + approval checks pass. */
export async function setAdStatus(adId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await graphPost(adId, { status })
}

// ---- Paused-build (campaign-6plus2-nov09-20261104) creation helpers ----
// Every helper hard-codes status PAUSED. There is intentionally NO status
// parameter and NO ACTIVE path: callers cannot enable anything through these.

export async function createPausedCampaign(name: string): Promise<string> {
  const data = await graphPost(`act_${accountIdOrThrow()}/campaigns`, {
    name,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: '[]',
  })
  if (!data?.id) throw new Error('Meta campaign create returned no id')
  return String(data.id)
}

export interface PausedAdSetSpec {
  name: string
  campaignId: string
  dailyBudgetCents: string
  pixelId: string
  customConversionId: string
}

export async function createPausedAdSet(spec: PausedAdSetSpec): Promise<string> {
  const data = await graphPost(`act_${accountIdOrThrow()}/adsets`, {
    name: spec.name,
    campaign_id: spec.campaignId,
    daily_budget: spec.dailyBudgetCents,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    status: 'PAUSED',
    targeting: JSON.stringify({
      geo_locations: { countries: ['US'] },
      locales: ['en_US'],
      age_min: 25,
      age_max: 54,
      facebook_positions: ['feed', 'reels', 'story'],
      instagram_positions: ['reels', 'stream', 'story'],
    }),
    promoted_object: JSON.stringify({
      pixel_id: spec.pixelId,
      custom_event_type: spec.customConversionId,
    }),
    attribution_spec: JSON.stringify([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 },
    ]),
  })
  if (!data?.id) throw new Error('Meta ad set create returned no id')
  return String(data.id)
}

export interface PausedAdSpec {
  name: string
  adSetId: string
  pageId: string
  videoId: string
  linkUrl: string
  message: string
  title: string
  linkDescription: string
}

export async function createPausedAd(spec: PausedAdSpec): Promise<{ adId: string; creativeId: string }> {
  const data = await graphPost(`act_${accountIdOrThrow()}/ads`, {
    name: spec.name,
    adset_id: spec.adSetId,
    status: 'PAUSED',
    creative: JSON.stringify({
      object_story_spec: {
        page_id: spec.pageId,
        video_data: {
          video_id: spec.videoId,
          link_description: spec.linkDescription,
          message: spec.message,
          title: spec.title,
          call_to_action: { type: 'LEARN_MORE', value: { link: spec.linkUrl } },
        },
      },
    }),
  })
  if (!data?.id) throw new Error('Meta ad create returned no id')
  return { adId: String(data.id), creativeId: data?.creative_id ? String(data.creative_id) : '' }
}

function accountIdOrThrow(): string {
  const id = adAccountId()
  if (!id) throw new Error('META_AD_ACCOUNT_ID not configured')
  return id.startsWith('act_') ? id.slice(4) : id
}

export function getAdAccountId(): string | null {
  return adAccountId()
}
