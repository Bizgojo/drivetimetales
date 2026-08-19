// app/api/admin/analytics/funnel-reach/route.ts
//
// Returns Reach for the Bell Arm 2 ad set (Bell_Arm2_PV2_SE) from Meta Graph API.
// Arms 1 and 3 have no active ad sets — return null for those.
//
// AUTH: same requireAdmin() pattern as funnel/route.ts.
// ENV:
//   META_ACCESS_TOKEN     — Meta Graph API access token
//   META_ARM2_ADSET_ID    — Ad set ID for Bell_Arm2_PV2_SE (set in Vercel + .env.local)
//
// If META_ARM2_ADSET_ID is not set, returns { arm2_reach: null, configured: false }.
// If Meta API errors, returns { arm2_reach: null, error: <message> }.

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
  arm2_reach: number | null
  configured: boolean
  fetched_at: string
  error?: string
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = process.env.META_ACCESS_TOKEN
    const adsetId = process.env.META_ARM2_ADSET_ID

    // If adset ID not configured, return gracefully
    if (!adsetId) {
      return NextResponse.json({
        arm2_reach: null,
        configured: false,
        fetched_at: new Date().toISOString(),
      } satisfies FunnelReachResponse)
    }

    if (!accessToken) {
      return NextResponse.json({
        arm2_reach: null,
        configured: false,
        fetched_at: new Date().toISOString(),
        error: 'META_ACCESS_TOKEN not set',
      } satisfies FunnelReachResponse)
    }

    // Call Meta Graph API for adset-level reach over lifetime
    const metaUrl = new URL(`https://graph.facebook.com/v21.0/${adsetId}/insights`)
    metaUrl.searchParams.set('fields', 'reach')
    metaUrl.searchParams.set('date_preset', 'lifetime')
    metaUrl.searchParams.set('access_token', accessToken)

    let metaRes: Response
    try {
      metaRes = await fetch(metaUrl.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'EndlessTales-OrionAgent/1.0' },
      })
    } catch (err) {
      console.error('[analytics/funnel-reach] Meta fetch failed:', err)
      return NextResponse.json({
        arm2_reach: null,
        configured: true,
        fetched_at: new Date().toISOString(),
        error: 'Failed to reach Meta Graph API',
      } satisfies FunnelReachResponse)
    }

    const raw = await metaRes.json()

    if (!metaRes.ok || raw?.error) {
      const metaErrMsg =
        raw?.error?.message ?? raw?.error ?? `Meta API returned status ${metaRes.status}`
      console.error('[analytics/funnel-reach] Meta API error:', metaErrMsg)
      return NextResponse.json({
        arm2_reach: null,
        configured: true,
        fetched_at: new Date().toISOString(),
        error: metaErrMsg,
      } satisfies FunnelReachResponse)
    }

    // Extract reach from data[0].reach
    const reachRaw = raw?.data?.[0]?.reach
    const arm2Reach = reachRaw !== undefined ? parseInt(reachRaw, 10) : null

    return NextResponse.json({
      arm2_reach: Number.isFinite(arm2Reach) ? arm2Reach : null,
      configured: true,
      fetched_at: new Date().toISOString(),
    } satisfies FunnelReachResponse)
  } catch (err) {
    console.error('[analytics/funnel-reach] failed:', err)
    return NextResponse.json(
      {
        arm2_reach: null,
        configured: true,
        fetched_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'funnel-reach failed',
      } satisfies FunnelReachResponse,
      { status: 500 }
    )
  }
}
