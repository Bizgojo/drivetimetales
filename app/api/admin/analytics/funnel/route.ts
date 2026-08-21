// app/api/admin/analytics/funnel/route.ts — Bell Campaign Funnel (v2 clean rewrite)
//
// WHAT THIS DOES:
//   1. Fetches ALL go_listen_events for bell-arm1/2/3 via paginated Supabase queries.
//      PostgREST caps at 1000 rows/response; .range() with ORDER BY created_at paginates
//      deterministically through the full result set.
//   2. Counts DISTINCT sessions per (arm × stage) using Set deduplication.
//      Each (session_id, event) pair appears at most once (DB unique constraint), so
//      Set.size = distinct session count for that arm+stage.
//   3. Fetches per-arm Reach from Meta Graph API (per-adset, explicit time_range).
//      Arms with no adset ID env var return null for Reach.
//   4. Returns combined response including _debug fields to verify correctness at a glance.
//
// CAMPAIGN: Bell Beneath Falls Park
// START:    2026-08-18T04:00:00.000Z (midnight EDT Aug 18)
// VARIANTS: bell-arm1, bell-arm2, bell-arm3
//
// VERIFIED LOCALLY (2026-08-21):
//   Total events: 1370 rows in 2 pages
//   bell-arm2: page_view=703, play_start=268, pct_25=140, pct_50=99, pct_75=79,
//              wall_shown=50, wall_submit=21
//
// AUTH: requireAdmin() — admin email list + cookie/bearer token check.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Campaign constants ────────────────────────────────────────────────────────

const CAMPAIGN_START = '2026-08-18T04:00:00.000Z'

const BELL_VARIANTS = ['bell-arm1', 'bell-arm2', 'bell-arm3'] as const
type BellArm = (typeof BELL_VARIANTS)[number]

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

// ── Admin auth ────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const sbAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Bearer token path (API clients)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token) {
    const { data } = await createClient(sbUrl, sbAnon).auth.getUser(token)
    if (data.user?.email && ADMIN_EMAILS.has(data.user.email.toLowerCase())) return true
  }

  // Cookie path (browser sessions)
  const cookieStore = cookies()
  const { data: { user } } = await createServerClient(sbUrl, sbAnon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  }).auth.getUser()

  return Boolean(user?.email && ADMIN_EMAILS.has(user.email.toLowerCase()))
}

// ── Funnel fetch (Supabase, paginated) ───────────────────────────────────────

async function fetchFunnelCounts(): Promise<{
  arms: Record<BellArm, Record<FunnelStage, number>>
  debug: { totalEventsFetched: number; pagesFetched: number }
}> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Paginate through ALL rows. PAGE_SIZE matches PostgREST max per response.
  // ORDER BY created_at ASC is required for stable OFFSET pagination — without
  // it, consecutive range() calls can return overlapping or missed rows.
  const PAGE_SIZE = 1000
  const MAX_ROWS = 100_000 // safety ceiling; campaign won't approach this
  type EventRow = { session_id: string; variant: string; event: string }
  const allEvents: EventRow[] = []
  let pagesFetched = 0

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('go_listen_events')
      .select('session_id, variant, event')
      .in('variant', [...BELL_VARIANTS])
      .gte('created_at', CAMPAIGN_START)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`go_listen_events fetch failed: ${error.message}`)

    pagesFetched++
    allEvents.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break // last page
  }

  // Build session sets: counts[arm][stage] = Set<session_id>
  // Set.size = distinct session count (unique constraint on session_id+event).
  const sets: Record<BellArm, Record<FunnelStage, Set<string>>> = {
    'bell-arm1': Object.fromEntries(FUNNEL_STAGES.map(s => [s, new Set<string>()])) as Record<FunnelStage, Set<string>>,
    'bell-arm2': Object.fromEntries(FUNNEL_STAGES.map(s => [s, new Set<string>()])) as Record<FunnelStage, Set<string>>,
    'bell-arm3': Object.fromEntries(FUNNEL_STAGES.map(s => [s, new Set<string>()])) as Record<FunnelStage, Set<string>>,
  }

  for (const { session_id, variant, event } of allEvents) {
    if (
      BELL_VARIANTS.includes(variant as BellArm) &&
      FUNNEL_STAGES.includes(event as FunnelStage)
    ) {
      sets[variant as BellArm][event as FunnelStage].add(session_id)
    }
  }

  // Convert sets → counts
  const arms = Object.fromEntries(
    BELL_VARIANTS.map(arm => [
      arm,
      Object.fromEntries(FUNNEL_STAGES.map(stage => [stage, sets[arm][stage].size])),
    ]),
  ) as Record<BellArm, Record<FunnelStage, number>>

  return { arms, debug: { totalEventsFetched: allEvents.length, pagesFetched } }
}

// ── Reach fetch (Meta Graph API, per-adset) ───────────────────────────────────

async function fetchReach(): Promise<{
  arm1: number | null
  arm2: number | null
  arm3: number | null
}> {
  const accessToken = process.env.META_ACCESS_TOKEN
  const adsetIds = {
    arm1: process.env.META_ARM1_ADSET_ID ?? null,
    arm2: process.env.META_ARM2_ADSET_ID ?? null,
    arm3: process.env.META_ARM3_ADSET_ID ?? null,
  }
  const reach = { arm1: null as number | null, arm2: null as number | null, arm3: null as number | null }

  if (!accessToken) return reach // META_ACCESS_TOKEN not set → all null

  // Explicit time_range required — date_preset is rejected by this token/endpoint.
  const since = '2026-08-16'
  const until = new Date().toISOString().slice(0, 10)

  await Promise.all(
    (Object.entries(adsetIds) as ['arm1' | 'arm2' | 'arm3', string | null][]).map(
      async ([arm, id]) => {
        if (!id) return // adset ID not configured for this arm
        try {
          const url = new URL(`https://graph.facebook.com/v21.0/${id}/insights`)
          url.searchParams.set('fields', 'reach')
          url.searchParams.set('time_range', JSON.stringify({ since, until }))
          url.searchParams.set('access_token', accessToken)
          const res = await fetch(url.toString(), {
            headers: { 'User-Agent': 'EndlessTales-OrionAgent/1.0' },
          })
          const json = await res.json()
          const val = json?.data?.[0]?.reach
          if (val !== undefined) reach[arm] = parseInt(val, 10)
        } catch {
          // Non-fatal: reach stays null for this arm; log server-side
          console.error(`[funnel] Meta reach fetch failed for ${arm}`)
        }
      },
    ),
  )

  return reach
}

// ── Response type ─────────────────────────────────────────────────────────────

export type FunnelArmData = Record<FunnelStage, number>

export type FunnelResponse = {
  generatedAt: string
  campaignStart: string
  stages: readonly string[]
  arms: Record<BellArm, FunnelArmData>
  reach: { arm1: number | null; arm2: number | null; arm3: number | null }
  _debug: { totalEventsFetched: number; pagesFetched: number }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Run Supabase + Meta fetches in parallel
    const [{ arms, debug }, reach] = await Promise.all([
      fetchFunnelCounts(),
      fetchReach(),
    ])

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        campaignStart: CAMPAIGN_START,
        stages: [...FUNNEL_STAGES],
        arms,
        reach,
        _debug: debug,
      } satisfies FunnelResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[funnel] handler failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Funnel query failed' },
      { status: 500 },
    )
  }
}
