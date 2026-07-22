/**
 * GET /api/marketing/meta-insights
 *
 * Susan-scoped read-only proxy for Meta Ads campaign performance data.
 * Credentials never leave the server. Susan authenticates via SUSAN_MARKETING_TOKEN.
 *
 * Authorization: Bearer <SUSAN_MARKETING_TOKEN>
 * -or- header: x-susan-api-key: <SUSAN_MARKETING_TOKEN>
 *
 * Query params:
 *   campaign_id    - Meta campaign ID (required)
 *   date_preset    - e.g. last_7d, last_14d, last_30d, last_month, this_month (default: last_7d)
 *   fields         - comma-separated (default: impressions,clicks,spend,reach,ctr,cpc,cpm,conversions,roas)
 *   ad_account_id  - optional override; falls back to META_AD_ACCOUNT_ID env var
 *
 * READ-ONLY. No write/create/delete. Returns sanitized performance data only.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DEFAULT_FIELDS = 'impressions,clicks,spend,reach,ctr,cpc,cpm,conversions,purchase_roas'
const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const susanToken = process.env.SUSAN_MARKETING_TOKEN
  if (!susanToken) return false

  // Accept Bearer token in Authorization header
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === susanToken) return true

  // Accept x-susan-api-key header
  const keyHeader = req.headers.get('x-susan-api-key') ?? ''
  if (keyHeader === susanToken) return true

  return false
}

// ─── Missing credentials helper ───────────────────────────────────────────────

function missingCredentials(missing: string[]): NextResponse {
  return NextResponse.json(
    {
      error: 'META_CREDENTIALS_NOT_CONFIGURED',
      message: `Meta Ads API credentials are not yet configured. Ask Marc to add the following to .env.local and Vercel env vars: ${missing.join(', ')}`,
      missing,
      docs: 'https://developers.facebook.com/docs/marketing-api/get-started',
    },
    { status: 503 }
  )
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth check
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Valid x-susan-api-key or Bearer token required.' },
      { status: 401 }
    )
  }

  // 2. Credential check
  const accessToken = process.env.META_ACCESS_TOKEN
  const adAccountId =
    new URL(req.url).searchParams.get('ad_account_id') ?? process.env.META_AD_ACCOUNT_ID

  const missing: string[] = []
  if (!accessToken) missing.push('META_ACCESS_TOKEN')
  if (!adAccountId) missing.push('META_AD_ACCOUNT_ID')
  if (missing.length > 0) return missingCredentials(missing)

  // 3. Parse query params
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  const datePreset = searchParams.get('date_preset') ?? 'last_7d'
  const fields = searchParams.get('fields') ?? DEFAULT_FIELDS

  if (!campaignId) {
    return NextResponse.json(
      { error: 'MISSING_PARAM', message: 'campaign_id is required.' },
      { status: 400 }
    )
  }

  // 4. Validate fields — strip any that look like PII or mutation fields
  const BLOCKED_FIELDS = new Set([
    'email', 'phone', 'name', 'address', 'gender', 'age',
    'create', 'delete', 'update', 'bid_amount', 'budget',
  ])
  const requestedFields = fields
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .filter((f) => !BLOCKED_FIELDS.has(f))
    .join(',')

  // 5. Call Meta Graph API — campaign-level insights
  // Docs: https://developers.facebook.com/docs/marketing-api/insights
  const metaUrl = new URL(`${META_GRAPH_BASE}/${campaignId}/insights`)
  metaUrl.searchParams.set('access_token', accessToken!)
  metaUrl.searchParams.set('date_preset', datePreset)
  metaUrl.searchParams.set('fields', requestedFields)
  metaUrl.searchParams.set('level', 'campaign')

  let metaRes: Response
  try {
    metaRes = await fetch(metaUrl.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'EndlessTales-SusanAgent/1.0' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'META_FETCH_ERROR', message: 'Failed to reach Meta Graph API.', detail: String(err) },
      { status: 502 }
    )
  }

  const raw = await metaRes.json()

  if (!metaRes.ok) {
    return NextResponse.json(
      {
        error: 'META_API_ERROR',
        message: 'Meta API returned an error.',
        meta_error: raw?.error ?? raw,
      },
      { status: metaRes.status }
    )
  }

  // 6. Return sanitized response (strip access_token echoes if any)
  return NextResponse.json({
    source: 'meta',
    campaign_id: campaignId,
    date_preset: datePreset,
    fields: requestedFields,
    data: raw.data ?? [],
    paging: raw.paging ?? null,
    fetched_at: new Date().toISOString(),
  })
}
