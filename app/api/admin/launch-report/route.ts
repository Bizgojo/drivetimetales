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
// LIVE OVERRIDES (ATL-LAUNCH-REPORT-002): on each request the server also
// tries to fetch live numbers directly from Meta + Mercury (see the "live
// sources" section below). Successes override the launch_metrics 'total'
// cells ONLY (as_of = now); 4h/24h windows always come from launch_metrics —
// Marc's local fetcher snapshot history stays the window engine. Any live
// failure (or absent env var) falls back to stored launch_metrics values
// exactly as before; the page never errors on upstream failure.
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

// ── LIVE SOURCES (ATL-LAUNCH-REPORT-002) ────────────────────────────────────
//
//   Meta Graph insights for act_10211115959074229 (env META_ACCESS_TOKEN):
//     impressions → impressions, inline_link_clicks → lp_clicks,
//     spend → meta_expenses. time_range since launch day, until today.
//   Mercury (env MERCURY_API_TOKEN): GET /api/v1/accounts, sum of
//     currentBalance across accounts → mercury_balance.
//
// The two sources are INDEPENDENT: Meta failing never blocks Mercury and
// vice versa. Live meta_expenses counts as a real expense row for the Total
// Expenses gating rule and flows into CAC (both total-window only).
//
// Cache: module-level, per source, 60s TTL — successes AND failures — so
// repeated admin refreshes don't hammer Meta rate limits. BEST-EFFORT on
// Vercel serverless: each lambda instance has its own module scope, so cold
// starts / concurrent instances may still fetch; acceptable for an admin page.
//
// TOKEN HYGIENE: token values are read from process.env and placed ONLY in
// the Authorization header — never in a URL, never logged, never returned to
// the client. Upstream error bodies are redacted + truncated before logging
// (defense in depth: Meta error payloads can echo request URLs).

const META_AD_ACCOUNT = 'act_10211115959074229'
const META_API_VERSION = 'v23.0'
const META_SINCE = '2026-07-17' // launch day
const LIVE_CACHE_TTL_MS = 60_000
const LIVE_FETCH_TIMEOUT_MS = 6_000

type LiveMeta = { impressions: number; lpClicks: number; spend: number }
type LiveMercury = { balance: number }
type LiveCacheEntry<T> = { result: T | null; fetchedAt: number }

let metaLiveCache: LiveCacheEntry<LiveMeta> | null = null
let mercuryLiveCache: LiveCacheEntry<LiveMercury> | null = null

// Strip anything token-shaped from a string before it can reach a log line.
function redactSecrets(s: string): string {
  return s
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]')
}

function logLiveFailure(source: string, detail: unknown) {
  const msg = detail instanceof Error ? detail.message : String(detail)
  console.error(`[launch-report] live ${source} fetch failed:`, redactSecrets(msg).slice(0, 300))
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchMetaLive(): Promise<LiveMeta | null> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return null // env absent → fallback, silently
  const startedAt = Date.now()
  if (metaLiveCache && startedAt - metaLiveCache.fetchedAt < LIVE_CACHE_TTL_MS) {
    return metaLiveCache.result
  }
  let result: LiveMeta | null = null
  try {
    const until = new Date().toISOString().slice(0, 10) // UTC today; a not-yet-started (ET) date just returns no extra rows
    const params = new URLSearchParams({
      fields: 'impressions,inline_link_clicks,spend',
      time_range: JSON.stringify({ since: META_SINCE, until }),
      level: 'account',
    })
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT}/insights?${params.toString()}`,
      { Authorization: `Bearer ${token}` }, // token in header only — never in the URL
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    const json = await res.json()
    const rows: any[] = Array.isArray(json?.data) ? json.data : []
    // Empty data (no delivery in range yet) is a valid live answer: zeros.
    const sum = (field: string) => rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0)
    result = {
      impressions: sum('impressions'),
      lpClicks: sum('inline_link_clicks'),
      spend: sum('spend'),
    }
  } catch (err) {
    logLiveFailure('Meta', err)
    result = null
  }
  metaLiveCache = { result, fetchedAt: startedAt }
  return result
}

async function fetchMercuryLive(): Promise<LiveMercury | null> {
  const token = process.env.MERCURY_API_TOKEN
  if (!token) return null // env absent → fallback, silently
  const startedAt = Date.now()
  if (mercuryLiveCache && startedAt - mercuryLiveCache.fetchedAt < LIVE_CACHE_TTL_MS) {
    return mercuryLiveCache.result
  }
  let result: LiveMercury | null = null
  try {
    const res = await fetchWithTimeout('https://api.mercury.com/api/v1/accounts', {
      Authorization: `Bearer ${token}`,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    const json = await res.json()
    const accounts: any[] = Array.isArray(json?.accounts) ? json.accounts : []
    // Zero accounts would make a $0 balance override look real — treat as failure.
    if (accounts.length === 0) throw new Error('no accounts in response')
    result = { balance: accounts.reduce((acc, a) => acc + (Number(a?.currentBalance) || 0), 0) }
  } catch (err) {
    logLiveFailure('Mercury', err)
    result = null
  }
  mercuryLiveCache = { result, fetchedAt: startedAt }
  return result
}

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

    // ── LIVE overrides (ATL-LAUNCH-REPORT-002): 'total' window only ────────
    // Per-source independence: each fetch resolves to null on its own failure
    // (never throws), so one source failing can't block the other or the page.
    const [liveMeta, liveMercury] = await Promise.all([fetchMetaLive(), fetchMercuryLive()])
    const liveAsOf = new Date(now).toISOString()
    const setLiveTotal = (key: string, value: number) => {
      metrics = metrics || {}
      metrics[key] = metrics[key] || {}
      metrics[key]!.total = { value, asOf: liveAsOf }
    }
    if (liveMeta) {
      setLiveTotal('impressions', liveMeta.impressions)
      setLiveTotal('lp_clicks', liveMeta.lpClicks)
      // Counts as a REAL expense row for the Total Expenses gating rule and
      // flows into CAC (both consume the metrics map below).
      setLiveTotal('meta_expenses', liveMeta.spend)
    }
    if (liveMercury) setLiveTotal('mercury_balance', liveMercury.balance)

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
      liveSources: { meta: Boolean(liveMeta), mercury: Boolean(liveMercury) },
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
