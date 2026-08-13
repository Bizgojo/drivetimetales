// app/api/admin/analytics/spend/route.ts — Bell Campaign: Spend Entry
//
// GET: returns current spend per arm from campaign_arm_spend table.
//      Gracefully returns { tableExists: false } if migration is pending.
//
// POST: updates spend_usd for one or more arms.
//       Body: { arms: { 'bell-arm1': 150.00, 'bell-arm2': 200.00, 'bell-arm3': 175.00 } }
//       Gracefully returns { tableExists: false } if migration is pending.
//
// AUTH: same requireAdmin pattern as listen-report/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const VALID_ARMS_LIST = ['bell-arm1', 'bell-arm2', 'bell-arm3'] as const
const VALID_ARMS = new Set(VALID_ARMS_LIST)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Missing Supabase environment variables')
  return {
    auth: createClient(url, anon),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  }
}

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    const { auth } = clients()
    const { data, error } = await auth.auth.getUser(token)
    if (!error && data.user?.email && ADMIN_EMAILS.has(data.user.email.toLowerCase())) return true
  }
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

function isMissingTable(msg: string): boolean {
  return /does not exist|schema cache|could not find the table/i.test(msg)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()
    const { data, error } = await admin
      .from('campaign_arm_spend')
      .select('arm, spend_usd, notes, updated_at, updated_by')
      .in('arm', VALID_ARMS_LIST)

    if (error) {
      if (isMissingTable(error.message || '')) {
        return NextResponse.json({ tableExists: false, arms: null })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const arms: Record<string, { spendUsd: number; notes: string | null; updatedAt: string | null; updatedBy: string | null }> = {}
    for (const arm of VALID_ARMS_LIST) {
      arms[arm] = { spendUsd: 0, notes: null, updatedAt: null, updatedBy: null }
    }
    for (const row of data || []) {
      if (VALID_ARMS.has(row.arm)) {
        arms[row.arm] = {
          spendUsd: Number(row.spend_usd) || 0,
          notes: row.notes ?? null,
          updatedAt: row.updated_at ?? null,
          updatedBy: row.updated_by ?? null,
        }
      }
    }

    return NextResponse.json({ tableExists: true, arms })
  } catch (err) {
    console.error('[analytics/spend] GET failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Spend GET failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.arms !== 'object') {
      return NextResponse.json({ error: 'Invalid body: expected { arms: { ... } }' }, { status: 400 })
    }

    // Get caller email for updated_by
    let callerEmail: string | null = null
    try {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      if (token) {
        const { auth } = clients()
        const { data } = await auth.auth.getUser(token)
        callerEmail = data.user?.email ?? null
      }
      if (!callerEmail) {
        const cookieStore = cookies()
        const authClient = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        )
        const { data: { user } } = await authClient.auth.getUser()
        callerEmail = user?.email ?? null
      }
    } catch { /* ignore — updated_by may be null */ }

    const { admin } = clients()
    const updates = []

    for (const [arm, spendRaw] of Object.entries(body.arms)) {
      if (!(VALID_ARMS_LIST as readonly string[]).includes(arm)) continue
      const spendUsd = Number(spendRaw)
      if (!isFinite(spendUsd) || spendUsd < 0) continue
      updates.push({
        arm: arm as 'bell-arm1' | 'bell-arm2' | 'bell-arm3',
        spend_usd: spendUsd,
        updated_at: new Date().toISOString(),
        updated_by: callerEmail,
      })
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid arm updates provided' }, { status: 400 })
    }

    const { error } = await admin
      .from('campaign_arm_spend')
      .upsert(updates, { onConflict: 'arm' })

    if (error) {
      if (isMissingTable(error.message || '')) {
        return NextResponse.json({ tableExists: false, saved: false })
      }
      console.error('[analytics/spend] POST upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tableExists: true, saved: true, updatedArms: updates.map(u => u.arm) })
  } catch (err) {
    console.error('[analytics/spend] POST failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Spend POST failed' }, { status: 500 })
  }
}
