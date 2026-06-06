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

type ApprovalTab = 'ready_for_review' | 'approved_ready' | 'repair_queue' | 'being_repaired' | 'unpublished_library' | 'cold_storage' | 'published' | 'all'
type WorkflowState = Exclude<ApprovalTab, 'all'>
type ProductionStandardValue = 'current_standard' | 'remaster_candidate' | 'unknown'

type StoryRow = {
  id: string
  title: string | null
  author: string | null
  genre: string | null
  description: string | null
  duration_mins: number | null
  created_at: string | null
  updated_at?: string | null
  status: string | null
  is_hidden: boolean | null
  published_on: string | null
  review_status: string | null
  reviewed_at: string | null
  review_notes: string | null
  workflow_state: string | null
  repair_checklist: unknown | null
  repair_notes: string | null
  production_standard?: ProductionStandardValue | null
  production_standard_updated_at?: string | null
  production_standard_updated_by?: string | null
  audio_url: string | null
  story_audio_url: string | null
  intro_audio_url: string | null
  intro_before_url: string | null
  intro_after_url: string | null
  outro_audio_url: string | null
  background_music_url: string | null
  cover_url: string | null
  prose_text: string | null
  author_id: string | null
  narrator_voice_id: string | null
  narrator_voice_name: string | null
  series_id: string | null
  series_name: string | null
  episode_number: number | null
  series_number: number | null
  series_total: number | null
  series_total_episodes: number | null
  story_type: string | null
  script_version: number | null
}

