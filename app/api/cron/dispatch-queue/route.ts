import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']
const READY_OR_FURTHER_STATES = new Set([
  'stories_in_queue',
  'scripts_ready',
  'ready_for_review',
  'approved_ready',
  'unpublished_library',
  'published',
])
const NUM_RUNNERS = 4              // Larry, Curly, Moe, Groucho
const MAX_DISPATCH_PER_RUN = NUM_RUNNERS * 4  // Keep 4 jobs queued per runner (16 total)

type StoryRow = {
  id: string
  title: string | null
  story_type: string | null
  workflow_state: string | null
  series_id: string | null
  series_name: string | null
  episode_number: number | null
  series_episode_number: number | null
  series_total_episodes: number | null
}

type DispatchResult = {
  jobId: string
  jobType: 'standalone' | 'series'
  storyId?: string
  seriesId?: string
  title?: string | null
  episodeCount?: number
}

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

function cleanState(value: unknown) {
  return String(value || '').trim()
}

function episodeNumber(story: StoryRow) {
  return Number(story.episode_number || story.series_episode_number || 0)
}

function expectedEpisodeCount(stories: StoryRow[]) {
  const fromRows = stories
    .map((story) => Number(story.series_total_episodes || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  return Math.max(stories.length, ...fromRows)
}

function seriesIsReady(stories: StoryRow[]) {
  const expected = expectedEpisodeCount(stories)
  if (expected < 2 || stories.length < expected) return false

  const episodeNumbers = new Set(stories.map(episodeNumber).filter((value) => value > 0))
  if (episodeNumbers.size < expected) return false

  return stories.every((story) => READY_OR_FURTHER_STATES.has(cleanState(story.workflow_state)))
}

async function handleDispatchQueue(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const dispatched: DispatchResult[] = []
  const skipped: Array<Record<string, unknown>> = []
  const now = new Date().toISOString()
  const deduped: Array<{ id: string; title: string }> = []

  // ── Auto-deduplication ──────────────────────────────────────────────────────
  // Find all stories_in_queue, group by title. For each title with >1 entry,
  // keep the one with highest production_priority (then earliest created_at)
  // and cold-storage the rest automatically.
  const { data: allQueued } = await supabase
    .from('stories')
    .select('id,title,production_priority,created_at')
    .eq('workflow_state', 'stories_in_queue')
    .order('production_priority', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (allQueued && allQueued.length > 0) {
    const seenTitles = new Map<string, string>() // title → keeper id
    const dupesToRemove: string[] = []

    for (const story of allQueued as Array<{ id: string; title: string; production_priority: number | null; created_at: string }>) {
      const title = (story.title || '').trim().toLowerCase()
      if (!title) continue
      if (seenTitles.has(title)) {
        dupesToRemove.push(story.id)
      } else {
        seenTitles.set(title, story.id)
      }
    }

    if (dupesToRemove.length > 0) {
      const { data: removed } = await supabase
        .from('stories')
        .update({
          workflow_state: 'cold_storage',
          workflow_state_changed_by: 'orion',
          workflow_state_changed_at: now,
          workflow_state_change_reason: 'Duplicate title auto-removed from queue by dispatch-queue cron',
        })
        .in('id', dupesToRemove)
        .select('id,title')

      // Also cancel any active jobs for removed stories
      if (dupesToRemove.length > 0) {
        await supabase
          .from('production_jobs')
          .update({ status: 'cancelled' })
          .in('story_id', dupesToRemove)
          .in('status', ACTIVE_JOB_STATUSES)
      }

      for (const r of (removed || []) as Array<{ id: string; title: string }>) {
        deduped.push({ id: r.id, title: r.title })
        console.log(`[dispatch-queue] Auto-deduped: "${r.title}" (${r.id})`)
      }
    }
  }

  // Check how many active jobs already exist — only dispatch enough to fill up to MAX_DISPATCH_PER_RUN
  const { count: existingActiveCount } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_JOB_STATUSES)
  const activeCount = existingActiveCount ?? 0
  const dispatchTarget = Math.max(0, MAX_DISPATCH_PER_RUN - activeCount)
  console.log(`[dispatch-queue] Active jobs: ${activeCount}, target: ${MAX_DISPATCH_PER_RUN}, will dispatch up to: ${dispatchTarget}`)
  if (dispatchTarget === 0) {
    return json({ success: true, dispatched: [], skipped: [], message: `Queue full (${activeCount} active jobs, target ${MAX_DISPATCH_PER_RUN})` }, 200)
  }

  const { data: standaloneStories, error: standaloneError } = await supabase
    .from('stories')
    .select('id,title,story_type,workflow_state,series_id,series_name,episode_number,series_episode_number,series_total_episodes')
    .eq('workflow_state', 'stories_in_queue')
    .in('story_type', ['standalone', 'single'])
    .order('production_priority', { ascending: false, nullsFirst: false })
    .order('workflow_state_changed_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(50)

  if (standaloneError) {
    console.error('[dispatch-queue] Failed to load standalone queue:', standaloneError)
    return json({ success: false, error: standaloneError.message }, 500)
  }

  const standaloneIds = ((standaloneStories || []) as StoryRow[]).map((story) => story.id)
  const { data: activeStandaloneJobs, error: activeStandaloneError } = standaloneIds.length
    ? await supabase
        .from('production_jobs')
        .select('id,story_id,status')
        .in('story_id', standaloneIds)
        .in('status', ACTIVE_JOB_STATUSES)
    : { data: [], error: null }

  if (activeStandaloneError) {
    console.error('[dispatch-queue] Failed to load active standalone jobs:', activeStandaloneError)
    return json({ success: false, error: activeStandaloneError.message }, 500)
  }

  const activeStandaloneStoryIds = new Set(
    ((activeStandaloneJobs || []) as Array<{ story_id: string | null }>).map((job) => job.story_id).filter(Boolean),
  )

  for (const story of (standaloneStories || []) as StoryRow[]) {
    if (dispatched.length >= dispatchTarget) break
    if (activeStandaloneStoryIds.has(story.id)) {
      skipped.push({ storyId: story.id, reason: 'active_job_exists' })
      continue
    }

    const { data: job, error: insertError } = await supabase
      .from('production_jobs')
      .insert({
        story_id: story.id,
        job_type: 'standalone',
        status: 'queued',
        // Stories in stories_in_queue already have scripts — start at voice production, not script generation
        current_step: 'voice_preflight',
        step_index: 0,
        input_json: {
          mode: 'standalone',
          source: 'hal',
          storyId: story.id,
        },
        state_json: {
          storyId: story.id,
          dispatchSource: 'cron/dispatch-queue',
          dispatchedAt: now,
        },
        logs: [
          {
            at: now,
            event: 'Queued from stories_in_queue by dispatch-queue cron',
            storyId: story.id,
            source: 'hal',
          },
        ],
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[dispatch-queue] Failed to dispatch standalone story:', story.id, insertError)
      skipped.push({ storyId: story.id, reason: 'insert_failed', error: insertError.message })
      continue
    }

    dispatched.push({
      jobId: job.id,
      jobType: 'standalone',
      storyId: story.id,
      title: story.title,
    })
  }

  if (dispatched.length < dispatchTarget) {
    const { data: queuedSeriesEpisodes, error: queuedSeriesError } = await supabase
      .from('stories')
      .select('series_id')
      .eq('workflow_state', 'stories_in_queue')
      .eq('story_type', 'series_episode')
      .not('series_id', 'is', null)
      .limit(200)

    if (queuedSeriesError) {
      console.error('[dispatch-queue] Failed to load queued series ids:', queuedSeriesError)
      return json({ success: false, error: queuedSeriesError.message }, 500)
    }

    const candidateSeriesIds = Array.from(new Set(
      ((queuedSeriesEpisodes || []) as Array<{ series_id: string | null }>)
        .map((story) => story.series_id)
        .filter((id): id is string => Boolean(id)),
    ))

    const { data: activeSeriesJobs, error: activeSeriesError } = candidateSeriesIds.length
      ? await supabase
          .from('production_jobs')
          .select('id,series_id,status')
          .in('series_id', candidateSeriesIds)
          .in('status', ACTIVE_JOB_STATUSES)
      : { data: [], error: null }

    if (activeSeriesError) {
      console.error('[dispatch-queue] Failed to load active series jobs:', activeSeriesError)
      return json({ success: false, error: activeSeriesError.message }, 500)
    }

    const activeSeriesIds = new Set(
      ((activeSeriesJobs || []) as Array<{ series_id: string | null }>).map((job) => job.series_id).filter(Boolean),
    )

    for (const seriesId of candidateSeriesIds) {
      if (dispatched.length >= dispatchTarget) break
      if (activeSeriesIds.has(seriesId)) {
        skipped.push({ seriesId, reason: 'active_job_exists' })
        continue
      }

      const { data: seriesStories, error: seriesStoriesError } = await supabase
        .from('stories')
        .select('id,title,story_type,workflow_state,series_id,series_name,episode_number,series_episode_number,series_total_episodes')
        .eq('series_id', seriesId)
        .eq('story_type', 'series_episode')

      if (seriesStoriesError) {
        console.error('[dispatch-queue] Failed to load series stories:', seriesId, seriesStoriesError)
        skipped.push({ seriesId, reason: 'series_load_failed', error: seriesStoriesError.message })
        continue
      }

      const episodes = (seriesStories || []) as StoryRow[]
      if (!seriesIsReady(episodes)) {
        skipped.push({
          seriesId,
          reason: 'series_not_fully_written',
          episodeCount: episodes.length,
          expectedEpisodeCount: expectedEpisodeCount(episodes),
        })
        continue
      }

      const episodeCount = expectedEpisodeCount(episodes)
      const seriesName = episodes.find((episode) => episode.series_name)?.series_name || null
      const { data: job, error: insertError } = await supabase
        .from('production_jobs')
        .insert({
          series_id: seriesId,
          job_type: 'series',
          status: 'queued',
          current_step: 'series_voice_preflight',
          step_index: 0,
          input_json: {
            mode: 'series',
            source: 'hal',
            seriesId,
          },
          state_json: {
            seriesId,
            totalEpisodes: episodeCount,
            dispatchSource: 'cron/dispatch-queue',
            dispatchedAt: now,
            // Series episodes already have scripts; start at the series voice preflight.
            initialStep: 'series_voice_preflight',
          },
          logs: [
            {
              at: now,
              event: 'Queued complete series from stories_in_queue by dispatch-queue cron',
              seriesId,
              episodeCount,
              source: 'hal',
            },
          ],
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[dispatch-queue] Failed to dispatch series:', seriesId, insertError)
        skipped.push({ seriesId, reason: 'insert_failed', error: insertError.message })
        continue
      }

      dispatched.push({
        jobId: job.id,
        jobType: 'series',
        seriesId,
        title: seriesName,
        episodeCount,
      })
    }
  }

  console.log('[dispatch-queue] Dispatch complete', {
    dispatchedCount: dispatched.length,
    dispatched,
    skippedCount: skipped.length,
  })

  return json({
    success: true,
    dispatchedCount: dispatched.length,
    dispatched,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 20),
    dedupedCount: deduped.length,
    deduped,
  })
}

export async function GET(request: NextRequest) {
  return handleDispatchQueue(request)
}

export async function POST(request: NextRequest) {
  return handleDispatchQueue(request)
}
