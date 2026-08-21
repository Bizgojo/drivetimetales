// app/api/admin/analytics/funnel/route.ts — Bell Campaign: Funnel by Arm
//
// Source: go_listen_events
//
// IMPORTANT: Only 'bell-arm1', 'bell-arm2', 'bell-arm3' variants are included.
// Variants 'listen-arm1', 'a', 'b', 'bare', and bare strings represent other
// experiments and MUST NOT be mixed into this report. Doing so would inflate
// per-arm session counts and completely distort the funnel drop-off rates.
//
// SESSION MODEL: session_id = random per-visit UUID. Each event type appears at
// most once per session (DB unique constraint), so distinct session count for any
// event = row count for that (session_id, event) combination.
//
// PAGINATION: PostgREST caps responses at 1000 rows by default. We page through
// all rows using .range() in PAGE_SIZE batches (same pattern as listen-report).
// Without pagination, counts are silently truncated — confirmed Aug 20 2026 when
// 290 of 1290 bell-arm2 rows were dropped, causing ~30% undercount on all stages.
//
// JOIN NOTE (ATL-FUNNEL-JOIN-001): go_listen_events.session_id is a per-visit
// random UUID — it does NOT correspond to users.id. Any query that attempts
// go_listen_events JOIN users ON users.id = session_id returns 0 rows. All arm-
// level counts (page_view, play_start, pct_*, wall_*) are derived from
// go_listen_events.variant directly. Lead-level data (name, email, trial status)
// comes from users via separate queries in signups/route.ts and trial-paid/route.ts.
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

// IMPORTANT: Only these three variants belong to the Bell campaign.
// Other values in go_listen_events ('listen-arm1', 'a', 'b', 'bare') are
// from prior or parallel experiments — exclude them unconditionally.
const BELL_VARIANTS = ['bell-arm1', 'bell-arm2', 'bell-arm3'] as const

// CAMPAIGN_START_DATE: set this to the campaign go-live timestamp before first spend.
// Leave as null until Marc sets the real date.
// Format: ISO 8601 UTC, e.g. '2026-08-20T04:00:00.000Z'
const CAMPAIGN_START_DATE: string | null = '2026-08-18T04:00:00.000Z' // midnight EDT Aug 18 (Marc auth 2026-08-16)
type BellVariant = (typeof BELL_VARIANTS)[number]

export const FUNNEL_STAGES = [
  'page_view',
  'play_start',
  'pct_25',
  'pct_50',
  'pct_75',
  'wall_shown',
  'wall_submit',
] as const
type FunnelStage = (typeof FUNNEL_STAGES)[number]

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

export type FunnelArmData = Record<FunnelStage, number>
export type FunnelResponse = {
  generatedAt: string
  stages: readonly string[]
  arms: Record<BellVariant, FunnelArmData>
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()

    // Fetch all bell-arm events via paginated range queries.
    // PostgREST caps at 1000 rows per request regardless of query size;
    // without pagination counts are silently truncated (ATL-FUNNEL-JOIN-001).
    // PAGE_SIZE matches the PostgREST server cap so each page is maximally full.
    const PAGE_SIZE = 1000
    const MAX_ROWS = 50_000 // safety ceiling — campaign won't hit this
    const allEvents: Array<{ session_id: string; variant: string; event: string }> = []

    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      let q = admin
        .from('go_listen_events')
        .select('session_id, variant, event')
        .in('variant', [...BELL_VARIANTS])
      if (CAMPAIGN_START_DATE !== null) q = q.gte('created_at', CAMPAIGN_START_DATE)
      const { data, error } = await q.range(from, from + PAGE_SIZE - 1)

      if (error) {
        console.error('[analytics/funnel] go_listen_events read error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      allEvents.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break // last page — done
    }

    // Build session sets: arms[variant][stage] = Set<session_id>
    // Each event fires at most once per session (unique constraint), so
    // Set size = distinct session count for that (arm, stage).
    const emptyStages = (): Record<FunnelStage, Set<string>> => ({
      page_view: new Set(),
      play_start: new Set(),
      pct_25: new Set(),
      pct_50: new Set(),
      pct_75: new Set(),
      wall_shown: new Set(),
      wall_submit: new Set(),
    })

    const sessionSets: Record<BellVariant, Record<FunnelStage, Set<string>>> = {
      'bell-arm1': emptyStages(),
      'bell-arm2': emptyStages(),
      'bell-arm3': emptyStages(),
    }

    for (const row of allEvents) {
      const v = row.variant as BellVariant
      const e = row.event as FunnelStage
      if (BELL_VARIANTS.includes(v) && FUNNEL_STAGES.includes(e)) {
        sessionSets[v][e].add(row.session_id)
      }
    }

    // Convert sets to counts
    const arms = {} as Record<BellVariant, FunnelArmData>
    for (const v of BELL_VARIANTS) {
      arms[v] = {} as FunnelArmData
      for (const s of FUNNEL_STAGES) {
        arms[v][s] = sessionSets[v][s].size
      }
    }

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        stages: [...FUNNEL_STAGES],
        arms,
      } satisfies FunnelResponse,
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (err) {
    console.error('[analytics/funnel] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Funnel report failed' },
      { status: 500 }
    )
  }
}
