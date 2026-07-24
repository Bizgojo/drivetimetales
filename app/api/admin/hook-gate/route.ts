/**
 * HOOK-GATE-001 — Standalone operator endpoint
 *
 * POST /api/admin/hook-gate
 * Body: { storyId: string }
 *
 * Runs the full HOOK-GATE-001 pre-flight gate against a story and returns
 * the structured result. This lets operators manually trigger the check
 * without advancing the pipeline.
 *
 * Returns 200 with { pass, warnings, failures, checks } on success.
 * Returns 422 when the gate finds hard failures.
 * Returns 400 for bad input, 404 if story not found, 500 for unexpected errors.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runHookGateForStory } from '@/lib/hookGate'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { storyId?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const storyId = body?.storyId?.trim()
  if (!storyId) {
    return NextResponse.json(
      { success: false, error: 'storyId is required' },
      { status: 400 },
    )
  }

  let result
  try {
    result = await runHookGateForStory(storyId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (/not found/i.test(message)) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 404 },
      )
    }

    return NextResponse.json(
      { success: false, error: `HOOK-GATE-001 failed unexpectedly: ${message}` },
      { status: 500 },
    )
  }

  const status = result.pass ? 200 : 422

  return NextResponse.json(
    {
      success: result.pass,
      gate: 'HOOK-GATE-001',
      storyId,
      pass: result.pass,
      warnings: result.warnings,
      failures: result.failures,
      checks: result.checks,
    },
    { status },
  )
}
