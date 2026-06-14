/**
 * /api/admin/hal-report
 *
 * HAL-REPORT-001: Live pipeline status for Hal's production reports.
 *
 * Hal MUST call this endpoint instead of reading from org-status (cached storage)
 * when generating any production status report.
 *
 * Returns:
 * - Live job states from production_jobs (never cached)
 * - Pipeline Truth classification (trueState) for each job
 * - Full structured error_json fields: kind, marc_required, retry_count, playbookId, etc.
 * - Active mission context and smoke test slot membership
 * - Cache/live mismatch detection when Hal provides cached summaries
 *
 * Usage:
 *   GET  /api/admin/hal-report                         — all active jobs
 *   GET  /api/admin/hal-report?jobIds=id1,id2          — specific jobs
 *   GET  /api/admin/hal-report?includeComplete=true    — include complete jobs
 *   POST /api/admin/hal-report { cachedSummaries: [...] } — detect mismatches
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  buildLivePipelineReport,
  annotateMismatches,
  type CachedJobSummary,
} from '@/lib/halReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

async function requireAdmin(): Promise<NextResponse | null> {
  const cronKey = typeof (globalThis as any).Request !== 'undefined'
    ? null
    : null  // allow cron bypass to be added later

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
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

/**
 * GET /api/admin/hal-report
 *
 * Returns a live pipeline report. Never cached — always queries production_jobs directly.
 *
 * Query params:
 *   jobIds         — comma-separated job IDs (optional, defaults to all active jobs)
 *   includeComplete — include complete jobs (default: false)
 */
export async function GET(req: NextRequest) {
  // Allow Orion cron service key to read
  const cronKey = req.headers.get('x-orion-service-key')
  const validCronKey = process.env.ORION_CRON_READ_KEY
  const isCronRead = cronKey && validCronKey && cronKey === validCronKey

  if (!isCronRead) {
    const authError = await requireAdmin()
    if (authError) return authError
  }

  try {
    const url = new URL(req.url)
    const jobIdsParam = url.searchParams.get('jobIds')
    const includeComplete = url.searchParams.get('includeComplete') === 'true'

    const jobIds = jobIdsParam
      ? jobIdsParam.split(',').map(id => id.trim()).filter(Boolean)
      : undefined

    const report = await buildLivePipelineReport(supabase, { jobIds, includeComplete })

    return NextResponse.json(
      { success: true, report },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/hal-report
 *
 * Returns a live pipeline report with cache/live mismatch detection.
 *
 * Body:
 * {
 *   cachedSummaries: CachedJobSummary[]  — what Hal's cached report shows for each job
 *   jobIds?: string[]                    — subset of jobs to check (optional)
 *   includeComplete?: boolean
 * }
 *
 * Mismatches are returned in report.mismatches[].
 * Always trust the live values over the cached ones.
 */
export async function POST(req: NextRequest) {
  const cronKey = req.headers.get('x-orion-service-key')
  const validCronKey = process.env.ORION_CRON_READ_KEY
  const isCronRead = cronKey && validCronKey && cronKey === validCronKey

  if (!isCronRead) {
    const authError = await requireAdmin()
    if (authError) return authError
  }

  try {
    const body = await req.json() as {
      cachedSummaries?: CachedJobSummary[]
      jobIds?: string[]
      includeComplete?: boolean
    }

    const { cachedSummaries = [], jobIds, includeComplete = false } = body

    // Ensure we query all jobs mentioned in cachedSummaries (if not explicitly provided)
    const effectiveJobIds = jobIds
      ?? (cachedSummaries.length > 0 ? cachedSummaries.map(c => c.jobId) : undefined)

    const report = await buildLivePipelineReport(supabase, {
      jobIds: effectiveJobIds,
      includeComplete,
    })

    // Annotate with mismatches
    const annotatedReport = cachedSummaries.length > 0
      ? annotateMismatches(report, cachedSummaries)
      : report

    const hasMismatches = annotatedReport.mismatches.length > 0

    return NextResponse.json(
      {
        success: true,
        report: annotatedReport,
        hasMismatches,
        // Surface mismatches at the top level for easy scanning
        mismatches: annotatedReport.mismatches,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
