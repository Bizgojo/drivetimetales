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

const QUEUE_BLOCKING_WORKFLOW_STATES = new Set([
  'repair_queue',
  'being_repaired',
  'ready_for_review',
  'approved_ready',
  'published',
  'cold_storage',
  'unpublished_library',
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
  queue_item_id?: string | null
  story_id: string | null
  series_id: string | null
  status: string | null
  current_step: string | null
  updated_at: string | null
  created_at: string | null
  state_json?: any
  error_json?: any
}

type QueueRow = {
  id: string
  story_id?: string | null
  title?: string | null
  premise?: string | null
  setting?: string | null
  primary_genre?: string | null
  secondary_genre?: string | null
  tertiary_genre?: string | null
  duration?: string | null
  author_target?: string | null
  notes?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  total_episodes?: number | null
  priority?: number | null
  display_order?: number | null
  sort_order?: number | null
  source?: string | null
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
  queue?: {
    id: string
    title: string
    genre: string | null
    duration: string | null
    episodeCount: number | null
    status: string | null
    priority: number | null
    createdAt: string | null
    updatedAt: string | null
    brief: string | null
    source: string | null
    notes: string | null
  } | null
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

function normalizedTitleKey(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ')
}

function extractQueueCoreTitle(value: string | null | undefined): string {
  let text = clean(value)
  text = text.replace(/^\[.*?\]\s*/i, '')
  text = text.replace(/\s*[—–-]+\s*\d+\s*episodes?\s*$/i, '')
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

function timestampMs(value: string | null | undefined) {
  const ms = Date.parse(value || '')
  return Number.isFinite(ms) ? ms : 0
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

function isIncubatorTagged(story: StoryRow) {
  return /\[INCUBATOR\]/i.test(String(story.review_notes || ''))
}

function queueEpisodeCount(queueItem: QueueRow) {
  const explicit = numberOrNull(queueItem.total_episodes)
  if (explicit && explicit > 0) return explicit
  const notes = String(queueItem.notes || '')
  const match = notes.match(/total\s+episodes\s*:\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function queuePriority(queueItem: QueueRow) {
  return numberOrNull(queueItem.priority) ?? numberOrNull(queueItem.display_order) ?? numberOrNull(queueItem.sort_order)
}

function queueGenre(queueItem: QueueRow) {
  return [queueItem.primary_genre, queueItem.secondary_genre, queueItem.tertiary_genre]
    .map(clean)
    .filter(Boolean)
    .join(' / ') || null
}

function queueBrief(queueItem: QueueRow) {
  return [clean(queueItem.premise), clean(queueItem.setting)]
    .filter(Boolean)
    .join(' ')
    .slice(0, 420) || null
}

function queuePayload(queueItem: QueueRow | null | undefined): ConsoleItem['queue'] {
  if (!queueItem?.id) return null
  return {
    id: queueItem.id,
    title: clean(queueItem.title) || 'Untitled Queue Item',
    genre: queueGenre(queueItem),
    duration: clean(queueItem.duration) || null,
    episodeCount: queueEpisodeCount(queueItem),
    status: clean(queueItem.status) || null,
    priority: queuePriority(queueItem),
    createdAt: queueItem.created_at || null,
    updatedAt: queueItem.updated_at || null,
    brief: queueBrief(queueItem),
    source: clean(queueItem.source || queueItem.author_target) || null,
    notes: clean(queueItem.notes) || null,
  }
}

function isNewerQueueRow(candidate: QueueRow, current: QueueRow) {
  const candidateUpdated = timestampMs(candidate.updated_at)
  const currentUpdated = timestampMs(current.updated_at)
  if (candidateUpdated || currentUpdated) return candidateUpdated > currentUpdated

  const candidateCreated = timestampMs(candidate.created_at)
  const currentCreated = timestampMs(current.created_at)
  if (candidateCreated || currentCreated) return candidateCreated > currentCreated

  return false
}

function dedupeQueueRows(queueRows: QueueRow[]) {
  const byTitle = new Map<string, QueueRow>()
  const untitledRows: QueueRow[] = []

  for (const queueRow of queueRows) {
    const titleKey = extractQueueCoreTitle(queueRow.title)
    if (!titleKey) {
      untitledRows.push(queueRow)
      continue
    }

    const existing = byTitle.get(titleKey)
    if (!existing || isNewerQueueRow(queueRow, existing)) {
      byTitle.set(titleKey, queueRow)
    }
  }

  return [...byTitle.values(), ...untitledRows]
}

function storyBlocksQueue(story: StoryRow) {
  const workflowState = clean(story.workflow_state).toLowerCase()
  const status = clean(story.status).toLowerCase()
  return QUEUE_BLOCKING_WORKFLOW_STATES.has(workflowState) || status === 'published'
}

function queueBlockingTitleKeys(stories: StoryRow[]) {
  const titleKeys = new Set<string>()

  for (const story of stories) {
    if (!storyBlocksQueue(story)) continue

    const storyTitleKey = normalizedTitleKey(story.title)
    if (storyTitleKey) titleKeys.add(storyTitleKey)

    const seriesTitleKey = normalizedTitleKey(story.series_name)
    if (seriesTitleKey) titleKeys.add(seriesTitleKey)
  }

  return titleKeys
}

function filterQueueRowsAlreadyInWorkflow(queueRows: QueueRow[], stories: StoryRow[]) {
  const blockingTitleKeys = queueBlockingTitleKeys(stories)
  const visibleRows: QueueRow[] = []
  const excludedRows: QueueRow[] = []

  for (const queueRow of queueRows) {
    const titleKey = extractQueueCoreTitle(queueRow.title)
    if (titleKey && blockingTitleKeys.has(titleKey)) {
      excludedRows.push(queueRow)
      continue
    }

    visibleRows.push(queueRow)
  }

  if (excludedRows.length > 0) {
    console.info('[production-console] Filtered queue items already represented in story workflow', {
      excludedCount: excludedRows.length,
      titles: Array.from(new Set(excludedRows.map((row) => clean(row.title)).filter(Boolean))).slice(0, 10),
    })
  }

  return visibleRows
}

function queueItemToConsoleItem(queueItem: QueueRow): ConsoleItem {
  const queue = queuePayload(queueItem)
  return {
    key: `queue:${queueItem.id}`,
    type: 'job',
    title: queue?.title || 'Untitled Queue Item',
    seriesId: null,
    storyId: queueItem.story_id || null,
    episodeCount: queue?.episodeCount || 0,
    affectedEpisodes: [],
    workflowState: null,
    status: queue?.status || null,
    lastUpdated: queue?.updatedAt || queue?.createdAt || null,
    owner: null,
    repairNotes: null,
    repairChecklist: null,
    reviewNotes: null,
    warning: null,
    jobs: [],
    queue,
  }
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

function jobQueueItem(job: ProductionJobRow, queueById: Map<string, QueueRow>): QueueRow | null {
  if (job.queue_item_id && queueById.has(job.queue_item_id)) return queueById.get(job.queue_item_id) || null
  const embedded = job.state_json?.input?.queueItem || job.state_json?.queueItem
  if (embedded?.id) return embedded as QueueRow
  return null
}

function jobTitle(job: ProductionJobRow, storyById: Map<string, StoryRow>, seriesTitles: Map<string, string>, queueById: Map<string, QueueRow>) {
  const queueItem = jobQueueItem(job, queueById)
  if (queueItem) return clean(queueItem.title) || 'Untitled Queue Item'
  if (job.series_id && seriesTitles.get(job.series_id)) return seriesTitles.get(job.series_id) || 'Untitled Series'
  if (job.story_id && storyById.get(job.story_id)) return storyById.get(job.story_id)?.title || 'Untitled Story'
  return clean(job.state_json?.title || job.state_json?.seriesTitle || job.error_json?.title || job.current_step) || 'Unlinked Production Job'
}

function inProductionItems(jobs: ProductionJobRow[], stories: StoryRow[], queueById: Map<string, QueueRow>) {
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
      const queue = queuePayload(jobQueueItem(job, queueById))
      return {
        key: `job:${job.id}`,
        type: job.series_id ? 'series' : story ? 'story' : 'job',
        title: jobTitle(job, storyById, seriesTitles, queueById),
        seriesId: job.series_id,
        storyId: job.story_id,
        episodeCount: queue?.episodeCount || Number(job.state_json?.totalEpisodes || job.state_json?.seriesValidation?.episodeCount || (job.series_id ? 0 : 1)) || 0,
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
        queue,
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
      .select('id,queue_item_id,story_id,series_id,status,current_step,updated_at,created_at,state_json,error_json')
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (jobsResult.error) {
      return json({ success: false, error: jobsResult.error.message }, 500)
    }

    const queueResult = await supabase
      .from('story_queue_items')
      .select('*')
      .in('status', ['queued', 'dispatched'])
      .order('created_at', { ascending: true })
      .limit(1000)

    if (queueResult.error) {
      console.warn('[production-console] story_queue_items query failed — returning empty queue:', queueResult.error.message)
    }

    const stories = (storiesResult.data || []) as StoryRow[]
    const jobs = (jobsResult.data || []) as ProductionJobRow[]
    const queueRows = (queueResult.error ? [] : (queueResult.data || [])) as QueueRow[]
    const queueById = new Map(queueRows.map((item) => [item.id, item]))
    const visibleQueueRows = filterQueueRowsAlreadyInWorkflow(dedupeQueueRows(queueRows), stories)
    const repairStories = stories.filter((story) => story.workflow_state === 'repair_queue' || story.workflow_state === 'being_repaired')
    const readyForReviewStories = stories.filter((story) => story.workflow_state === 'ready_for_review')
    const storageStories = stories.filter((story) => story.workflow_state === 'cold_storage' || story.workflow_state === 'unpublished_library')
    const incubatorStories = storageStories.filter(isIncubatorTagged)
    const coldStories = storageStories.filter((story) => !isIncubatorTagged(story))
    const productionStoryItems = itemsForStories(stories.filter(isInProductionStory), jobs)
    const productionJobItems = inProductionItems(jobs, stories, queueById)
    const inProductionByKey = new Map<string, ConsoleItem>()
    for (const item of [...productionStoryItems, ...productionJobItems]) inProductionByKey.set(item.key, item)

    return json({
      success: true,
      fetchedAt: new Date().toISOString(),
      repairItems: itemsForStories(repairStories, jobs),
      readyForReviewItems: itemsForStories(readyForReviewStories, jobs),
      inProductionItems: Array.from(inProductionByKey.values()),
      coldStorageItems: itemsForStories(coldStories, jobs),
      incubatorItems: itemsForStories(incubatorStories, jobs),
      queueItems: visibleQueueRows.map(queueItemToConsoleItem),
    })
  } catch (err: any) {
    console.error('[production-console] GET failed:', err)
    return json({ success: false, error: err?.message || 'Failed to load production console' }, 500)
  }
}
