import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runPipelineLoop } from '@/lib/pipeline-runner/runner'
import type { RunnerConfig } from '@/lib/pipeline-runner/types'

export const runtime = 'nodejs'
export const maxDuration = 800

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

async function handleRunner(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Each worker gets a stable, unique holderId so per-worker leases don't collide.
  // worker=1/2/3 ensures three parallel runners each claim their own lease row.
  const workerNum = request.nextUrl.searchParams.get('worker') ?? '1'
  const holderId = `production-runner:worker-${workerNum}`

  const config: RunnerConfig = { holderId }

  try {
    const result = await runPipelineLoop(supabase, config)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[production-runner] Unhandled error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRunner(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRunner(request)
}
