// app/api/admin/analytics/meta-reach/route.ts
//
// Returns the live Meta Ads "Reach" metric for the single active Bell campaign ad set
// ("Bell_Arm2_PV2_SE").  Only Arm 2 has a running ad set; Arms 1 and 3 are inactive.
//
// AUTH: same requireAdmin pattern as /api/admin/analytics/funnel/route.ts
//       (session cookie or Bearer token from ADMIN_EMAILS set).
//
// CACHING: results are cached in-process for CACHE_TTL_MS (5 minutes) so we
//          don't hit the Graph API on every funnel page load.
//
// Meta Graph API version matches the existing meta-insights route (v21.0).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // uses cookies() for admin auth — must be dynamic

// ─── Config ───────────────────────────────────────────────────────────────────

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const ADSET_NAME = 'Bell_Arm2_PV2_SE'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ─── Auth ─────────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

function supabaseClients() {
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
    const { auth } = supabaseClients()
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

// ─── In-process cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  reach: number | null
  fetchedAt: number
}

let cache: CacheEntry | null = null

// ─── Meta API helpers ─────────────────────────────────────────────────────────

/**
 * Look up the ad set ID for ADSET_NAME under the configured ad account.
 * Returns null if the ad set is not found (inactive or renamed).
 */
async function findAdSetId(token: string, accountId: string): Promise<string | null> {
  // Strip "act_" prefix if already present so we can normalise below
  const acctNum = accountId.replace(/^act_/, '')

  const url = new URL(`${META_GRAPH_BASE}/act_${acctNum}/adsets`)
  url.searchParams.set('fields', 'id,name')
  url.searchParams.set(
    'filtering',
    JSON.stringify([{ field: 'name', operator: 'EQUAL', value: ADSET_NAME }])
  )
  url.searchParams.set('limit', '5')
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'EndlessTales-AtlasAgent/1.0' },
  })
  const body = await res.json()

  if (body.error) {
    throw new Error(`Meta adsets lookup error: ${body.error.message} (code ${body.error.code})`)
  }

  const rows: Array<{ id: string; name: string }> = body.data ?? []
  const match = rows.find((r) => r.name === ADSET_NAME)
  return match?.id ?? null
}

/**
 * Fetch the lifetime `reach` insight for a given ad set ID.
 * Returns 0 if the ad set has no data yet.
 */
async function fetchAdSetReach(token: string, adSetId: string): Promise<number> {
  const url = new URL(`${META_GRAPH_BASE}/${adSetId}/insights`)
  url.searchParams.set('fields', 'reach')
  url.searchParams.set('date_preset', 'maximum') // all-time / campaign lifetime
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'EndlessTales-AtlasAgent/1.0' },
  })
  const body = await res.json()

  if (body.error) {
    throw new Error(`Meta insights error: ${body.error.message} (code ${body.error.code})`)
  }

  const rows: Array<{ reach: string }> = body.data ?? []
  if (rows.length === 0) return 0
  return parseInt(rows[0].reach, 10) || 0
}

/**
 * Main fetch: resolve ad set → insights.
 * Returns null if the ad set cannot be found (treated as "no active ad set").
 */
async function fetchLiveReach(): Promise<number | null> {
  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    throw new Error('META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured')
  }

  const adSetId = await findAdSetId(token, accountId)
  if (!adSetId) {
    console.warn(`[meta-reach] Ad set "${ADSET_NAME}" not found in account — returning null`)
    return null
  }

  return await fetchAdSetReach(token, adSetId)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = Date.now()

    if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
      const reach = await fetchLiveReach()
      cache = { reach, fetchedAt: now }
    }

    return NextResponse.json({
      reach: cache.reach,
      adSetName: ADSET_NAME,
      generatedAt: new Date(cache.fetchedAt).toISOString(),
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Meta reach fetch failed'
    console.error('[meta-reach] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
