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
// WINDOWS (final revisions, Marc msg 2868): every metric below is reported
// in TWO windows — Last 24h (rolling; sessions whose first event created_at
// >= now-24h) and All-time. Aggregation logic lives in lib/listenReport.ts
// (pure, unit-tested in __tests__/listen-report-001.test.ts).
//
// METRICS (per variant, and split by utm_source — each in both windows):
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
import { buildSessions, groupWindows, inLast24h, ListenEventRow } from '@/lib/listenReport'

export type { ListenGroupStats, ListenGroupWindows } from '@/lib/listenReport'

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
const WINDOW_24H_MS = 24 * 60 * 60 * 1000

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
        .select('session_id, variant, utm_source, event, position_seconds, created_at')
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

    const cutoffMs = Date.now() - WINDOW_24H_MS
    const sessions = tableAvailable ? Array.from(buildSessions(rows).values()) : []
    const byVariant = groupWindows(sessions, cutoffMs, s => s.variant)
    const bySource = groupWindows(sessions, cutoffMs, s => s.utmSource ?? '(none)')

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      window24hStart: new Date(cutoffMs).toISOString(),
      tableAvailable,
      truncated,
      totalEvents: rows.length,
      totalSessions: sessions.length,
      totalSessions24h: sessions.filter(s => inLast24h(s, cutoffMs)).length,
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
