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

    // Fetch only bell-arm variants — see IMPORTANT comment at top of file
    let funnelQuery = admin
      .from('go_listen_events')
      .select('session_id, variant, event')
      .in('variant', [...BELL_VARIANTS])
    if (CAMPAIGN_START_DATE !== null) funnelQuery = funnelQuery.gte('created_at', CAMPAIGN_START_DATE)
    const { data: events, error } = await funnelQuery

    if (error) {
      console.error('[analytics/funnel] go_listen_events read error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    for (const row of events || []) {
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

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      stages: [...FUNNEL_STAGES],
      arms,
    } satisfies FunnelResponse)
  } catch (err) {
    console.error('[analytics/funnel] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Funnel report failed' },
      { status: 500 }
    )
  }
}
