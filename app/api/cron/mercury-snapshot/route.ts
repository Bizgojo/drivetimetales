import { NextRequest, NextResponse } from 'next/server'

const MERCURY_BASE_URL = 'https://api.mercury.com/api/v1'
const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'
const CASH_SNAPSHOTS_TABLE_ID = 'tbl96ykBf3hbNJmJi'
const ALERT_EMAIL = 'm.postlewaite@gmail.com'

type AirtableRecord = {
  id: string
  fields: Record<string, unknown>
}

type SnapshotResult = {
  success: boolean
  action?: 'created' | 'updated'
  snapshotDate?: string
  recordId?: string
  mercuryBalance?: number
  error?: string
}

function json(data: SnapshotResult, status = 200) {
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

function parseMercuryBalance(payload: unknown): number | null {
  const account = typeof payload === 'object' && payload !== null && 'account' in payload
    ? (payload as { account?: unknown }).account
    : payload

  if (typeof account !== 'object' || account === null) return null

  const candidates = [
    (account as Record<string, unknown>).availableBalance,
    (account as Record<string, unknown>).currentBalance,
    (account as Record<string, unknown>).balance,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (typeof candidate === 'string') {
      const parsed = Number(candidate.replace(/[$,]/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

async function sendMarcAlert(subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[mercury-snapshot] Alert skipped, RESEND_API_KEY missing:', subject, text)
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
      console.error('[mercury-snapshot] Alert send failed:', response.status, await response.text())
    }
  } catch (error) {
    console.error('[mercury-snapshot] Alert send error:', error)
  }
}

async function fetchMercuryBalance() {
  const token = process.env.MERCURY_API_TOKEN
  const accountId = process.env.MERCURY_ACCOUNT_ID
  if (!token || !accountId) {
    throw new Error('Missing MERCURY_API_TOKEN or MERCURY_ACCOUNT_ID')
  }

  const response = await fetch(`${MERCURY_BASE_URL}/account/${accountId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Mercury API failure ${response.status}: ${body.slice(0, 500)}`)
  }

  const payload = await response.json()
  const balance = parseMercuryBalance(payload)
  if (balance === null) {
    throw new Error('Mercury API response did not include a parseable balance')
  }

  return balance
}

function airtableHeaders() {
  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) throw new Error('Missing AIRTABLE_API_KEY')

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function airtableTableUrl() {
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID')
  return `${AIRTABLE_BASE_URL}/${baseId}/${CASH_SNAPSHOTS_TABLE_ID}`
}

async function findSnapshot(snapshotDate: string): Promise<AirtableRecord | null> {
  const params = new URLSearchParams({
    maxRecords: '1',
    filterByFormula: `DATETIME_FORMAT({Snapshot Date}, 'YYYY-MM-DD') = '${snapshotDate}'`,
  })

  const response = await fetch(`${airtableTableUrl()}?${params.toString()}`, {
    headers: airtableHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable lookup failure ${response.status}: ${body.slice(0, 500)}`)
  }

  const payload = await response.json() as { records?: AirtableRecord[] }
  return payload.records?.[0] || null
}

async function writeSnapshot(recordId: string | null, snapshotDate: string, mercuryBalance: number) {
  const url = recordId ? `${airtableTableUrl()}/${recordId}` : airtableTableUrl()
  const method = recordId ? 'PATCH' : 'POST'
  const body = recordId
    ? { fields: { 'Mercury Balance': mercuryBalance } }
    : { fields: { 'Snapshot Date': snapshotDate, 'Mercury Balance': mercuryBalance } }

  const response = await fetch(url, {
    method,
    headers: airtableHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Airtable write failure ${response.status}: ${text.slice(0, 500)}`)
  }

  return await response.json() as AirtableRecord
}

async function retryAirtableWrite(recordId: string | null, snapshotDate: string, mercuryBalance: number) {
  let lastError: unknown

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await writeSnapshot(recordId, snapshotDate, mercuryBalance)
    } catch (error) {
      lastError = error
      console.error('[mercury-snapshot] Airtable write attempt failed:', {
        attempt,
        recordId,
        snapshotDate,
        error: error instanceof Error ? error.message : String(error),
      })

      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function runMercurySnapshot() {
  let mercuryBalance: number

  try {
    mercuryBalance = await fetchMercuryBalance()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mercury-snapshot] Mercury failure, no snapshot created:', message)
    await sendMarcAlert('Mercury snapshot failed', `Mercury API failed before Airtable write. No Cash Snapshot was created.\n\n${message}`)
    return json({ success: false, error: message }, 502)
  }

  const snapshotDate = todayIsoDate()

  try {
    const existing = await findSnapshot(snapshotDate)
    const record = await retryAirtableWrite(existing?.id || null, snapshotDate, mercuryBalance)
    const action = existing ? 'updated' : 'created'

    console.log('[mercury-snapshot] Success:', {
      action,
      snapshotDate,
      recordId: record.id,
      mercuryBalance,
    })

    return json({
      success: true,
      action,
      snapshotDate,
      recordId: record.id,
      mercuryBalance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mercury-snapshot] Airtable failure:', message)
    await sendMarcAlert('Airtable Cash Snapshot write failed', `Mercury balance was pulled, but Airtable write failed after retry.\n\nSnapshot Date: ${snapshotDate}\nMercury Balance: ${mercuryBalance}\n\n${message}`)
    return json({ success: false, snapshotDate, mercuryBalance, error: message }, 502)
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return runMercurySnapshot()
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return runMercurySnapshot()
}
