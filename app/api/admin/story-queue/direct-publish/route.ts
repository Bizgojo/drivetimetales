/**
 * OPERATOR DIRECT-PUBLISH — POST /api/admin/story-queue/direct-publish.
 * Branch: feat/operator-direct-publish-oct23. Review required. No merge authority.
 *
 * Audited operator path for authorized direct-mode series: promotes a repaired
 * series repair_queue → ready_for_review → approved_ready → published with zero
 * owner clicks, gated by (a) server-side Strategos bearer, (b) an explicit
 * Marc decision id on the allowlist (exact match), (c) the full QC bundle in
 * lib/storyQueue/directPublish.ts, (d) Tier-1 single-series scoping.
 *
 * Refusals write NOTHING (fail-closed); the 403/422 response carries the
 * reason. Publishes write one story_workflow_audit row per transition.
 *
 * No deploy, no Harbor Light state changes from this file alone — it only
 * runs when an operator calls it with a valid bearer + decision id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStrategosToken } from '@/lib/storyQueue/dispatch'
import {
  DirectPublishError,
  executeOperatorDirectPublish,
  isDirectPublishDecisionAuthorized,
  runEpisodePreflight,
  type PreflightGateResult,
} from '@/lib/storyQueue/directPublish'
import { resolveNarratorVoiceId } from '@/lib/preflight/narrator-check'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Columns the gates read. DB values are published as-is; no overrides accepted. */
const DIRECT_PUBLISH_EPISODE_COLUMNS =
  'id,series_id,episode_number,title,author,genre,audio_url,cover_url,description,' +
  'duration_mins,announcement_url,background_music_url,script,script_json,series_name,' +
  'narrator_voice_id,narrator_voice_name,author_id,workflow_state,review_status,' +
  'status,is_hidden,production_repair_count'

export async function POST(req: NextRequest) {
  try {
    // 1. Bearer FIRST — before any body parsing side effects or DB reads.
    const auth = requireStrategosToken(req)
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const seriesId = String(body.seriesId || body.series_id || '').trim()
    const decisionId = String(body.decisionId || body.decision_id || '').trim()
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined
    const storyRecordChanged =
      typeof body.storyRecordChanged === 'boolean' ? body.storyRecordChanged : undefined

    // 2. Tier-1 scoping: single explicit series, no unbounded mode.
    if (!seriesId) {
      return NextResponse.json(
        { success: false, code: 'series_required', error: 'seriesId required (Tier-1 scoping: single series only)' },
        { status: 400 }
      )
    }

    // 3. Decision-id allowlist (exact match). Checked before any DB read.
    if (!decisionId) {
      return NextResponse.json(
        { success: false, code: 'decision_required', error: 'decisionId required: explicit Marc decision id authorizing this direct publish' },
        { status: 400 }
      )
    }
    if (!isDirectPublishDecisionAuthorized(decisionId)) {
      return NextResponse.json(
        { success: false, code: 'decision_not_authorized', error: 'direct publish refused: decision id is not on the Marc allowlist' },
        { status: 403 }
      )
    }

    // 4. Load the series (read-only).
    const { data: episodes, error: fetchError } = await supabase
      .from('stories')
      .select(DIRECT_PUBLISH_EPISODE_COLUMNS)
      .eq('series_id', seriesId)
    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }
    if (!episodes || episodes.length === 0) {
      return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 })
    }

    // 5. Narrator resolution per episode (same stage as POST /api/admin/preflight:
    // unresolved narrator = preflight blocker, never a silent skip).
    // 6. Preflight per episode (same validator + pass criterion as the 200 path).
    const preflight: Record<string, PreflightGateResult> = {}
    for (const ep of episodes as Array<Record<string, unknown>>) {
      const storyId = String((ep as { id?: unknown }).id)
      const narratorResult = await resolveNarratorVoiceId(storyId, supabase as never, ep as never)
      if (narratorResult.ok === false) {
        preflight[storyId] = { ok: false, blockers: [narratorResult.message] }
        continue
      }
      preflight[storyId] = await runEpisodePreflight(ep)
    }

    // 7. Gate + promote (throws with zero writes on any refusal).
    const result = await executeOperatorDirectPublish(
      supabase,
      episodes as Array<Record<string, unknown>>,
      { seriesId, decisionId, reason, preflight, storyRecordChanged }
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    if (err instanceof DirectPublishError) {
      return NextResponse.json(
        { success: false, code: err.status === 403 ? 'decision_not_authorized' : 'direct_publish_gates_failed', error: err.message, ...(err.blockers ? { blockers: err.blockers } : {}) },
        { status: err.status }
      )
    }
    console.error('[story-queue/direct-publish] POST failed:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to direct-publish series' },
      { status: 500 }
    )
  }
}