type ProductionJobRow = {
  id: string
  story_id: string | null
  series_id: string | null
  status: string | null
  current_step: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  state_json?: any
  error_json?: any
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

async function currentAdminEmail() {
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
  return ADMIN_EMAILS.has(email) ? email : null
}

function bool(value: unknown) {
  return Boolean(String(value || '').trim())
}

function clean(value: unknown) {
  return String(value || '').trim()
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeTab(value: unknown): ApprovalTab {
  const tab = clean(value)
  if (
    tab === 'ready_for_review' ||
    tab === 'approved_ready' ||
    tab === 'repair_queue' ||
    tab === 'being_repaired' ||
    tab === 'unpublished_library' ||
    tab === 'cold_storage' ||
    tab === 'published' ||
    tab === 'all'
  ) return tab
  return 'all'
}

function normalizeWorkflowState(value: unknown): WorkflowState | null {
  const state = clean(value)
  if (
    state === 'ready_for_review' ||
    state === 'approved_ready' ||
    state === 'repair_queue' ||
    state === 'being_repaired' ||
    state === 'unpublished_library' ||
    state === 'cold_storage' ||
    state === 'published'
  ) return state
  return null
}

function normalizeProductionStandard(value: unknown): ProductionStandardValue | null {
  const standard = clean(value)
  if (
    standard === 'current_standard' ||
    standard === 'remaster_candidate' ||
    standard === 'unknown'
  ) return standard
  return null
}

function storyEpisodeNumber(story: StoryRow) {
  return numberOrNull(story.episode_number) || numberOrNull(story.series_number) || null
}

function hasSeriesRelationship(story: StoryRow) {
  return bool(story.series_id) && storyEpisodeNumber(story) !== null
}

function displayReviewStatus(story: StoryRow) {
  return clean(story.review_status) || 'pending'
}

function effectiveWorkflowState(story: StoryRow): string {
  if (story.workflow_state === 'cold_storage' || story.workflow_state === 'unpublished_library') return story.workflow_state
  if (story.status === 'published' && story.is_hidden === false) return 'published'
  if (story.status === 'published' && story.is_hidden === true) return 'unpublished_library'
  if (story.workflow_state === 'repair_queue' || story.workflow_state === 'being_repaired') return story.workflow_state
  if (story.workflow_state) return story.workflow_state
  if (story.review_status === 'approved') return 'approved_ready'
  if (story.review_status === 'not_approved') return 'cold_storage'
  return 'ready_for_review'
}

function requiredMetadataMissing(story: StoryRow) {
  const missing: string[] = []
  if (!bool(story.title)) missing.push('title')
  if (!bool(story.author)) missing.push('author')
  if (!bool(story.genre)) missing.push('genre')
  if (!bool(story.description)) missing.push('description')
  if (!numberOrNull(story.duration_mins)) missing.push('duration_mins')
  if (!bool(story.created_at)) missing.push('created_at')
  return missing
}

function episodeBlockingReasons(story: StoryRow) {
  const reasons: string[] = []
  if (story.status !== 'audio_ready') reasons.push(`status is ${story.status || 'empty'}, expected audio_ready`)
  if (story.is_hidden !== true) reasons.push(`is_hidden is ${String(story.is_hidden)}, expected true`)
  if (story.published_on !== null) reasons.push('published_on is set, expected null')
  if (displayReviewStatus(story) !== 'pending') reasons.push(`review_status is ${displayReviewStatus(story)}, expected pending`)
  if (!bool(story.audio_url)) reasons.push('missing audio_url')
  else if (!String(story.audio_url).includes('/final_mix.mp3') && story.workflow_state !== 'ready_for_review') reasons.push('audio_url does not contain /final_mix.mp3')
  if (!bool(story.story_audio_url)) reasons.push('missing story_audio_url')
  if (!bool(story.cover_url)) reasons.push('missing cover_url')
  if (!bool(story.prose_text)) reasons.push('missing prose_text')
  if (!bool(story.author_id)) reasons.push('missing author_id')
  if (!bool(story.narrator_voice_id)) reasons.push('missing narrator_voice_id')
  if (!bool(story.narrator_voice_name)) reasons.push('missing narrator_voice_name')
  for (const missing of requiredMetadataMissing(story)) reasons.push(`missing ${missing}`)
  return reasons
}

function audioReadiness(story: StoryRow) {
  return {
    audioUrl: bool(story.audio_url),
    storyAudioUrl: bool(story.story_audio_url),
    introAudio: bool(story.intro_audio_url) || bool(story.intro_before_url) || bool(story.intro_after_url),
    outroAudio: bool(story.outro_audio_url),
    backgroundMusic: bool(story.background_music_url),
    finalMix: String(story.audio_url || '').includes('/final_mix.mp3'),
  }
}

function packagingReadiness(story: StoryRow) {
  return {
    coverUrl: bool(story.cover_url),
    proseText: bool(story.prose_text),
    authorId: bool(story.author_id),
    narratorVoiceId: bool(story.narrator_voice_id),
    narratorVoiceName: bool(story.narrator_voice_name),
    description: bool(story.description),
    requiredMetadata: requiredMetadataMissing(story).length === 0,
  }
}

function isPublished(story: StoryRow) {
  return story.status === 'published' && story.is_hidden === false
}

function isApprovedReady(story: StoryRow) {
  return story.status === 'audio_ready'
    && story.is_hidden === true
    && displayReviewStatus(story) === 'approved'
    && bool(story.audio_url)
    && bool(story.cover_url)
    && requiredMetadataMissing(story).length === 0
}

function isReviewReady(story: StoryRow) {
  return story.status === 'audio_ready'
    && story.is_hidden === true
    && displayReviewStatus(story) === 'pending'
    && bool(story.audio_url)
    && String(story.audio_url || '').includes('/final_mix.mp3')
    && bool(story.story_audio_url)
    && bool(story.cover_url)
    && bool(story.prose_text)
    && bool(story.author_id)
    && bool(story.narrator_voice_id)
    && bool(story.narrator_voice_name)
    && requiredMetadataMissing(story).length === 0
}

function matchesTab(story: StoryRow, tab: ApprovalTab) {
  if (tab === 'all') return true
  return effectiveWorkflowState(story) === tab
}

function storyJobIds(job: ProductionJobRow) {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    const id = clean(value)
    if (id) ids.add(id)
  }

  add(job.story_id)
  add(job.state_json?.storyId)
  add(job.state_json?.story_id)
  add(job.error_json?.storyId)
  add(job.error_json?.story_id)
  add(job.error_json?.voiceGenerationReport?.storyId)
  add(job.error_json?.voiceGenerationReport?.story_id)

  for (const list of [
    job.state_json?.episodes,
    job.state_json?.seriesValidation?.validatedEpisodes,
    job.state_json?.seriesVoicePreflight?.checkedEpisodes,
    Object.values(job.state_json?.seriesVoiceGeneration?.progressByEpisode || {}),
  ]) {
    if (!Array.isArray(list)) continue
    for (const item of list) add(item?.storyId || item?.story_id || item?.id)
  }

  return ids
}

function jobSeriesIds(job: ProductionJobRow) {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    const id = clean(value)
    if (id) ids.add(id)
  }

  add(job.series_id)
  add(job.state_json?.seriesId)
  add(job.state_json?.series_id)
  add(job.error_json?.seriesId)
  add(job.error_json?.series_id)
  add(job.error_json?.voiceGenerationReport?.seriesId)
  add(job.error_json?.voiceGenerationReport?.series_id)
  return ids
}

