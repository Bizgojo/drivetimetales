const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const CASH_SNAPSHOTS_TABLE_ID = 'tbl96ykBf3hbNJmJi'

export interface AirtableCampaign {
  id: string;
  campaignName: string;
  status: 'Recommended' | 'Approved' | 'Active' | 'Complete' | 'Archived' | 'Rejected';
  channel: string;
  forecastSpend: number | null;
  actualSpend: number | null;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  frozenForecastSpend: number | null;
  frozenForecastCAC: number | null;
  frozenForecastPaidSubs: number | null;
  forecastPaidSubs: number | null;
  actualPaidSubs: number | null;
  pacingPercent: number | null;
  rejectionReason: string | null;
  varianceAnalysis: string | null;
  lastActualsUpdate: string | null;
  approvedDate: string | null;
}

export interface AirtableCashSnapshot {
  id: string;
  snapshotDate: string;
  mercuryBalance: number | null;
  totalCommittedCampaignSpend: number | null;
  totalRecurringMonthly: number | null;
  availableCash: number | null;
  ninetyDayForecastFloor: number | null;
  minFloorDate: string | null;
  belowStressThreshold: boolean;
}

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

type AirtableListResponse = {
  records?: AirtableRecord[]
  offset?: string
}

const CAMPAIGN_STATUSES: AirtableCampaign['status'][] = [
  'Recommended',
  'Approved',
  'Active',
  'Complete',
  'Archived',
  'Rejected',
]

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

function numberField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,%]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function booleanField(value: unknown): boolean {
  return value === true
}

function selectField(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = (value as { name?: unknown }).name
    return typeof name === 'string' ? name : ''
  }
  return typeof value === 'string' ? value : ''
}

function campaignStatus(value: unknown): AirtableCampaign['status'] {
  const status = selectField(value)
  return CAMPAIGN_STATUSES.includes(status as AirtableCampaign['status'])
    ? status as AirtableCampaign['status']
    : 'Recommended'
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

    const payload = await response.json() as AirtableListResponse
    records.push(...(payload.records || []))
    offset = payload.offset
  } while (offset)

  return records
}

function mapCampaign(record: AirtableRecord): AirtableCampaign {
  const fields = record.fields
  return {
    id: record.id,
    campaignName: stringField(fields['Campaign Name']) || record.id,
    status: campaignStatus(fields.Status),
    channel: selectField(fields.Channel),
    forecastSpend: numberField(fields['Forecast Spend']),
    actualSpend: numberField(fields['Actual Spend']),
    forecastStartDate: stringField(fields['Forecast Start Date']),
    forecastEndDate: stringField(fields['Forecast End Date']),
    actualStartDate: stringField(fields['Actual Start Date']),
    actualEndDate: stringField(fields['Actual End Date']),
    frozenForecastSpend: numberField(fields['Frozen Forecast Spend']),
    frozenForecastCAC: numberField(fields['Frozen Forecast CAC']),
    frozenForecastPaidSubs: numberField(fields['Frozen Forecast Paid Subs']),
    forecastPaidSubs: numberField(fields['Forecast Paid Subs']),
    actualPaidSubs: numberField(fields['Actual Paid Subs']),
    pacingPercent: numberField(fields['Pacing %']),
    rejectionReason: stringField(fields['Rejection Reason']),
    varianceAnalysis: stringField(fields['Variance Analysis']),
    lastActualsUpdate: stringField(fields['Last Actuals Update']),
    approvedDate: stringField(fields['Approved Date']),
  }
}

function mapCashSnapshot(record: AirtableRecord): AirtableCashSnapshot {
  const fields = record.fields
  return {
    id: record.id,
    snapshotDate: stringField(fields['Snapshot Date']) || '',
    mercuryBalance: numberField(fields['Mercury Balance']),
    totalCommittedCampaignSpend: numberField(fields['Total Committed Campaign Spend']),
    totalRecurringMonthly: numberField(fields['Total Recurring Monthly']),
    availableCash: numberField(fields['Available Cash']),
    ninetyDayForecastFloor: numberField(fields['90-Day Forecast Floor']),
    minFloorDate: stringField(fields['Min Floor Date']),
    belowStressThreshold: booleanField(fields['Below Stress Threshold']),
  }
}

export async function getCampaigns(status?: string): Promise<AirtableCampaign[]> {
  const params = new URLSearchParams()
  if (status) params.set('filterByFormula', `{Status} = '${status.replace(/'/g, "\\'")}'`)
  const records = await airtableList(CAMPAIGNS_TABLE_ID, params)
  return records.map(mapCampaign)
}

export async function getCampaign(recordId: string): Promise<AirtableCampaign | null> {
  const response = await fetch(`${airtableTableUrl(CAMPAIGNS_TABLE_ID)}/${recordId}`, {
    headers: airtableHeaders(),
    cache: 'no-store',
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable get failure ${response.status}: ${body.slice(0, 500)}`)
  }

  return mapCampaign(await response.json() as AirtableRecord)
}

export async function updateCampaignStatus(recordId: string, status: string, rejectionReason?: string): Promise<void> {
  const fields: Record<string, string> = { Status: status }
  if (rejectionReason !== undefined) fields['Rejection Reason'] = rejectionReason

  const response = await fetch(`${airtableTableUrl(CAMPAIGNS_TABLE_ID)}/${recordId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable update failure ${response.status}: ${body.slice(0, 500)}`)
  }
}

export async function getLatestCashSnapshot(): Promise<AirtableCashSnapshot | null> {
  const params = new URLSearchParams({
    maxRecords: '1',
  })
  params.set('sort[0][field]', 'Snapshot Date')
  params.set('sort[0][direction]', 'desc')
  const records = await airtableList(CASH_SNAPSHOTS_TABLE_ID, params)
  return records[0] ? mapCashSnapshot(records[0]) : null
}

export async function getCashSnapshots(limit = 30): Promise<AirtableCashSnapshot[]> {
  const params = new URLSearchParams({
    maxRecords: String(limit),
  })
  params.set('sort[0][field]', 'Snapshot Date')
  params.set('sort[0][direction]', 'desc')
  const records = await airtableList(CASH_SNAPSHOTS_TABLE_ID, params)
  return records.map(mapCashSnapshot)
}
