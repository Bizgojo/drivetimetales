// app/api/admin/analytics/trial-paid/route.ts — Bell Campaign: Trial to Paid by Arm
//
// Source: users table
// Filter: same as signups report
//   - signup_source = 'bell-invitation'
//   - listen_arm IN (1, 2, 3)  ← integer column
//   - is_test_account IS DISTINCT FROM true
//
// Also reads campaign_arm_spend for spend/CPR columns.
// Gracefully handles missing campaign_arm_spend table (migration may be pending).
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

const BELL_ARM_INTS = [1, 2, 3] as const
type ArmInt = 1 | 2 | 3

// CAMPAIGN_START_DATE: set this to the campaign go-live timestamp before first spend.
// Leave as null until Marc sets the real date.
// Format: ISO 8601 UTC, e.g. '2026-08-20T04:00:00.000Z'
const CAMPAIGN_START_DATE: string | null = null

// Map integer arm to bell-arm key (for spend table lookup)
const ARM_TO_KEY: Record<ArmInt, string> = {
  1: 'bell-arm1',
  2: 'bell-arm2',
  3: 'bell-arm3',
}

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

/** Median of an array of numbers; returns null for empty arrays */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export type TrialArmData = {
  signups: number
  pastDay7: number          // users where trial_started_at <= now() - 7 days
  converted: number         // users where first_paid_date IS NOT NULL
  medianDaysToConvert: number | null
}

export type SpendData = {
  spendUsd: number
  notes: string | null
}

export type TrialPaidResponse = {
  generatedAt: string
  arms: Record<ArmInt, TrialArmData>
  spend: Record<string, SpendData> | null  // keyed by 'bell-arm1' etc.; null if table missing
  spendTableExists: boolean
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()
    const now = new Date()
    const day7Cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Fetch bell-invitation users
    let usersQuery = admin
      .from('users')
      .select('id, listen_arm, is_test_account, trial_started_at, first_paid_date')
      .eq('signup_source', 'bell-invitation')
      .in('listen_arm', [...BELL_ARM_INTS])
    if (CAMPAIGN_START_DATE !== null) usersQuery = usersQuery.gte('created_at', CAMPAIGN_START_DATE)
    const { data: rawUsers, error: usersErr } = await usersQuery

    if (usersErr) {
      console.error('[analytics/trial-paid] users read error:', usersErr.message)
      return NextResponse.json({ error: usersErr.message }, { status: 500 })
    }

    // Apply is_test_account IS DISTINCT FROM true (null passes, false passes, true excluded)
    const users = (rawUsers || []).filter(u => u.is_test_account !== true)

    // Compute per-arm metrics
    const armAccum: Record<ArmInt, { data: TrialArmData; daysToConvert: number[] }> = {
      1: { data: { signups: 0, pastDay7: 0, converted: 0, medianDaysToConvert: null }, daysToConvert: [] },
      2: { data: { signups: 0, pastDay7: 0, converted: 0, medianDaysToConvert: null }, daysToConvert: [] },
      3: { data: { signups: 0, pastDay7: 0, converted: 0, medianDaysToConvert: null }, daysToConvert: [] },
    }

    for (const user of users) {
      const arm = user.listen_arm as ArmInt
      if (!BELL_ARM_INTS.includes(arm)) continue

      const acc = armAccum[arm]
      acc.data.signups++

      // Past day 7: trial_started_at IS NOT NULL AND trial_started_at <= 7 days ago
      if (user.trial_started_at) {
        const trialStart = new Date(user.trial_started_at)
        if (trialStart <= day7Cutoff) {
          acc.data.pastDay7++
        }
      }

      // Converted: first_paid_date IS NOT NULL
      if (user.first_paid_date) {
        acc.data.converted++
        // Days to convert: first_paid_date - trial_started_at
        if (user.trial_started_at) {
          const trialStart = new Date(user.trial_started_at)
          const paidDate = new Date(user.first_paid_date)
          const days = (paidDate.getTime() - trialStart.getTime()) / (24 * 60 * 60 * 1000)
          if (days >= 0) acc.daysToConvert.push(Math.round(days))
        }
      }
    }

    // Finalise medians
    const arms = {} as Record<ArmInt, TrialArmData>
    for (const arm of BELL_ARM_INTS) {
      const acc = armAccum[arm]
      acc.data.medianDaysToConvert = median(acc.daysToConvert)
      arms[arm] = acc.data
    }

    // Fetch spend data — gracefully handle missing table
    let spendData: Record<string, SpendData> | null = null
    let spendTableExists = false
    try {
      const { data: spendRows, error: spendErr } = await admin
        .from('campaign_arm_spend')
        .select('arm, spend_usd, notes')
        .in('arm', Object.values(ARM_TO_KEY))

      if (spendErr) {
        const isMissing = /does not exist|schema cache|could not find/i.test(spendErr.message || '')
        if (!isMissing) {
          console.error('[analytics/trial-paid] campaign_arm_spend read error:', spendErr.message)
        }
        // Table missing or inaccessible — report as not available
        spendTableExists = false
      } else {
        spendTableExists = true
        spendData = {}
        // Initialise all arms at zero
        for (const key of Object.values(ARM_TO_KEY)) {
          spendData[key] = { spendUsd: 0, notes: null }
        }
        // Fill from DB rows
        for (const row of spendRows || []) {
          if (spendData[row.arm] !== undefined) {
            spendData[row.arm] = { spendUsd: Number(row.spend_usd) || 0, notes: row.notes ?? null }
          }
        }
      }
    } catch (spendEx) {
      console.error('[analytics/trial-paid] spend fetch exception:', spendEx)
      spendTableExists = false
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      arms,
      spend: spendData,
      spendTableExists,
    } satisfies TrialPaidResponse)
  } catch (err) {
    console.error('[analytics/trial-paid] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Trial-to-paid report failed' },
      { status: 500 }
    )
  }
}
