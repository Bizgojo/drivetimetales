// ATL-LAUNCH-REPORT-001 — data source for /admin/launch-report.
//
// LIVE rows (computed here from our own users table):
//   Sign ups        = users.created_at in window (test/internal accounts excluded)
//   Cancelations    = users.cancelled_at in window (webhook stamps this on
//                     customer.subscription.deleted; cleared on re-activation)
//   Total trials    = users.subscription_start in window AND stripe_subscription_id
//                     set (webhook stamps subscription_start when Stripe checkout
//                     completes = trial begins)
//   Total subs      = users.first_paid_date in window (webhook stamps this once,
//                     on the first PAID invoice = trial→paid conversion)
//   Sub Rev. Added  = (monthly conversions in window × $7.99)
//                     + (annual conversions in window × $59.99).
//                     billing_cycle is 'monthly' | 'annual' | null (webhook
//                     derives it from the Stripe price interval and nulls it on
//                     deactivation). null/unknown counts as MONTHLY: monthly is
//                     the standard default plan, every converter to date is
//                     monthly, and it gives the conservative (lower) estimate.
//                     Approximation only — Stripe is the source of truth for
//                     actual revenue (no invoice amounts stored in our DB).
//
// FETCHED rows come from public.launch_metrics (populated by Marc's local
// script — see supabase/migrations/20260717160000_launch_metrics.sql). If the
// table doesn't exist yet (migration not applied), the report degrades to
// "awaiting data" instead of crashing.
//
// COMPUTED rows:
//   CAC             = (Meta + TikTok expenses, total-to-date) ÷ Total trials to
//                     date; '—' when trials = 0. Per-window CAC is ambiguous
//                     (spend windows vs. trial windows don't line up), so CAC is
//                     shown ONLY in "Total to date" — flagged for Marc's review.
//   Total Expenses  = sum of the six expense rows per window. Renders only
//                     when at least one REAL expense row exists in
//                     launch_metrics for that window; the TikTok $0 default
//                     alone never produces a numeric total (shows '—' while
//                     awaiting data). Missing TikTok still counts as $0 once
//                     real expense rows are present.
//
// Launch anchor for "Total to date": 2026-07-17 9:55 AM ET = 13:55 UTC.

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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js route files only allow whitelisted exports — keep these module-local.
const LAUNCH_ANCHOR_ISO = '2026-07-17T13:55:00.000Z'
const STANDARD_MONTHLY_PRICE = 7.99
const STANDARD_ANNUAL_PRICE = 59.99

type WindowKey = 'h4' | 'h24' | 'total'
type WindowValues = Record<WindowKey, number | null>

type ReportRow = {
  key: string
  label: string
  kind: 'live' | 'fetched' | 'computed'
  format: 'int' | 'usd'
  windows: WindowValues
  asOf: string | null // fetched rows only: source freshness ("as of [time]")
  note?: string
}

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Missing Supabase environment')
  return {
    auth: createClient(url, anon),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  }
}

