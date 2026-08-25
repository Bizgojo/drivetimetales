// app/api/admin/analytics/funnel-reach/route.ts
//
// ATL-FUNNEL-REACH-001: per-adset Reach from Meta Graph API.
// Returns Reach for each Bell arm's adset independently.
// Arms with no adset ID env var configured return null for that arm.
//
// AUTH: same requireAdmin() pattern as funnel/route.ts.
// ENV:
//   META_ACCESS_TOKEN     — Meta Graph API access token
//   META_ARM1_ADSET_ID    — Ad set ID for Bell Arm 1 (optional)
//   META_ARM2_ADSET_ID    — Ad set ID for Bell Arm 2 (optional)
//   META_ARM3_ADSET_ID    — Ad set ID for Bell Arm 3 (optional)
//
// Each arm independently: if an adset ID env var is absent, that arm's reach is null.
// If Meta API errors for a given arm, that arm's reach is null and error is surfaced.
//
// NOTE: date_preset is rejected by this token/endpoint (Meta error #100 for all
// presets). Must use explicit time_range. Campaign effective-start (ad delivery
// aligned to Marc's Ads Manager baseline): 2026-08-21.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 300 // 5-min cache

// ─── Admin auth (copied from funnel/route.ts — separate Next.js route files) ─

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

// ─── Response types ───────────────────────────────────────────────────────────

export interface FunnelReachResponse {
  arm1_reach: number | null
  arm2_reach: number | null
  arm3_reach: number | null
  /** Which arms have an adset ID configured */
  configured_arms: ('arm1' | 'arm2' | 'arm3')[]
  fetched_at: string
  errors?: Partial<Record<'arm1' | 'arm2' | 'arm3', string>>
}

// ─── Per-adset fetch helper ───────────────────────────────────────────────────

async function fetchAdsetReach(
  adsetId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<{ reach: number | null; error?: string }> {
  const metaUrl = new URL(`https://graph.facebook.com/v21.0/${adsetId}/insights`)
  metaUrl.searchParams.set('fields', 'reach')
  metaUrl.searchParams.set('time_range', JSON.stringify({ since, until }))
  metaUrl.searchParams.set('access_token', accessToken)

  let res: Response
  try {
    res = await fetch(metaUrl.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'EndlessTales-OrionAgent/1.0' },
    })
  } catch (err) {
    return { reach: null, error: 'Failed to reach Meta Graph API' }
  }

  const raw = await res.json()

  if (!res.ok || raw?.error) {
    const msg = raw?.error?.message ?? raw?.error ?? `Meta API status ${res.status}`
    console.error(`[analytics/funnel-reach] Meta API error for adset ${adsetId}:`, msg)
    return { reach: null, error: String(msg) }
  }

  const reachRaw = raw?.data?.[0]?.reach
  const reach = reachRaw !== undefined ? parseInt(reachRaw, 10) : null
  return { reach: Number.isFinite(reach) ? reach : null }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = process.env.META_ACCESS_TOKEN
    const adsetIds = {
      arm1: process.env.META_ARM1_ADSET_ID ?? null,
      arm2: process.env.META_ARM2_ADSET_ID ?? null,
      arm3: process.env.META_ARM3_ADSET_ID ?? null,
    }

    const configuredArms = (Object.entries(adsetIds) as ['arm1' | 'arm2' | 'arm3', string | null][])
      .filter(([, id]) => id !== null)
      .map(([arm]) => arm)

    // Use explicit time_range — date_preset is rejected by this token/endpoint.
    // Default since = 2026-08-21 (campaign effective-start, verified in Ads Manager
    // Aug 25 2026). Accepts ?since=YYYY-MM-DD override.
    const since = req.nextUrl.searchParams.get('since') ?? '2026-08-21'
    const until = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const reaches: Record<'arm1' | 'arm2' | 'arm3', number | null> = {
      arm1: null,
      arm2: null,
      arm3: null,
    }
    const errors: Partial<Record<'arm1' | 'arm2' | 'arm3', string>> = {}

    if (!accessToken) {
      // No token — return gracefully with configured_arms populated
      return NextResponse.json({
        arm1_reach: null,
        arm2_reach: null,
        arm3_reach: null,
        configured_arms: configuredArms,
        fetched_at: new Date().toISOString(),
        errors: { arm1: 'META_ACCESS_TOKEN not set', arm2: 'META_ACCESS_TOKEN not set', arm3: 'META_ACCESS_TOKEN not set' },
      } satisfies FunnelReachResponse)
    }

    // Fetch all configured arms in parallel
    await Promise.all(
      (Object.entries(adsetIds) as ['arm1' | 'arm2' | 'arm3', string | null][]).map(
        async ([arm, id]) => {
          if (!id) return // not configured — leave as null
          const result = await fetchAdsetReach(id, accessToken, since, until)
          reaches[arm] = result.reach
          if (result.error) errors[arm] = result.error
        }
      )
    )

    return NextResponse.json({
      arm1_reach: reaches.arm1,
      arm2_reach: reaches.arm2,
      arm3_reach: reaches.arm3,
      configured_arms: configuredArms,
      fetched_at: new Date().toISOString(),
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    } satisfies FunnelReachResponse)
  } catch (err) {
    console.error('[analytics/funnel-reach] failed:', err)
    return NextResponse.json(
      {
        arm1_reach: null,
        arm2_reach: null,
        arm3_reach: null,
        configured_arms: [],
        fetched_at: new Date().toISOString(),
        errors: { arm1: err instanceof Error ? err.message : 'funnel-reach failed' },
      } satisfies FunnelReachResponse,
      { status: 500 }
    )
  }
}
