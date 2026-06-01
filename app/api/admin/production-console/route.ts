import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

type StoryRow = {
  id: string
  title: string | null
  author: string | null
  status: string | null
  workflow_state: string | null
  review_notes: string | null
  repair_notes: string | null
  repair_checklist: unknown | null
  updated_at: string | null
  created_at: string | null
  series_id: string | null
  series_name: string | null
  episode_number: number | null
  series_total: number | null
  series_total_episodes: number | null
  owner: string | null
}

type ProductionJobRow = {
  id: string
  story_id: string | null
  series_id: string | null
  status: string | null
  current_step: string | null
  updated_at: string | null
  created_at: string | null
  state_json?: any
  error_json?: any
}

type ConsoleItem = {
  key: string
  type: 'series' | 'story' | 'job'
  title: string
  seriesId: string | null
  storyId: string | null
  episodeCount: number
  affectedEpisodes: number[]
  workflowState: string | null
  status: string | null
  lastUpdated: string | null
  owner: string | null
  repairNotes: string | null
  repairChecklist: unknown | null
  reviewNotes: string | null
  warning: string | null
  jobs?: Array<{
    id: string
    status: string | null
    currentStep: string | null
    updatedAt: string | null
  }>
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return null
}

function clean(value: unknown) {
  return String(value || '').trim()
}

function episodeNumber(story: StoryRow) {
  const value = Number(story.episode_number)
  return Number.isFinite(value) && value > 0 ? value : null
}

function titleForStories(stories: StoryRow[]) {
  const seriesName = stories.map((story) => clean(story.series_name)).find(Boolean)
  return seriesName || clean(stories[0]?.title) || 'Untitled'
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null
}

function expectedEpisodeCount(stories: StoryRow[]) {
  return Math.max(
    stories.length,
    0,
    ...stories.map((story) => Number(story.series_total_episodes || story.series_total || 0) || 0)
  )
}

function hasDocumentedRepair(stories: StoryRow[]) {
  return stories.some((story) => {
    const notes = `${story.repair_notes || ''} ${story.review_notes || ''}`.trim()
    const checklist = story.repair_checklist
    return Boolean(notes || (Array.isArray(checklist) && checklist.length > 0) || (checklist && typeof checklist === 'object' && Object.keys(checklist).length > 0))
  })
}

function itemFromStories(stories: StoryRow[], type: 'series' | 'story', jobs: ProductionJobRow[] = []): ConsoleItem {
  const sorted = [...stories].sort((a, b) => (episodeNumber(a) || 999) - (episodeNumber(b) || 999))
  const first = sorted[0]
  const seriesId = first?.series_id || null
  const affectedEpisodes = sorted.map(episodeNumber).filter((value): value is number => value !== null)
  const relatedJobs = jobs.filter((job) =>
    Boolean((seriesId && job.series_id === seriesId) || sorted.some((story) => job.story_id === story.id))
  )

  return {
    key: type === 'series' ? `series:${seriesId}` : `story:${first.id}`,
    type,
    title: titleForStories(sorted),
    seriesId,
    storyId: type === 'story' ? first.id : null,
    episodeCount: type === 'series' ? expectedEpisodeCount(sorted) : 1,
    affectedEpisodes,
    workflowState: first.workflow_state,
    status: first.status,
    lastUpdated: latestDate([...sorted.map((story) => story.updated_at || story.created_at), ...relatedJobs.map((job) => job.updated_at || job.created_at)]),
    owner: sorted.map((story) => clean(story.owner)).find(Boolean) || null,
    repairNotes: sorted.map((story) => clean(story.repair_notes)).find(Boolean) || null,
    repairChecklist: sorted.map((story) => story.repair_checklist).find(Boolean) || null,
    reviewNotes: sorted.map((story) => clean(story.review_notes)).find(Boolean) || null,
    warning: hasDocumentedRepair(sorted) ? null : 'No documented repair issue found.',
    jobs: relatedJobs.map((job) => ({
      id: job.id,
      status: job.status,
      currentStep: job.current_step,
      updatedAt: job.updated_at,
    })),
  }
}

function groupStories(stories: StoryRow[]) {
  const series = new Map<string, StoryRow[]>()
  const standalone: StoryRow[] = []

  for (const story of stories) {
    const seriesId = clean(story.series_id)
    if (seriesId && episodeNumber(story) !== null) {
      series.set(seriesId, [...(series.get(seriesId) || []), story])
    } else {
      standalone.push(story)
    }
  }

  return {
    series,
    standalone,
  }
}

function itemsForStories(stories: StoryRow[], jobs: ProductionJobRow[] = []) {
  const grouped = groupStories(stories)
  return [
    ...Array.from(grouped.series.values()).map((group) => itemFromStories(group, 'series', jobs)),
    ...grouped.standalone.map((story) => itemFromStories([story], 'story', jobs)),
  ].sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''))
}

