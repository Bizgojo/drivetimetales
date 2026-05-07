import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CASH_SNAPSHOTS_TABLE_ID = 'tbl96ykBf3hbNJmJi'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const RECURRING_EXPENSES_TABLE_ID = 'tblXxUmh9BlGIQZ3F'
const ALERT_EMAIL = 'm.postlewaite@gmail.com'

const REVENUE_DISCOUNT = 0.5
const REVENUE_LAG_DAYS = 28
const DAYS_TO_PROJECT = 90
const STRIPE_FEE_RATE = 0.029
const ASSUMED_MONTHLY_CHURN = 0.07
const SUBSCRIPTION_MONTHLY = 7.99
const SUBSCRIPTION_ANNUAL = 59.99
const ANNUAL_MONTHLY_EQUIVALENT = 4.99

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

type CampaignCommitment = {
  id: string
  name: string
  spend: number
  actualSpendToDate: number
  remainingSpend: number
  startDate: Date
  endDate: Date
  durationDays: number
  forecastPaidSubs: number
  forecastAnnualMix: number
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function startOfUtcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function numberField(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,%]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function booleanField(value: unknown) {
  return value === true
}

function selectName(value: unknown) {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = (value as { name?: unknown }).name
    return typeof name === 'string' ? name : ''
  }
  return typeof value === 'string' ? value : ''
}

function dateField(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = startOfUtcDate(value.slice(0, 10))
  return Number.isNaN(date.getTime()) ? null : date
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

async function sendMarcAlert(subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[snapshot-calculate] Alert skipped, RESEND_API_KEY missing:', subject, text)
    return
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Endless Tales Alerts <hello@endless-tales.com>',
        to: ALERT_EMAIL,
        subject,
        text,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('[snapshot-calculate] Alert send failed:', response.status, await response.text())
    }
  } catch (error) {
    console.error('[snapshot-calculate] Alert send error:', error)
  }
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

async function findTodaySnapshot(snapshotDate: string) {
  const params = new URLSearchParams({
    maxRecords: '1',
    filterByFormula: `DATETIME_FORMAT({Snapshot Date}, 'YYYY-MM-DD') = '${snapshotDate}'`,
  })

  const records = await airtableList(CASH_SNAPSHOTS_TABLE_ID, params)
  return records[0] || null
}

async function getActiveRecurringExpenses() {
  const params = new URLSearchParams({
    filterByFormula: '{Active} = 1',
  })

  return airtableList(RECURRING_EXPENSES_TABLE_ID, params)
}

async function getApprovedActiveCampaigns() {
  const params = new URLSearchParams({
    filterByFormula: `OR({Status} = 'Approved', {Status} = 'Active')`,
  })

  return airtableList(CAMPAIGNS_TABLE_ID, params)
}

function campaignCommitment(record: AirtableRecord): CampaignCommitment | null {
  const fields = record.fields
  const status = selectName(fields.Status)
  if (status !== 'Approved' && status !== 'Active') return null

  const startDate = dateField(fields['Forecast Start Date'])
  const endDate = dateField(fields['Forecast End Date'])
  if (!startDate || !endDate) return null

  const cashCommitted = numberField(fields['Cash Committed'])
  const frozenSpend = numberField(fields['Frozen Forecast Spend'])
  const forecastSpend = numberField(fields['Forecast Spend'])
  const spend = cashCommitted || frozenSpend || forecastSpend
  const actualSpendToDate = numberField(fields['Actual Spend'])
  const remainingSpend = Math.max(0, spend - actualSpendToDate)
  const durationMs = endDate.getTime() - startDate.getTime()
  const durationDays = Math.max(1, Math.round(durationMs / 86400000))

  return {
    id: record.id,
    name: typeof fields['Campaign Name'] === 'string' ? fields['Campaign Name'] : record.id,
    spend,
    actualSpendToDate,
    remainingSpend,
    startDate,
    endDate,
    durationDays,
    forecastPaidSubs: numberField(fields['Forecast Paid Subs']),
    forecastAnnualMix: numberField(fields['Forecast Annual Mix %']) / 100,
  }
}

