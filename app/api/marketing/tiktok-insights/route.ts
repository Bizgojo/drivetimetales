/**
 * GET /api/marketing/tiktok-insights
 *
 * Susan-scoped read-only proxy for TikTok Ads campaign performance data.
 * Credentials never leave the server. Susan authenticates via SUSAN_MARKETING_TOKEN.
 *
 * Authorization: Bearer <SUSAN_MARKETING_TOKEN>
 * -or- header: x-susan-api-key: <SUSAN_MARKETING_TOKEN>
 *
 * Query params:
 *   campaign_id    - TikTok campaign ID (required)
 *   date_range     - e.g. last_7d, last_14d, last_30d (default: last_7d)
 *                    OR pass start_date + end_date as YYYY-MM-DD
 *   fields         - comma-separated (default: campaign_name,spend,impressions,clicks,ctr,cpc,cpm,conversions,cost_per_result,reach)
 *   advertiser_id  - optional override; falls back to TIKTOK_ADVERTISER_ID env var
 *
 * READ-ONLY. No write/create/delete. Returns sanitized performance data only.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DEFAULT_METRICS = [
  'campaign_name',
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'conversion',
  'cost_per_result',
  'reach',
  'frequency',
]
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3'

// ─── Date range helper ────────────────────────────────────────────────────────

function resolveDateRange(dateRange: string): { start_date: string; end_date: string } {
  const today = new Date()
  const end = today.toISOString().split('T')[0]

  const presets: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_month: 30,
    this_month: today.getDate(),
  }

  const days = presets[dateRange] ?? 7
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  return { start_date: start.toISOString().split('T')[0], end_date: end }
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const susanToken = process.env.SUSAN_MARKETING_TOKEN
  if (!susanToken) return false

  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === susanToken) return true

  const keyHeader = req.headers.get('x-susan-api-key') ?? ''
  if (keyHeader === susanToken) return true

  return false
}

// ─── Missing credentials helper ───────────────────────────────────────────────

function missingCredentials(missing: string[]): NextResponse {
  return NextResponse.json(
    {
      error: 'TIKTOK_CREDENTIALS_NOT_CONFIGURED',
      message: `TikTok Ads API credentials are not yet configured. Ask Marc to add the following to .env.local and Vercel env vars: ${missing.join(', ')}`,
      missing,
      docs: 'https://business-api.tiktok.com/portal/docs?id=1738373164380162',
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
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN
  const advertiserId =
    new URL(req.url).searchParams.get('advertiser_id') ?? process.env.TIKTOK_ADVERTISER_ID

  const missing: string[] = []
  if (!accessToken) missing.push('TIKTOK_ACCESS_TOKEN')
  if (!advertiserId) missing.push('TIKTOK_ADVERTISER_ID')
  if (missing.length > 0) return missingCredentials(missing)

  // 3. Parse query params
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  const dateRange = searchParams.get('date_range') ?? 'last_7d'
  const rawFields = searchParams.get('fields')

  if (!campaignId) {
    return NextResponse.json(
      { error: 'MISSING_PARAM', message: 'campaign_id is required.' },
      { status: 400 }
    )
  }

  // 4. Validate/filter metrics — no PII, no mutation fields
  const BLOCKED_METRICS = new Set([
    'email', 'phone', 'name', 'address', 'gender', 'age',
    'create', 'delete', 'update', 'bid', 'budget',
  ])
  const metrics = (rawFields ? rawFields.split(',').map((f) => f.trim().toLowerCase()) : DEFAULT_METRICS)
    .filter((m) => !BLOCKED_METRICS.has(m))

  // 5. Resolve dates
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const { start_date, end_date } =
    startDate && endDate ? { start_date: startDate, end_date: endDate } : resolveDateRange(dateRange)

  // 6. Call TikTok Ads API — campaign report
  // Docs: https://business-api.tiktok.com/portal/docs?id=1738373164380162
  const body = {
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN',
    dimensions: ['campaign_id', 'stat_time_day'],
    metrics,
    start_date,
    end_date,
    filters: [{ field_name: 'campaign_id', filter_type: 'IN', filter_value: `["${campaignId}"]` }],
    page_size: 100,
  }

  let tiktokRes: Response
  try {
    tiktokRes = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/`, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken!,
        'Content-Type': 'application/json',
        'User-Agent': 'EndlessTales-SusanAgent/1.0',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'TIKTOK_FETCH_ERROR', message: 'Failed to reach TikTok Ads API.', detail: String(err) },
      { status: 502 }
    )
  }

  const raw = await tiktokRes.json()

  if (!tiktokRes.ok || raw.code !== 0) {
    return NextResponse.json(
      {
        error: 'TIKTOK_API_ERROR',
        message: 'TikTok API returned an error.',
        tiktok_error: { code: raw.code, message: raw.message },
      },
      { status: tiktokRes.ok ? 422 : tiktokRes.status }
    )
  }

  // 7. Return sanitized response
  return NextResponse.json({
    source: 'tiktok',
    campaign_id: campaignId,
    date_range: dateRange,
    start_date,
    end_date,
    metrics,
    data: raw.data?.list ?? [],
    page_info: raw.data?.page_info ?? null,
    fetched_at: new Date().toISOString(),
  })
}
