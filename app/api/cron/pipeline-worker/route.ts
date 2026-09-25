import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

export async function handlePipelineWorker(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const now = new Date().toISOString()
  const processed: Array<{ storyId: string; title: string | null; jobId: string }> = []
  const skipped: Array<Record<string, unknown>> = []
  const errors: Array<Record<string, unknown>> = []

  try {
    // Query stories in queue that don't have active production jobs
    const { data: queuedStories, error: queueError } = await supabase
      .from('stories')
      .select('id,title,story_type,series_id,workflow_state')
      .eq('workflow_state', 'stories_in_queue')
      .order('created_at', { ascending: true })
      .limit(5)

    if (queueError) {
      console.error('[pipeline-worker] Failed to load queued stories:', queueError)
      return json({
        success: false,
        error: `Failed to load stories_in_queue: ${queueError.message}`,
        processed: processed.length,
        skipped: skipped.length,
      }, 500)
    }

    if (!queuedStories || queuedStories.length === 0) {
      console.log('[pipeline-worker] No stories queued — pipeline idle')
      return json({
        success: true,
        processed: 0,
        skipped: 0,
        message: 'Queue empty',
        stories: [],
      }, 200)
    }

    const storyIds = queuedStories.map((s: any) => s.id)

    // Check which stories already have active jobs
    const { data: activeJobs, error: activeJobsError } = await supabase
      .from('production_jobs')
      .select('story_id,series_id')
      .in('story_id', storyIds)
      .in('status', ['queued', 'running', 'waiting_for_external'])

    if (activeJobsError) {
      console.error('[pipeline-worker] Failed to check active jobs:', activeJobsError)
      return json({
        success: false,
        error: `Failed to check active jobs: ${activeJobsError.message}`,
      }, 500)
    }

    const activeStoryIds = new Set((activeJobs || []).map((j: any) => j.story_id))
    const activeSeriesIds = new Set((activeJobs || []).map((j: any) => j.series_id).filter(Boolean))

    // Process each queued story
    for (const story of queuedStories as any[]) {
      try {
        // Skip if story already has an active job
        if (activeStoryIds.has(story.id)) {
          skipped.push({ storyId: story.id, reason: 'active_job_exists' })
          continue
        }

        // For series episodes: skip if series has an active job
        if (story.story_type === 'series_episode' && story.series_id) {
          if (activeSeriesIds.has(story.series_id)) {
            skipped.push({ storyId: story.id, seriesId: story.series_id, reason: 'series_has_active_job' })
            continue
          }
        }

        // Determine initial step based on story type
        let initialStep = 'voice_preflight'
        let jobType: 'standalone' | 'series' = 'standalone'

        if (story.story_type === 'series_episode' && story.series_id) {
          initialStep = 'score_validate_package'
          jobType = 'series'
        }

        // Create production job
        const { data: job, error: insertError } = await supabase
          .from('production_jobs')
          .insert({
            ...(jobType === 'series' ? { series_id: story.series_id } : { story_id: story.id }),
            job_type: jobType,
            status: 'queued',
            current_step: initialStep,
            step_index: 0,
            input_json: {
              mode: jobType,
              source: 'pipeline-worker-cron',
              ...(jobType === 'series' ? { seriesId: story.series_id } : { storyId: story.id }),
            },
            state_json: {
              ...(jobType === 'series' ? { seriesId: story.series_id } : { storyId: story.id }),
              dispatchSource: 'cron/pipeline-worker',
              dispatchedAt: now,
            },
            logs: [
              {
                at: now,
                event: `Queued ${jobType} ${jobType === 'series' ? 'series' : 'story'} from stories_in_queue by pipeline-worker cron`,
                source: 'pipeline-worker',
              },
            ],
          })
          .select('id')
          .single()

        if (insertError) {
          console.error(`[pipeline-worker] Failed to create job for story ${story.id}:`, insertError)
          errors.push({
            storyId: story.id,
            title: story.title,
            error: insertError.message,
          })
          continue
        }

        if (!job) {
          console.error(`[pipeline-worker] No job returned for story ${story.id}`)
          errors.push({
            storyId: story.id,
            title: story.title,
            error: 'Job creation returned no data',
          })
          continue
        }

        processed.push({
          storyId: story.id,
          title: story.title,
          jobId: job.id,
        })

        console.log(
          `[pipeline-worker] Created ${jobType} job ${job.id.slice(0, 8)} for ${jobType === 'series' ? `series ${story.series_id}` : `story ${story.id}`}`,
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[pipeline-worker] Caught error processing story ${story.id}:`, errMsg)
        errors.push({
          storyId: story.id,
          title: story.title,
          error: errMsg,
        })
      }
    }

    console.log(
      `[pipeline-worker] Complete: ${processed.length} jobs created, ${skipped.length} skipped, ${errors.length} errors`,
    )

    return json({
      success: true,
      processed: processed.length,
      skipped: skipped.length,
      errors: errors.length,
      processedStories: processed,
      skippedReasons: skipped.slice(0, 10),
      errorDetails: errors.slice(0, 5),
    }, 200)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline-worker] Unhandled error:', errMsg)
    return json({
      success: false,
      error: `Pipeline worker error: ${errMsg}`,
      processed: processed.length,
    }, 500)
  }
}

export async function GET(request: NextRequest) {
  return handlePipelineWorker(request)
}

export async function POST(request: NextRequest) {
  return handlePipelineWorker(request)
}