function jobsForStory(story: StoryRow, jobs: ProductionJobRow[]) {
  return jobs
    .filter((job) => storyJobIds(job).has(story.id) || (story.series_id && jobSeriesIds(job).has(story.series_id)))
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''))
}

function sourceJobForStory(story: StoryRow, jobs: ProductionJobRow[]) {
  const storyJobs = jobsForStory(story, jobs)
  return storyJobs[0] || null
}

function versionForStory(story: StoryRow, job: ProductionJobRow | null) {
  return {
    number: numberOrNull(story.script_version) || 1,
    date: job?.completed_at || job?.updated_at || story.updated_at || story.created_at,
    type: 'new',
    redoReason: null,
    changeSummary: null,
  }
}

function dateMs(value: unknown) {
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function jobLooksLikePackageCompletion(job: ProductionJobRow | null) {
  if (!job) return false
  const status = clean(job.status).toLowerCase()
  const step = clean(job.current_step).toLowerCase()
  return Boolean(job.completed_at) && (
    status === 'complete' ||
    step === 'ready_for_review' ||
    step === 'complete_story_package' ||
    step === 'series_render_final_mix' ||
    step === 'render_final_mix'
  )
}

function completionProofForStory(story: StoryRow, job: ProductionJobRow | null) {
  if (!String(story.audio_url || '').includes('/final_mix.mp3')) {
    if (story.workflow_state === 'ready_for_review' && bool(story.audio_url)) {
      return { date: story.created_at || new Date().toISOString(), source: 'workflow_state_ready_for_review_legacy_audio' }
    }
    return { date: null, source: 'missing_final_mix' }
  }
  if (jobLooksLikePackageCompletion(job)) {
    return { date: job?.completed_at || null, source: `production_jobs.completed_at:${job?.current_step || 'complete'}` }
  }
  return { date: null, source: 'unproven_final_mix_completion_time' }
}

function activeFailedBlockingJobs(jobs: ProductionJobRow[], completionSortDate: string | null) {
  const completionMs = dateMs(completionSortDate)
  return jobs.filter((job) => {
    const status = clean(job.status).toLowerCase()
    if (status !== 'failed' && status !== 'error') return false
    const jobMs = dateMs(job.updated_at || job.completed_at || job.created_at)
    return completionMs === 0 || jobMs >= completionMs
  })
}

function approvalEntryReason(story: StoryRow) {
  if (isPublished(story)) return 'Published and visible in the public app.'
  if (effectiveWorkflowState(story) === 'approved_ready') return 'Approved by review and waiting to publish.'
  if (effectiveWorkflowState(story) === 'cold_storage') return 'Moved to Cold Storage.'
  if (isReviewReady(story)) return 'Package completion made the story ready for Content Approval.'
  if (bool(story.audio_url) || bool(story.story_audio_url)) return 'Audio assets exist, but approval packaging is incomplete.'
  return 'Story row exists but has not reached audio/package readiness.'
}

function episodeObject(story: StoryRow, sourceJob: ProductionJobRow | null) {
  const blockingReasons = episodeBlockingReasons(story)
  const completionProof = completionProofForStory(story, sourceJob)
  if (!completionProof.date) blockingReasons.push(`completion timestamp not proven: ${completionProof.source}`)
  const approvalReady = blockingReasons.length === 0
  return {
    storyId: story.id,
    title: story.title,
    episodeNumber: storyEpisodeNumber(story),
    status: story.status,
    reviewStatus: displayReviewStatus(story),
    workflowState: effectiveWorkflowState(story),
    workflow_state: effectiveWorkflowState(story),
    repairChecklist: story.repair_checklist || null,
    repair_checklist: story.repair_checklist || null,
    repairNotes: story.repair_notes || null,
    repair_notes: story.repair_notes || null,
    isHidden: story.is_hidden,
    publishedOn: story.published_on,
    audioReadiness: audioReadiness(story),
    packagingReadiness: packagingReadiness(story),
    approvalReady,
    approvalBlockingReasons: blockingReasons,
    approvalEntryReason: approvalEntryReason(story),
    sourceJobId: sourceJob?.id || null,
    version: versionForStory(story, sourceJob),
    completionSortDate: completionProof.date,
    completionSortSource: completionProof.source,
  }
}

function expectedEpisodeCountProof(stories: StoryRow[], jobs: ProductionJobRow[]) {
  const fromStories = Math.max(
    0,
    ...stories.map((story) => numberOrNull(story.series_total_episodes) || numberOrNull(story.series_total) || 0)
  )
  if (fromStories > 0) return { count: fromStories, source: 'stories.series_total' }

  const fromJobs = Math.max(
    0,
    ...jobs.map((job) => Number(job.state_json?.totalEpisodes || job.state_json?.seriesValidation?.episodeCount || 0) || 0)
  )
  if (fromJobs > 0) return { count: fromJobs, source: 'production_jobs.state_json.totalEpisodes' }
  return { count: 0, source: 'unproven' }
}

function missingEpisodes(stories: StoryRow[], expectedCount: number) {
  const present = new Set(stories.map(storyEpisodeNumber).filter((value): value is number => value !== null))
  const missing: number[] = []
  for (let episode = 1; episode <= expectedCount; episode += 1) {
    if (!present.has(episode)) missing.push(episode)
  }
  return missing
}

function seriesTitle(stories: StoryRow[]) {
  const named = stories.map((story) => clean(story.series_name)).find(Boolean)
  return named || clean(stories[0]?.title) || 'Untitled Series'
}

function seriesObject(seriesId: string, stories: StoryRow[], jobs: ProductionJobRow[]) {
  const sortedStories = [...stories].sort((a, b) => (storyEpisodeNumber(a) || 999) - (storyEpisodeNumber(b) || 999))
  const seriesJobs = jobs.filter((job) => jobSeriesIds(job).has(seriesId))
  const expectedProof = expectedEpisodeCountProof(sortedStories, seriesJobs)
  const expected = expectedProof.count || sortedStories.length
  const missing = missingEpisodes(sortedStories, expected)
  const episodes = sortedStories.map((story) => episodeObject(story, sourceJobForStory(story, jobs)))
  const completionSortDate = episodes
    .map((episode) => episode.completionSortDate)
    .filter(Boolean)
    .sort((a, b) => dateMs(b) - dateMs(a))[0] || null
  const blockingJobs = activeFailedBlockingJobs(seriesJobs, completionSortDate)
  const approvalBlockingReasons = [
    ...(expectedProof.count ? [] : [`series expected episode count is not proven (${expectedProof.source})`]),
    ...(missing.length ? [`missing episode(s): ${missing.join(', ')}`] : []),
    ...episodes.flatMap((episode) => episode.approvalBlockingReasons.map((reason) => `Episode ${episode.episodeNumber || '?'}: ${reason}`)),
    ...blockingJobs.map((job) => `Active failed production job ${job.id} at ${job.current_step || 'unknown step'}`),
  ]
  const newestJob = jobs
    .filter((job) => job.series_id === seriesId)
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''))[0] || null

  return {
    type: 'series',
    seriesId,
    title: seriesTitle(sortedStories),
    expectedEpisodeCount: expected,
    expectedEpisodeCountSource: expectedProof.source,
    presentEpisodeCount: sortedStories.length,
    missingEpisodes: missing,
    approvalReady: approvalBlockingReasons.length === 0,
    approvalEntryReason: missing.length
      ? 'Series has story rows but is missing expected episodes.'
      : 'Series readiness is aggregated from all episode rows.',
    approvalBlockingReasons,
    sourceJobId: newestJob?.id || null,
    completionSortDate,
    completionSortSource: completionSortDate ? 'newest_episode_final_mix_completion' : 'unproven_series_completion_time',
    version: {
      number: Math.max(1, ...sortedStories.map((story) => numberOrNull(story.script_version) || 1)),
      date: completionSortDate || newestJob?.completed_at || newestJob?.updated_at || sortedStories[0]?.updated_at || sortedStories[0]?.created_at || null,
      type: 'new',
      redoReason: null,
      changeSummary: null,
    },
    counts: {
      audioReady: episodes.filter((episode) => episode.audioReadiness.audioUrl && episode.audioReadiness.storyAudioUrl).length,
      approvalReady: episodes.filter((episode) => episode.approvalReady).length,
      approved: episodes.filter((episode) => episode.reviewStatus === 'approved').length,
      coldStorage: episodes.filter((episode) => episode.workflowState === 'cold_storage').length,
      published: episodes.filter((episode) => episode.status === 'published' && episode.isHidden === false).length,
    },
    episodes,
  }
}