function jobTitle(job: ProductionJobRow, storyById: Map<string, StoryRow>, seriesTitles: Map<string, string>) {
  if (job.series_id && seriesTitles.get(job.series_id)) return seriesTitles.get(job.series_id) || 'Untitled Series'
  if (job.story_id && storyById.get(job.story_id)) return storyById.get(job.story_id)?.title || 'Untitled Story'
  return clean(job.state_json?.title || job.state_json?.seriesTitle || job.error_json?.title || job.current_step) || 'Unlinked Production Job'
}

function inProductionItems(jobs: ProductionJobRow[], stories: StoryRow[]) {
  const activeStatuses = new Set(['queued', 'running', 'waiting_for_external', 'processing', 'in_progress'])
  const storyById = new Map(stories.map((story) => [story.id, story]))
  const seriesTitles = new Map<string, string>()
  for (const [seriesId, groupedStories] of groupStories(stories).series.entries()) {
    seriesTitles.set(seriesId, titleForStories(groupedStories))
  }

  return jobs
    .filter((job) => activeStatuses.has(clean(job.status).toLowerCase()))
    .map((job): ConsoleItem => {
      const story = job.story_id ? storyById.get(job.story_id) || null : null
      return {
        key: `job:${job.id}`,
        type: job.series_id ? 'series' : story ? 'story' : 'job',
        title: jobTitle(job, storyById, seriesTitles),
        seriesId: job.series_id,
        storyId: job.story_id,
        episodeCount: Number(job.state_json?.totalEpisodes || job.state_json?.seriesValidation?.episodeCount || (job.series_id ? 0 : 1)) || 0,
        affectedEpisodes: [],
        workflowState: story?.workflow_state || null,
        status: job.status,
        lastUpdated: job.updated_at || job.created_at,
        owner: null,
        repairNotes: null,
        repairChecklist: null,
        reviewNotes: null,
        warning: null,
        jobs: [{ id: job.id, status: job.status, currentStep: job.current_step, updatedAt: job.updated_at }],
      }
    })
}

function isInProductionStory(story: StoryRow) {
  const workflowState = clean(story.workflow_state).toLowerCase()
  const status = clean(story.status).toLowerCase()
  if (['repair_queue', 'being_repaired', 'cold_storage', 'unpublished_library', 'ready_for_review', 'approved_ready', 'published'].includes(workflowState)) return false
  if (status === 'published') return false
  return ['brief_complete', 'in_production', 'producing', 'queued', 'draft', 'script_ready', 'voice_ready', 'music_ready', 'rendering'].includes(status)
}

export async function GET(_req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const storyColumns = [
      'id',
      'title',
      'author',
      'status',
      'workflow_state',
      'review_notes',
      'repair_notes',
      'repair_checklist',
      'updated_at',
      'created_at',
      'series_id',
      'series_name',
      'episode_number',
      'series_total',
      'series_total_episodes',
      'owner',
    ]

    const legacyStoryColumns = storyColumns.filter((column) => column !== 'owner')

    let storiesResult: any = await supabase
      .from('stories')
      .select(storyColumns.join(','))
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (storiesResult.error && /owner|schema cache|column/i.test(storiesResult.error.message || '')) {
      storiesResult = await supabase
        .from('stories')
        .select(legacyStoryColumns.join(','))
        .order('updated_at', { ascending: false })
        .limit(1000)
      if (storiesResult.data) {
        storiesResult.data = storiesResult.data.map((story: any) => ({ ...story, owner: null }))
      }
    }

    if (storiesResult.error) {
      return json({ success: false, error: storiesResult.error.message }, 500)
    }

    const jobsResult = await supabase
      .from('production_jobs')
      .select('id,story_id,series_id,status,current_step,updated_at,created_at,state_json,error_json')
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (jobsResult.error) {
      return json({ success: false, error: jobsResult.error.message }, 500)
    }

    const stories = (storiesResult.data || []) as StoryRow[]
    const jobs = (jobsResult.data || []) as ProductionJobRow[]
    const repairStories = stories.filter((story) => story.workflow_state === 'repair_queue' || story.workflow_state === 'being_repaired')
    const coldStories = stories.filter((story) => story.workflow_state === 'cold_storage' || story.workflow_state === 'unpublished_library')
    const productionStoryItems = itemsForStories(stories.filter(isInProductionStory), jobs)
    const productionJobItems = inProductionItems(jobs, stories)
    const inProductionByKey = new Map<string, ConsoleItem>()
    for (const item of [...productionStoryItems, ...productionJobItems]) inProductionByKey.set(item.key, item)

    return json({
      success: true,
      fetchedAt: new Date().toISOString(),
      repairItems: itemsForStories(repairStories, jobs),
      inProductionItems: Array.from(inProductionByKey.values()),
      coldStorageItems: itemsForStories(coldStories, jobs),
      incubatorItems: [],
      queueItems: [],
    })
  } catch (err: any) {
    console.error('[production-console] GET failed:', err)
    return json({ success: false, error: err?.message || 'Failed to load production console' }, 500)
  }
}