async function requireAdmin(req: NextRequest) {
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
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

// Exclude internal/test accounts from launch KPIs (mirrors the launch
// dashboard convention: test_driver plans and admin emails are not customers).
function isRealCustomer(u: any) {
  const plan = String(u.plan || '').toLowerCase().replace(/-/g, '_')
  const subType = String(u.subscription_type || '').toLowerCase().replace(/-/g, '_')
  if (plan === 'test_driver' || subType === 'test_driver') return false
  if (ADMIN_EMAILS.has(String(u.email || '').toLowerCase())) return false
  return true
}

function countInWindows(rows: any[], field: string, starts: Record<WindowKey, number>): WindowValues {
  const out: WindowValues = { h4: 0, h24: 0, total: 0 }
  for (const row of rows) {
    const ms = Date.parse(String(row[field] || ''))
    if (!Number.isFinite(ms)) continue
    if (ms >= starts.h4) out.h4 = (out.h4 || 0) + 1
    if (ms >= starts.h24) out.h24 = (out.h24 || 0) + 1
    if (ms >= starts.total) out.total = (out.total || 0) + 1
  }
  return out
}

const WINDOW_TO_KEY: Record<string, WindowKey> = { '4h': 'h4', '24h': 'h24', total: 'total' }

type MetricCell = { value: number; asOf: string | null }
type MetricMap = Record<string, Partial<Record<WindowKey, MetricCell>>>

function fetchedRow(
  metrics: MetricMap | null,
  key: string,
  label: string,
  format: 'int' | 'usd',
  opts: { defaultZero?: boolean; totalOnly?: boolean; note?: string } = {},
): ReportRow {
  const entry = metrics?.[key]
  const windows: WindowValues = { h4: null, h24: null, total: null }
  let asOf: string | null = null
  for (const wk of ['h4', 'h24', 'total'] as WindowKey[]) {
    if (opts.totalOnly && wk !== 'total') continue
    const cell = entry?.[wk]
    if (cell) {
      windows[wk] = cell.value
      if (cell.asOf && (!asOf || cell.asOf > asOf)) asOf = cell.asOf
    } else if (opts.defaultZero) {
      windows[wk] = 0
    }
  }
  return { key, label, kind: 'fetched', format, windows, asOf, note: opts.note }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()
    const now = Date.now()
    const starts: Record<WindowKey, number> = {
      h4: now - 4 * 60 * 60 * 1000,
      h24: now - 24 * 60 * 60 * 1000,
      total: Date.parse(LAUNCH_ANCHOR_ISO),
    }

    // ── LIVE metrics from users ──────────────────────────────────────────────
    const { data: userRows, error: usersError } = await admin
      .from('users')
      .select('email, plan, subscription_type, created_at, cancelled_at, subscription_start, first_paid_date, stripe_subscription_id, billing_cycle')
      .limit(20000)
    if (usersError) throw new Error(`users query failed: ${usersError.message}`)

    const customers = (userRows || []).filter(isRealCustomer)
    const signups = countInWindows(customers, 'created_at', starts)
    const cancelations = countInWindows(customers, 'cancelled_at', starts)
    const trials = countInWindows(customers.filter(u => u.stripe_subscription_id), 'subscription_start', starts)
    const paidSubs = countInWindows(customers, 'first_paid_date', starts)
    // Sub Rev. Added: monthly × $7.99 + annual × $59.99. null/unknown
    // billing_cycle counts as monthly (default plan; conservative estimate —
    // see header). Approximation; Stripe is source of truth for real revenue.
    const paidAnnual = countInWindows(customers.filter(u => u.billing_cycle === 'annual'), 'first_paid_date', starts)
    const paidMonthly = countInWindows(customers.filter(u => u.billing_cycle !== 'annual'), 'first_paid_date', starts)
    const subRev: WindowValues = {
      h4: (paidMonthly.h4 ?? 0) * STANDARD_MONTHLY_PRICE + (paidAnnual.h4 ?? 0) * STANDARD_ANNUAL_PRICE,
      h24: (paidMonthly.h24 ?? 0) * STANDARD_MONTHLY_PRICE + (paidAnnual.h24 ?? 0) * STANDARD_ANNUAL_PRICE,
      total: (paidMonthly.total ?? 0) * STANDARD_MONTHLY_PRICE + (paidAnnual.total ?? 0) * STANDARD_ANNUAL_PRICE,
    }

    // ── FETCHED metrics from launch_metrics (graceful if table missing) ─────
    let metrics: MetricMap | null = null
    let metricsTableAvailable = false
    const { data: metricRows, error: metricsError } = await admin
      .from('launch_metrics')
      .select('metric_key, window, value, as_of')
    if (metricsError) {
      const msg = metricsError.message || ''
      const missing = /could not find the table|does not exist|schema cache/i.test(msg)
      if (!missing) console.error('[launch-report] launch_metrics read failed:', msg)
      metricsTableAvailable = false
    } else {
      metricsTableAvailable = true
      metrics = {}
      for (const row of metricRows || []) {
        const wk = WINDOW_TO_KEY[String(row.window || 'total')]
        if (!wk) continue
        const value = Number(row.value)
        if (!Number.isFinite(value)) continue
        metrics[row.metric_key] = metrics[row.metric_key] || {}
        metrics[row.metric_key]![wk] = { value, asOf: row.as_of || null }
      }
    }

    const impressions = fetchedRow(metrics, 'impressions', 'Impressions', 'int')
    const lpClicks = fetchedRow(metrics, 'lp_clicks', 'Clicks to Landing Page', 'int')
    const tiktok = fetchedRow(metrics, 'tiktok_expenses', 'TikTok expenses', 'usd', {
      defaultZero: true,
      note: 'Defaults to $0 until TikTok launch',
    })
    const meta = fetchedRow(metrics, 'meta_expenses', 'Meta Expenses', 'usd')
    const anthropic = fetchedRow(metrics, 'anthropic_expenses', 'Anthropic expenses', 'usd')
    const openai = fetchedRow(metrics, 'openai_expenses', 'OpenAI expenses', 'usd')
    const el = fetchedRow(metrics, 'el_expenses', 'EL Expenses', 'usd')
    const other = fetchedRow(metrics, 'other_expenses', 'Other Expenses', 'usd')
    const mercury = fetchedRow(metrics, 'mercury_balance', 'Money in Mercury Bank', 'usd', {
      totalOnly: true,
      note: 'Point-in-time balance — window columns not applicable',
    })

    // ── COMPUTED: Total Expenses ─────────────────────────────────────────────
    // Numeric ONLY when at least one REAL expense metric row exists in
    // launch_metrics for the window — the TikTok $0 default alone must never
    // render as a real total (Marc's revision #5). Once a real row is present,
    // the sum includes every populated cell (TikTok's $0 default included).
    const expenseRows = [tiktok, meta, anthropic, openai, el, other]
    const totalExpenses: WindowValues = { h4: null, h24: null, total: null }
    let expensesAsOf: string | null = null
    for (const wk of ['h4', 'h24', 'total'] as WindowKey[]) {
      const hasRealExpenseData = expenseRows.some(r => metrics?.[r.key]?.[wk] !== undefined)
      if (!hasRealExpenseData) continue // '—' until real launch_metrics expense rows exist
      const present = expenseRows.filter(r => r.windows[wk] !== null)
      if (present.length > 0) {
        totalExpenses[wk] = present.reduce((sum, r) => sum + (r.windows[wk] as number), 0)
      }
    }
    for (const r of expenseRows) {
      if (r.asOf && (!expensesAsOf || r.asOf < expensesAsOf)) expensesAsOf = r.asOf
    }

    // ── COMPUTED: CAC = (Meta + TikTok spend to date) ÷ trials to date ──────
    // Shown only in "Total to date" — per-window CAC is ambiguous (see header).
    const adSpendTotal =
      meta.windows.total !== null ? meta.windows.total + (tiktok.windows.total ?? 0) : null
    const trialsTotal = trials.total ?? 0
    const cacTotal = adSpendTotal !== null && trialsTotal > 0 ? adSpendTotal / trialsTotal : null

    const rows: ReportRow[] = [
      impressions,
      lpClicks,
      { key: 'signups', label: 'Sign ups', kind: 'live', format: 'int', windows: signups, asOf: null },
      { key: 'cancelations', label: 'Cancelations', kind: 'live', format: 'int', windows: cancelations, asOf: null },
      {
        key: 'cac', label: 'CAC', kind: 'computed', format: 'usd',
        windows: { h4: null, h24: null, total: cacTotal }, asOf: meta.asOf,
        note: '(Meta + TikTok spend to date) ÷ trials to date; total column only',
      },
      { key: 'trials', label: 'Total trials', kind: 'live', format: 'int', windows: trials, asOf: null },
      { key: 'subs', label: 'Total subs', kind: 'live', format: 'int', windows: paidSubs, asOf: null },
      tiktok,
      meta,
      anthropic,
      openai,
      el,
      other,
      {
        key: 'total_expenses', label: 'Total Expenses', kind: 'computed', format: 'usd',
        windows: totalExpenses, asOf: expensesAsOf,
        note: 'Sum of the six expense rows above; \u2014 until real expense data arrives in launch_metrics',
      },
      {
        key: 'sub_rev', label: 'Sub Rev. Added', kind: 'live', format: 'usd', windows: subRev, asOf: null,
        note: `Monthly conversions × $${STANDARD_MONTHLY_PRICE} + annual × $${STANDARD_ANNUAL_PRICE} (unknown billing cycle counted as monthly); approximation — Stripe is source of truth`,
      },
      mercury,
    ]

    return NextResponse.json({
      anchor: LAUNCH_ANCHOR_ISO,
      generatedAt: new Date(now).toISOString(),
      metricsTableAvailable,
      rows,
    })
  } catch (err) {
    console.error('[launch-report] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Launch report failed' },
      { status: 500 }
    )
  }
}
