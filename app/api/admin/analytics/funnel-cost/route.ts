// app/api/admin/analytics/funnel-cost/route.ts
//
// Returns Cost/PV and Cost/Trial for each Bell arm, computed from:
//   - Meta Graph API: 7-day rolling spend per arm adset
//   - Supabase go_listen_events: 7-day rolling page_view + wall_submit counts per arm
//
// COMPUTATION:
//   Cost/PV    = arm_spend ÷ arm_page_view_count
//   Cost/Trial = arm_spend ÷ arm_wall_submit_count
//   Shows "—" (null) when denominator = 0 or adset env var is not set.
//
// META FETCH STRATEGY:
//   3 separate adset calls (one per arm). Each is gated on env var presence.
//   Missing env var → spend: null, costPerPv: null, costPerTrial: null for that arm.
//   time_range: explicit since/until (date_preset is rejected by this token — see funnel-reach/route.ts).
//   Window: today-7d to today UTC. NEVER lifetime or date_preset.
//
// CACHE: revalidate = 900 (15 min) to stay within Meta rate limits.
//   The 15-min window is a safe default; Meta allows ~200 calls/hour per token.
//
// AUTH: requireAdmin() — same pattern as funnel-reach/route.ts and funnel/route.ts.
// ENV:
//   META_ACCESS_TOKEN     — Meta Graph API access token
//   META_ARM1_ADSET_ID    — Ad set ID for Arm 1 (optional; absent → "—")
//   META_ARM2_ADSET_ID    — Ad set ID for Arm 2 Bell_Arm2_PV2_SE
//   META_ARM3_ADSET_ID    — Ad set ID for Arm 3 (optional; absent → "—")
//   SUPABASE_SERVICE_ROLE_KEY — server-side service role (already present)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 900 // 15-min server cache — respects Meta rate limits

// ─── Admin auth (same pattern as funnel/route.ts and funnel-reach/route.ts) ──

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

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
  const {
    data: { user },
  } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BELL_ARMS = ['bell-arm1', 'bell-arm2', 'bell-arm3'] as const
type BellArm = (typeof BELL_ARMS)[number]

