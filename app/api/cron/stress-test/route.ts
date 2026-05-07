import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CASH_SNAPSHOTS_TABLE_ID = 'tbl96ykBf3hbNJmJi'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const RECURRING_EXPENSES_TABLE_ID = 'tblXxUmh9BlGIQZ3F'

const STRESS_FLOOR_MIN = 5000
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
  remainingSpend: number
  startDate: Date
  endDate: Date
  durationDays: number
  forecastPaidSubs: number
  forecastAnnualMix: number
}

type StressTestInput = {
  recordId?: unknown
  secret?: unknown
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function startOfUtcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
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

async function airtableGet(tableId: string, recordId: string) {
  const response = await fetch(`${airtableTableUrl(tableId)}/${recordId}`, {
    headers: airtableHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable get failure ${tableId}/${recordId} ${response.status}: ${body.slice(0, 500)}`)
  }

  return await response.json() as AirtableRecord
}

async function airtablePatch(tableId: string, recordId: string, fields: Record<string, unknown>) {
  const response = await fetch(`${airtableTableUrl(tableId)}/${recordId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable update failure ${tableId}/${recordId} ${response.status}: ${body.slice(0, 500)}`)
  }

  return await response.json() as AirtableRecord
}

async function latestCashSnapshot() {
  const params = new URLSearchParams({
    maxRecords: '1',
  })
  params.set('sort[0][field]', 'Snapshot Date')
  params.set('sort[0][direction]', 'desc')

  const records = await airtableList(CASH_SNAPSHOTS_TABLE_ID, params)
  return records[0] || null
}

async function activeRecurringExpenses() {
  const params = new URLSearchParams({
    filterByFormula: '{Active} = 1',
  })

  return airtableList(RECURRING_EXPENSES_TABLE_ID, params)
}

async function approvedActiveCampaigns() {
  const params = new URLSearchParams({
    filterByFormula: `OR({Status} = 'Approved', {Status} = 'Active')`,
  })

  return airtableList(CAMPAIGNS_TABLE_ID, params)
}

function campaignCommitment(record: AirtableRecord, proposedRecordId: string): CampaignCommitment | null {
  if (record.id === proposedRecordId) return null

  const fields = record.fields
  const status = selectName(fields.Status)
  if (status !== 'Approved' && status !== 'Active') return null

  const startDate = dateField(fields['Forecast Start Date'])
  const endDate = dateField(fields['Forecast End Date'])
  if (!startDate || !endDate) return null

  const frozenSpend = numberField(fields['Frozen Forecast Spend'])
  const forecastSpend = numberField(fields['Forecast Spend'])
  const spend = frozenSpend || forecastSpend
  const actualSpendToDate = numberField(fields['Actual Spend'])
  const remainingSpend = Math.max(0, spend - actualSpendToDate)
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))

  return {
    id: record.id,
    name: typeof fields['Campaign Name'] === 'string' ? fields['Campaign Name'] : record.id,
    remainingSpend,
    startDate,
    endDate,
    durationDays,
    forecastPaidSubs: numberField(fields['Forecast Paid Subs']),
    forecastAnnualMix: numberField(fields['Forecast Annual Mix %']) / 100,
  }
}

function requireProposedCampaignValues(campaign: AirtableRecord) {
  const fields = campaign.fields
  const proposedSpend = numberField(fields['Forecast Spend'])
  const proposedStart = dateField(fields['Forecast Start Date'])
  const proposedEnd = dateField(fields['Forecast End Date'])
  const proposedSubs = numberField(fields['Forecast Paid Subs'])
  const proposedAnnualMix = numberField(fields['Forecast Annual Mix %']) / 100

  if (!proposedStart || !proposedEnd) {
    throw new Error('Campaign must have Forecast Start Date and Forecast End Date before approval stress test.')
  }

  const proposedDuration = Math.max(1, Math.round((proposedEnd.getTime() - proposedStart.getTime()) / 86400000))

  return {
    proposedSpend,
    proposedStart,
    proposedEnd,
    proposedSubs,
    proposedAnnualMix,
    proposedDuration,
  }
}

function runProjection({
  snapshotDate,
  currentCash,
  monthlyBurn,
  currentMrr,
  commitments,
  proposed,
}: {
  snapshotDate: string
  currentCash: number
  monthlyBurn: number
  currentMrr: number
  commitments: CampaignCommitment[]
  proposed: ReturnType<typeof requireProposedCampaignValues>
}) {
  const today = startOfUtcDate(snapshotDate)
  const dailyBurn = monthlyBurn / 30
  const calculatedFloor = 90 * dailyBurn
  const stressFloor = Math.max(STRESS_FLOOR_MIN, calculatedFloor)
  let balance = currentCash
  let mrr = currentMrr
  let minBalance = currentCash
  let minDay = 0

  for (let dayOffset = 0; dayOffset < DAYS_TO_PROJECT; dayOffset++) {
    const date = addDays(today, dayOffset)

    balance -= dailyBurn

    for (const commitment of commitments) {
      if (date >= commitment.startDate && date <= commitment.endDate) {
        balance -= commitment.remainingSpend / commitment.durationDays
      }
    }

    if (date >= proposed.proposedStart && date <= proposed.proposedEnd) {
      balance -= proposed.proposedSpend / proposed.proposedDuration
    }

    mrr *= (1 - ASSUMED_MONTHLY_CHURN / 30)
    balance += (mrr * (1 - STRIPE_FEE_RATE)) / 30

    for (const commitment of commitments) {
      const revenueStart = addDays(commitment.startDate, REVENUE_LAG_DAYS)
      if (toIsoDate(date) === toIsoDate(revenueStart)) {
        const monthlySubs = commitment.forecastPaidSubs * (1 - commitment.forecastAnnualMix)
        const annualSubs = commitment.forecastPaidSubs * commitment.forecastAnnualMix
        const annualLump = annualSubs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT
        const monthlyRevenue = monthlySubs * SUBSCRIPTION_MONTHLY * REVENUE_DISCOUNT
        const annualMonthlyEquiv = annualSubs * ANNUAL_MONTHLY_EQUIVALENT * REVENUE_DISCOUNT

        balance += annualLump * (1 - STRIPE_FEE_RATE)
        mrr += monthlyRevenue + annualMonthlyEquiv
      }
    }

    const proposedRevenueStart = addDays(proposed.proposedStart, REVENUE_LAG_DAYS)
    if (toIsoDate(date) === toIsoDate(proposedRevenueStart)) {
      const monthlySubs = proposed.proposedSubs * (1 - proposed.proposedAnnualMix)
      const annualSubs = proposed.proposedSubs * proposed.proposedAnnualMix
      const annualLump = annualSubs * SUBSCRIPTION_ANNUAL * REVENUE_DISCOUNT
      const monthlyRevenue = monthlySubs * SUBSCRIPTION_MONTHLY * REVENUE_DISCOUNT
      const annualMonthlyEquiv = annualSubs * ANNUAL_MONTHLY_EQUIVALENT * REVENUE_DISCOUNT

      balance += annualLump * (1 - STRIPE_FEE_RATE)
      mrr += monthlyRevenue + annualMonthlyEquiv
    }

    if (balance < minBalance) {
      minBalance = balance
      minDay = dayOffset
    }
  }

  return {
    dailyBurn,
    calculatedFloor,
    stressFloor,
    minBalance,
    minDay,
    minDate: addDays(today, minDay),
  }
}

async function runStressTest(recordId: string) {
  const [campaign, snapshot, expenses, campaignRecords] = await Promise.all([
    airtableGet(CAMPAIGNS_TABLE_ID, recordId),
    latestCashSnapshot(),
    activeRecurringExpenses(),
    approvedActiveCampaigns(),
  ])

  if (!snapshot) {
    throw new Error('No Cash Snapshot found for stress test.')
  }

  const proposed = requireProposedCampaignValues(campaign)
  const monthlyBurn = expenses.reduce((sum, record) => {
    if (!booleanField(record.fields.Active)) return sum
    return sum + numberField(record.fields['Monthly Equivalent'])
  }, 0)
  const commitments = campaignRecords
    .map(record => campaignCommitment(record, recordId))
    .filter((commitment): commitment is CampaignCommitment => Boolean(commitment))
  const snapshotDate = typeof snapshot.fields['Snapshot Date'] === 'string'
    ? snapshot.fields['Snapshot Date'].slice(0, 10)
    : todayIsoDate()
  const currentCash = numberField(snapshot.fields['Mercury Balance'])
  const currentMrr = numberField(snapshot.fields['Current MRR'])

  const projection = runProjection({
    snapshotDate,
    currentCash,
    monthlyBurn,
    currentMrr,
    commitments,
    proposed,
  })

  const campaignName = typeof campaign.fields['Campaign Name'] === 'string'
    ? campaign.fields['Campaign Name']
    : recordId

  if (projection.minBalance < projection.stressFloor) {
    const rejectionMessage = `STRESS TEST FAILED. With this campaign, projected cash floor is $${Math.round(projection.minBalance).toLocaleString()} on ${toIsoDate(projection.minDate)} (day ${projection.minDay}), below threshold of $${Math.round(projection.stressFloor).toLocaleString()}. Stress floor is MAX($5,000 minimum, 90 × daily burn = $${Math.round(projection.calculatedFloor).toLocaleString()}). To pass: reduce spend, delay start, or wait for revenue to accumulate.`

    await airtablePatch(CAMPAIGNS_TABLE_ID, recordId, {
      Status: 'Recommended',
      'Rejection Reason': rejectionMessage,
    })

    return {
      action: 'blocked',
      campaignName,
      recordId,
      minBalance: Number(projection.minBalance.toFixed(2)),
      minDay: projection.minDay,
      minDate: toIsoDate(projection.minDate),
      stressFloor: Number(projection.stressFloor.toFixed(2)),
      calculatedFloor: Number(projection.calculatedFloor.toFixed(2)),
      monthlyBurn: Number(monthlyBurn.toFixed(2)),
      currentCash,
      currentMrr,
      activeRecurringExpenseCount: expenses.length,
      existingCommitmentCount: commitments.length,
      rejectionReason: rejectionMessage,
    }
  }

  const approvedDate = todayIsoDate()
  const frozenCac = proposed.proposedSubs > 0 ? proposed.proposedSpend / proposed.proposedSubs : 0

  await airtablePatch(CAMPAIGNS_TABLE_ID, recordId, {
    'Frozen Forecast Spend': proposed.proposedSpend,
    'Frozen Forecast CAC': Number(frozenCac.toFixed(2)),
    'Frozen Forecast Paid Subs': proposed.proposedSubs,
    'Approved Date': approvedDate,
  })

  return {
    action: 'approved',
    campaignName,
    recordId,
    minBalance: Number(projection.minBalance.toFixed(2)),
    minDay: projection.minDay,
    minDate: toIsoDate(projection.minDate),
    stressFloor: Number(projection.stressFloor.toFixed(2)),
    calculatedFloor: Number(projection.calculatedFloor.toFixed(2)),
    monthlyBurn: Number(monthlyBurn.toFixed(2)),
    currentCash,
    currentMrr,
    activeRecurringExpenseCount: expenses.length,
    existingCommitmentCount: commitments.length,
    frozenForecastSpend: proposed.proposedSpend,
    frozenForecastCac: Number(frozenCac.toFixed(2)),
    frozenForecastPaidSubs: proposed.proposedSubs,
    approvedDate,
  }
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.STRESS_TEST_WEBHOOK_SECRET
  if (!expectedSecret) {
    return json({ success: false, error: 'Missing STRESS_TEST_WEBHOOK_SECRET' }, 500)
  }

  let body: StressTestInput
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  if (body.secret !== expectedSecret) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  if (typeof body.recordId !== 'string' || !body.recordId.trim()) {
    return json({ success: false, error: 'recordId required' }, 400)
  }

  try {
    const result = await runStressTest(body.recordId.trim())
    return json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stress-test] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}
