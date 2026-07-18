// app/api/admin/listen-report/route.ts — ATL-GO-LISTEN-001 data source for
// /admin/listen-report.
//
// Reads go_listen_events (written by /api/go-listen from the /go sample
// player) and aggregates per-session funnels. Purpose: distinguish
// "listened 60s+ then left" (CTA/layout problem) from "bounced in 5s"
// (ad-promise mismatch) for the Sunday zero-signup decision.
//
// SESSION MODEL: session_id = random per-visit UUID. Each event type
// appears at most once per session (client latch + DB unique index), so a
// session collapses to the set of events it reached plus the furthest
// audio position seen.
//
// METRICS (per variant, and split by utm_source):
//   Sample starts      = sessions with play_start
//   Median listen s    = median over started sessions of max(position_seconds)
//                        across listen events (cta_click excluded — clicking
//                        isn't listening). Coarse by design: positions are
//                        only sampled at event boundaries, so this reads as
//                        "at least reached X seconds".
//   % reached 25/50/75/complete = started sessions with that event ÷ starts
//   Completion rate    = the complete row of the funnel (called out)
//   CTA click rate     = sessions with cta_click ÷ starts
//   Listened-fully-then-left = sessions reaching ≥75% (pct_75 or complete)
//                        WITHOUT cta_click — the "player worked, CTA didn't"
//                        signal — surfaced against clicked-CTA sessions.
//
// GRACEFUL PRE-MIGRATION: go_listen_events is migration-file-only until Marc
// applies the DDL. A missing table degrades to tableAvailable:false (same
// pattern as launch-report's launch_metrics handling) — the page renders an
// awaiting-data state, never a crash.
//
// AUTH: requireAdmin — same pattern as /api/admin/launch-report (Bearer
// token or Supabase session cookie, email allowlist). Reads use the service
// role server-side (never exposed to the client).

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

const PAGE_SIZE = 10000
const MAX_ROWS = 100000

type ListenEventRow = {
  session_id: string
  variant: string
  utm_source: string | null
  event: string
  position_seconds: number
}

type SessionAgg = {
  variant: string
  utmSource: string | null
  events: Set<string>
  maxListenSeconds: number
}

export type ListenGroupStats = {
  key: string
  starts: number
  totalSessions: number
  medianListenSeconds: number | null
  pct25Rate: number | null
  pct50Rate: number | null
  pct75Rate: number | null
  completionRate: number | null
  ctaClickRate: number | null
  listenedFullyNoCta: number
  clickedCta: number
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

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function buildSessions(rows: ListenEventRow[]): Map<string, SessionAgg> {
  const sessions = new Map<string, SessionAgg>()
  for (const row of rows) {
    let s = sessions.get(row.session_id)
    if (!s) {
      s = { variant: row.variant, utmSource: row.utm_source, events: new Set(), maxListenSeconds: 0 }
      sessions.set(row.session_id, s)
    }
    if (s.utmSource === null && row.utm_source !== null) s.utmSource = row.utm_source
    s.events.add(row.event)
    const pos = Number(row.position_seconds)
    // cta_click position is where they clicked, not how far they listened —
    // exclude it from the listen-depth measure.
    if (row.event !== 'cta_click' && Number.isFinite(pos) && pos > s.maxListenSeconds) {
      s.maxListenSeconds = pos
    }
  }
  return sessions
}

function computeStats(key: string, group: SessionAgg[]): ListenGroupStats {
  const started = group.filter(s => s.events.has('play_start'))
  const starts = started.length
  const withEvent = (event: string) => started.filter(s => s.events.has(event)).length
  const rate = (n: number) => (starts > 0 ? (n / starts) * 100 : null)
  const reached75 = group.filter(s => s.events.has('pct_75') || s.events.has('complete'))
  return {
    key,
    starts,
    totalSessions: group.length,
    medianListenSeconds: median(started.map(s => s.maxListenSeconds)),
    pct25Rate: rate(withEvent('pct_25')),
    pct50Rate: rate(withEvent('pct_50')),
    pct75Rate: rate(withEvent('pct_75')),
    completionRate: rate(withEvent('complete')),
    ctaClickRate: rate(group.filter(s => s.events.has('cta_click')).length),
    listenedFullyNoCta: reached75.filter(s => !s.events.has('cta_click')).length,
    clickedCta: group.filter(s => s.events.has('cta_click')).length,
  }
}

function groupBy(sessions: SessionAgg[], keyOf: (s: SessionAgg) => string): ListenGroupStats[] {
  const groups = new Map<string, SessionAgg[]>()
  for (const s of sessions) {
    const key = keyOf(s)
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  return Array.from(groups.entries())
    .map(([key, group]) => computeStats(key, group))
    .sort((a, b) => b.starts - a.starts || a.key.localeCompare(b.key))
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()

    // Page through events (bounded). The campaign is days old and a session
    // emits ≤6 rows, so 100k rows ≫ expected volume; if we ever hit the cap
    // the payload flags it instead of silently truncating.
    const rows: ListenEventRow[] = []
    let tableAvailable = true
    let truncated = false
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from('go_listen_events')
        .select('session_id, variant, utm_source, event, position_seconds')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        const msg = error.message || ''
        const missing = /could not find the table|does not exist|schema cache/i.test(msg)
        if (!missing) console.error('[listen-report] go_listen_events read failed:', msg.slice(0, 300))
        tableAvailable = false
        break
      }
      rows.push(...((data || []) as ListenEventRow[]))
      if (!data || data.length < PAGE_SIZE) break
      if (from + PAGE_SIZE >= MAX_ROWS) truncated = true
    }

    const sessions = tableAvailable ? Array.from(buildSessions(rows).values()) : []
    const byVariant = groupBy(sessions, s => s.variant)
    const bySource = groupBy(sessions, s => s.utmSource ?? '(none)')

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tableAvailable,
      truncated,
      totalEvents: rows.length,
      totalSessions: sessions.length,
      byVariant,
      bySource,
    })
  } catch (err) {
    console.error('[listen-report] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Listen report failed' },
      { status: 500 }
    )
  }
}