function standaloneObject(story: StoryRow, jobs: ProductionJobRow[]) {
  const relatedJobs = jobsForStory(story, jobs)
  const sourceJob = relatedJobs[0] || null
  const episode = episodeObject(story, sourceJob)
  const blockingJobs = activeFailedBlockingJobs(relatedJobs, episode.completionSortDate)
  const approvalBlockingReasons = [
    ...episode.approvalBlockingReasons,
    ...blockingJobs.map((job) => `Active failed production job ${job.id} at ${job.current_step || 'unknown step'}`),
  ]
  return {
    type: 'story',
    storyId: story.id,
    title: story.title,
    approvalReady: approvalBlockingReasons.length === 0,
    approvalEntryReason: episode.approvalEntryReason,
    approvalBlockingReasons,
    sourceJobId: episode.sourceJobId,
    completionSortDate: episode.completionSortDate,
    completionSortSource: episode.completionSortSource,
    version: episode.version,
    episode: {
      ...episode,
      approvalReady: approvalBlockingReasons.length === 0,
      approvalBlockingReasons,
    },
  }
}

function includeItem(item: any, tab: ApprovalTab, includeBlocked: boolean) {
  if (tab === 'ready_for_review') {
    if (item.type === 'series') {
      return item.approvalReady === true
        && item.episodes.length > 0
        && item.episodes.every((episode: any) => episode.workflowState === 'ready_for_review')
    }
    return item.approvalReady === true && item.episode.workflowState === 'ready_for_review'
  }
  if (includeBlocked || tab === 'all') return true
  if (item.type === 'series') return item.episodes.some((episode: any) => {
    const synthetic = {
      status: episode.status,
      is_hidden: episode.isHidden,
      review_status: episode.reviewStatus,
      workflow_state: episode.workflowState,
      repair_checklist: episode.repairChecklist,
      repair_notes: episode.repairNotes,
      audio_url: episode.audioReadiness.audioUrl ? 'present' : '',
      cover_url: episode.packagingReadiness.coverUrl ? 'present' : '',
      title: episode.title,
      author: 'present',
      genre: 'present',
      description: episode.packagingReadiness.description ? 'present' : '',
      duration_mins: 1,
      created_at: 'present',
    } as StoryRow
    return matchesTab(synthetic, tab)
  })
  return matchesTab({
    ...item.episode,
    is_hidden: item.episode.isHidden,
    review_status: item.episode.reviewStatus,
    workflow_state: item.episode.workflowState,
    repair_checklist: item.episode.repairChecklist,
    repair_notes: item.episode.repairNotes,
    audio_url: item.episode.audioReadiness.audioUrl ? 'present' : '',
    cover_url: item.episode.packagingReadiness.coverUrl ? 'present' : '',
    author: 'present',
    genre: 'present',
    description: item.episode.packagingReadiness.description ? 'present' : '',
    duration_mins: 1,
    created_at: 'present',
  } as StoryRow, tab)
}

