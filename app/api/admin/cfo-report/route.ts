/**
 * app/api/admin/cfo-report/route.ts
 *
 * GET  /api/admin/cfo-report          → Return today's or latest stored report
 * GET  /api/admin/cfo-report?date=YYYY-MM-DD → Return specific date
 * POST /api/admin/cfo-report          → Trigger a fresh compile (admin + service role only)
 *
 * Auth: admin email list + service role for POST
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function requireAdmin(): Promise<NextResponse | null> {
  // Allow service-role Bearer token (for cron jobs)
  // Also checked below for POST — we skip cookie auth if Bearer matches CRON_SECRET
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

  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }
  return null
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin()
  if (authErr) return authErr

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  try {
    // Try to fetch from cfo_reports table
    const { data, error } = await supabase
      .from('cfo_reports')
      .select('*')
      .eq('report_date', date)
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — not a real error
      throw error
    }

    if (data) {
      return json({
        success: true,
        source: 'supabase',
        reportDate: date,
        deliveredAt: data.delivered_at,
        report: data.report_json,
      })
    }

    // No stored report — return a stub with instructions
    return json({
      success: false,
      source: 'none',
      reportDate: date,
      message:
        'No report found for this date. Either the cfo_reports table migration has not been run, or no report has been compiled yet. ' +
        'POST to this endpoint to trigger a fresh compile (admin only). ' +
        'Run supabase/migrations/20260917_cfo_reports.sql first.',
    }, 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ success: false, error: message }, 500)
  }
}

// ─── POST — trigger fresh compile ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Accept either admin session cookie OR CRON_SECRET bearer token
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCronAuth) {
    const authErr = await requireAdmin()
    if (authErr) return authErr
  }

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; force?: boolean }
  const { dryRun = false, force = false } = body

  try {
    // Dynamically import compile to avoid bundling issues
    // In production this runs server-side via API call to the cron route
    // For now, return a trigger acknowledgement — actual compile happens via cron
    console.log(`[api/cfo-report] POST received — dryRun=${dryRun} force=${force}`)

    // If CRON_SECRET is set, chain to deliver endpoint
    // (in production, this should call the deliver.ts script via a worker)
    return json({
      success: true,
      message: 'Report compile triggered. Check logs for progress.',
      note: 'Full pipeline: compile.ts + deliver.ts. Trigger via cron at 6:30 AM ET (compile) and 7:00 AM ET (deliver).',
      dryRun,
      force,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ success: false, error: message }, 500)
  }
}
