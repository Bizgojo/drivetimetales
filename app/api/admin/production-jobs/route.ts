import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ProductionJobMode = 'single' | 'series'

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function normalizeMode(value: unknown): ProductionJobMode | null {
  const mode = String(value || '').trim()
  if (mode === 'single' || mode === 'series') return mode
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const queueItemId = String(body.queueItemId || '').trim()
    const mode = normalizeMode(body.mode)

    if (!queueItemId) return bad('queueItemId required')
    if (!mode) return bad('mode must be single or series')

    const { data: queueItem, error: queueError } = await supabase
      .from('story_queue_items')
      .select('*')
      .eq('id', queueItemId)
      .maybeSingle()

    if (queueError) {
      console.error('[production-jobs] Failed to load queue item:', queueError)
      return bad(queueError.message || 'Failed to load queue item', 500)
    }

    if (!queueItem) {
      return bad('Queue item not found', 404)
    }

    const { data: existingJob, error: existingJobError } = await supabase
      .from('production_jobs')
      .select('id,status,current_step,queue_item_id,job_type,created_at')
      .eq('queue_item_id', queueItemId)
      .in('status', ACTIVE_JOB_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingJobError) {
      console.error('[production-jobs] Failed to check active production jobs:', existingJobError)
      return bad(existingJobError.message || 'Failed to check active production jobs', 500)
    }

    if (existingJob) {
      return NextResponse.json(
        {
          success: false,
          error: 'Active production job already exists for this queue item',
          existingJobId: existingJob.id,
          existingJob,
        },
        { status: 409 }
      )
    }

    const { data: job, error: insertError } = await supabase
      .from('production_jobs')
      .insert({
        queue_item_id: queueItemId,
        job_type: mode,
        status: 'queued',
        current_step: 'queued',
        step_index: 0,
        input_json: {
          queueItem,
          mode,
          source: 'story_queue',
        },
      })
      .select('id,status,current_step,queue_item_id,job_type,created_at')
      .single()

    if (insertError) {
      console.error('[production-jobs] Failed to create production job:', insertError)
      return bad(insertError.message || 'Failed to create production job', 500)
    }

    const { data: updatedQueueItem, error: queueUpdateError } = await supabase
      .from('story_queue_items')
      .update({ status: 'dispatched' })
      .eq('id', queueItemId)
      .select('id,status')
      .single()

    if (queueUpdateError) {
      console.error('[production-jobs] Failed to mark queue item dispatched:', queueUpdateError)
      return bad(queueUpdateError.message || 'Production job created, but failed to mark queue item dispatched', 500)
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      currentStep: job.current_step,
      queueItemStatus: updatedQueueItem.status,
      job,
    })
  } catch (err: any) {
    console.error('[production-jobs] POST failed:', err)
    return bad(err?.message || 'Failed to create production job', 500)
  }
}
