import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CAMPAIGNS_TABLE_ID = 'tblBBWg3lgcjBYpPy'
const TASKS_TABLE_ID = 'tblJZG3UR2Zq3qFcG'
const TASK_TEMPLATES_TABLE_ID = 'tblKbDD2kB6dcmfpA'
const ELIGIBLE_CAMPAIGNS_FORMULA = 'AND({Status}="Approved",{Frozen Forecast Spend}!=BLANK(),{Tasks}=BLANK())'
const ALERT_EMAIL = 'm.postlewaite@gmail.com'

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

type CampaignResult = {
  recordId: string
  campaignName: string
  channel: string | null
  tasksCreated: number
  status: 'created' | 'skipped' | 'partial' | 'error'
  errors: string[]
  tasks?: Array<{
    taskName: string
    owner: string
    forecastDate: string
  }>
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

async function airtableCreateBatch(tableId: string, records: Array<{ fields: Record<string, unknown> }>) {
  const created: AirtableRecord[] = []

  for (let index = 0; index < records.length; index += 10) {
    const batch = records.slice(index, index + 10)
    const response = await fetch(airtableTableUrl(tableId), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: batch }),
      cache: 'no-store',
    })

    const text = await response.text()
    let payload: { records?: AirtableRecord[] } | null = null
    try {
      payload = JSON.parse(text)
    } catch {
      // Preserve response text in the thrown error below.
    }

    if (!response.ok) {
      throw new Error(`Airtable create failure ${tableId} ${response.status}: ${text.slice(0, 500)}`)
    }

    created.push(...(payload?.records || []))
  }

  return created
}

async function findEligibleCampaigns() {
  const params = new URLSearchParams({
    filterByFormula: ELIGIBLE_CAMPAIGNS_FORMULA,
  })

  return airtableList(CAMPAIGNS_TABLE_ID, params)
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function findActiveTemplates(channel: string) {
  const params = new URLSearchParams({
    filterByFormula: `AND({Channel}="${escapeFormulaString(channel)}",{Active}=TRUE())`,
  })
  params.set('sort[0][field]', 'Order')
  params.set('sort[0][direction]', 'asc')

  return airtableList(TASK_TEMPLATES_TABLE_ID, params)
}

function fieldString(record: AirtableRecord, fieldName: string) {
  const value = record.fields[fieldName]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function fieldNumber(record: AirtableRecord, fieldName: string) {
  const value = record.fields[fieldName]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function campaignName(record: AirtableRecord) {
  return fieldString(record, 'Campaign Name') || record.id
}

function parseDate(value: string) {
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function computeTemplateDate(
  campaignStartDate: string,
  campaignEndDate: string,
  anchor: string,
  offsetDays: number,
) {
  const start = parseDate(campaignStartDate)
  const end = parseDate(campaignEndDate)
  if (!start || !end) return null

  let anchorDate: Date
  if (anchor === 'start') {
    anchorDate = start
  } else if (anchor === 'end') {
    anchorDate = end
  } else if (anchor === 'midpoint') {
    const midpointMs = start.getTime() + ((end.getTime() - start.getTime()) / 2)
    anchorDate = new Date(midpointMs)
  } else {
    return null
  }

  return formatDate(addDays(anchorDate, offsetDays))
}

async function sendMissingTemplateAlert(campaign: AirtableRecord, channel: string | null) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[task-template-applier] Alert skipped, RESEND_API_KEY missing:', {
      campaignId: campaign.id,
      campaignName: campaignName(campaign),
      channel,
    })
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
        subject: 'Campaign approved with no Task Template — manual setup required',
        text: [
          'A campaign passed approval/stress testing, but no active task templates were found for its channel.',
          '',
          `Campaign: ${campaignName(campaign)}`,
          `Record ID: ${campaign.id}`,
          `Channel: ${channel || 'Missing'}`,
          '',
          'Manual task setup is required, or add active Task Templates for this channel.',
        ].join('\n'),
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('[task-template-applier] Alert send failed:', response.status, await response.text())
    }
  } catch (error) {
    console.error('[task-template-applier] Alert send error:', error)
  }
}