function examples(items: any[]) {
  const findSeries = (name: string) => items.find((item) =>
    item.type === 'series' && String(item.title || '').toLowerCase() === name.toLowerCase()
  ) || null

  return {
    brakeLine: findSeries('The Brake Line'),
    glassMile: findSeries('The Glass Mile'),
  }
}

function reviewStatusForWorkflowState(state: WorkflowState) {
  if (state === 'approved_ready' || state === 'published') return 'approved'
  if (state === 'ready_for_review') return 'pending'
  return 'not_approved'
}

function transitionAllowed(from: string, to: WorkflowState, retire: boolean) {
  const allowed: Record<string, WorkflowState[]> = {
    ready_for_review: ['approved_ready', 'repair_queue', 'cold_storage'],
    approved_ready: ['published', 'repair_queue', 'cold_storage'],
    repair_queue: ['being_repaired', 'ready_for_review'],
    being_repaired: ['ready_for_review'],
    published: ['unpublished_library', 'repair_queue'],
    unpublished_library: ['ready_for_review', 'repair_queue', 'cold_storage'],
    cold_storage: ['ready_for_review'],
  }

  if (from === 'published' && to === 'cold_storage') return retire
  return (allowed[from] || []).includes(to)
}

function workflowUpdateForState(state: WorkflowState, body: any = {}) {
  const reviewedAt = new Date().toISOString()
  const update: Record<string, unknown> = {
    workflow_state: state,
    review_status: reviewStatusForWorkflowState(state),
    is_hidden: true,
    reviewed_at: state === 'ready_for_review' ? null : reviewedAt,
  }

  if (state === 'ready_for_review') {
    update.review_notes = null
  }

  if (state === 'approved_ready') {
    update.review_notes = body.reviewNotes || 'Approved for Publishing'
  }

  if (state === 'repair_queue' || state === 'being_repaired') {
    update.repair_checklist = body.repairChecklist || null
    update.repair_notes = body.repairNotes || null
    update.review_notes = state === 'repair_queue' ? 'Moved to Repair Queue' : 'Sent for Repair'
  }

  if (state === 'unpublished_library') {
    update.status = 'audio_ready'
    update.published_on = null
    update.review_notes = 'Unpublished to library'
  }

  if (state === 'cold_storage') {
    update.review_notes = 'Moved to Cold Storage'
  }

  return update
}