// Maps arm → env var name for adset ID
const ARM_ADSET_ENV: Record<BellArm, string> = {
  'bell-arm1': 'META_ARM1_ADSET_ID',
  'bell-arm2': 'META_ARM2_ADSET_ID',
  'bell-arm3': 'META_ARM3_ADSET_ID',
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface ArmCostData {
  spend: number | null          // USD spend in last 7 days; null = adset not configured
  pvCount: number               // page_view sessions in last 7 days
  trialCount: number            // wall_submit sessions in last 7 days
  costPerPv: number | null      // null when spend=null or pvCount=0
  costPerTrial: number | null   // null when spend=null or trialCount=0
  adsetConfigured: boolean      // false if env var is not set
}

export interface FunnelCostResponse {
  arms: Record<BellArm, ArmCostData>
  window: '7d'
  fetchedAt: string
  metaError?: string            // set if Meta API returned an error
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FIX-DUAL-COUNT-001: campaignWindow accepts an ISO since string from the caller
// (matches the ?since= param the page passes). Defaults to campaign start 2026-08-21
// so that cost-metrics PV counts use the same window as the stage-funnel section.
function campaignWindow(sinceIso: string): { since: string; until: string } {
  const until = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (today UTC)
  // Clamp to YYYY-MM-DD for Meta Graph API (it rejects timestamps with time components)
  const since = sinceIso.slice(0, 10)
  return { since, until }
}

/** Fetch spend for a single adset. Returns null if not configured or on error. */
async function fetchAdsetSpend(
  adsetId: string,
  accessToken: string,
  since: string,
  until: string,
  armLabel: string,
): Promise<{ spend: number | null; error?: string }> {
  const url = new URL(`https://graph.facebook.com/v21.0/${adsetId}/insights`)
  url.searchParams.set('fields', 'spend')
  // Explicit time_range required — date_preset is rejected by this token (see funnel-reach/route.ts)
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('access_token', accessToken)

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'EndlessTales-OrionAgent/1.0' },
    })
  } catch (err) {
    console.error(`[funnel-cost] Meta fetch failed for ${armLabel}:`, err)
    return { spend: null, error: 'Meta network error' }
  }

  const raw = await res.json()
  if (!res.ok || raw?.error) {
    const msg = raw?.error?.message ?? raw?.error ?? `HTTP ${res.status}`
    console.error(`[funnel-cost] Meta API error for ${armLabel}:`, msg)
    return { spend: null, error: msg }
  }

  // data[0].spend may be missing if adset had zero delivery in the window
  const spendRaw = raw?.data?.[0]?.spend
  if (spendRaw === undefined || spendRaw === null) return { spend: 0 }
  const spend = parseFloat(spendRaw)
  return { spend: Number.isFinite(spend) ? spend : null }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // FIX-DUAL-COUNT-001: Accept ?since= from the page so this route uses the
    // same date window as /api/admin/analytics/funnel. Defaults to 2026-08-21
    // (campaign effective-start, Marc verified ground truth Aug 26 2026).
    const sinceParam = req.nextUrl.searchParams.get('since') ?? '2026-08-21T00:00:00.000Z'
    const { since, until } = campaignWindow(sinceParam)
    const accessToken = process.env.META_ACCESS_TOKEN ?? ''
    const { admin } = clients()

    // ── 1. Fetch Meta spend per arm (3 separate adset calls, parallel) ────────
    // Each arm is gated on its env var; missing var → configured: false → spend: null.
    const spendResults = await Promise.all(
      BELL_ARMS.map(async (arm) => {
        const adsetId = process.env[ARM_ADSET_ENV[arm]] ?? ''
        if (!adsetId) {
          return { arm, spend: null, configured: false, error: undefined }
        }
        if (!accessToken) {
          return { arm, spend: null, configured: true, error: 'META_ACCESS_TOKEN not set' }
        }
        const { spend, error } = await fetchAdsetSpend(adsetId, accessToken, since, until, arm)
        return { arm, spend, configured: true, error }
      }),
    )

    // Collect any meta error to surface in response
    const metaError = spendResults.find(r => r.error)?.error

    // ── 2. Fetch Supabase event counts (campaign-aligned window) ──────────────
    // FIX-DUAL-COUNT-001: Use sinceParam (from page ?since= param) instead of
    // hardcoded 7-day rolling window so cost-metrics PV count matches stage-funnel.
    // Columns: session_id, variant (not "arm"), event
    // ATL-TESTUSER-003: Exclude test-account session IDs via signup_session_id join.
    const isoSince = sinceParam

    // Fetch test-account session IDs to exclude (same pattern as funnel/route.ts)
    const { data: testUsers } = await admin
      .from('users')
      .select('signup_session_id')
      .eq('is_test_account', true)
      .not('signup_session_id', 'is', null)
    const testSessionIds = new Set<string>(
      (testUsers ?? []).map((u: { signup_session_id: string }) => u.signup_session_id).filter(Boolean)
    )
    console.log(`[funnel-cost] Excluding ${testSessionIds.size} test-account session IDs`)

    const { data: events, error: sbError } = await admin
      .from('go_listen_events')
      .select('session_id, variant, event')
      .in('variant', [...BELL_ARMS])
      .in('event', ['page_view', 'wall_submit'])
      .gte('created_at', isoSince)

    if (sbError) {
      console.error('[funnel-cost] Supabase query error:', sbError.message)
      return NextResponse.json({ error: sbError.message }, { status: 500 })
    }

    // Count unique sessions per arm per event using Sets
    // (DB has unique constraint on session_id+event, but Sets guard against any edge cases)
    const pvSets: Record<BellArm, Set<string>> = {
      'bell-arm1': new Set(),
      'bell-arm2': new Set(),
      'bell-arm3': new Set(),
    }
    const trialSets: Record<BellArm, Set<string>> = {
      'bell-arm1': new Set(),
      'bell-arm2': new Set(),
      'bell-arm3': new Set(),
    }

    for (const row of events ?? []) {
      const v = row.variant as BellArm
      if (!BELL_ARMS.includes(v)) continue
      // ATL-TESTUSER-003: skip test-account sessions
      if (testSessionIds.has(row.session_id)) continue
      if (row.event === 'page_view') pvSets[v].add(row.session_id)
      else if (row.event === 'wall_submit') trialSets[v].add(row.session_id)
    }

    // ── 3. Compute per-arm cost metrics ───────────────────────────────────────
    const arms = {} as Record<BellArm, ArmCostData>
    for (const sr of spendResults) {
      const arm = sr.arm as BellArm
      const pvCount = pvSets[arm].size
      const trialCount = trialSets[arm].size
      const spend = sr.spend

      arms[arm] = {
        spend,
        pvCount,
        trialCount,
        // Guard against div-by-0; also null when spend not configured
        costPerPv: spend !== null && pvCount > 0 ? spend / pvCount : null,
        costPerTrial: spend !== null && trialCount > 0 ? spend / trialCount : null,
        adsetConfigured: sr.configured,
      }
    }

    return NextResponse.json({
      arms,
      window: '7d', // kept for type compat; actual window is since→today (see sinceParam)
      fetchedAt: new Date().toISOString(),
      ...(metaError ? { metaError } : {}),
    } satisfies FunnelCostResponse)
  } catch (err) {
    console.error('[funnel-cost] failed:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'funnel-cost failed',
      },
      { status: 500 },
    )
  }
}