function runProjection({
  snapshotDate,
  currentCash,
  monthlyBurn,
  currentMrr,
  campaigns,
}: {
  snapshotDate: string
  currentCash: number
  monthlyBurn: number
  currentMrr: number
  campaigns: CampaignCommitment[]
}) {
  const today = startOfUtcDate(snapshotDate)
  const dailyBurn = monthlyBurn / 30
  let balance = currentCash
  let mrr = currentMrr
  let minBalance = currentCash
  let minDay = 0

  for (let dayOffset = 1; dayOffset <= DAYS_TO_PROJECT; dayOffset++) {
    const date = addDays(today, dayOffset)

    balance -= dailyBurn

    for (const campaign of campaigns) {
      if (date >= campaign.startDate && date <= campaign.endDate) {
        balance -= campaign.remainingSpend / campaign.durationDays
      }
    }

    mrr *= (1 - ASSUMED_MONTHLY_CHURN / 30)
    balance += (mrr * (1 - STRIPE_FEE_RATE)) / 30

    for (const campaign of campaigns) {
      const revenueStart = addDays(campaign.startDate, REVENUE_LAG_DAYS)
      if (toIsoDate(date) === toIsoDate(revenueStart)) {
        const monthlySubs = campaign.forecastPaidSubs * (1 - campaign.forecastAnnualMix)
        const annualSubs = campaign.forecastPaidSubs * campaign.forecastAnnualMix
        const monthlyRevenue = monthlySubs * SUBSCRIPTION_MONTHLY
        const annualLump = annualSubs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT
        const annualMonthlyEquiv = annualSubs * ANNUAL_MONTHLY_EQUIVALENT

        balance += annualLump * (1 - STRIPE_FEE_RATE)
        mrr += (monthlyRevenue + annualMonthlyEquiv) * REVENUE_DISCOUNT
      }
    }

    if (balance < minBalance) {
      minBalance = balance
      minDay = dayOffset
    }
  }

  return {
    dailyBurn,
    minBalance,
    minDay,
    minDate: toIsoDate(addDays(today, minDay)),
  }
}

async function updateSnapshot(recordId: string, fields: Record<string, unknown>) {
  const response = await fetch(`${airtableTableUrl(CASH_SNAPSHOTS_TABLE_ID)}/${recordId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable snapshot update failure ${response.status}: ${body.slice(0, 500)}`)
  }

  return await response.json() as AirtableRecord
}

async function retrySnapshotUpdate(recordId: string, fields: Record<string, unknown>) {
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await updateSnapshot(recordId, fields)
    } catch (error) {
      lastError = error
      console.error('[snapshot-calculate] Airtable update attempt failed:', {
        attempt,
        recordId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function runSnapshotCalculate() {
  const snapshotDate = todayIsoDate()

  try {
    const snapshot = await findTodaySnapshot(snapshotDate)
    if (!snapshot) {
      return json({ success: false, error: `No Cash Snapshot found for ${snapshotDate}` }, 404)
    }

    const expenses = await getActiveRecurringExpenses()
    const monthlyBurn = expenses.reduce((sum, record) => {
      if (!booleanField(record.fields.Active)) return sum
      return sum + numberField(record.fields['Monthly Equivalent'])
    }, 0)

    const campaignRecords = await getApprovedActiveCampaigns()
    const campaigns = campaignRecords
      .map(campaignCommitment)
      .filter((campaign): campaign is CampaignCommitment => Boolean(campaign))

    const totalCommittedCampaignSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0)
    const currentCash = numberField(snapshot.fields['Mercury Balance'])
    const currentMrr = numberField(snapshot.fields['Current MRR'])
    const activeAnnualSubs = numberField(snapshot.fields['Active Annual Subs'])

    const projection = runProjection({
      snapshotDate,
      currentCash,
      monthlyBurn,
      currentMrr,
      campaigns,
    })

    const fieldsToUpdate = {
      'Total Committed Campaign Spend': Number(totalCommittedCampaignSpend.toFixed(2)),
      'Total Recurring Monthly': Number(monthlyBurn.toFixed(2)),
      '90-Day Forecast Floor': Number(projection.minBalance.toFixed(2)),
      'Min Floor Day Offset': projection.minDay,
      'Min Floor Date': projection.minDate,
    }

    const updated = await retrySnapshotUpdate(snapshot.id, fieldsToUpdate)

    const result = {
      success: true,
      snapshotDate,
      recordId: updated.id,
      currentCash,
      currentMrr,
      activeAnnualSubs,
      activeRecurringExpenseCount: expenses.length,
      activeCampaignCount: campaigns.length,
      totalCommittedCampaignSpend: fieldsToUpdate['Total Committed Campaign Spend'],
      totalRecurringMonthly: fieldsToUpdate['Total Recurring Monthly'],
      dailyBurn: Number(projection.dailyBurn.toFixed(2)),
      forecastFloor90Day: fieldsToUpdate['90-Day Forecast Floor'],
      minFloorDayOffset: projection.minDay,
      minFloorDate: projection.minDate,
    }

    console.log('[snapshot-calculate] Success:', result)
    return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[snapshot-calculate] Failed:', message)
    await sendMarcAlert('Cash Snapshot calculation failed', `Cash Snapshot calculation failed for ${snapshotDate}.\n\n${message}`)
    return json({ success: false, snapshotDate, error: message }, 502)
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return runSnapshotCalculate()
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return runSnapshotCalculate()
}
