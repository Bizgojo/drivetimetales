import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ProductionJobMode = 'single' | 'series'

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']
const COMPLETED_ASSET_STATUS = 'superseded_by_completed_assets'

type ProductionJobRow = {
  id: string
  status: string
  current_step: string | null
  story_id: string | null
  series_id: string | null
  error_json?: any
  state_json?: any
}

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function normalizeMode(value: unknown): ProductionJobMode | null {
  const mode = String(value || '').trim()
  if (mode === 'single' || mode === 'series') return mode
  return null
}

function readStoryIdFromJob(job: ProductionJobRow): string | null {
  const candidates = [
    job.story_id,
    job.error_json?.storyId,
    job.error_json?.story_id,
    job.error_json?.voiceGenerationReport?.storyId,
    job.error_json?.voiceGenerationReport?.story_id,
    job.state_json?.storyId,
    job.state_json?.story_id,
  ]

  for (const candidate of candidates) {
    const clean = String(candidate || '').trim()
    if (clean) return clean
  }

  return null
}

function expectedSegmentCeiling(job: ProductionJobRow, presentSegmentNumbers: number[]) {
  const report = job.error_json?.voiceGenerationReport || job.error_json
  const missing = [
    ...(Array.isArray(report?.missingSegments) ? report.missingSegments : []),
    ...(Array.isArray(report?.inventory?.missingSegments) ? report.inventory.missingSegments : []),
  ]

  const missingNumbers = missing
    .map((name: unknown) => String(name || '').match(/^segment_(\d{4})\.mp3$/)?.[1])
    .filter((value: string | undefined): value is string => Boolean(value))
    .map(Number)

  return Math.max(0, ...presentSegmentNumbers, ...missingNumbers)
}

async function completedAssetsForFailedJob(job: ProductionJobRow) {
  if (job.status !== 'failed') return null

  const storyId = readStoryIdFromJob(job)
  if (!storyId) return null

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id,title,status,is_hidden,published_on,audio_url,story_audio_url,intro_audio_url,intro_before_url,intro_after_url,outro_audio_url,background_music_url')
    .eq('id', storyId)
    .maybeSingle()

  if (storyError || !story) {
    console.warn('[production-jobs] Failed-job reconciliation could not load story:', storyError)
    return null
  }

  const { data: files, error: storageError } = await supabase
    .storage
    .from('audio')
    .list(`asc3/${storyId}`, { limit: 500 })

  if (storageError || !files) {
    console.warn('[production-jobs] Failed-job reconciliation could not list story assets:', storageError)
    return null
  }

  const names = files.map((file) => file.name)
  const segmentNumbers = names
    .map((name) => name.match(/^segment_(\d{4})\.mp3$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .sort((a, b) => a - b)

  const expectedMax = expectedSegmentCeiling(job, segmentNumbers)
  const missingSegments: string[] = []
  if (expectedMax > 0) {
    const present = new Set(segmentNumbers)
    for (let segment = 1; segment <= expectedMax; segment += 1) {
      if (!present.has(segment)) missingSegments.push(`segment_${String(segment).padStart(4, '0')}.mp3`)
    }
  }

  const hasIntro = names.some((name) => name === 'intro.mp3' || name.startsWith('intro_'))
  const hasOutro = names.some((name) => name === 'outro.mp3' || name.startsWith('outro_'))
  const hasStoryBody = names.includes('story_body.mp3')
  const hasFinalMix = names.includes('final_mix.mp3')
  const complete =
    Boolean(story.audio_url) &&
    Boolean(story.story_audio_url) &&
    hasStoryBody &&
    hasFinalMix &&
    hasIntro &&
    hasOutro &&
    segmentNumbers.length > 0 &&
    missingSegments.length === 0

  if (!complete) {
    return {
      complete: false,
      storyId,
      segmentCount: segmentNumbers.length,
      expectedSegmentCount: expectedMax || null,
      missingSegments,
      hasIntro,
      hasOutro,
      hasStoryBody,
      hasFinalMix,
      hasAudioUrl: Boolean(story.audio_url),
      hasStoryAudioUrl: Boolean(story.story_audio_url),
    }
  }

  return {
    complete: true,
    storyId,
    storyTitle: story.title,
    storyStatus: story.status,
    isHidden: story.is_hidden,
    publishedOn: story.published_on,
    segmentCount: segmentNumbers.length,
    expectedSegmentCount: expectedMax || segmentNumbers.length,
    hasIntro,
    hasOutro,
    hasStoryBody,
    hasFinalMix,
    hasAudioUrl: true,
    hasStoryAudioUrl: true,
  }
}

async function withReportingStatus(job: ProductionJobRow) {
  const assetState = await completedAssetsForFailedJob(job)
  if (!assetState?.complete) {
    return {
      ...job,
      reporting_status: job.status,
      reporting_message: null,
      stale_failure_superseded: false,
      asset_completion: assetState,
    }
  }

  return {
    ...job,
    reporting_status: COMPLETED_ASSET_STATUS,
    reporting_message: 'Stale failed job superseded by completed story/storage assets.',
    stale_failure_superseded: true,
    asset_completion: assetState,
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    const storyId = req.nextUrl.searchParams.get('storyId')
    const seriesId = req.nextUrl.searchParams.get('seriesId')
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)))

    let query = supabase
      .from('production_jobs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (id) query = query.eq('id', id)
    if (seriesId) query = query.eq('series_id', seriesId)

    const { data, error } = await query
    if (error) {
      console.error('[production-jobs] Failed to load jobs:', error)
      return bad(error.message || 'Failed to load production jobs', 500)
    }

    const reconciledJobs = await Promise.all(((data || []) as ProductionJobRow[]).map(withReportingStatus))
    const jobs = storyId
      ? reconciledJobs.filter((job) => job.story_id === storyId || job.asset_completion?.storyId === storyId || readStoryIdFromJob(job) === storyId)
      : reconciledJobs

    return NextResponse.json({ success: true, jobs })
  } catch (err: any) {
    console.error('[production-jobs] GET failed:', err)
    return bad(err?.message || 'Failed to load production jobs', 500)
  }
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
