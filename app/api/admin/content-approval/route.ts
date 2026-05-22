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

type ApprovalTab = 'review' | 'approved' | 'not_approved' | 'published' | 'all'

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
  if (tab === 'review' || tab === 'approved' || tab === 'not_approved' || tab === 'published' || tab === 'all') return tab
  return 'all'
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
    && bool(story.cover_url)
    && requiredMetadataMissing(story).length === 0
}

function matchesTab(story: StoryRow, tab: ApprovalTab) {
  if (tab === 'all') return true
  if (tab === 'review') return isReviewReady(story)
  if (tab === 'approved') return isApprovedReady(story)
  if (tab === 'not_approved') return displayReviewStatus(story) === 'not_approved'
  return isPublished(story)
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

function sourceJobForStory(story: StoryRow, jobs: ProductionJobRow[]) {
  const storyJobs = jobs
    .filter((job) => storyJobIds(job).has(story.id) || (story.series_id && job.series_id === story.series_id))
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''))
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

function approvalEntryReason(story: StoryRow) {
  if (isPublished(story)) return 'Published and visible in the public app.'
  if (displayReviewStatus(story) === 'approved') return 'Approved by review and waiting to publish.'
  if (displayReviewStatus(story) === 'not_approved') return 'Marked Not Approved for revision or archival history.'
  if (isReviewReady(story)) return 'Package completion made the story ready for Content Approval.'
  if (bool(story.audio_url) || bool(story.story_audio_url)) return 'Audio assets exist, but approval packaging is incomplete.'
  return 'Story row exists but has not reached audio/package readiness.'
}

function episodeObject(story: StoryRow, sourceJob: ProductionJobRow | null) {
  const blockingReasons = episodeBlockingReasons(story)
  const approvalReady = blockingReasons.length === 0
  return {
    storyId: story.id,
    title: story.title,
    episodeNumber: storyEpisodeNumber(story),
    status: story.status,
    reviewStatus: displayReviewStatus(story),
    isHidden: story.is_hidden,
    publishedOn: story.published_on,
    audioReadiness: audioReadiness(story),
    packagingReadiness: packagingReadiness(story),
    approvalReady,
    approvalBlockingReasons: blockingReasons,
    approvalEntryReason: approvalEntryReason(story),
    sourceJobId: sourceJob?.id || null,
    version: versionForStory(story, sourceJob),
  }
}

function expectedEpisodeCount(stories: StoryRow[], jobs: ProductionJobRow[]) {
  const fromStories = Math.max(
    0,
    ...stories.map((story) => numberOrNull(story.series_total_episodes) || numberOrNull(story.series_total) || 0)
  )
  if (fromStories > 0) return fromStories

  const fromJobs = Math.max(
    0,
    ...jobs.map((job) => Number(job.state_json?.totalEpisodes || job.state_json?.seriesValidation?.episodeCount || 0) || 0)
  )
  return fromJobs || stories.length
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
  const expected = expectedEpisodeCount(sortedStories, jobs.filter((job) => job.series_id === seriesId))
  const missing = missingEpisodes(sortedStories, expected)
  const episodes = sortedStories.map((story) => episodeObject(story, sourceJobForStory(story, jobs)))
  const approvalBlockingReasons = [
    ...(missing.length ? [`missing episode(s): ${missing.join(', ')}`] : []),
    ...episodes.flatMap((episode) => episode.approvalBlockingReasons.map((reason) => `Episode ${episode.episodeNumber || '?'}: ${reason}`)),
  ]
  const newestJob = jobs
    .filter((job) => job.series_id === seriesId)
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''))[0] || null

  return {
    type: 'series',
    seriesId,
    title: seriesTitle(sortedStories),
    expectedEpisodeCount: expected,
    presentEpisodeCount: sortedStories.length,
    missingEpisodes: missing,
    approvalReady: approvalBlockingReasons.length === 0,
    approvalEntryReason: missing.length
      ? 'Series has story rows but is missing expected episodes.'
      : 'Series readiness is aggregated from all episode rows.',
    approvalBlockingReasons,
    sourceJobId: newestJob?.id || null,
    version: {
      number: Math.max(1, ...sortedStories.map((story) => numberOrNull(story.script_version) || 1)),
      date: newestJob?.completed_at || newestJob?.updated_at || sortedStories[0]?.updated_at || sortedStories[0]?.created_at || null,
      type: 'new',
      redoReason: null,
      changeSummary: null,
    },
    counts: {
      audioReady: episodes.filter((episode) => episode.audioReadiness.audioUrl && episode.audioReadiness.storyAudioUrl).length,
      approvalReady: episodes.filter((episode) => episode.approvalReady).length,
      approved: episodes.filter((episode) => episode.reviewStatus === 'approved').length,
      notApproved: episodes.filter((episode) => episode.reviewStatus === 'not_approved').length,
      published: episodes.filter((episode) => episode.status === 'published' && episode.isHidden === false).length,
    },
    episodes,
  }
}

function standaloneObject(story: StoryRow, jobs: ProductionJobRow[]) {
  const sourceJob = sourceJobForStory(story, jobs)
  const episode = episodeObject(story, sourceJob)
  return {
    type: 'story',
    storyId: story.id,
    title: story.title,
    approvalReady: episode.approvalReady,
    approvalEntryReason: episode.approvalEntryReason,
    approvalBlockingReasons: episode.approvalBlockingReasons,
    sourceJobId: episode.sourceJobId,
    version: episode.version,
    episode,
  }
}

function includeItem(item: any, tab: ApprovalTab, includeBlocked: boolean) {
  if (includeBlocked || tab === 'all') return true
  if (item.type === 'series') return item.episodes.some((episode: any) => {
    const synthetic = {
      status: episode.status,
      is_hidden: episode.isHidden,
      review_status: episode.reviewStatus,
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

export async function GET(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const tab = normalizeTab(req.nextUrl.searchParams.get('tab'))
    const includeBlocked = req.nextUrl.searchParams.get('includeBlocked') !== 'false'
    const storyId = clean(req.nextUrl.searchParams.get('storyId'))
    const seriesId = clean(req.nextUrl.searchParams.get('seriesId'))

    let storyQuery = supabase
      .from('stories')
      .select([
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
      ].join(','))
      .order('created_at', { ascending: false })
      .limit(1000)

    if (storyId) storyQuery = storyQuery.eq('id', storyId)
    if (seriesId) storyQuery = storyQuery.eq('series_id', seriesId)

    const { data: stories, error: storiesError } = await storyQuery
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
      .limit(500)

    if (seriesId) jobsQuery = jobsQuery.eq('series_id', seriesId)
    else if (seriesIds.length > 0) jobsQuery = jobsQuery.in('series_id', seriesIds)

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
      const aDate = a.version?.date || a.episodes?.[0]?.version?.date || ''
      const bDate = b.version?.date || b.episodes?.[0]?.version?.date || ''
      return Date.parse(bDate) - Date.parse(aDate)
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
