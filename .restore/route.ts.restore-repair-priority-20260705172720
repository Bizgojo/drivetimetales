/**
 * repair-queue cron — ATL-REPAIR-001
 *
 * Watches stories in `repair_queue` and `failed` workflow states and sends
 * them back through the pipeline automatically.
 *
 * Repair logic:
 *   - Belle quality failures (missing title, listener, hook, narrator)
 *     → reset to voice_preflight with repair_belle_quality as safe_resume
 *       (keeps the script body, just fixes the Belle intro/outro)
 *   - Script content failures / RFR gate content failures
 *     → clear script, create job at generate_script (Hal rewrites from scratch)
 *   - Unknown failures
 *     → same as script failure — send back to Hal
 *   - Max 3 total repair attempts → needs_human_review + Marc action item
 *
 * Runs every 5 minutes via Vercel cron.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_REPAIR_ATTEMPTS = 3

// Belle-specific failures that can be fixed without rewriting the full script.
// These go to repair_belle_quality, not generate_script.
const BELLE_FIXABLE_KINDS = new Set([
  'belle_quality',
  'belle_quality_title_missing',
  'belle_quality_hook_missing',
  'belle_quality_listener_missing',
  'belle_quality_repair_failed',
  'rfr_outro_narrator_missing',
  'rfr_gate_unknown',       // Usually a Belle issue — try repair_belle first
  'rfr_gate_content',
])

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export async function POST(req: Request) {
  // Verify cron secret
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const now = new Date().toISOString()

  // 1. Find stories in repair_queue or failed state
  const { data: repairStories, error: fetchError } = await supabase
    .from('stories')
    .select('id, title, workflow_state, script_json, script')
    .in('workflow_state', ['repair_queue', 'failed'])
    .order('workflow_state_changed_at', { ascending: true, nullsFirst: false })
    .limit(10)  // Process up to 10 per run

  if (fetchError) {
    console.error('[repair-queue] Failed to fetch repair stories:', fetchError)
    return json({ success: false, error: fetchError.message }, 500)
  }

  if (!repairStories?.length) {
    return json({ success: true, processed: [], message: 'No stories in repair queue' })
  }

  const processed: Array<{ storyId: string; title: string; action: string; repairAttempts: number }> = []
  const escalated: Array<{ storyId: string; title: string; reason: string }> = []

  for (const story of repairStories) {
    const repairAttempts = Number(((story.script_json as any)?.repair_attempts) || 0)
    const storyId = story.id
    const title = story.title || storyId

    // Check attempt limit
    if (repairAttempts >= MAX_REPAIR_ATTEMPTS) {
      // Escalate to needs_human_review
      await supabase
        .from('stories')
        .update({
          workflow_state: 'cold_storage',
          workflow_state_changed_by: 'orion',
          workflow_state_changed_at: now,
          workflow_state_change_reason: `Repair exhausted: ${MAX_REPAIR_ATTEMPTS} attempts failed. Moved to cold_storage for manual review.`,
        })
        .eq('id', storyId)

      // Cancel any lingering active jobs for this story
      await supabase
        .from('production_jobs')
        .update({ status: 'cancelled' })
        .eq('story_id', storyId)
        .in('status', ['queued', 'running', 'waiting_for_external'])

      console.log(`[repair-queue] Escalated "${title}" after ${repairAttempts} attempts — cold_storage`)
      escalated.push({ storyId, title, reason: `${repairAttempts} repair attempts exhausted` })
      continue
    }

    // Get the most recent failed production_job to understand why it failed
    const { data: failedJob } = await supabase
      .from('production_jobs')
      .select('id, error_json, current_step, state_json')
      .eq('story_id', storyId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const errorKind = (failedJob?.error_json as any)?.kind as string | undefined
    const recommendedAction = (failedJob?.error_json as any)?.recommendedAction as string | undefined
    const failureStep = failedJob?.current_step as string | undefined
    const nextAttempt = repairAttempts + 1

    // Cancel any lingering active jobs before creating the repair job
    await supabase
      .from('production_jobs')
      .update({ status: 'cancelled' })
      .eq('story_id', storyId)
      .in('status', ['queued', 'running', 'waiting_for_external'])

    let action: string
    let jobStep: string
    let clearScript = false

    if (errorKind && BELLE_FIXABLE_KINDS.has(errorKind)) {
      // Belle repair: keep script, fix intro/outro
      action = `belle_repair (attempt ${nextAttempt}/${MAX_REPAIR_ATTEMPTS})`
      jobStep = 'voice_preflight'
      clearScript = false
    } else {
      // Full script rewrite: send back to Hal (generate_script)
      action = `generate_script (attempt ${nextAttempt}/${MAX_REPAIR_ATTEMPTS})`
      jobStep = 'generate_script'
      clearScript = true
    }

    // Optionally clear the script for full rewrites
    const storyUpdate: Record<string, unknown> = {
      workflow_state: 'being_repaired',
      workflow_state_changed_by: 'orion',
      workflow_state_changed_at: now,
      workflow_state_change_reason: `Repair attempt ${nextAttempt}/${MAX_REPAIR_ATTEMPTS}: ${action}. Failure: ${errorKind || 'unknown'} at ${failureStep || 'unknown step'}.`,
      // Track repair attempts inside script_json (no separate column needed)
      script_json: {
        ...((story.script_json as Record<string, unknown>) || {}),
        repair_attempts: nextAttempt,
        last_repair_reason: errorKind || 'unknown',
        last_repair_at: now,
      },
    }

    if (clearScript) {
      // CRITICAL (per Hal): generateStandaloneScript() checks if (story.script) and
      // silently skips generation if script is non-null. Must clear both script AND
      // reset status to 'brief_complete' so the generate_script step actually runs.
      storyUpdate.script = null
      storyUpdate.status = 'brief_complete'
    }

    await supabase.from('stories').update(storyUpdate).eq('id', storyId)

    // Create repair production job
    const { data: newJob, error: jobError } = await supabase
      .from('production_jobs')
      .insert({
        story_id: storyId,
        job_type: 'standalone',
        status: 'queued',
        current_step: jobStep,
        step_index: 0,
        input_json: {
          mode: 'standalone',
          source: 'repair-queue',
          storyId,
          repairAttempt: nextAttempt,
          repairReason: errorKind || 'unknown',
          // Pass Hal's recommendedAction so generate_script prompt can incorporate it
          recommendedAction: recommendedAction || null,
          failedStep: failureStep || 'unknown',
          originalFailure: failedJob?.error_json || null,
        },
        state_json: {
          storyId,
          isRepair: true,
          repairAttempt: nextAttempt,
          repairReason: errorKind || 'unknown',
          // For Belle repair, signal to run-next to route through repair_belle_quality
          ...(jobStep === 'voice_preflight' && errorKind
            ? { belleRepairOnFail: true, repairBelleKind: errorKind }
            : {}),
        },
        logs: [
          {
            at: now,
            event: `Repair attempt ${nextAttempt}/${MAX_REPAIR_ATTEMPTS}: ${action}. Triggered by repair-queue cron.`,
            source: 'repair-queue',
            storyId,
            errorKind: errorKind || 'unknown',
          },
        ],
      })
      .select('id')
      .single()

    if (jobError) {
      console.error(`[repair-queue] Failed to create repair job for "${title}":`, jobError)
      continue
    }

    console.log(`[repair-queue] Created repair job ${newJob.id.slice(0, 8)} for "${title}" → ${jobStep} (attempt ${nextAttempt})`)
    processed.push({ storyId, title, action, repairAttempts: nextAttempt })
  }

  return json({
    success: true,
    processed,
    escalated,
    message: `Processed ${processed.length} repairs, escalated ${escalated.length}`,
  })
}

// Vercel cron also calls GET for scheduled invocations
export async function GET(req: Request) {
  return POST(req)
}