async function processCampaign(campaign: AirtableRecord): Promise<CampaignResult> {
  const name = campaignName(campaign)
  const channel = fieldString(campaign, 'Channel')
  const campaignStartDate = fieldString(campaign, 'Forecast Start Date')
  const campaignEndDate = fieldString(campaign, 'Forecast End Date')
  const errors: string[] = []

  if (!channel) {
    const message = 'Campaign skipped: Channel is missing.'
    console.warn('[task-template-applier]', message, { recordId: campaign.id, campaignName: name })
    await sendMissingTemplateAlert(campaign, channel)
    return { recordId: campaign.id, campaignName: name, channel, tasksCreated: 0, status: 'skipped', errors: [message] }
  }

  if (!campaignStartDate || !campaignEndDate) {
    const message = 'Campaign skipped: Forecast Start Date or Forecast End Date is missing.'
    console.warn('[task-template-applier]', message, { recordId: campaign.id, campaignName: name, channel })
    return { recordId: campaign.id, campaignName: name, channel, tasksCreated: 0, status: 'skipped', errors: [message] }
  }

  const templates = await findActiveTemplates(channel)
  if (templates.length === 0) {
    const message = `Campaign skipped: no active Task Templates found for channel "${channel}".`
    console.warn('[task-template-applier]', message, { recordId: campaign.id, campaignName: name, channel })
    await sendMissingTemplateAlert(campaign, channel)
    return { recordId: campaign.id, campaignName: name, channel, tasksCreated: 0, status: 'skipped', errors: [message] }
  }

  const taskRecords: Array<{ fields: Record<string, unknown> }> = []
  const taskSummaries: CampaignResult['tasks'] = []

  for (const template of templates) {
    const taskName = fieldString(template, 'Task Name')
    const owner = fieldString(template, 'Default Owner')
    const anchor = fieldString(template, 'Anchor')
    const offsetDays = fieldNumber(template, 'Days from Start')
    const notes = fieldString(template, 'Notes')

    if (!taskName || !owner || !anchor || offsetDays === null) {
      const message = `Template skipped: ${template.id} is missing Task Name, Default Owner, Anchor, or Days from Start.`
      console.warn('[task-template-applier]', message, { templateId: template.id, campaignId: campaign.id })
      errors.push(message)
      continue
    }

    const forecastDate = computeTemplateDate(campaignStartDate, campaignEndDate, anchor, offsetDays)
    if (!forecastDate) {
      const message = `Template skipped: ${template.id} has unsupported Anchor "${anchor}" or invalid campaign dates.`
      console.warn('[task-template-applier]', message, { templateId: template.id, campaignId: campaign.id })
      errors.push(message)
      continue
    }

    const fields: Record<string, unknown> = {
      'Task Name': taskName,
      Campaign: [campaign.id],
      Owner: owner,
      Status: 'Not Started',
      Priority: 'P1',
      'Forecast Start Date': forecastDate,
      'Forecast End Date': forecastDate,
    }

    if (notes) fields.Notes = notes

    taskRecords.push({ fields })
    taskSummaries?.push({ taskName, owner, forecastDate })
  }

  if (taskRecords.length === 0) {
    return {
      recordId: campaign.id,
      campaignName: name,
      channel,
      tasksCreated: 0,
      status: errors.length > 0 ? 'error' : 'skipped',
      errors,
      tasks: taskSummaries,
    }
  }

  const created = await airtableCreateBatch(TASKS_TABLE_ID, taskRecords)
  const status = errors.length > 0 ? 'partial' : 'created'

  console.log('[task-template-applier] Campaign processed:', {
    recordId: campaign.id,
    campaignName: name,
    channel,
    tasksCreated: created.length,
    errors,
  })

  return {
    recordId: campaign.id,
    campaignName: name,
    channel,
    tasksCreated: created.length,
    status,
    errors,
    tasks: taskSummaries,
  }
}

async function runPoller() {
  const campaigns = await findEligibleCampaigns()
  const results: CampaignResult[] = []

  for (const campaign of campaigns) {
    try {
      results.push(await processCampaign(campaign))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[task-template-applier] Campaign processing error:', {
        recordId: campaign.id,
        campaignName: campaignName(campaign),
        error: message,
      })
      results.push({
        recordId: campaign.id,
        campaignName: campaignName(campaign),
        channel: fieldString(campaign, 'Channel'),
        tasksCreated: 0,
        status: 'error',
        errors: [message],
      })
    }
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
    return await runPoller()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[task-template-applier] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    return await runPoller()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[task-template-applier] Failed:', message)
    return json({ success: false, error: message }, 500)
  }
}
