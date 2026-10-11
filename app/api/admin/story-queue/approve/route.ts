/**
 * Atlas Gap-1 build — POST /api/admin/story-queue/approve.
 * Branch: feat/atlas-gap1-build-oct11. Review required. No merge authority.
 *
 * Approval + token-reference write in a SINGLE step
 * (gap1-token-mint-oct11-1637): creates the approval row in the dedicated
 * table AND stores the caller-supplied opaque token reference in the same
 * handler. Bearer-gated.
 *
 * KEY-MATERIAL RULE: `tokenRef` is stored verbatim. Nothing here mints,
 * generates, or handles real key material — Marc mints STRATEGOS_SERVICE_TOKEN
 * out-of-band and supplies only the opaque reference.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  approveBlueprintAndRecordToken,
  DispatchError,
  requireStrategosToken,
} from '@/lib/storyQueue/dispatch'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Bearer FIRST — before any body parsing side effects or DB reads.
    const auth = requireStrategosToken(req)
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const queueItemId = String(body.queueItemId || '').trim()
    const blueprintRef = String(body.blueprintRef || '').trim()
    const approvedBy = String(body.approvedBy || 'strategos').trim()
    const seriesId = typeof body.seriesId === 'string' ? body.seriesId.trim() || undefined : undefined
    const blueprintPayload =
      body.blueprintPayload !== undefined && body.blueprintPayload !== null
        ? body.blueprintPayload
        : undefined
    const tokenRef =
      typeof body.tokenRef === 'string'
        ? body.tokenRef
        : undefined

    if (!queueItemId) {
      return NextResponse.json({ success: false, error: 'queueItemId required' }, { status: 400 })
    }
    if (!blueprintRef) {
      return NextResponse.json({ success: false, error: 'blueprintRef required' }, { status: 400 })
    }

    const result = await approveBlueprintAndRecordToken(supabase, {
      queueItemId,
      blueprintRef,
      approvedBy,
      seriesId,
      blueprintPayload,
      tokenRef,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    if (err instanceof DispatchError) {
      return NextResponse.json(
        { success: false, error: err.message, ...(err.extra || {}) },
        { status: err.status }
      )
    }
    console.error('[story-queue/approve] POST failed:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to record blueprint approval' },
      { status: 500 }
    )
  }
}
