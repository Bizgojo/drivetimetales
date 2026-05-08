import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const TASKS_TABLE_ID = 'tblJZG3UR2Zq3qFcG'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const VIEW_OPTIONS = [
  'Recommendation Queue',
  'Approval Pipeline',
  'Active Campaigns',
  'Variance Watch',
] as const

const CAMPAIGN_FIELDS = [
  'Campaign Name',
  'Status',
  'Channel',
  'Sub-channel',
  'Hypothesis',
  'Target Audience',
  'Research Notes',
  'Recommended By',
  'Created Date',
  'Forecast Spend',
  'Forecast Start Date',
  'Forecast End Date',
  'Forecast Impressions',
  'Forecast Clicks',
  'Forecast Landing Page Visits',
  'Forecast Free Story Plays',
  'Forecast Trial Signups',
  'Forecast Paid Subs',
  'Forecast 30-Day Retained',
  'Forecast CAC',
  'Forecast Annual Mix %',
  'Forecast LTV',
  'Frozen Forecast Spend',
  'Frozen Forecast CAC',
  'Frozen Forecast Paid Subs',
  'Approved Date',
  'Actual Spend',
  'Actual Impressions',
  'Actual Clicks',
  'Actual Landing Page Visits',
  'Actual Free Story Plays',
  'Actual Trial Signups',
  'Actual Paid Subs',
  'Actual 30-Day Retained ',
  'Actual Annual Subs',
  'Actual Start Date',
  'Actual End Date',
  'Last Actuals Update',
  'Cash Committed',
  'Variance Flag',
  'Variance Analysis',
  'Rejection Reason',
  'Tasks',
]

const TASK_FIELDS = [
  'Task Name',
  'Campaign',
  'Owner',
  'Priority',
  'Status',
  'Forecast Start Date',
  'Forecast End Date',
  'Actual Start Date',
  'Actual End Date',
  'Notes',
  'Blocker Description',
  'Estimated Hours',
  'Actual Hours',
  'Dependencies',
]

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  )

  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return null
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

function taskIds(campaign: AirtableRecord) {
  const tasks = campaign.fields.Tasks
  return Array.isArray(tasks)
    ? tasks.filter((task): task is string => typeof task === 'string')
    : []
}

async function loadTasks(campaigns: AirtableRecord[]) {
  const ids = Array.from(new Set(campaigns.flatMap(taskIds)))
  const taskEntries = await Promise.all(ids.map(async (id) => {
    try {
      const record = await airtableGet(TASKS_TABLE_ID, id)
      return [id, record] as const
    } catch (error) {
      console.error('[admin-marketing-campaigns] Failed to load task:', id, error)
      return [id, null] as const
    }
  }))

  return Object.fromEntries(taskEntries.filter((entry): entry is readonly [string, AirtableRecord] => Boolean(entry[1])))
}

function normalizeRecord(record: AirtableRecord, tasksById: Record<string, AirtableRecord>) {
  return {
    id: record.id,
    fields: record.fields,
    tasks: taskIds(record)
      .map((id) => tasksById[id])
      .filter(Boolean)
      .map((task) => ({
        id: task.id,
        fields: task.fields,
      })),
  }
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const requestedView = request.nextUrl.searchParams.get('view') || VIEW_OPTIONS[0]
    const view = VIEW_OPTIONS.includes(requestedView as typeof VIEW_OPTIONS[number])
      ? requestedView
      : VIEW_OPTIONS[0]

    const params = new URLSearchParams({
      view,
      pageSize: '100',
    })
    CAMPAIGN_FIELDS.forEach((field) => params.append('fields[]', field))

    const campaigns = await airtableList(CAMPAIGNS_TABLE_ID, params)
    const tasksById = await loadTasks(campaigns)

    return json({
      success: true,
      view,
      views: VIEW_OPTIONS,
      fields: {
        campaign: CAMPAIGN_FIELDS,
        task: TASK_FIELDS,
      },
      campaigns: campaigns.map((campaign) => normalizeRecord(campaign, tasksById)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin-marketing-campaigns] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}