export async function GET(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const tab = normalizeTab(req.nextUrl.searchParams.get('tab'))
    const includeBlocked = req.nextUrl.searchParams.get('includeBlocked') !== 'false'
    const storyId = clean(req.nextUrl.searchParams.get('storyId'))
    const seriesId = clean(req.nextUrl.searchParams.get('seriesId'))

    const storySelectColumns = [
      'id',
      'title',
      'author',
      'genre',
      'description',
      'duration_mins',
      'created_at',
      'updated_at',
      'status',
      'is_hidden',
      'published_on',
      'review_status',
      'reviewed_at',
      'review_notes',
      'workflow_state',
      'repair_checklist',
      'repair_notes',
      'production_standard',
      'production_standard_updated_at',
      'production_standard_updated_by',
      'audio_url',
      'story_audio_url',
      'intro_audio_url',
      'intro_before_url',
      'intro_after_url',
      'outro_audio_url',
      'background_music_url',
      'cover_url',
      'prose_text',
      'author_id',
      'narrator_voice_id',
      'narrator_voice_name',
      'series_id',
      'series_name',
      'episode_number',
      'series_number',
      'series_total',
      'series_total_episodes',
      'story_type',
      'script_version',
    ]

    const legacyStorySelectColumns = storySelectColumns.filter((column) =>
      !['workflow_state', 'repair_checklist', 'repair_notes', 'production_standard', 'production_standard_updated_at', 'production_standard_updated_by'].includes(column)
    )

    const buildStoryQuery = (columns: string[]) => {
      let query = supabase
        .from('stories')
        .select(columns.join(','))
        .order('created_at', { ascending: false })
        .limit(1000)

      if (storyId) query = query.eq('id', storyId)
      if (seriesId) query = query.eq('series_id', seriesId)
      return query
    }

    const firstStoryResult = await buildStoryQuery(storySelectColumns)
    let stories = firstStoryResult.data
    let storiesError = firstStoryResult.error

    if (storiesError && /workflow_state|repair_checklist|repair_notes|production_standard|schema cache|column/i.test(storiesError.message || '')) {
      const legacyResult = await buildStoryQuery(legacyStorySelectColumns)
      stories = (legacyResult.data || []).map((story: any) => ({
        ...story,
        workflow_state: null,
        repair_checklist: null,
        repair_notes: null,
        production_standard: 'unknown',
        production_standard_updated_at: null,
        production_standard_updated_by: null,
      }))
      storiesError = legacyResult.error
    }

    if (storiesError) {
      return json({ success: false, error: storiesError.message }, 500)
    }

    const storyRows = ((stories || []) as unknown) as StoryRow[]

    const seriesIds = Array.from(new Set(storyRows.map((story) => clean(story.series_id)).filter(Boolean)))
    const storyIds = storyRows.map((story) => story.id)

    let jobsQuery = supabase
      .from('production_jobs')
      .select('id,story_id,series_id,status,current_step,created_at,updated_at,completed_at,state_json,error_json')
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (seriesId) jobsQuery = jobsQuery.eq('series_id', seriesId)

    const { data: seriesJobs, error: jobsError } = await jobsQuery
    if (jobsError) {
      return json({ success: false, error: jobsError.message }, 500)
    }

    let storyJobs: ProductionJobRow[] = []
    if (!seriesId && storyIds.length > 0) {
      const { data, error } = await supabase
        .from('production_jobs')
        .select('id,story_id,series_id,status,current_step,created_at,updated_at,completed_at,state_json,error_json')
        .in('story_id', storyIds)
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) return json({ success: false, error: error.message }, 500)
      storyJobs = (data || []) as ProductionJobRow[]
    }

    const jobsById = new Map<string, ProductionJobRow>()
    for (const job of [...((seriesJobs || []) as ProductionJobRow[]), ...storyJobs]) jobsById.set(job.id, job)
    const jobs = Array.from(jobsById.values())

    const seriesGroups = new Map<string, StoryRow[]>()
    const standaloneStories: StoryRow[] = []
    for (const story of storyRows) {
      if (hasSeriesRelationship(story)) {
        const id = clean(story.series_id)
        seriesGroups.set(id, [...(seriesGroups.get(id) || []), story])
      } else {
        standaloneStories.push(story)
      }
    }

    const allItems = [
      ...Array.from(seriesGroups.entries()).map(([id, groupedStories]) => seriesObject(id, groupedStories, jobs)),
      ...standaloneStories.map((story) => standaloneObject(story, jobs)),
    ].sort((a: any, b: any) => {
      return dateMs(b.completionSortDate) - dateMs(a.completionSortDate)
    })

    const items = allItems.filter((item) => includeItem(item, tab, includeBlocked))

    return json({
      success: true,
      tab,
      includeBlocked,
      filters: {
        storyId: storyId || null,
        seriesId: seriesId || null,
      },
      counts: {
        items: items.length,
        series: items.filter((item: any) => item.type === 'series').length,
        stories: items.filter((item: any) => item.type === 'story').length,
      },
      examples: examples(allItems),
      items,
    })
  } catch (err: any) {
    console.error('[content-approval] GET failed:', err)
    return json({ success: false, error: err?.message || 'Failed to load content approval readiness' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const action = clean(req.nextUrl.searchParams.get('action'))
    if (!["set_workflow_state","set_series_ready_for_review","set_production_standard","recover_from_cold_storage","set_incubator_tag"].includes(action)) {
      return json({ success: false, error: 'Unsupported action' }, 400)
    }

    const body = await req.json().catch(() => ({}))
    const storyId = clean(body.storyId || body.story_id)
    if (action === 'set_production_standard') {
      const productionStandard = normalizeProductionStandard(body.production_standard)
      if (!storyId) return json({ success: false, error: 'Missing story_id' }, 400)
      if (!productionStandard) return json({ success: false, error: 'Invalid production_standard' }, 400)

      const adminEmail = await currentAdminEmail()
      const update = {
        production_standard: productionStandard,
        production_standard_updated_at: new Date().toISOString(),
        production_standard_updated_by: adminEmail,
      }

      const { data, error } = await supabase
        .from('stories')
        .update(update)
        .eq('id', storyId)
        .select('id,production_standard,production_standard_updated_at,production_standard_updated_by')
        .maybeSingle()

      if (error) return json({ success: false, error: error.message }, 500)
      if (!data) return json({ success: false, error: 'Story not found' }, 404)
      return json({ success: true, story: data })
    }

    if (action === 'set_series_ready_for_review') {
      const seriesId = clean(body.seriesId || body.series_id)
      const targetState = clean(body.targetState || body.target_state || 'ready_for_review')
      if (!seriesId) return json({ success: false, error: 'Missing seriesId' }, 400)
      if (targetState !== 'ready_for_review') return json({ success: false, error: 'Invalid targetState' }, 400)

      const { data: seriesRows, error: seriesError } = await supabase
        .from('stories')
        .select('id,status,is_hidden,workflow_state,series_id,series_name,episode_number')
        .eq('series_id', seriesId)

      if (seriesError) return json({ success: false, error: seriesError.message }, 500)
      if (!seriesRows || seriesRows.length === 0) return json({ success: false, error: 'Series not found' }, 404)

      const update = {
        status: 'audio_ready',
        is_hidden: true,
        workflow_state: 'ready_for_review',
        review_status: 'pending',
        reviewed_at: null,
        published_on: null,
        review_notes: null,
      }

      const { data, error } = await supabase
        .from('stories')
        .update(update)
        .eq('series_id', seriesId)
        .select('id,status,is_hidden,review_status,workflow_state,published_on')

      if (error) return json({ success: false, error: error.message }, 500)
      return json({
        success: true,
        seriesId,
        updatedCount: data?.length || 0,
        stories: data || [],
        fieldsUpdated: Object.keys(update),
      })
    }

    if (action === "recover_from_cold_storage") {
      const seriesId = clean(body.seriesId || body.series_id)
      const singleStoryId = clean(body.storyId || body.story_id)

      if (!seriesId && !singleStoryId) {
        return json({ success: false, error: "Missing storyId or seriesId" }, 400)
      }

      const recoveryUpdate = {
        workflow_state: "ready_for_review",
        review_status: "pending",
        is_hidden: true,
        reviewed_at: null,
        // review_notes intentionally NOT included — preserved as-is
      }

      if (seriesId) {
        const { data, error } = await supabase
          .from("stories")
          .update(recoveryUpdate)
          .eq("series_id", seriesId)
          .select("id,workflow_state,review_notes")
        if (error) return json({ success: false, error: error.message }, 500)
        return json({ success: true, seriesId, updatedCount: data?.length || 0 })
      }

      const { data: storyData, error: storyError } = await supabase
        .from("stories")
        .select("id,workflow_state")
        .eq("id", singleStoryId)
        .maybeSingle()
      if (storyError) return json({ success: false, error: storyError.message }, 500)
      if (!storyData) return json({ success: false, error: "Story not found" }, 404)
      if (storyData.workflow_state !== "cold_storage") {
        return json({ success: false, error: `Story is not in cold_storage (current: ${storyData.workflow_state})` }, 400)
      }

      const { data, error } = await supabase
        .from("stories")
        .update(recoveryUpdate)
        .eq("id", singleStoryId)
        .select("id,workflow_state,review_notes")
        .maybeSingle()
      if (error) return json({ success: false, error: error.message }, 500)
      return json({ success: true, story: data })
    }

    if (action === "set_incubator_tag") {
      const seriesId = clean(body.seriesId || body.series_id)
      const singleStoryId = clean(body.storyId || body.story_id)

      if (!seriesId && !singleStoryId) {
        return json({ success: false, error: "Missing storyId or seriesId" }, 400)
      }

      if (seriesId) {
        const { data: seriesRows, error: fetchError } = await supabase
          .from("stories")
          .select("id,review_notes")
          .eq("series_id", seriesId)
        if (fetchError) return json({ success: false, error: fetchError.message }, 500)
        if (!seriesRows || seriesRows.length === 0) return json({ success: false, error: "Series not found" }, 404)

        let taggedCount = 0
        for (const row of seriesRows) {
          const current = String(row.review_notes || "").trim()
          if (/\[INCUBATOR\]/i.test(current)) continue
          const updated = current ? `${current} [INCUBATOR]` : "[INCUBATOR]"
          await supabase.from("stories").update({ review_notes: updated }).eq("id", row.id)
          taggedCount++
        }
        return json({ success: true, seriesId, taggedCount })
      }

      const { data: storyRow, error: fetchError } = await supabase
        .from("stories")
        .select("id,review_notes")
        .eq("id", singleStoryId)
        .maybeSingle()
      if (fetchError) return json({ success: false, error: fetchError.message }, 500)
      if (!storyRow) return json({ success: false, error: "Story not found" }, 404)

      const current = String(storyRow.review_notes || "").trim()
      if (/\[INCUBATOR\]/i.test(current)) {
        return json({ success: true, story: storyRow, alreadyTagged: true })
      }
      const updated = current ? `${current} [INCUBATOR]` : "[INCUBATOR]"
      const { data, error } = await supabase
        .from("stories")
        .update({ review_notes: updated })
        .eq("id", singleStoryId)
        .select("id,review_notes")
        .maybeSingle()
      if (error) return json({ success: false, error: error.message }, 500)
      return json({ success: true, story: data })
    }

    const state = normalizeWorkflowState(body.state)
    if (!storyId) return json({ success: false, error: 'Missing storyId' }, 400)
    if (!state) return json({ success: false, error: 'Invalid workflow state' }, 400)

    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .select('id,status,is_hidden,review_status,workflow_state')
      .eq('id', storyId)
      .maybeSingle()

    if (storyError) return json({ success: false, error: storyError.message }, 500)
    if (!storyData) return json({ success: false, error: 'Story not found' }, 404)

    const story = storyData as StoryRow
    const from = effectiveWorkflowState({
      ...story,
      repair_checklist: null,
      repair_notes: null,
    })
    if (!transitionAllowed(from, state, body.retire === true)) {
      return json({ success: false, error: `Transition ${from} → ${state} is not allowed` }, 400)
    }

    const update = workflowUpdateForState(state, body)
    if (from === 'published' && state !== 'published') {
      update.status = 'audio_ready'
      update.published_on = null
    }
    const { data, error } = await supabase
      .from('stories')
      .update(update)
      .eq('id', storyId)
      .select('id,status,is_hidden,review_status,workflow_state,repair_checklist,repair_notes')
      .maybeSingle()

    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, story: data })
  } catch (err: any) {
    console.error('[content-approval] POST failed:', err)
    return json({ success: false, error: err?.message || 'Failed to update workflow state' }, 500)
  }
}
