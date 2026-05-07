import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const ELIGIBLE_CAMPAIGNS_FORMULA = 'AND({Status}="Approved",{Frozen Forecast Spend}=BLANK())'

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

type PollerResult = {
  recordId: string
  campaignName: string
  ok: boolean
  status?: number
  result?: unknown
  error?: string
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

function airtableHeaders() {
  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) throw new Error('Missing AIRTABLE_API_KEY')

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function airtableTableUrl(tableId: string) {
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID')
  return `${AIRTABLE_BASE_URL}/${baseId}/${tableId}`
}

async function airtableList(tableId: string, params: URLSearchParams) {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const pageParams = new URLSearchParams(params)
    if (offset) pageParams.set('offset', offset)

    const response = await fetch(`${airtableTableUrl(tableId)}?${pageParams.toString()}`, {
      headers: airtableHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Airtable list failure ${tableId} ${response.status}: ${body.slice(0, 500)}`)
    }

    const payload = await response.json() as { records?: AirtableRecord[]; offset?: string }
    records.push(...(payload.records || []))
    offset = payload.offset
  } while (offset)

  return records
}

async function findEligibleCampaigns() {
  const params = new URLSearchParams({
    filterByFormula: ELIGIBLE_CAMPAIGNS_FORMULA,
  })

  return airtableList(CAMPAIGNS_TABLE_ID, params)
}

function campaignName(record: AirtableRecord) {
  const name = record.fields['Campaign Name']
  return typeof name === 'string' && name.trim() ? name : record.id
}

async function runStressTestForCampaign(origin: string, record: AirtableRecord): Promise<PollerResult> {
  const secret = process.env.STRESS_TEST_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('Missing STRESS_TEST_WEBHOOK_SECRET')
  }

  const name = campaignName(record)

  try {
    const response = await fetch(`${origin}/api/cron/stress-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recordId: record.id,
        secret,
      }),
      cache: 'no-store',
    })

    const text = await response.text()
    let payload: unknown = text
    try {
      payload = JSON.parse(text)
    } catch {
      // Preserve raw text in the result for non-JSON failures.
    }

    if (!response.ok) {
      const error = `stress-test failed ${response.status}: ${text.slice(0, 500)}`
      console.error('[stress-test-poller] Campaign stress-test failed:', {
        recordId: record.id,
        campaignName: name,
        error,
      })
      return {
        recordId: record.id,
        campaignName: name,
        ok: false,
        status: response.status,
        error,
        result: payload,
      }
    }

    console.log('[stress-test-poller] Campaign processed:', {
      recordId: record.id,
      campaignName: name,
      result: payload,
    })

    return {
      recordId: record.id,
      campaignName: name,
      ok: true,
      status: response.status,
      result: payload,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stress-test-poller] Campaign stress-test error:', {
      recordId: record.id,
      campaignName: name,
      error: message,
    })
    return {
      recordId: record.id,
      campaignName: name,
      ok: false,
      error: message,
    }
  }
}

async function runPoller(request: NextRequest) {
  const origin = new URL(request.url).origin
  const campaigns = await findEligibleCampaigns()
  const results: PollerResult[] = []

  for (const campaign of campaigns) {
    results.push(await runStressTestForCampaign(origin, campaign))
  }

  return json({
    success: true,
    processed: campaigns.length,
    results,
  })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    return await runPoller(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stress-test-poller] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    return await runPoller(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stress-test-poller] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}
