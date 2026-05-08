import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

type AirtableRecord = { id: string; fields: Record<string, unknown> }

async function findCampaignByName(name: string): Promise<AirtableRecord[]> {
  const baseId = process.env.AIRTABLE_BASE_ID!
  const apiKey = process.env.AIRTABLE_API_KEY!
  const escaped = name.replace(/"/g, '\\"')
  const formula = encodeURIComponent(`{Campaign Name}="${escaped}"`)
  const url = `${AIRTABLE_BASE_URL}/${baseId}/${CAMPAIGNS_TABLE_ID}?filterByFormula=${formula}&maxRecords=10`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new Error(`Airtable lookup failed: ${res.status} ${await res.text()}`)
  const body = await res.json() as { records: AirtableRecord[] }
  return body.records || []
}

async function updateCampaign(recordId: string, fields: Record<string, unknown>): Promise<void> {
  const baseId = process.env.AIRTABLE_BASE_ID!
  const apiKey = process.env.AIRTABLE_API_KEY!
  const url = `${AIRTABLE_BASE_URL}/${baseId}/${CAMPAIGNS_TABLE_ID}/${recordId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Airtable update failed for ${recordId}: ${res.status} ${text}`)
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const now = Date.now()
  const thirtyDaysAgo = new Date(now - 30 * 86400000)
  const thirtyOneDaysAgo = new Date(now - 31 * 86400000)
  const todayDate = new Date(now).toISOString().split('T')[0]

  const { data: cohort, error: cohortErr } = await supabase
    .from('users')
    .select('id, utm_campaign, billing_cycle, first_paid_date, cancelled_at')
    .gte('first_paid_date', thirtyOneDaysAgo.toISOString())
    .lt('first_paid_date', thirtyDaysAgo.toISOString())
    .not('plan', 'is', null)

  if (cohortErr) {
    console.error('[attribute-subscribers] cohort query failed:', cohortErr)
    return json({ error: 'cohort_query_failed', details: cohortErr.message }, 500)
  }

  const stillActive = (cohort || []).filter(u => !u.cancelled_at)

  const campaignCounts: Record<string, number> = {}
  const annualCounts: Record<string, number> = {}
  const noUtmCount = stillActive.filter(u => !u.utm_campaign).length

  for (const sub of stillActive) {
    if (!sub.utm_campaign) continue
    campaignCounts[sub.utm_campaign] = (campaignCounts[sub.utm_campaign] || 0) + 1
    if (sub.billing_cycle === 'annual') {
      annualCounts[sub.utm_campaign] = (annualCounts[sub.utm_campaign] || 0) + 1
    }
  }

  const results: Array<{ campaign: string; status: string; detail?: string; added?: number; addedAnnual?: number }> = []

  for (const [campaignName, count] of Object.entries(campaignCounts)) {
    try {
      const records = await findCampaignByName(campaignName)
      if (records.length === 0) {
        console.warn(`[attribute-subscribers] No Airtable campaign matches utm_campaign: ${campaignName}`)
        results.push({ campaign: campaignName, status: 'no_match' })
        continue
      }
      if (records.length > 1) {
        console.warn(`[attribute-subscribers] Multiple Airtable campaigns match: ${campaignName} (using first)`)
      }
      const record = records[0]
      const currentSubs = (record.fields['Actual Paid Subs'] as number | undefined) || 0
      const currentAnnual = (record.fields['Actual Annual Subs'] as number | undefined) || 0
      const annualAdd = annualCounts[campaignName] || 0

      await updateCampaign(record.id, {
        'Actual Paid Subs': currentSubs + count,
        'Actual Annual Subs': currentAnnual + annualAdd,
        'Last Actuals Update': todayDate,
      })

      results.push({ campaign: campaignName, status: 'updated', added: count, addedAnnual: annualAdd })
    } catch (err: any) {
      console.error(`[attribute-subscribers] update failed for ${campaignName}:`, err?.message || err)
      results.push({ campaign: campaignName, status: 'error', detail: err?.message || String(err) })
    }
  }

  return json({
    ok: true,
    cohortSize: cohort?.length || 0,
    stillActive: stillActive.length,
    noUtmCount,
    campaignsAttempted: Object.keys(campaignCounts).length,
    results,
    cohortWindow: {
      from: thirtyOneDaysAgo.toISOString(),
      to: thirtyDaysAgo.toISOString(),
    },
  })
}
