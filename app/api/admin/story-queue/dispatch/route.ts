/**
 * Atlas Gap-1 build — POST /api/admin/story-queue/dispatch.
 * Branch: feat/atlas-gap1-build-oct11. Review required. No merge authority.
 *
 * Atomic authorize+dispatch. Verifies the approval row in the dedicated
 * table, sets authorized + audit row, inserts the job. Bearer-gated.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  authorizeAndDispatchQueueItem,
  DispatchError,
  normalizeDispatchMode,
  requireStrategosToken,
} from '@/lib/storyQueue/dispatch'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // 1. Bearer FIRST — before any body parsing side effects or DB reads.
    const auth = requireStrategosToken(req)
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const queueItemId = String(body.queueItemId || '').trim()
    const mode = normalizeDispatchMode(body.mode)
    const blueprintRef = String(body.blueprintRef || '').trim()
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined

    if (!queueItemId) {
      return NextResponse.json({ success: false, error: 'queueItemId required' }, { status: 400 })
    }
    if (!mode) {
      return NextResponse.json({ success: false, error: 'mode must be single or series' }, { status: 400 })
    }
    if (!blueprintRef) {
      return NextResponse.json({ success: false, error: 'blueprintRef required' }, { status: 400 })
    }

    const result = await authorizeAndDispatchQueueItem(supabase, {
      queueItemId,
      mode,
      blueprintRef,
      reason,
      caller: 'strategos',
      authorizedBy: 'strategos',
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    if (err instanceof DispatchError) {
      return NextResponse.json(
        { success: false, error: err.message, ...(err.extra || {}) },
        { status: err.status }
      )
    }
    console.error('[story-queue/dispatch] POST failed:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to dispatch queue item' },
      { status: 500 }
    )
  }
}
