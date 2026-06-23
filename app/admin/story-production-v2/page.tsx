'use client'


type TopFix = {
  text: string
  area: 'Hook' | 'Clarity' | 'Pacing' | 'Character' | 'Landing'
}

function inferTopFixArea(text: string): TopFix['area'] {
  const lower = text.toLowerCase()
  if (lower.includes('opening') || lower.includes('cold open') || lower.includes('hook') || lower.includes('first two minutes')) return 'Hook'
  if (lower.includes('clarity') || lower.includes('context') || lower.includes('confused') || lower.includes('recall') || lower.includes('re-orientation')) return 'Clarity'
  if (lower.includes('pacing') || lower.includes('rushed') || lower.includes('montage') || lower.includes('rhythmic') || lower.includes('breath')) return 'Pacing'
  if (lower.includes('character') || lower.includes('dialogue') || lower.includes('reaction') || lower.includes('emotional')) return 'Character'
  return 'Landing'
}

function parseTopFixDetails(reviewText: string): TopFix[] {
  if (!reviewText) return []

  const shortVerdictIndex = reviewText.indexOf('SHORT VERDICT:')
  const relevant = shortVerdictIndex >= 0 ? reviewText.slice(0, shortVerdictIndex) : reviewText

  const lines = relevant.split('\n')
  const fixes: string[] = []
  let collecting = false
  let current = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (current) current += '\n'
      continue
    }

    if (line.toUpperCase() === 'TOP FIXES:') {
      collecting = true
      continue
    }

    if (!collecting) continue

    const m = line.match(/^\d+\.\s+(.*)$/)
    if (m) {
      if (current.trim()) fixes.push(current.trim())
      current = m[1].trim()
      continue
    }

    if (current) current += ` ${line}`
  }

  if (current.trim()) fixes.push(current.trim())

  return fixes.map((text) => ({
    text,
    area: inferTopFixArea(text),
  }))
}

function parseTopFixes(reviewText: string): string[] {
  return parseTopFixDetails(reviewText).map((fix) => fix.text)
}

function extractSuccessfulHalStoryId(report: string) {
  if (!/Hal intake complete/i.test(report) || !/Generate-voices preflight:\s*passed/i.test(report)) return ''
  return report.match(/Story ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] || ''
}

const ACTIVE_V2_SESSION_KEY = 'et_v2_active_story_session_v1'
const LAST_AUTHOR_BY_GENRE_KEY = 'et_v2_last_author_by_genre_v1'
const MAX_TOP_FIX_ATTEMPTS_PER_SCRIPT = 2

function readSavedSeriesId(): string {
  if (typeof window === 'undefined') return ''

  const savedSeriesId = localStorage.getItem('et_last_series_id_v2')
  if (savedSeriesId) return savedSeriesId

  try {
    const rawPackageHandoff = localStorage.getItem('et_asc_package_handoff_v1')
    const packageHandoff = rawPackageHandoff ? JSON.parse(rawPackageHandoff) : null
    return packageHandoff?.seriesId || ''
  } catch {
    return ''
  }
}

async function readJsonOrDiagnostic(response: Response, endpointLabel: string) {
  console.log('[SERIES SAFE JSON]', endpointLabel)
  const contentType = response.headers.get('content-type') || ''
  const body = await response.text()
  const preview = body.slice(0, 500)
  const trimmed = body.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error([
      `Non-JSON response from ${endpointLabel}`,
      `Status: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      `Content-Type: ${contentType || 'unknown'}`,
      `Body preview: ${preview || '(empty)'}`,
    ].join('\n'))
  }

  try {
    return JSON.parse(trimmed)
  } catch (err) {
    throw new Error([
      `Invalid JSON response from ${endpointLabel}`,
      `Status: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      `Content-Type: ${contentType || 'unknown'}`,
      `Body preview: ${preview || '(empty)'}`,
      `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    ].join('\n'))
  }
}

function formatDiagnosticReport(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message

  if (typeof value === 'object') {
    const record = value as Record<string, any>
    const endpoint = record.endpoint || record.endpointLabel || record.url || record.failingUrl
    const status = record.status || record.httpStatus
    const contentType = record.contentType || record['content-type'] || record.responseContentType
    const preview = record.responsePreview || record.bodyPreview || record.preview || record.body || record.message

    if (endpoint || status || contentType || preview) {
      return [
        endpoint ? `Endpoint: ${endpoint}` : '',
        status ? `Status: ${status}` : '',
        contentType ? `Content-Type: ${contentType}` : '',
        preview ? `Response preview: ${typeof preview === 'string' ? preview.slice(0, 500) : JSON.stringify(preview, null, 2).slice(0, 500)}` : '',
      ].filter(Boolean).join('\n')
    }

    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return String(value)
}


import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type V2Status =
  | 'brief_complete'
  | 'script_drafted'
  | 'script_revised'
  | 'validator_failed'
  | 'validator_passed'
  | 'audio_pending'
  | 'ready_for_production'
  | 'audio_produced'
  | 'ready_to_publish'
  | 'published'
  | 'production_failed'
  | 'archived'

type AuthorOption = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  narrative_voice?: string | null
  tone?: string | null
  pacing?: string | null
  signature?: string | null
  style_reference?: string | null
  style_description?: string | null
  style_book_type?: string | null
  style_signature_trait?: string | null
  style_author_living?: boolean | null
  style_author_death_year?: number | null
  narrator_name?: string | null
}

type StepState = 'locked' | 'waiting' | 'running' | 'complete' | 'failed'

type QueueStatus = 'queued' | 'in_v2' | 'ready_for_asc' | 'published'
type ActiveAction =
  | 'saveBrief'
  | 'halIntake'
  | 'generateScript'
  | 'generateSeriesScripts'
  | 'scoreScript'
  | 'validateScript'
  | 'scoreValidatePackage'
  | 'produceAudio'
  | 'validatorFix'
  | 'standaloneTopFix'
  | 'episodeTopFix'
  | 'packageIssueFix'
  | 'reloadSavedStory'
  | ''

type QueueItem = {
  id: string
  title: string
  premise: string
  setting: string
  primaryGenre: string
  secondaryGenre: string
  tertiaryGenre: string
  duration: string
  authorTarget: string
  notes: string
  status: QueueStatus
  createdAt: string
  updatedAt: string
}

type SeriesEpisodePlan = {
  id: string
  title: string
  status: string
  script?: string | null
  script_json?: {
    pre_audio_review?: {
      reviewed_at?: string
      total?: number | null
      review_text?: string
    }
    series_generation?: {
      generated_at?: string
      episode_number?: number
      summary?: {
        description?: string
      }
    }
    series_score_validate?: {
      scored_at?: string
      validated_at?: string
      score_total?: number | null
      validator_result?: string
    }
  } | null
  validator_result?: string | null
  validator_report?: string | null
  validator_passed_at?: string | null
  episode_number?: number | null
  series_episode_number?: number | null
  brief_json?: {
    premise?: string | null
    setting?: string | null
    description?: string | null
    continuity_notes?: string | null
    cliffhanger_or_resolution?: string | null
  } | null
}

type SeriesPackage = {
  series: {
    id: string
    title: string
    description?: string | null
    total_episodes?: number | null
  }
  episodes: SeriesEpisodePlan[]
}

type EpisodeDetailModal =
  | {
      kind: 'score'
      episode: SeriesEpisodePlan
    }
  | {
      kind: 'validation'
      episode: SeriesEpisodePlan
    }
  | null


const GENRES = [
  'Thriller',
  'Horror',
  'Dark Mystery',
  'Mystery/Crime',
  'Adventure',
  'Drama',
  'Sci-Fi',
  'Western',
  'Historical Drama',
  'Supernatural',
  'Family/Heartwarming',
  'Comedy',
  'Romance',
  'Adventure/Survival',
  'Literary',
]

// Temporary compatibility layer until author genre data is retagged to canonical Admin Genres.
const GENRE_ALIASES: Record<string, string[]> = {
  Historical: ['Historical Drama'],
  Learn: ['Get Smarter', 'Non-Fiction'],
  Mystery: ['Mystery/Crime', 'Dark Mystery', 'Noir', 'Crime'],
  Classics: ['Literary'],
}

const SERIES_EPISODE_COUNTS = [3, 5, 7, 13]
const HAL_EPISODE_COUNTS = SERIES_EPISODE_COUNTS
const STANDALONE_EXCEPTION_EPISODE_COUNT = 1

const EMPTY_FORM = {
  title: '',
  type: 'series',
  author: '',
  author_style: '',
  genre: '',
  narrative_voice: '',
  premise: '',
  requirements: '',
  setting: '',
  runtime: '15 min',
  series_name: '',
  series_episode_number: '1',
  series_total_episodes: '3',
  series_is_finale: 'false',
  series_arc_plan: '',
}

const DEFAULT_HAL_INTAKE = {
  genre: '',
  runtime_minutes: '15',
  episode_count: '3',
  optional_premise: '',
}

type ActiveV2Session = {
  storyId?: string
  title?: string
  status?: V2Status | ''
  script?: string
  actionReport?: string
  validationReport?: string
  reviewText?: string
  reviewTotal?: number | null
  halPreflightPassedStoryId?: string
  form?: typeof EMPTY_FORM
  halIntake?: typeof DEFAULT_HAL_INTAKE
  queueIntakeNotice?: string
  queueAuthorTarget?: string
  standaloneExceptionEnabled?: boolean
  activeStep?: 'brief' | 'script' | 'score' | 'validate' | 'produce' | ''
  stepMessage?: string
  updatedAt?: string
}

function readActiveV2Session(): ActiveV2Session | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(ACTIVE_V2_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as ActiveV2Session
    if (!session || typeof session !== 'object') return null
    if (!session.storyId && !session.script && !session.actionReport && !session.validationReport) return null
    return session
  } catch (err) {
    console.error('Failed to read active V2 story session', err)
    return null
  }
}

function storedActiveV2SessionStoryId(): string {
  return readActiveV2Session()?.storyId || ''
}

function scriptAttemptKey(storyId: string, script: string) {
  let hash = 0
  for (let i = 0; i < script.length; i += 1) {
    hash = ((hash << 5) - hash + script.charCodeAt(i)) | 0
  }
  return `${storyId}:${script.length}:${Math.abs(hash)}`
}

function readTopFixAttemptMap(): Record<string, number> {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(localStorage.getItem('et_v2_top_fix_attempts_v1') || '{}')
  } catch {
    return {}
  }
}

function writeTopFixAttemptMap(attempts: Record<string, number>) {
  if (typeof window === 'undefined') return

  localStorage.setItem('et_v2_top_fix_attempts_v1', JSON.stringify(attempts))
}

function readNoFurtherRepairMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(localStorage.getItem('et_v2_no_further_top_fix_v1') || '{}')
  } catch {
    return {}
  }
}

function writeNoFurtherRepairMap(flags: Record<string, boolean>) {
  if (typeof window === 'undefined') return

  localStorage.setItem('et_v2_no_further_top_fix_v1', JSON.stringify(flags))
}

function readLastAuthorByGenre(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(localStorage.getItem(LAST_AUTHOR_BY_GENRE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeLastAuthorForGenre(genre: string, authorName: string) {
  if (typeof window === 'undefined' || !genre || !authorName) return

  const lastByGenre = readLastAuthorByGenre()
  lastByGenre[genre.toLowerCase()] = authorName
  localStorage.setItem(LAST_AUTHOR_BY_GENRE_KEY, JSON.stringify(lastByGenre))
}

function runtimeMinutesFromQueue(duration: string): string {
  const minutes = Number(String(duration || '').match(/\d+/)?.[0] || 15)
  if (minutes <= 10) return '10'
  if (minutes <= 15) return '15'
  if (minutes <= 20) return '20'
  return '30'
}

function episodeCountFromQueue(queueItem: Partial<QueueItem>): string {
  const source = [
    queueItem.title,
    queueItem.premise,
    queueItem.notes,
  ].filter(Boolean).join(' ')

  if (!/\b(series|episode|episodes|part|parts)\b/i.test(source)) return '3'

  const explicitCount = Number(source.match(/\b(3|5|7|13)\s*[- ]?(episode|episodes|part|parts)\b/i)?.[1] || 0)
  return explicitCount && HAL_EPISODE_COUNTS.includes(explicitCount) ? String(explicitCount) : '3'
}

function isStandaloneStoryType(type: unknown): boolean {
  return ['standalone', 'single_story'].includes(String(type || '').toLowerCase())
}

function queuePremiseSeed(queueItem: Partial<QueueItem>): string {
  const parts = [
    queueItem.premise ? `Premise: ${queueItem.premise}` : '',
    queueItem.setting ? `Setting seed: ${queueItem.setting}` : '',
    queueItem.notes ? `Instructions: ${queueItem.notes}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

function queueHalIntakeValues(queueItem: Partial<QueueItem>, story: any = null) {
  const genre = story?.genre || queueItem.primaryGenre || queueItem.secondaryGenre || queueItem.tertiaryGenre || ''
  const runtime = runtimeMinutesFromQueue(story?.runtime || queueItem.duration || '')
  const seriesTotal = story?.series_total_episodes ? Number(story.series_total_episodes) : 0
  const episodes = story && isStandaloneStoryType(story.type) && !story.series_id
    ? String(STANDALONE_EXCEPTION_EPISODE_COUNT)
    : (seriesTotal && HAL_EPISODE_COUNTS.includes(seriesTotal)
      ? String(seriesTotal)
      : episodeCountFromQueue(queueItem))
  const seed = queuePremiseSeed({
    ...queueItem,
    premise: story?.premise || queueItem.premise,
    setting: story?.setting || queueItem.setting,
    notes: story?.requirements || queueItem.notes,
  })

  return {
    genre,
    runtime_minutes: runtime,
    episode_count: episodes,
    optional_premise: seed,
  }
}

function queueSeedFromForm(formState: typeof EMPTY_FORM): string {
  return [
    formState.premise ? `Premise: ${formState.premise}` : '',
    formState.setting ? `Setting seed: ${formState.setting}` : '',
    formState.requirements ? `Instructions: ${formState.requirements}` : '',
  ].filter(Boolean).join('\n')
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-black animate-spin" />
      <span>{label}</span>
    </div>
  )
}

function ButtonLabel({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {loading ? <span className="h-3 w-3 rounded-full border-2 border-white/50 border-t-white animate-spin" /> : null}
      <span>{children}</span>
    </span>
  )
}

function StepPill({ label, state }: { label: string; state: StepState }) {
  const styles: Record<StepState, string> = {
    locked: 'bg-gray-200 text-gray-500 border-gray-300',
    waiting: 'bg-gray-100 text-gray-700 border-gray-300',
    running: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    complete: 'bg-green-100 text-green-800 border-green-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
  }
  return <div className={`px-3 py-2 rounded-full border text-sm font-medium ${styles[state]}`}>{label}</div>
}

function formatDetailValue(value: unknown): string {
  if (value == null || value === '') return 'Not available'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export default function StoryProductionV2Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queueId = searchParams.get('queueId')

  const [storyId, setStoryId] = useState('')
  const [status, setStatus] = useState<V2Status | ''>('')
  const [loading, setLoading] = useState(false)
  const [workingMessage, setWorkingMessage] = useState('')
  const [activeAction, setActiveAction] = useState<ActiveAction>('')
  const [scriptDirty, setScriptDirty] = useState(false)
  const [selectedTopFixes, setSelectedTopFixes] = useState<number[]>([])
  const [report, setReport] = useState('')
  const [script, setScript] = useState('')
  const [title, setTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewTotal, setReviewTotal] = useState<number | null>(null)
  const [halPreflightPassedStoryId, setHalPreflightPassedStoryId] = useState('')
  const [activeStep, setActiveStep] = useState<'brief' | 'script' | 'score' | 'validate' | 'produce' | ''>('')
  const [stepMessage, setStepMessage] = useState('')
  const [authors, setAuthors] = useState<AuthorOption[]>([])
  const [authorsLoading, setAuthorsLoading] = useState(true)
  const [adminGenres, setAdminGenres] = useState<string[]>(GENRES)
  const [selectedAuthorMeta, setSelectedAuthorMeta] = useState<AuthorOption | null>(null)
  const [seriesPackage, setSeriesPackage] = useState<SeriesPackage | null>(null)
  const [episodeDetailModal, setEpisodeDetailModal] = useState<EpisodeDetailModal>(null)
  const [applyingTopFixKey, setApplyingTopFixKey] = useState('')
  const [applyingValidatorFix, setApplyingValidatorFix] = useState(false)
  const [halIntake, setHalIntake] = useState(DEFAULT_HAL_INTAKE)
  const [queueIntakeNotice, setQueueIntakeNotice] = useState('')
  const [queueAuthorTarget, setQueueAuthorTarget] = useState('')
  const [standaloneExceptionEnabled, setStandaloneExceptionEnabled] = useState(false)
  const [episodeRepairStatus, setEpisodeRepairStatus] = useState<Record<string, string>>({})

  const scriptRef = useRef<HTMLTextAreaElement | null>(null)
  const reviewRef = useRef<HTMLPreElement | null>(null)
  const validateRef = useRef<HTMLPreElement | null>(null)
  const stateLoadGenerationRef = useRef(0)
  const activeSessionRestoreCheckedRef = useRef(false)
  const skipNextActiveSessionSaveRef = useRef(false)

  const [form, setForm] = useState(EMPTY_FORM)

  function clearLoadedProductionState() {
    stateLoadGenerationRef.current += 1
    setStoryId('')
    setStatus('')
    setScript('')
    setTitle('')
    setReviewText('')
    setReviewTotal(null)
    setReport('')
    setSeriesPackage(null)
    setEpisodeDetailModal(null)
    setSelectedTopFixes([])
    setScriptDirty(false)
    setHalPreflightPassedStoryId('')
    setQueueIntakeNotice('')
    setQueueAuthorTarget('')

    if (typeof window !== 'undefined') {
      localStorage.removeItem('et_last_series_id_v2')
      localStorage.removeItem('et_last_story_id_v2')
      localStorage.removeItem('et_last_queue_id_v2')
      localStorage.removeItem('et_asc_package_handoff_v1')
      localStorage.removeItem('et_asc_handoff_v1')
      localStorage.removeItem(ACTIVE_V2_SESSION_KEY)

      const url = new URL(window.location.href)
      url.searchParams.delete('seriesId')
      url.searchParams.delete('storyId')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearLoadedProductionStateForNewInput() {
    if (!storyId && !seriesPackage?.series?.id) return
    clearLoadedProductionState()
    setStepMessage('Cleared previous story/package state for a new brief')
  }

  function clearAllForNewStory() {
    clearLoadedProductionState()
    setForm(EMPTY_FORM)
    setHalIntake(DEFAULT_HAL_INTAKE)
    setQueueIntakeNotice('')
    setQueueAuthorTarget('')
    setStandaloneExceptionEnabled(false)
    setSelectedAuthorMeta(null)
    setWorkingMessage('')
    setActiveStep('')
    setActiveAction('')
    setLoading(false)
    setApplyingTopFixKey('')
    setApplyingValidatorFix(false)
    setStepMessage('')
  }

  async function reloadSavedStory(savedStoryId: string) {
    const cleanStoryId = String(savedStoryId || '').trim()
    if (!cleanStoryId) {
      setReport('Cannot reload saved story: missing storyId.')
      setStepMessage('Reload saved story failed')
      return
    }

    setActiveAction('reloadSavedStory')
    setLoading(true)
    setWorkingMessage('Reloading saved story...')
    setStepMessage('')
    setReport('')

    try {
      const res = await fetch(`/api/v2/load-story?storyId=${encodeURIComponent(cleanStoryId)}`, { cache: 'no-store' })
      const data = await readJsonOrDiagnostic(res, 'GET /api/v2/load-story')

      if (!res.ok || !data.success || !data.story) {
        throw new Error(data.error || 'Failed to reload saved story')
      }

      setSeriesPackage(null)
      setStoryId(data.story.id || '')
      setTitle(data.story.title || '')
      setStatus(data.story.status || '')
      setScript(data.story.script || '')
      setReport(data.story.validator_report || '')
      setReviewText(data.story.grade_notes || '')
      setReviewTotal(data.story.grade_total != null ? Number(data.story.grade_total) : null)
      setStandaloneExceptionEnabled(isStandaloneStoryType(data.story.type) && !data.story.series_id)
      setForm(prev => ({
        ...prev,
        title: data.story.title || prev.title,
        type: data.story.type || prev.type,
        author: data.story.author || prev.author,
        author_style: data.story.author_style || prev.author_style,
        genre: data.story.genre || prev.genre,
        narrative_voice: data.story.narrative_voice || prev.narrative_voice,
        premise: data.story.premise || prev.premise,
        setting: data.story.setting || prev.setting,
        runtime: data.story.runtime || prev.runtime,
        series_name: data.story.series_name || prev.series_name,
        series_episode_number: data.story.series_episode_number != null ? String(data.story.series_episode_number) : prev.series_episode_number,
        series_total_episodes: data.story.series_total_episodes != null ? String(data.story.series_total_episodes) : prev.series_total_episodes,
        series_is_finale: data.story.series_is_finale != null ? String(data.story.series_is_finale) : prev.series_is_finale,
        series_arc_plan: data.story.series_arc_plan || prev.series_arc_plan,
      }))

      try {
        const briefRes = await fetch(`/api/v2/story-brief?storyId=${encodeURIComponent(data.story.id)}`, { cache: 'no-store' })
        const briefData = await readJsonOrDiagnostic(briefRes, 'GET /api/v2/story-brief')
        if (briefRes.ok && briefData?.success && briefData?.story) {
          setForm(prev => ({
            ...prev,
            series_arc_plan: briefData.story.series_arc_plan || prev.series_arc_plan,
            requirements: briefData.story.requirements || prev.requirements,
          }))
        }
      } catch (err) {
        console.error('story brief detail reload failed', err)
      }

      try {
        if (typeof window !== 'undefined' && data?.story?.id) {
          localStorage.setItem('et_last_story_id_v2', data.story.id)
        }
      } catch (err) {
        console.error('Failed to refresh last active V2 story', err)
      }

      setStepMessage('Reloaded saved story from database.')
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Reload saved story failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveAction('')
    }
  }

  useEffect(() => {
    if (activeSessionRestoreCheckedRef.current) return
    activeSessionRestoreCheckedRef.current = true

    const requestedStoryId = searchParams.get('storyId')
    const requestedSeriesId = searchParams.get('seriesId')
    const session = readActiveV2Session()

    if (!session) return
    if (requestedSeriesId) return
    if (queueId) return
    if (requestedStoryId && session.storyId && requestedStoryId !== session.storyId) return

    stateLoadGenerationRef.current += 1
    skipNextActiveSessionSaveRef.current = true
    setSeriesPackage(null)
    setStoryId(session.storyId || '')
    setTitle(session.title || '')
    setStatus((session.status || '') as V2Status | '')
    setScript(session.script || '')
    setReport(session.actionReport || session.validationReport || '')
    setReviewText(session.reviewText || '')
    setReviewTotal(session.reviewTotal ?? null)
    setHalPreflightPassedStoryId(session.halPreflightPassedStoryId || '')
    setForm({ ...EMPTY_FORM, ...(session.form || {}) })
    setHalIntake({ ...DEFAULT_HAL_INTAKE, ...(session.halIntake || {}) })
    setQueueIntakeNotice(session.queueIntakeNotice || '')
    setQueueAuthorTarget(session.queueAuthorTarget || '')
    setStandaloneExceptionEnabled(!!session.standaloneExceptionEnabled || isStandaloneStoryType(session.form?.type) || session.halIntake?.episode_count === '1')
    setActiveStep(session.activeStep || '')
    setStepMessage(session.stepMessage || '')
    setSelectedTopFixes([])
    setScriptDirty(false)
    setLoading(false)
    setWorkingMessage('')
    setActiveAction('')

    if (session.storyId && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (!url.searchParams.get('seriesId')) {
        url.searchParams.set('storyId', session.storyId)
        window.history.replaceState({}, '', url.toString())
      }
    }

    console.log('[V2] session restored', { storyId: session.storyId || '', title: session.title || '' })
  }, [queueId, searchParams])

  useEffect(() => {
    if (!activeSessionRestoreCheckedRef.current) return
    if (typeof window === 'undefined') return

    if (skipNextActiveSessionSaveRef.current) {
      skipNextActiveSessionSaveRef.current = false
      return
    }

    const hasActiveSessionContent = !!(storyId || script || report || reviewText || title)
    if (!hasActiveSessionContent) {
      localStorage.removeItem(ACTIVE_V2_SESSION_KEY)
      return
    }

    const session: ActiveV2Session = {
      storyId,
      title,
      status,
      script,
      actionReport: report,
      validationReport: report,
      reviewText,
      reviewTotal,
      halPreflightPassedStoryId,
      form,
      halIntake,
      queueIntakeNotice,
      queueAuthorTarget,
      standaloneExceptionEnabled,
      activeStep,
      stepMessage,
      updatedAt: new Date().toISOString(),
    }

    localStorage.setItem(ACTIVE_V2_SESSION_KEY, JSON.stringify(session))
    console.log('[V2] session saved', { storyId, title })
  }, [
    activeStep,
    form,
    halIntake,
    halPreflightPassedStoryId,
    queueIntakeNotice,
    queueAuthorTarget,
    report,
    reviewText,
    reviewTotal,
    script,
    standaloneExceptionEnabled,
    status,
    stepMessage,
    storyId,
    title,
  ])

  useEffect(() => {
    if (!queueId && storedActiveV2SessionStoryId()) return

    const savedSeriesId = readSavedSeriesId()
    const effectiveQueueId =
      queueId ||
      (!savedSeriesId && typeof window !== 'undefined' ? localStorage.getItem('et_last_queue_id_v2') : '')

    if (!effectiveQueueId) return

    let ignore = false
    const loadGeneration = stateLoadGenerationRef.current

    async function loadQueueItemIntoBrief() {
      try {
        setWorkingMessage('Loading queued story...')
        setStepMessage('')

        const res = await fetch(`/api/admin/story-queue?id=${encodeURIComponent(effectiveQueueId)}`, { cache: 'no-store' })
        const data = await readJsonOrDiagnostic(res, 'GET /api/admin/story-queue')
        const queued = data?.item

        if (!res.ok || !queued) {
          throw new Error(data?.error || 'Failed to load queue item')
        }
        if (ignore || loadGeneration !== stateLoadGenerationRef.current) return
        setQueueAuthorTarget(queued.authorTarget || '')

        let loadedSavedStory = false

        if (queued.storyId) {
          try {
            const savedRes = await fetch(`/api/v2/load-story?storyId=${encodeURIComponent(queued.storyId)}`)
            const savedData = await readJsonOrDiagnostic(savedRes, 'GET /api/v2/load-story')

            if (savedRes.ok && savedData?.success && savedData?.story) {
              if (ignore || loadGeneration !== stateLoadGenerationRef.current) return

              const queueIntake = queueHalIntakeValues(queued, savedData.story)
              console.log("[QUEUE→HAL]", {
                genre: queueIntake.genre,
                runtime: queueIntake.runtime_minutes,
                seedLength: queueIntake.optional_premise.length,
                episodes: queueIntake.episode_count,
              })
              setStoryId(savedData.story.id || '')
              setTitle(savedData.story.title || queued.title || '')
              setStatus(savedData.story.status || '')
              setScript(savedData.story.script || '')
              setReport(savedData.story.validator_report || '')
              setHalIntake(queueIntake)
              setStandaloneExceptionEnabled(isStandaloneStoryType(savedData.story.type) && !savedData.story.series_id)
              setForm(prev => ({
                ...prev,
                title: savedData.story.title || queued.title || prev.title,
                type: queueIntake.episode_count === '1' ? 'standalone' : 'series',
                author: savedData.story.author || queued.authorTarget || prev.author,
                author_style: savedData.story.author_style || prev.author_style,
                genre: queueIntake.genre || prev.genre,
                narrative_voice: savedData.story.narrative_voice || prev.narrative_voice,
                premise: savedData.story.premise || queued.premise || prev.premise,
                requirements: savedData.story.requirements || queued.notes || prev.requirements,
                setting: savedData.story.setting || queued.setting || prev.setting,
                runtime: `${queueIntake.runtime_minutes} min`,
                series_name: savedData.story.series_name || prev.series_name,
                series_episode_number: queueIntake.episode_count === '1' ? '' : savedData.story.series_episode_number != null ? String(savedData.story.series_episode_number) : '1',
                series_total_episodes: queueIntake.episode_count === '1' ? '' : queueIntake.episode_count,
                series_is_finale: savedData.story.series_is_finale != null ? String(savedData.story.series_is_finale) : prev.series_is_finale,
                series_arc_plan: savedData.story.series_arc_plan || prev.series_arc_plan,
              }))
              try {
                const briefRes = await fetch(`/api/v2/story-brief?storyId=${encodeURIComponent(savedData.story.id)}`)
                const briefData = await readJsonOrDiagnostic(briefRes, 'GET /api/v2/story-brief')
                if (!ignore && loadGeneration === stateLoadGenerationRef.current && briefRes.ok && briefData?.success && briefData?.story) {
                  setForm(prev => ({
                    ...prev,
                    series_arc_plan: briefData.story.series_arc_plan || prev.series_arc_plan,
                    requirements: briefData.story.requirements || queued.notes || prev.requirements,
                  }))
                }
              } catch (err) {
                console.error('series brief detail load failed', err)
              }
              setStepMessage('Reloaded saved story from queue')
              setQueueIntakeNotice('Loaded from Story Queue. This will use the standard Hal Intake production path.')
              loadedSavedStory = true
            }
          } catch (err) {
            console.error('load-story failed, falling back to queue data', err)
          }
        }

        if (!loadedSavedStory) {
          if (!queued.storyId) clearLoadedProductionState()
          const queueIntake = queueHalIntakeValues(queued)
          console.log("[QUEUE→HAL]", {
            genre: queueIntake.genre,
            runtime: queueIntake.runtime_minutes,
            seedLength: queueIntake.optional_premise.length,
            episodes: queueIntake.episode_count,
          })
          setStoryId(queued.storyId || '')
          setTitle(queued.title || '')
          setHalIntake(queueIntake)
          setStandaloneExceptionEnabled(false)
          setForm(prev => ({
            ...prev,
            title: queued.title || prev.title,
            type: queueIntake.episode_count === '1' ? 'standalone' : 'series',
            genre: queueIntake.genre || prev.genre,
            premise: queued.premise || prev.premise,
            requirements: queued.notes || prev.requirements,
            setting: queued.setting || prev.setting,
            runtime: `${queueIntake.runtime_minutes} min`,
            author: queued.authorTarget || '',
            series_total_episodes: queueIntake.episode_count === '1' ? '' : queueIntake.episode_count,
            series_episode_number: queueIntake.episode_count === '1' ? '' : '1',
            series_is_finale: 'false',
          }))
          setQueueIntakeNotice('Loaded from Story Queue. This will use the standard Hal Intake production path.')
          setStepMessage(queued.storyId ? 'Loaded queued story draft' : 'Loaded queued story idea for Hal Intake')
        }

        await fetch('/api/admin/story-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: effectiveQueueId, status: 'in_v2' }),
        })
      } catch (e) {
          if (!ignore && loadGeneration === stateLoadGenerationRef.current) {
          console.error('Failed to preload queue item into V2', e)
          setStepMessage('Queue preload failed')
        }
      } finally {
        if (!ignore) {
          setWorkingMessage('')
        }
      }
    }

    loadQueueItemIntoBrief()
    return () => {
      ignore = true
    }
  }, [queueId])


  useEffect(() => {
    const requestedStoryId = searchParams.get('storyId')
    const requestedSeriesId = searchParams.get('seriesId')

    if (requestedSeriesId) return
    if (!requestedStoryId) return
    if (storedActiveV2SessionStoryId() === requestedStoryId) return

    let ignore = false
    const loadGeneration = stateLoadGenerationRef.current

    async function loadSavedStory() {
      try {
        setLoading(true)
        setWorkingMessage('Loading saved story...')
        setStepMessage('')

        const res = await fetch(`/api/v2/load-story?storyId=${encodeURIComponent(requestedStoryId)}`)
        const data = await readJsonOrDiagnostic(res, 'GET /api/v2/load-story')

        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load saved story')
        if (ignore || loadGeneration !== stateLoadGenerationRef.current) return

        if (data.story?.series_id) {
          const packageRes = await fetch(`/api/v2/series-package/score-validate?seriesId=${encodeURIComponent(data.story.series_id)}`)
          const packageData = await readJsonOrDiagnostic(packageRes, 'GET /api/v2/series-package/score-validate')

          if (!packageRes.ok || !packageData.success) {
            throw new Error(formatDiagnosticReport(packageData.error) || 'Failed to load series package')
          }
          if (ignore || loadGeneration !== stateLoadGenerationRef.current) return

          const pkg = packageData.package as SeriesPackage
          const firstEpisode = pkg.episodes?.[0]
          const firstBrief = firstEpisode?.brief_json || {}

          setSeriesPackage(pkg)
          setStandaloneExceptionEnabled(false)
          setStoryId(firstEpisode?.id || '')
          setTitle(pkg.series?.title || '')
          setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
          setScript('')
          setReport('')
          setReviewText('')
          setReviewTotal(null)
          setForm(prev => ({
            ...prev,
            title: pkg.series?.title || prev.title,
            type: 'series',
            series_name: pkg.series?.title || prev.series_name,
            series_total_episodes: String(pkg.series?.total_episodes || pkg.episodes?.length || prev.series_total_episodes || ''),
            series_episode_number: '1',
            series_is_finale: 'false',
            series_arc_plan: pkg.series?.description || prev.series_arc_plan,
            premise: firstBrief?.premise || prev.premise,
            requirements: firstBrief?.requirements || prev.requirements,
            setting: firstBrief?.setting || prev.setting,
          }))

          router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(data.story.series_id)}`, { scroll: false })

          setStepMessage('Loaded series package')
          return
        }

        setSeriesPackage(null)
        setStandaloneExceptionEnabled(isStandaloneStoryType(data.story.type) && !data.story.series_id)
        setStoryId(data.story.id || '')
        setTitle(data.story.title || '')
        setStatus(data.story.status || '')
        setScript(data.story.script || '')
        setReport(data.story.validator_report || '')
        setReviewText(data.story.grade_notes || '')
        setReviewTotal(data.story.grade_total != null ? Number(data.story.grade_total) : null)
        setForm(prev => ({
          ...prev,
          title: data.story.title || prev.title,
          type: data.story.type || prev.type,
          author: data.story.author || prev.author,
          author_style: data.story.author_style || prev.author_style,
          genre: data.story.genre || prev.genre,
          narrative_voice: data.story.narrative_voice || prev.narrative_voice,
          premise: data.story.premise || prev.premise,
          setting: data.story.setting || prev.setting,
          runtime: data.story.runtime || prev.runtime,
          series_name: data.story.series_name || prev.series_name,
          series_episode_number: data.story.series_episode_number != null ? String(data.story.series_episode_number) : prev.series_episode_number,
          series_total_episodes: data.story.series_total_episodes != null ? String(data.story.series_total_episodes) : prev.series_total_episodes,
          series_is_finale: data.story.series_is_finale != null ? String(data.story.series_is_finale) : prev.series_is_finale,
          series_arc_plan: data.story.series_arc_plan || prev.series_arc_plan,
        }))

        try {
          const briefRes = await fetch(`/api/v2/story-brief?storyId=${encodeURIComponent(data.story.id)}`)
          const briefData = await readJsonOrDiagnostic(briefRes, 'GET /api/v2/story-brief')
          if (!ignore && loadGeneration === stateLoadGenerationRef.current && briefRes.ok && briefData?.success && briefData?.story) {
            setForm(prev => ({
              ...prev,
              series_arc_plan: briefData.story.series_arc_plan || prev.series_arc_plan,
              requirements: briefData.story.requirements || prev.requirements,
            }))
          }
        } catch (err) {
          console.error('series brief detail load failed', err)
        }

        try {
          if (typeof window !== 'undefined' && data?.story?.id) {
            localStorage.setItem('et_last_story_id_v2', data.story.id)
          }
        } catch (err) {
          console.error('Failed to refresh last active V2 story', err)
        }

        setStepMessage('Loaded saved story')
      } catch (e) {
        if (!ignore && loadGeneration === stateLoadGenerationRef.current) {
          setReport(e instanceof Error ? e.message : 'Unknown error')
          setStepMessage('Load saved story failed')
        }
      } finally {
        if (!ignore && loadGeneration === stateLoadGenerationRef.current) {
          setLoading(false)
          setWorkingMessage('')
        }
      }
    }

    loadSavedStory()
    return () => {
      ignore = true
    }
  }, [router, searchParams])

  useEffect(() => {
    const requestedStoryId = searchParams.get('storyId')
    const requestedSeriesId = searchParams.get('seriesId')

    if (requestedStoryId || requestedSeriesId || queueId) return
    if (typeof window === 'undefined') return
    if (storedActiveV2SessionStoryId()) return

    const savedSeriesId = readSavedSeriesId()

    if (savedSeriesId) {
      router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(savedSeriesId)}`, { scroll: false })
    }
  }, [queueId, router, searchParams])

  useEffect(() => {
    const requestedSeriesId = searchParams.get('seriesId')

    if (!requestedSeriesId) return

    let ignore = false
    const loadGeneration = stateLoadGenerationRef.current

    async function loadSeriesPackage() {
      try {
        setLoading(true)
        setWorkingMessage('Loading series package...')
        setStepMessage('')

        const res = await fetch(`/api/v2/series-package/score-validate?seriesId=${encodeURIComponent(requestedSeriesId)}`)
        const data = await readJsonOrDiagnostic(res, 'GET /api/v2/series-package/score-validate')

        if (!res.ok || !data.success) throw new Error(formatDiagnosticReport(data.error) || 'Failed to load series package')
        if (ignore || loadGeneration !== stateLoadGenerationRef.current) return

        const pkg = data.package as SeriesPackage
        const firstEpisode = pkg.episodes?.[0]
        const firstBrief = firstEpisode?.brief_json || {}

        setSeriesPackage(pkg)
        setStandaloneExceptionEnabled(false)
        try {
          if (typeof window !== 'undefined' && pkg.series?.id) {
            localStorage.setItem('et_last_series_id_v2', pkg.series.id)
          }
        } catch (err) {
          console.error('Failed to persist active V2 series package', err)
        }
        setStoryId(firstEpisode?.id || '')
        setTitle(pkg.series?.title || '')
        setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
        setScript('')
        setReport('')
        setReviewText('')
        setReviewTotal(null)
        setForm(prev => ({
          ...prev,
          title: pkg.series?.title || prev.title,
          type: 'series',
          series_name: pkg.series?.title || prev.series_name,
          series_total_episodes: String(pkg.series?.total_episodes || pkg.episodes?.length || prev.series_total_episodes || ''),
          series_episode_number: '1',
          series_is_finale: 'false',
          series_arc_plan: pkg.series?.description || prev.series_arc_plan,
          premise: firstBrief?.premise || prev.premise,
          requirements: firstBrief?.requirements || prev.requirements,
          setting: firstBrief?.setting || prev.setting,
        }))

        setStepMessage('Loaded series package')
      } catch (e) {
        if (!ignore && loadGeneration === stateLoadGenerationRef.current) {
          setReport(e instanceof Error ? e.message : 'Unknown error')
          setStepMessage('Load series package failed')
        }
      } finally {
        if (!ignore && loadGeneration === stateLoadGenerationRef.current) {
          setLoading(false)
          setWorkingMessage('')
        }
      }
    }

    loadSeriesPackage()
    return () => {
      ignore = true
    }
  }, [searchParams])

  useEffect(() => {
    if (!storyId || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('seriesId')) return
    if (seriesPackage?.series?.id) {
      router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(seriesPackage.series.id)}`, { scroll: false })
      return
    }
    url.searchParams.set('storyId', storyId)
    window.history.replaceState({}, '', url.toString())
  }, [router, storyId, seriesPackage?.series?.id])

  useEffect(() => {
    const reportStoryId = extractSuccessfulHalStoryId(report)
    if (seriesPackage?.series?.id || !reportStoryId || !script || status !== 'validator_passed') return

    if (!storyId) {
      setStoryId(reportStoryId)
    }
    if (halPreflightPassedStoryId !== reportStoryId) {
      setHalPreflightPassedStoryId(reportStoryId)
    }
  }, [halPreflightPassedStoryId, report, script, seriesPackage?.series?.id, status, storyId])

  useEffect(() => {
    let ignore = false
    async function loadAdminGenres() {
      try {
        const res = await fetch('/api/admin/genres?active=true', { cache: 'no-store' })
        const data = await readJsonOrDiagnostic(res, 'GET /api/admin/genres')
        const genreNames = Array.isArray(data?.genres)
          ? data.genres.map((genre: any) => String(genre?.name || '').trim()).filter(Boolean)
          : []

        if (!ignore && res.ok && data?.success && genreNames.length > 0) {
          setAdminGenres(genreNames)
        }
      } catch (err) {
        console.warn('Failed to load admin genres; using fallback genres', err)
      }
    }

    loadAdminGenres()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    async function loadAuthors() {
      try {
        setAuthorsLoading(true)
        const res = await fetch('/api/v2/author-options')
        const data = await readJsonOrDiagnostic(res, 'GET /api/v2/author-options')
        if (!ignore && res.ok && data.success) setAuthors(data.authors || [])
      } finally {
        if (!ignore) setAuthorsLoading(false)
      }
    }
    loadAuthors()
    return () => {
      ignore = true
    }
  }, [])

  const filteredAuthors = useMemo(() => {
    if (!form.genre) return []
    const genreTargets = [form.genre, ...(GENRE_ALIASES[form.genre] || [])].map((value) => value.toLowerCase())
    return authors.filter((a) =>
      [a.primary_genre, a.secondary_genre].filter(Boolean).some((v) => genreTargets.includes(String(v).toLowerCase()))
    )
  }, [authors, form.genre])

  const genreOptions = useMemo(() => {
    const options = [...adminGenres]
    if (form.genre && !options.some((genre) => genre.toLowerCase() === form.genre.toLowerCase())) {
      options.unshift(form.genre)
    }
    if (halIntake.genre && !options.some((genre) => genre.toLowerCase() === halIntake.genre.toLowerCase())) {
      options.unshift(halIntake.genre)
    }
    return options
  }, [adminGenres, form.genre, halIntake.genre])

  useEffect(() => {
    setSelectedAuthorMeta(authors.find((a) => a.name === form.author) || null)
  }, [authors, form.author])

  const hasActiveAction = !!activeAction
  const canGenerate = !!storyId && status === 'brief_complete'
  const packageScriptsReady = !!seriesPackage && seriesPackage.episodes.length > 0 && seriesPackage.episodes.every((episode) => !!episode.script)
  const isPackageMode = !!seriesPackage?.series?.id
  const packageEpisodeCount = seriesPackage?.episodes.length || 0
  const packageExists = !!seriesPackage?.series?.id
  const packageAllScriptsPresent = packageEpisodeCount > 0 && seriesPackage!.episodes.every((episode) => !!episode.script)
  const packageNoScriptsPresent = packageEpisodeCount > 0 && seriesPackage!.episodes.every((episode) => !episode.script)
  const packageSomeScriptsPresent = packageEpisodeCount > 0 && !packageAllScriptsPresent && seriesPackage!.episodes.some((episode) => !!episode.script)
  const packageAllValidationsPass = packageEpisodeCount > 0 && seriesPackage!.episodes.every((episode) => {
    const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
    return episode.status === 'validator_passed' || validation === 'PASS'
  })
  const packageFailedEpisodes = seriesPackage?.episodes.filter((episode) => {
    const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
    return episode.status === 'validator_failed' || validation === 'FAIL'
  }) || []
  const canFixPackageIssues = !!seriesPackage?.series?.id
    && packageFailedEpisodes.length > 0
    && packageFailedEpisodes.every((episode) => !!episode.script && !!episode.validator_report)
    && !loading
    && !hasActiveAction
  const packageReadyForAsc = !!seriesPackage
    && seriesPackage.episodes.length > 0
    && seriesPackage.episodes.every((episode) => {
      const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
      return !!episode.script && (episode.status === 'validator_passed' || validation === 'PASS')
    })
  const canGeneratePackageScripts = !!seriesPackage
    && packageEpisodeCount > 0
    && !packageAllScriptsPresent
    && !loading
    && !hasActiveAction
  const canScore = seriesPackage ? packageScriptsReady && !loading : !!storyId && !!script && !loading
  const canValidate = seriesPackage ? packageScriptsReady && !loading : !!storyId && !!script && !loading
  const canProduce = seriesPackage ? packageReadyForAsc && !loading : !!storyId && !!script && status === 'validator_passed'
  const halNoActionRunning = !loading && !activeAction
  const canProceedToAudioProduction = seriesPackage
    ? canProduce
    : !!storyId
      && !!script
      && status === 'validator_passed'
      && halPreflightPassedStoryId === storyId
      && halNoActionRunning
  const standaloneReadyForHal = !seriesPackage
    && halNoActionRunning
    && !!storyId
    && !!script
    && status === 'validator_passed'
    && halPreflightPassedStoryId === storyId
  const packageReadyForHal = !!seriesPackage
    && halNoActionRunning
    && packageExists
    && packageEpisodeCount > 0
    && packageAllScriptsPresent
    && packageAllValidationsPass
    && packageReadyForAsc
    && canProduce
  const readyForHal = seriesPackage ? packageReadyForHal : standaloneReadyForHal
  const baseActionClass = 'px-4 py-2 rounded disabled:opacity-50'
  const completedActionClass = `${baseActionClass} bg-gray-200 text-gray-800 border border-gray-300`
  const primaryActionClass = `${baseActionClass} bg-green-600 text-white`
  const blockedActionClass = `${baseActionClass} bg-red-600 text-white`
  const neutralActionClass = `${baseActionClass} bg-black text-white`
  const runningActionClass = `${baseActionClass} bg-orange-500 text-white`
  const standaloneScriptComplete = !!script && ['script_drafted', 'validator_passed', 'validator_failed', 'audio_pending', 'ready_for_production', 'audio_produced', 'ready_to_publish', 'published'].includes(status)
  const standaloneScoreComplete = !!reviewText
  const standaloneValidationComplete = status === 'validator_passed' || status === 'validator_failed'
  const standaloneProduced = ['audio_pending', 'ready_for_production', 'audio_produced', 'ready_to_publish', 'published'].includes(status)
  const standaloneTopFixes = parseTopFixes(reviewText)
  const topFixAttemptKey = storyId ? `story:${storyId}` : ''
  const topFixAttempts = topFixAttemptKey ? readTopFixAttemptMap()[topFixAttemptKey] || 0 : 0
  const noFurtherTopFixRecommended = topFixAttemptKey ? !!readNoFurtherRepairMap()[topFixAttemptKey] : false
  const renderedHalGenre = halIntake.genre || form.genre
  const renderedHalRuntime = halIntake.runtime_minutes || runtimeMinutesFromQueue(form.runtime)
  const renderedHalEpisodes = halIntake.episode_count || (form.type === 'series' && form.series_total_episodes ? form.series_total_episodes : standaloneExceptionEnabled ? '1' : '3')
  const renderedHalSeed = halIntake.optional_premise || queueSeedFromForm(form)
  const effectiveHalIntake = {
    genre: renderedHalGenre,
    runtime_minutes: renderedHalRuntime,
    episode_count: renderedHalEpisodes,
    optional_premise: renderedHalSeed,
  }
  const halEligibleAuthors = renderedHalGenre ? approvedAuthorsForGenre(renderedHalGenre) : []
  const lastAuthorForGenre = renderedHalGenre ? readLastAuthorByGenre()[renderedHalGenre.toLowerCase()] || '' : ''
  const lastAuthorIndex = lastAuthorForGenre ? halEligibleAuthors.findIndex((author) => author.name === lastAuthorForGenre) : -1
  const nextAuthorIndex = halEligibleAuthors.length ? (lastAuthorIndex + 1) % halEligibleAuthors.length : -1
  const selectedHalAuthor = renderedHalGenre ? chooseCanonicalAuthor(renderedHalGenre, queueAuthorTarget, true) : null
  const authorSelectionReason = queueAuthorTarget
    ? 'queue target'
    : lastAuthorForGenre
      ? 'rotation'
      : renderedHalGenre
        ? 'fallback first author'
        : 'choose genre'
  const queueLoadedIntoHalIntake = !!queueIntakeNotice && !!renderedHalGenre && !!renderedHalSeed
  const canFixStandaloneTopFixes = !seriesPackage
    && !!storyId
    && !!script
    && !!reviewText
    && typeof reviewTotal === 'number'
    && reviewTotal < 25
    && standaloneTopFixes.length > 0
    && topFixAttempts < MAX_TOP_FIX_ATTEMPTS_PER_SCRIPT
    && !noFurtherTopFixRecommended
    && !loading
    && !hasActiveAction
  const generateActionClass = seriesPackage
    ? packageAllScriptsPresent
      ? completedActionClass
      : primaryActionClass
    : activeStep === 'script' && loading
      ? runningActionClass
      : standaloneScriptComplete
        ? completedActionClass
        : canGenerate
          ? primaryActionClass
          : blockedActionClass
  const scoreActionClass = seriesPackage
    ? packageAllValidationsPass
      ? completedActionClass
      : packageAllScriptsPresent
        ? primaryActionClass
        : blockedActionClass
    : activeStep === 'score' && loading
      ? runningActionClass
      : standaloneScoreComplete
        ? completedActionClass
        : script
          ? primaryActionClass
          : blockedActionClass
  const validateActionClass = seriesPackage
    ? scoreActionClass
    : activeStep === 'validate' && loading
      ? runningActionClass
      : standaloneValidationComplete
        ? completedActionClass
        : standaloneScoreComplete
          ? primaryActionClass
          : script
            ? neutralActionClass
            : blockedActionClass
  const produceActionClass = seriesPackage
    ? packageReadyForAsc
        ? primaryActionClass
        : blockedActionClass
    : activeStep === 'produce' && loading
      ? runningActionClass
      : standaloneProduced
        ? completedActionClass
        : canProceedToAudioProduction
          ? primaryActionClass
          : blockedActionClass

  useEffect(() => {
    console.log("[HAL RENDER]", {
      renderedGenre: renderedHalGenre,
      renderedRuntime: renderedHalRuntime,
      renderedEpisodes: renderedHalEpisodes,
      renderedSeedLength: renderedHalSeed.length,
    })
  }, [renderedHalEpisodes, renderedHalGenre, renderedHalRuntime, renderedHalSeed])

  function pickAuthor(author: AuthorOption) {
    clearLoadedProductionStateForNewInput()
    setForm((prev) => ({
      ...prev,
      author: author.name,
      author_style: author.style_reference || prev.author_style,
      narrative_voice: prev.narrative_voice || author.narrative_voice || '',
    }))
  }

  function approvedAuthorsForGenre(genre: string) {
    const genreTargets = [genre, ...(GENRE_ALIASES[genre] || [])].map((value) => value.toLowerCase())
    return authors.filter((author) =>
      [author.primary_genre, author.secondary_genre].filter(Boolean).some((value) => genreTargets.includes(String(value).toLowerCase()))
    )
  }

  function chooseCanonicalAuthor(genre: string, requestedAuthor = '', rotate = false) {
    const requested = requestedAuthor.trim().toLowerCase()
    if (requested) {
      const authorMatch = authors.find((author) => author.name.toLowerCase() === requested)
      if (authorMatch) return authorMatch
    }

    const eligibleAuthors = approvedAuthorsForGenre(genre)
    if (!eligibleAuthors.length) return null
    if (!rotate) return eligibleAuthors[0]

    const lastAuthorName = readLastAuthorByGenre()[genre.toLowerCase()] || ''
    const lastIndex = eligibleAuthors.findIndex((author) => author.name === lastAuthorName)
    return eligibleAuthors[(lastIndex + 1) % eligibleAuthors.length]
  }

  async function runGenerateVoicesPreflight(story: { id: string; title?: string | null }) {
    const res = await fetch('/api/admin/generate-voices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: story.id, preflightOnly: true }),
    })
    const data = await readJsonOrDiagnostic(res, 'POST /api/admin/generate-voices')
    if (!res.ok || !data.success) {
      const reasons = Array.isArray(data.blockingReasons) ? data.blockingReasons.join('; ') : data.error || 'preflight failed'
      throw new Error(`${story.title || story.id}: generate-voices preflight failed. ${reasons}`)
    }
    return data
  }

  function isSimpleHalAutoRepairableValidatorFailure(validatorReport: string) {
    const reportText = validatorReport.trim()
    if (!reportText) return false

    return [
      /DESCRIPTION[\s\S]{0,180}(70|character|characters|fewer|too long|shorten|length)/i,
      /DESCRIPTION[\s\S]{0,180}(incomplete|truncated|cut off|dangling|mid-thought|sentence)/i,
      /TAGLINE[\s\S]{0,180}(character|characters|too long|shorten|trim|length)/i,
      /SUBTITLE[\s\S]{0,180}(character|characters|too long|shorten|trim|length)/i,
      /(excess|extra|remove|trim)[\s\S]{0,120}punctuation/i,
      /simple formatting/i,
    ].some((pattern) => pattern.test(reportText))
  }

  function getValidatorIssueLines(validatorReport: string) {
    return validatorReport
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean)
  }

  function isDescriptionOnlyValidatorFailure(validatorReport: string) {
    const issues = getValidatorIssueLines(validatorReport)
    if (issues.length === 0) return false

    return issues.every((issue) =>
      /DESCRIPTION/i.test(issue)
      && /(70|character|characters|fewer|too long|length|incomplete|truncated|cut off|dangling|mid-thought|sentence)/i.test(issue)
      && !/past-tense|forbidden|required|missing/i.test(issue)
    )
  }

  function extractScriptHeader(scriptText: string, key: string) {
    const match = scriptText.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return match?.[1]?.trim() || ''
  }

  function replaceScriptHeader(scriptText: string, key: string, value: string) {
    const headerPattern = new RegExp(`^${key}:\\s*(.+)$`, 'm')
    if (!headerPattern.test(scriptText)) return scriptText
    return scriptText.replace(headerPattern, `${key}: ${value}`)
  }

  function shortenDescriptionHeader(scriptText: string) {
    const currentDescription = extractScriptHeader(scriptText, 'DESCRIPTION')
      .replace(/\s+/g, ' ')
      .replace(/^["']|["']$/g, '')
      .trim()

    if (!currentDescription) return scriptText

    const safeMaxChars = 65
    const trailingWeakWords = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an|ancient|old|forgotten|abandoned)$/i
    const words = currentDescription.split(' ')
    let nextDescription = currentDescription.length <= safeMaxChars
      ? currentDescription
      : ''

    if (!nextDescription) {
      for (const word of words) {
        const candidate = nextDescription ? `${nextDescription} ${word}` : word
        if (candidate.length > safeMaxChars) break
        nextDescription = candidate
      }
    }

    nextDescription = (nextDescription || currentDescription.slice(0, 65))
      .replace(/[,\-:;.!?]+$/g, '')
      .trim()

    while (trailingWeakWords.test(nextDescription) && nextDescription.includes(' ')) {
      nextDescription = nextDescription.split(' ').slice(0, -1).join(' ').trim()
    }

    if (!/[.!?]$/.test(nextDescription)) {
      nextDescription = `${nextDescription}.`
    }

    return replaceScriptHeader(scriptText, 'DESCRIPTION', nextDescription)
  }

  async function runStandaloneValidation(storyIdToValidate: string) {
    const validateRes = await fetch('/api/v2/validate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: storyIdToValidate }),
    })
    const validateData = await readJsonOrDiagnostic(validateRes, 'POST /api/v2/validate-script')
    if (!validateRes.ok || !validateData.success) throw new Error(validateData.error || 'Failed to validate script')
    return validateData
  }

  async function applySimpleHalValidatorRepair({
    storyIdToRepair,
    scriptToRepair,
    validatorReport,
  }: {
    storyIdToRepair: string
    scriptToRepair: string
    validatorReport: string
  }) {
    if (!scriptToRepair.trim()) throw new Error('Cannot auto-repair validator failure because the generated script is empty.')

    let revisedScript = ''
    if (isDescriptionOnlyValidatorFailure(validatorReport)) {
      revisedScript = shortenDescriptionHeader(scriptToRepair)
    } else {
      const reviseRes = await fetch('/api/v2/apply-top-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: scriptToRepair,
          selectedFixes: [
            `VALIDATOR ERROR FIX ONLY:\n${validatorReport}\n\nApply one bounded metadata/formatting repair only. Allowed repairs: shorten DESCRIPTION to 70 characters or fewer, trim TAGLINE, remove excess punctuation, shorten SUBTITLE, or correct simple formatting. Do not rewrite the story body, plot, tone, characters, dialogue, or ending.`,
          ],
        }),
      })
      const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
      if (!reviseRes.ok || !reviseData.success) {
        throw new Error(reviseData.error || 'Hal auto-repair revision failed')
      }
      revisedScript = reviseData.revisedScript
    }

    const saveRes = await fetch('/api/v2/save-revised-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId: storyIdToRepair,
        script: revisedScript,
      }),
    })
    const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
    if (!saveRes.ok || !saveData.success) {
      throw new Error(saveData.error || 'Failed to save Hal auto-repair')
    }

    return saveData.story?.script || revisedScript || scriptToRepair
  }

  async function validateStandaloneWithOneAutoRepair({
    storyIdToValidate,
    initialScript,
  }: {
    storyIdToValidate: string
    initialScript: string
  }) {
    let currentScript = initialScript
    let autoRepairApplied = false
    let validateData = await runStandaloneValidation(storyIdToValidate)

    setStatus(validateData.story.status)
    setReport(validateData.story.validator_report || '')

    if (validateData.story.status === 'validator_passed') {
      return { validateData, currentScript, autoRepairApplied }
    }

    const validatorReport = validateData.story.validator_report || ''
    if (!isSimpleHalAutoRepairableValidatorFailure(validatorReport)) {
      return { validateData, currentScript, autoRepairApplied }
    }

    autoRepairApplied = true
    setWorkingMessage('Hal is auto-repairing a simple validator issue...')
    currentScript = await applySimpleHalValidatorRepair({
      storyIdToRepair: storyIdToValidate,
      scriptToRepair: currentScript,
      validatorReport,
    })
    setScript(currentScript)
    setStatus('script_revised')

    setWorkingMessage('Revalidating repaired script...')
    validateData = await runStandaloneValidation(storyIdToValidate)
    setStatus(validateData.story.status)
    setReport(validateData.story.validator_report || '')

    return { validateData, currentScript, autoRepairApplied }
  }

  function syncStandaloneReadyState({
    nextStoryId,
    nextTitle,
    nextScript,
    nextReviewText,
    nextReviewTotal,
  }: {
    nextStoryId: string
    nextTitle: string
    nextScript: string
    nextReviewText: string
    nextReviewTotal: number | null
  }) {
    setSeriesPackage(null)
    setStoryId(nextStoryId)
    setTitle(nextTitle)
    setScript(nextScript)
    setReviewText(nextReviewText)
    setReviewTotal(nextReviewTotal)
    setStatus('validator_passed')
    setHalPreflightPassedStoryId(nextStoryId)
    setScriptDirty(false)
  }

  async function runHalCanonicalIntake() {
    if (loading || hasActiveAction) return
    console.log("[CREATE STORY PROMPT]", effectiveHalIntake)
    const genre = effectiveHalIntake.genre.trim()
    const runtimeMinutes = Math.max(1, Number(effectiveHalIntake.runtime_minutes || 15))
    const episodeCount = Number(effectiveHalIntake.episode_count || 1)
    const storyType = episodeCount === 1 ? 'standalone' : 'series'
    const standaloneExceptionRequested = episodeCount === STANDALONE_EXCEPTION_EPISODE_COUNT
    const author = chooseCanonicalAuthor(genre, queueAuthorTarget, true)

    if (!genre) {
      setReport('Genre is required.')
      setStepMessage('Hal intake blocked')
      return
    }
    if (standaloneExceptionRequested && !standaloneExceptionEnabled) {
      setReport('Standalone generation is reserved for repairs, legacy stories, and manual exception cases. Enable the Standalone Exception path to continue.')
      setStepMessage('Hal intake blocked')
      return
    }
    if (!HAL_EPISODE_COUNTS.includes(episodeCount) && !(standaloneExceptionEnabled && standaloneExceptionRequested)) {
      setReport('Episode count must be 3, 5, 7, or 13 for normal series-first V2 production. Standalone requires the explicit exception path.')
      setStepMessage('Hal intake blocked')
      return
    }
    if (!author) {
      setReport(`No approved ET author is configured for ${genre}. Add or retag an author before running canonical intake.`)
      setStepMessage('Hal intake blocked')
      return
    }
    if (!author.style_reference) {
      setReport(`${author.name} is missing author style metadata. Canonical intake requires approved author style data.`)
      setStepMessage('Hal intake blocked')
      return
    }
    writeLastAuthorForGenre(genre, author.name)

    setActiveAction('halIntake')
    setLoading(true)
    setActiveStep('brief')
    setWorkingMessage('Hal is building the canonical production workflow...')
    setStepMessage('Hal intake running')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    clearLoadedProductionState()

    const premise = effectiveHalIntake.optional_premise.trim() || `Claude may generate an original ${genre} premise consistent with a ${runtimeMinutes}-minute ${storyType === 'series' ? `${episodeCount}-episode series` : 'manual standalone exception story'}.`
    const setting = `Claude may choose a story-specific setting consistent with ${genre}, ${runtimeMinutes} minutes, and Endless Tales audio production.`
    const runtime = `${runtimeMinutes} min`
    const canonicalRequirements = [
      'Canonical Hal intake.',
      'Use approved Endless Tales author and narrator systems only.',
      'Do not create duplicate rows.',
      'Run script validation and generate-voices preflight before audio production.',
      'No automatic publish.',
      'Final review target after audio production is status=audio_ready, is_hidden=true, published_on=null.',
      storyType === 'series'
        ? 'Create ordered episodes with deterministic numbering, narrator continuity, and character voice continuity across episodes.'
        : 'Create one standalone exception story for repair, legacy, or manually approved use.',
    ].join(' ')

    try {
      if (storyType === 'standalone') {
        const briefBody = {
          type: 'standalone',
          title: '',
          author: author.name,
          author_style: author.style_reference,
          genre,
          narrative_voice: author.narrative_voice || '',
          premise,
          requirements: canonicalRequirements,
          setting,
          runtime,
        }
        setForm(prev => ({ ...prev, ...briefBody }))

        const briefRes = await fetch('/api/v2/story-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(briefBody),
        })
        const briefData = await readJsonOrDiagnostic(briefRes, 'GET /api/v2/story-brief')
        if (!briefRes.ok || !briefData.success) throw new Error(briefData.error || 'Failed to save canonical brief')
        const nextStoryId = briefData.story.id
        setStoryId(nextStoryId)
        setStatus(briefData.story.status)

        setActiveStep('script')
        setWorkingMessage('Generating canonical script...')
        const scriptRes = await fetch('/api/v2/generate-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: nextStoryId }),
        })
        const scriptData = await readJsonOrDiagnostic(scriptRes, 'POST /api/v2/generate-script')
        if (!scriptRes.ok || !scriptData.success) throw new Error(scriptData.error || 'Failed to generate script')
        setTitle(scriptData.story.title || '')
        setScript(scriptData.story.script || '')
        setStatus(scriptData.story.status)

        setActiveStep('score')
        setWorkingMessage('Scoring script...')
        const scoreRes = await fetch('/api/v2/score-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: nextStoryId }),
        })
        const scoreData = await readJsonOrDiagnostic(scoreRes, 'POST /api/v2/score-script')
        if (!scoreRes.ok || !scoreData.success) throw new Error(scoreData.error || 'Failed to score script')
        setReviewText(scoreData.reviewText || '')
        setReviewTotal(typeof scoreData.total === 'number' ? scoreData.total : null)

        setActiveStep('validate')
        setWorkingMessage('Validating script...')
        const { validateData, currentScript, autoRepairApplied } = await validateStandaloneWithOneAutoRepair({
          storyIdToValidate: nextStoryId,
          initialScript: scriptData.story.script || '',
        })

        if (validateData.story.status !== 'validator_passed') throw new Error(`Script validation did not pass.\n\n${validateData.story.validator_report || ''}`)

        setWorkingMessage('Running generate-voices preflight...')
        const preflight = await runGenerateVoicesPreflight({ id: nextStoryId, title: validateData.story.title || scriptData.story.title })
        syncStandaloneReadyState({
          nextStoryId,
          nextTitle: validateData.story.title || scriptData.story.title || '',
          nextScript: currentScript || scriptData.story.script || '',
          nextReviewText: scoreData.reviewText || '',
          nextReviewTotal: typeof scoreData.total === 'number' ? scoreData.total : null,
        })
        setStepMessage('Hal intake complete: standalone validated and voice preflight passed')
        setReport([
          '✓ Canonical Hal intake complete.',
          `Story ID: ${nextStoryId}`,
          `Author: ${author.name}`,
          `Type: standalone`,
          autoRepairApplied ? 'Auto-repair: applied one simple validator fix and revalidated' : 'Auto-repair: not needed',
          `Generate-voices preflight: passed`,
          `Estimated segments: ${preflight.estimatedSegmentCount?.total ?? '—'}`,
          'Next: Produce Audio from the existing ASC handoff workflow. Do not publish automatically.',
        ].join('\n'))
        return
      }

      const seriesBody = {
        type: 'series',
        title: '',
        series_name: '',
        series_total_episodes: episodeCount,
        series_episode_number: 1,
        series_is_finale: false,
        author: author.name,
        author_style: author.style_reference,
        genre,
        narrative_voice: author.narrative_voice || '',
        premise,
        requirements: canonicalRequirements,
        setting,
        runtime,
      }
      setForm(prev => ({
        ...prev,
        ...seriesBody,
        series_total_episodes: String(episodeCount),
        series_episode_number: '1',
        series_is_finale: 'false',
      }))

      setWorkingMessage('Planning canonical series package...')
      const packageRes = await fetch('/api/v2/series-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seriesBody),
      })
      const packageData = await readJsonOrDiagnostic(packageRes, 'POST /api/v2/series-package')
      if (!packageRes.ok || !packageData.success) throw new Error(formatDiagnosticReport(packageData.error) || 'Failed to create series package')
      let pkg = packageData.package as SeriesPackage
      setSeriesPackage(pkg)
      setStoryId(pkg.episodes?.[0]?.id || '')
      setTitle(pkg.series?.title || '')
      setStatus((pkg.episodes?.[0]?.status || 'brief_complete') as V2Status)

      setActiveStep('script')
      setWorkingMessage('Generating all episode scripts...')
      const scriptsRes = await fetch('/api/v2/series-package/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: pkg.series.id }),
      })
      const scriptsData = await readJsonOrDiagnostic(scriptsRes, 'POST /api/v2/series-package/generate-scripts')
      if (!scriptsRes.ok || !scriptsData.success) throw new Error(formatDiagnosticReport(scriptsData.error) || 'Failed to generate series scripts')
      pkg = scriptsData.package as SeriesPackage
      setSeriesPackage(pkg)

      setActiveStep('validate')
      setWorkingMessage('Scoring and validating all episodes...')
      const validatePackageRes = await fetch('/api/v2/series-package/score-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: pkg.series.id }),
      })
      const validatePackageData = await readJsonOrDiagnostic(validatePackageRes, 'POST /api/v2/series-package/score-validate')
      if (!validatePackageRes.ok || !validatePackageData.success) throw new Error(formatDiagnosticReport(validatePackageData.error) || 'Failed to score/validate series package')
      pkg = validatePackageData.package as SeriesPackage
      setSeriesPackage(pkg)

      const failedEpisode = pkg.episodes.find((episode) => {
        const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
        return !(episode.status === 'validator_passed' || validation === 'PASS')
      })
      if (failedEpisode) throw new Error(`Episode ${failedEpisode.episode_number || failedEpisode.series_episode_number} did not pass validation.`)

      setWorkingMessage('Running generate-voices preflight for all episodes...')
      const preflights = []
      for (const episode of pkg.episodes) {
        preflights.push(await runGenerateVoicesPreflight({ id: episode.id, title: episode.title }))
      }

      setStepMessage('Hal intake complete: series validated and voice preflight passed')
      setReport([
        '✓ Canonical Hal intake complete.',
        `Series ID: ${pkg.series.id}`,
        `Series: ${pkg.series.title}`,
        `Author: ${author.name}`,
        `Episodes: ${pkg.episodes.length}`,
        `Generate-voices preflight: passed for ${preflights.length} episodes`,
        'Next: Produce Audio from the existing ordered ASC package workflow. Do not publish automatically.',
      ].join('\n'))
    } catch (e) {
      setReport(formatDiagnosticReport(e) || 'Unknown error')
      setStepMessage('Hal intake stopped')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  function getStepState(step: 'brief' | 'script' | 'score' | 'validate'): StepState {
    if (activeStep === step && loading) return 'running'
    if (step === 'brief') {
      if (['brief_complete', 'script_drafted', 'script_revised', 'validator_passed', 'validator_failed'].includes(status)) return 'complete'
      return 'waiting'
    }
    if (step === 'script') {
      if (!storyId) return 'locked'
      if (['script_drafted', 'script_revised', 'validator_passed', 'validator_failed'].includes(status)) return 'complete'
      return canGenerate ? 'waiting' : 'locked'
    }
    if (step === 'score') {
      if (!storyId) return 'locked'
      if (seriesPackage) {
        if (seriesPackage.episodes.every((episode) => !!episode.script_json?.pre_audio_review)) return 'complete'
        return canScore ? 'waiting' : 'locked'
      }
      if (reviewText) return 'complete'
      return canScore ? 'waiting' : 'locked'
    }
    if (step === 'validate') {
      if (!storyId) return 'locked'
      if (seriesPackage) {
        if (seriesPackage.episodes.some((episode) => episode.status === 'validator_failed')) return 'failed'
        if (seriesPackage.episodes.length > 0 && seriesPackage.episodes.every((episode) => episode.status === 'validator_passed')) return 'complete'
        return canValidate ? 'waiting' : 'locked'
      }
      if (status === 'validator_passed') return 'complete'
      if (status === 'validator_failed') return 'failed'
      return canValidate ? 'waiting' : 'locked'
    }
    return 'locked'
  }

  async function applyEpisodeTopFix(episode: SeriesEpisodePlan, fix: TopFix, index: number) {
    if (!episode.script) {
      setReport(`Episode ${episode.episode_number || episode.series_episode_number || '?'} has no script to revise.`)
      return
    }

    const applyKey = `${episode.id}:${index}`
    const beforeScore = typeof episode.script_json?.pre_audio_review?.total === 'number'
      ? episode.script_json.pre_audio_review.total
      : typeof episode.script_json?.series_score_validate?.score_total === 'number'
        ? episode.script_json.series_score_validate.score_total
        : null
    setApplyingTopFixKey(applyKey)
    setActiveAction('episodeTopFix')
    setStepMessage(`Applying ${fix.area.toLowerCase()} fix to Episode ${episode.episode_number || episode.series_episode_number || '?'}`)
    setEpisodeRepairStatus(prev => ({
      ...prev,
      [episode.id]: `Repairing episode fix... Last started: ${new Date().toLocaleTimeString()}`,
    }))

    try {
      const reviseRes = await fetch('/api/v2/apply-top-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: episode.script,
          selectedFixes: [`${fix.area}: ${fix.text}`],
        }),
      })
      const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
      if (!reviseRes.ok || !reviseData.success) {
        throw new Error(reviseData.error || 'Claude revision failed')
      }

      const saveRes = await fetch('/api/v2/save-revised-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: episode.id,
          script: reviseData.revisedScript,
        }),
      })
      const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to save revised script')
      }

      let refreshedEpisode: SeriesEpisodePlan | null = null
      let afterScore: number | null = null
      try {
        const rescoreRes = await fetch('/api/v2/series-package/score-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId: seriesPackage?.series?.id }),
        })
        const rescoreData = await readJsonOrDiagnostic(rescoreRes, 'POST /api/v2/series-package/score-validate')
        if (rescoreData?.package) {
          const pkg = rescoreData.package as SeriesPackage
          setSeriesPackage(pkg)
          refreshedEpisode = pkg.episodes.find((candidate) => candidate.id === episode.id) || null
          const refreshedScore = refreshedEpisode?.script_json?.pre_audio_review?.total ?? refreshedEpisode?.script_json?.series_score_validate?.score_total
          afterScore = typeof refreshedScore === 'number' ? refreshedScore : null
        }
      } catch (refreshErr) {
        console.error('Episode score refresh after fix failed', refreshErr)
      }

      const updatedEpisode: SeriesEpisodePlan = {
        ...episode,
        script: saveData.story?.script || reviseData.revisedScript,
        status: saveData.story?.status || 'script_revised',
        validator_result: null,
        validator_report: null,
        validator_passed_at: null,
      }
      const displayEpisode = refreshedEpisode || updatedEpisode

      if (!refreshedEpisode) {
        setSeriesPackage((pkg) => {
          if (!pkg) return pkg
          return {
            ...pkg,
            episodes: pkg.episodes.map((candidate) => candidate.id === episode.id ? updatedEpisode : candidate),
          }
        })
      }
      setEpisodeDetailModal({ kind: 'score', episode: displayEpisode })
      const resultMessage = typeof beforeScore === 'number' && typeof afterScore === 'number' && afterScore > beforeScore
        ? `Score improved ${beforeScore} → ${afterScore}`
        : typeof beforeScore === 'number' && typeof afterScore === 'number' && afterScore <= beforeScore
          ? 'No meaningful improvement detected'
          : 'Fix applied successfully'
      const timestamp = new Date().toLocaleTimeString()
      setEpisodeRepairStatus(prev => ({
        ...prev,
        [episode.id]: `${resultMessage}. Last repaired: ${timestamp}`,
      }))
      setReport(`${resultMessage} for Episode ${episode.episode_number || episode.series_episode_number || '?'}: ${episode.title}`)
      setStepMessage('Episode score card refreshed after repair.')
    } catch (e) {
      const timestamp = new Date().toLocaleTimeString()
      setEpisodeRepairStatus(prev => ({
        ...prev,
        [episode.id]: `Claude repair failed. Last repaired: ${timestamp}`,
      }))
      setReport(`Claude repair failed.\n\n${formatDiagnosticReport(e) || 'Unknown error'}`)
      setStepMessage('Top fix revision failed')
    } finally {
      setApplyingTopFixKey('')
      setActiveAction('')
    }
  }

  async function applyEpisodeValidatorFix(episode: SeriesEpisodePlan) {
    if (!episode.script || !episode.validator_report) {
      setReport(`Episode ${episode.episode_number || episode.series_episode_number || '?'} needs a script and validator report before repair.`)
      return
    }

    const applyKey = `${episode.id}:validator`
    const previousScript = episode.script
    setApplyingTopFixKey(applyKey)
    setActiveAction('episodeTopFix')
    setStepMessage(`Fixing validator errors for Episode ${episode.episode_number || episode.series_episode_number || '?'}`)
    setEpisodeRepairStatus(prev => ({
      ...prev,
      [episode.id]: `Repairing validator issue... Last started: ${new Date().toLocaleTimeString()}`,
    }))

    try {
      const reviseRes = await fetch('/api/v2/apply-top-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: episode.script,
          selectedFixes: [
            `VALIDATOR ERROR FIX ONLY:\n${episode.validator_report}\n\nFix only the fields or formatting required by the validator. If DESCRIPTION is too long, rewrite only the DESCRIPTION header to 70 characters or fewer. Do not change story content unless required.`,
          ],
        }),
      })
      const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
      if (!reviseRes.ok || !reviseData.success) {
        throw new Error(reviseData.error || 'Validator revision failed')
      }

      const revisedScript = reviseData.revisedScript || ''
      const saveRes = await fetch('/api/v2/save-revised-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: episode.id,
          script: revisedScript,
        }),
      })
      const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to save validator fix')
      }

      let refreshedEpisode: SeriesEpisodePlan | null = null
      try {
        const rescoreRes = await fetch('/api/v2/series-package/score-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId: seriesPackage?.series?.id }),
        })
        const rescoreData = await readJsonOrDiagnostic(rescoreRes, 'POST /api/v2/series-package/score-validate')
        if (rescoreData?.package) {
          const pkg = rescoreData.package as SeriesPackage
          setSeriesPackage(pkg)
          refreshedEpisode = pkg.episodes.find((candidate) => candidate.id === episode.id) || null
        }
      } catch (refreshErr) {
        console.error('Episode validation refresh after fix failed', refreshErr)
      }

      const updatedEpisode: SeriesEpisodePlan = {
        ...episode,
        script: saveData.story?.script || revisedScript,
        status: 'script_revised',
        validator_result: null,
        validator_report: null,
        validator_passed_at: null,
      }
      const displayEpisode = refreshedEpisode || updatedEpisode

      if (!refreshedEpisode) {
        setSeriesPackage((pkg) => {
          if (!pkg) return pkg
          return {
            ...pkg,
            episodes: pkg.episodes.map((candidate) => candidate.id === episode.id ? updatedEpisode : candidate),
          }
        })
      }
      setEpisodeDetailModal({ kind: 'validation', episode: displayEpisode })
      const validationResult = displayEpisode.validator_result || displayEpisode.script_json?.series_score_validate?.validator_result
      const resultMessage = displayEpisode.status === 'validator_passed' || validationResult === 'PASS'
        ? 'Fix applied successfully'
        : 'Validation failed, previous script restored'
      const timestamp = new Date().toLocaleTimeString()

      if (resultMessage.startsWith('Validation failed')) {
        await fetch('/api/v2/save-revised-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId: episode.id,
            script: previousScript,
          }),
        })
      }

      setEpisodeRepairStatus(prev => ({
        ...prev,
        [episode.id]: `${resultMessage}. Last repaired: ${timestamp}`,
      }))
      setReport(`${resultMessage} for Episode ${episode.episode_number || episode.series_episode_number || '?'}: ${episode.title}`)
      setStepMessage(resultMessage)
    } catch (e) {
      const timestamp = new Date().toLocaleTimeString()
      setEpisodeRepairStatus(prev => ({
        ...prev,
        [episode.id]: `Claude repair failed. Last repaired: ${timestamp}`,
      }))
      setReport(`Claude repair failed.\n\n${formatDiagnosticReport(e) || 'Unknown error'}`)
      setStepMessage('Episode validator fix failed')
    } finally {
      setApplyingTopFixKey('')
      setActiveAction('')
    }
  }

  async function applyPackageIssueFixes() {
    if (!seriesPackage?.series?.id || packageFailedEpisodes.length === 0) {
      setReport('No failed package episodes are available to repair.')
      return
    }

    const failedEpisodes = packageFailedEpisodes
    const previousById = new Map(failedEpisodes.map((episode) => [episode.id, episode]))
    const savedRevisions: SeriesEpisodePlan[] = []

    setActiveAction('packageIssueFix')
    setLoading(true)
    setActiveStep('validate')
    setWorkingMessage('Repairing failed episode…')
    setStepMessage('')
    setReport('')

    try {
      for (const episode of failedEpisodes) {
        const episodeNo = episode.episode_number || episode.series_episode_number || '?'
        if (!episode.script || !episode.validator_report) {
          throw new Error(`Episode ${episodeNo} needs a script and validator report before package repair.`)
        }

        setWorkingMessage(`Repairing failed episode ${episodeNo}…`)

        const brief = episode.brief_json || {}
        const reviseRes = await fetch('/api/v2/apply-top-fixes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: episode.script,
            selectedFixes: [
              [
                'SERIES PACKAGE VALIDATOR REPAIR ONLY.',
                `Series: ${seriesPackage.series.title || ''}`,
                `Series ID: ${seriesPackage.series.id}`,
                `Episode: ${episodeNo}`,
                `Episode title: ${episode.title || brief.episode_title || ''}`,
                '',
                'SERIES BIBLE / CONTINUITY:',
                seriesPackage.series.description || brief.series_bible || 'No series bible available.',
                '',
                'EPISODE CONTINUITY NOTES:',
                brief.continuity_notes || 'No episode continuity notes available.',
                '',
                'VALIDATOR FAILURE:',
                episode.validator_report,
                '',
                'Repair only this failed episode script. Preserve series identity, episode order, title, author, narrator, continuity, and ending intent. If a speaking character appears in the script but is missing from CHARACTER GUIDE, add that character to CHARACTER GUIDE with age, gender, accent, and personality note. Do not rewrite passed episodes.',
              ].join('\n'),
            ],
          }),
        })
        const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
        if (!reviseRes.ok || !reviseData.success) {
          throw new Error(reviseData.error || `Episode ${episodeNo} package repair failed`)
        }

        const saveRes = await fetch('/api/v2/save-revised-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId: episode.id,
            script: reviseData.revisedScript,
          }),
        })
        const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
        if (!saveRes.ok || !saveData.success) {
          throw new Error(saveData.error || `Episode ${episodeNo} repaired script save failed`)
        }

        const updatedEpisode: SeriesEpisodePlan = {
          ...episode,
          script: saveData.story?.script || reviseData.revisedScript,
          status: 'script_revised',
          validator_result: null,
          validator_report: null,
          validator_passed_at: null,
        }
        savedRevisions.push(updatedEpisode)

        setSeriesPackage((pkg) => {
          if (!pkg) return pkg
          return {
            ...pkg,
            episodes: pkg.episodes.map((candidate) => candidate.id === episode.id ? updatedEpisode : candidate),
          }
        })
      }

      setWorkingMessage('Re-validating package…')
      const res = await fetch('/api/v2/series-package/score-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesPackage.series.id }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/series-package/score-validate')

      if (data?.package) {
        const pkg = data.package as SeriesPackage
        const firstEpisode = pkg.episodes?.[0]
        setSeriesPackage(pkg)
        setStoryId(firstEpisode?.id || '')
        setStatus((firstEpisode?.status || 'script_revised') as V2Status)
        setTitle(pkg.series?.title || '')
        setScript('')
      }

      if (!res.ok || !data.success) {
        const episodeNote = data?.failedEpisode ? ` Episode ${data.failedEpisode}.` : ''
        const phaseNote = data?.failurePhase ? ` Phase: ${data.failurePhase}.` : ''
        const failureReport = data?.failureReport ? `\n\n${data.failureReport}` : ''
        setReport(`${formatDiagnosticReport(data.error) || 'Package repair saved, but validation still failed.'}${episodeNote}${phaseNote}${failureReport}`)
        setStepMessage('Package repair saved; validation still needs review')
        return
      }

      const pkg = data.package as SeriesPackage
      const totals = pkg.episodes
        .map((episode) => episode.script_json?.pre_audio_review?.total)
        .filter((total): total is number => typeof total === 'number')
      const firstTotal = totals.length ? totals[0] : null
      setReviewTotal(firstTotal)
      setReviewText(`Series package score/validate complete.\n\n${pkg.episodes.map((episode) => {
        const n = episode.episode_number || episode.series_episode_number || '?'
        const total = episode.script_json?.pre_audio_review?.total
        return `Episode ${n}: ${typeof total === 'number' ? `${total}/25` : 'score recorded'}, ${episode.validator_result || episode.status}`
      }).join('\n')}`)
      setReport(`✓ Fixed package issues for ${failedEpisodes.length} episode${failedEpisodes.length === 1 ? '' : 's'} and revalidated all episodes.`)
      setStepMessage('Series package ready for ASC handoff')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      for (const revised of savedRevisions) {
        const previous = previousById.get(revised.id)
        if (!previous?.script) continue

        try {
          await fetch('/api/v2/save-revised-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storyId: previous.id,
              script: previous.script,
            }),
          })
        } catch (restoreErr) {
          console.error('Failed to restore previous episode script after package repair failure', restoreErr)
        }
      }

      setSeriesPackage((pkg) => {
        if (!pkg) return pkg
        return {
          ...pkg,
          episodes: pkg.episodes.map((episode) => previousById.get(episode.id) || episode),
        }
      })
      setReport(`Repair failed. Previous episode script restored.\n\n${formatDiagnosticReport(e) || 'Unknown error'}`)
      setStepMessage('Package issue repair failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function applyValidatorFix() {
    if (!storyId || !script || !report) {
      setReport('A script and validator report are required before applying validator fixes.')
      return
    }

    setApplyingValidatorFix(true)
    setActiveAction('validatorFix')
    setStepMessage('Applying validator fix with Claude...')

    try {
      const reviseRes = await fetch('/api/v2/apply-top-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          selectedFixes: [
            `VALIDATOR ERROR FIX ONLY:\n${report}\n\nFix only the fields or script formatting required by the validator. If DESCRIPTION is too long, rewrite only the DESCRIPTION header to 70 characters or fewer while keeping it clear, specific, present tense, and story-card friendly. Preserve title, story body, plot, tone, and ending unless the validator explicitly requires a change.`,
          ],
        }),
      })
      const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
      if (!reviseRes.ok || !reviseData.success) {
        throw new Error(reviseData.error || 'Validator revision failed')
      }

      const saveRes = await fetch('/api/v2/save-revised-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          script: reviseData.revisedScript,
        }),
      })
      const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to save validator fix')
      }

      setScript(saveData.story?.script || reviseData.revisedScript)
      setStatus((saveData.story?.status || 'script_revised') as V2Status)
      setReport('Validator fix applied. Re-run Score Script and Validate Script before producing audio.')
      setStepMessage('Validator fix applied')
      setScriptDirty(false)
      setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Validator fix failed')
    } finally {
      setApplyingValidatorFix(false)
      setActiveAction('')
    }
  }

  async function applyStandaloneTopFixes() {
    if (!storyId || !script || !reviewText) {
      setReport('A scored script and top fixes are required before applying fixes.')
      return
    }

    const fixes = parseTopFixes(reviewText)
    if (fixes.length === 0) {
      setReport('No top fixes were found in the script review.')
      return
    }
    const attemptKey = `story:${storyId}`
    const attempts = readTopFixAttemptMap()
    const currentAttempts = attempts[attemptKey] || 0
    if (currentAttempts >= MAX_TOP_FIX_ATTEMPTS_PER_SCRIPT) {
      setReport('No further automatic improvement recommended. Story is ready for audio review.')
      setStepMessage('Fix Top Fixes disabled after two automatic attempts for this story.')
      const noFurther = readNoFurtherRepairMap()
      noFurther[attemptKey] = true
      writeNoFurtherRepairMap(noFurther)
      return
    }

    const previousScript = script
    const previousStatus = status
    const previousReport = report
    const previousReviewText = reviewText
    const previousReviewTotal = reviewTotal
    const previousPreflightStoryId = halPreflightPassedStoryId
    let revisedScriptSaved = false

    setActiveAction('standaloneTopFix')
    setLoading(true)
    setActiveStep('score')
    setWorkingMessage('Fixing script…')
    setStepMessage('')
    setReport('')
    setHalPreflightPassedStoryId('')
    attempts[attemptKey] = currentAttempts + 1
    writeTopFixAttemptMap(attempts)

    try {
      const topFixesSection = fixes.map((fix, index) => `${index + 1}. ${fix}`).join('\n')
      const reviseRes = await fetch('/api/v2/apply-top-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          selectedFixes: [
            [
              'TOP FIXES TO APPLY:',
              topFixesSection,
              '',
              'FULL SCRIPT REVIEW CONTEXT:',
              reviewText,
              '',
              'CURRENT VALIDATION REPORT:',
              report || 'No validation report available.',
              '',
              'Apply only the Top Fixes above. Preserve the story identity, author, genre, title, ending, and validator-safe script format unless a listed fix explicitly requires a local script change.',
            ].join('\n'),
          ],
        }),
      })
      const reviseData = await readJsonOrDiagnostic(reviseRes, 'POST /api/v2/apply-top-fixes')
      if (!reviseRes.ok || !reviseData.success) {
        throw new Error(reviseData.error || 'Top fixes revision failed')
      }

      const saveRes = await fetch('/api/v2/save-revised-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          script: reviseData.revisedScript,
        }),
      })
      const saveData = await readJsonOrDiagnostic(saveRes, 'POST /api/v2/save-revised-script')
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to save revised script')
      }
      revisedScriptSaved = true

      const revisedScript = saveData.story?.script || reviseData.revisedScript
      setScript(revisedScript)
      setStatus((saveData.story?.status || 'script_revised') as V2Status)
      setScriptDirty(false)

      setWorkingMessage('Re-scoring…')
      const scoreRes = await fetch('/api/v2/score-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const scoreData = await readJsonOrDiagnostic(scoreRes, 'POST /api/v2/score-script')
      if (!scoreRes.ok || !scoreData.success) {
        throw new Error(scoreData.error || 'Failed to rescore revised script')
      }
      setReviewText(scoreData.reviewText || '')
      setReviewTotal(typeof scoreData.total === 'number' ? scoreData.total : null)

      const nextReviewTotal = typeof scoreData.total === 'number' ? scoreData.total : null
      if (typeof previousReviewTotal === 'number' && typeof nextReviewTotal === 'number' && nextReviewTotal < previousReviewTotal) {
        throw new Error(`Repair lowered script score from ${previousReviewTotal}/25 to ${nextReviewTotal}/25.`)
      }

      setActiveStep('validate')
      setWorkingMessage('Re-validating…')
      const validateRes = await fetch('/api/v2/validate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const validateData = await readJsonOrDiagnostic(validateRes, 'POST /api/v2/validate-script')
      if (!validateRes.ok || !validateData.success) {
        throw new Error(validateData.error || 'Failed to validate revised script')
      }
      setStatus(validateData.story.status)
      setReport(validateData.story.validator_report || '')

      if (validateData.story.status === 'validator_passed') {
        setWorkingMessage('Re-running preflight…')
        const preflight = await runGenerateVoicesPreflight({ id: storyId, title: validateData.story.title || title })
        syncStandaloneReadyState({
          nextStoryId: storyId,
          nextTitle: validateData.story.title || title,
          nextScript: revisedScript,
          nextReviewText: scoreData.reviewText || '',
          nextReviewTotal: typeof scoreData.total === 'number' ? scoreData.total : null,
        })
        setStepMessage('Top fixes applied, revised script validated, and voice preflight passed')
        if (typeof previousReviewTotal === 'number' && typeof nextReviewTotal === 'number' && nextReviewTotal <= previousReviewTotal) {
          const noFurther = readNoFurtherRepairMap()
          noFurther[attemptKey] = true
          writeNoFurtherRepairMap(noFurther)
          setStepMessage('No further automatic improvement recommended. Story is ready for audio review.')
        }
        setReport([
          validateData.story.validator_report || '✓ Validator passed.',
          '',
          `Generate-voices preflight: passed`,
          `Estimated segments: ${preflight.estimatedSegmentCount?.total ?? '—'}`,
          typeof previousReviewTotal === 'number' && typeof nextReviewTotal === 'number' && nextReviewTotal <= previousReviewTotal
            ? 'No further automatic improvement recommended. Story is ready for audio review.'
            : '',
        ].filter(Boolean).join('\n'))
      } else {
        throw new Error(validateData.story.validator_report || 'Repaired script failed validation.')
      }

      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      if (revisedScriptSaved) {
        try {
          await fetch('/api/v2/save-revised-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storyId,
              script: previousScript,
            }),
          })
          await fetch('/api/v2/score-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId }),
          })
          await fetch('/api/v2/validate-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId }),
          })
        } catch (restoreErr) {
          console.error('Failed to restore previous script after top-fix repair failure', restoreErr)
        }
      }

      setScript(previousScript)
      setStatus(previousStatus)
      setReport(`Repair failed. Previous validated script restored.\n\n${e instanceof Error ? e.message : 'Unknown error'}`)
      setReviewText(previousReviewText)
      setReviewTotal(previousReviewTotal)
      setHalPreflightPassedStoryId(previousPreflightStoryId)
      setStepMessage('Repair failed. Previous validated script restored.')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function saveBrief() {
    setTitle(form.title || '')
    if (form.type === 'series') {
      if (!SERIES_EPISODE_COUNTS.includes(Number(form.series_total_episodes))) {
        setReport('Episode Count is required for series briefs and must be 3, 5, 7, or 13')
        setStepMessage('Brief failed')
        return
      }
      await saveSeriesPackage()
      return
    }
    if (!standaloneExceptionEnabled) {
      setReport('Standalone brief creation is reserved for repairs, legacy stories, and manual exception cases. Enable the Standalone Exception path to continue.')
      setStepMessage('Brief blocked')
      return
    }
    setActiveAction('saveBrief')
    setLoading(true)
    setActiveStep('brief')
    setWorkingMessage('Saving brief...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/story-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          storyId: storyId && String(storyId).trim() ? storyId : undefined,
          series_episode_number: form.type === 'series' ? Number(form.series_episode_number || 1) : null,
          series_total_episodes: form.series_total_episodes ? Number(form.series_total_episodes) : null,
          series_is_finale: form.type === 'series' ? form.series_is_finale === 'true' : null,
        }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/story-brief')
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save brief')
      setStoryId(data.story.id)
      setStatus(data.story.status)
      setTitle(data.story.title || '')
      setReport('✓ Brief saved')
      setStepMessage('Ready for Generate Script')

      // Notify Hal via Telegram when a standalone brief is saved
      try {
        await fetch('/api/admin/send-to-orion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `📋 *New story brief saved*\n\n*Title:* ${data.story.title || form.title || 'Untitled'}\n*Genre:* ${form.genre || '—'}\n*Runtime:* ${form.runtime || '—'}\n*Author:* ${form.author || '—'}\n*Story ID:* \`${data.story.id}\`\n\nBrief is ready. Reply "create the story" to start production.`,
          }),
        })
      } catch (err) {
        console.warn('Hal notification failed (non-blocking):', err)
      }

      if (queueId && data?.story?.id) {
        try {
          const persistRes = await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2',
              title: form.title || data.story.title || '',
              premise: form.premise || '',
              setting: form.setting || '',
              primaryGenre: form.genre || '',
              duration: form.runtime || '',
              authorTarget: form.author || '',
              notes: form.requirements || ''
            }),
          })

          if (!persistRes.ok) {
            const txt = await persistRes.text()
            console.error('Persist storyId to queue failed:', txt)
          }
        } catch (err) {
          console.error('Persist storyId to queue failed:', err)
        }
      }

      try {
        if (queueId) {
          await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2'
            }),
          })
        }
      } catch (err) {
        console.error('Failed to persist storyId to queue item', err)
      }

      try {
        if (typeof window !== 'undefined' && data?.story?.id) {
          localStorage.setItem('et_last_story_id_v2', data.story.id)
          if (queueId) localStorage.setItem('et_last_queue_id_v2', queueId)
        }
      } catch (err) {
        console.error('Failed to persist last active V2 story', err)
      }

      try {
        if (queueId) {
          await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2',
              title: data.story.title || form.title || '',
              premise: form.premise || '',
              setting: form.setting || '',
              primaryGenre: form.genre || '',
              duration: form.runtime || '',
              authorTarget: form.author || '',
              notes: form.requirements || '',
            }),
          })
        }
      } catch (err) {
        console.error('Failed to persist storyId back to queue item', err)
      }
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Brief failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function saveSeriesPackage() {
    setActiveAction('saveBrief')
    setLoading(true)
    setActiveStep('brief')
    setWorkingMessage('Planning series package...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/series-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          seriesId: seriesPackage?.series?.id || undefined,
          series_total_episodes: Number(form.series_total_episodes),
        }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/series-package')
      if (!res.ok || !data.success) throw new Error(formatDiagnosticReport(data.error) || 'Failed to create series package')

      const pkg = data.package as SeriesPackage
      const firstEpisode = pkg.episodes?.[0]
      setSeriesPackage(pkg)
      setStoryId(firstEpisode?.id || '')
      setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
      setTitle(pkg.series?.title || '')
      setForm(prev => ({
        ...prev,
        title: pkg.series?.title || prev.title,
        series_name: pkg.series?.title || prev.series_name,
        series_arc_plan: pkg.series?.description || prev.series_arc_plan,
        series_episode_number: '1',
      }))
      setReport(`✓ Series package planned: ${pkg.episodes?.length || 0} episodes`)
      setStepMessage('Series package ready for episode scripting phase')

      if (typeof window !== 'undefined' && pkg.series?.id) {
        const url = new URL(window.location.href)
        url.searchParams.delete('storyId')
        url.searchParams.set('seriesId', pkg.series.id)
        window.history.replaceState({}, '', url.toString())
      }
    } catch (e) {
      setReport(formatDiagnosticReport(e) || 'Unknown error')
      setStepMessage('Series package planning failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function generateScript() {
    if (seriesPackage?.series?.id) {
      await generateSeriesScripts()
      return
    }

    setActiveAction('generateScript')
    setLoading(true)
    setActiveStep('script')
    setWorkingMessage('Generating script...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/generate-script')
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate script')
      setStatus(data.story.status)
      setTitle(data.story.title || '')
      setScript(data.story.script || '')
      setReport('✓ Script generated')
      setStepMessage('Ready for Score Script')
      setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Script generation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function generateSeriesScripts() {
    if (!seriesPackage?.series?.id) return

    setActiveAction('generateSeriesScripts')
    setLoading(true)
    setActiveStep('script')
    setWorkingMessage('Generating all episode scripts...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/series-package/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesPackage.series.id }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/series-package/generate-scripts')
      if (!res.ok || !data.success) {
        const episodeNote = data?.failedEpisode ? ` Episode ${data.failedEpisode}.` : ''
        throw new Error(`${formatDiagnosticReport(data.error) || 'Failed to generate series scripts'}${episodeNote}`)
      }

      const pkg = data.package as SeriesPackage
      const firstEpisode = pkg.episodes?.[0]
      setSeriesPackage(pkg)
      setStoryId(firstEpisode?.id || '')
      setStatus((firstEpisode?.status || 'script_drafted') as V2Status)
      setTitle(pkg.series?.title || '')
      setScript('')
      setReport(`✓ Generated scripts for ${pkg.episodes?.length || 0} episodes`)
      setStepMessage('Series scripts drafted. Ready for package score/validate phase.')
      setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(formatDiagnosticReport(e) || 'Unknown error')
      setStepMessage('Series script generation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function scoreScript() {
    if (seriesPackage?.series?.id) {
      await scoreValidateSeriesPackage()
      return
    }

    setActiveAction('scoreScript')
    setLoading(true)
    setActiveStep('score')
    setWorkingMessage('Scoring script...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/score-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/score-script')
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to score script')
      setReviewText(data.reviewText || '')
      setReviewTotal(typeof data.total === 'number' ? data.total : null)
      setReport(`✓ Script scored${typeof data.total === 'number' ? `: ${data.total}/25` : ''}`)
      setStepMessage('Ready for Validate Script')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Script scoring failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function validateScript() {
    if (seriesPackage?.series?.id) {
      await scoreValidateSeriesPackage()
      return
    }

    setActiveAction('validateScript')
    setLoading(true)
    setActiveStep('validate')
    setWorkingMessage('Validating script...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/validate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/validate-script')
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to validate script')
      setStatus(data.story.status)
      setReport(data.story.validator_report || '')
      setStepMessage(data.story.status === 'validator_passed' ? 'Ready for Produce Audio' : 'Validation failed, revise script')
      setTimeout(() => validateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Validation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  async function scoreValidateSeriesPackage() {
    if (!seriesPackage?.series?.id) return

    setActiveAction('scoreValidatePackage')
    setLoading(true)
    setActiveStep('validate')
    setWorkingMessage('Scoring and validating episodes...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/series-package/score-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesPackage.series.id }),
      })
      const data = await readJsonOrDiagnostic(res, 'POST /api/v2/series-package/score-validate')

      if (data?.package) {
        const pkg = data.package as SeriesPackage
        const firstEpisode = pkg.episodes?.[0]
        setSeriesPackage(pkg)
        setStoryId(firstEpisode?.id || '')
        setStatus((firstEpisode?.status || 'script_drafted') as V2Status)
        setTitle(pkg.series?.title || '')
        setScript('')
      }

      if (!res.ok || !data.success) {
        const episodeNote = data?.failedEpisode ? ` Episode ${data.failedEpisode}.` : ''
        const phaseNote = data?.failurePhase ? ` Phase: ${data.failurePhase}.` : ''
        const failureReport = data?.failureReport ? `\n\n${data.failureReport}` : ''
        throw new Error(`${formatDiagnosticReport(data.error) || 'Series package score/validate failed'}${episodeNote}${phaseNote}${failureReport}`)
      }

      const pkg = data.package as SeriesPackage
      const totals = pkg.episodes
        .map((episode) => episode.script_json?.pre_audio_review?.total)
        .filter((total): total is number => typeof total === 'number')
      const firstTotal = totals.length ? totals[0] : null
      setReviewTotal(firstTotal)
      setReviewText(`Series package score/validate complete.\n\n${pkg.episodes.map((episode) => {
        const n = episode.episode_number || episode.series_episode_number || '?'
        const total = episode.script_json?.pre_audio_review?.total
        return `Episode ${n}: ${typeof total === 'number' ? `${total}/25` : 'score recorded'}, ${episode.validator_result || episode.status}`
      }).join('\n')}`)
      setReport('✓ All episodes passed validation')
      setStepMessage('Series package ready for ASC handoff')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(formatDiagnosticReport(e) || 'Unknown error')
      setStepMessage('Series package score/validate failed')
      setTimeout(() => validateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
      setActiveAction('')
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-black px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Story Production V2</h1>
              <p className="text-gray-700 mt-2">Bible-first workflow: Brief → Script → Score → Validate → Produce → Grade → Publish</p>
            </div>
            <button
              type="button"
              onClick={clearAllForNewStory}
              disabled={loading || hasActiveAction}
              className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              New Story Intake
            </button>
          </div>
        </div>

        <div className="bg-white border border-black rounded-lg p-4">
          <div className="flex flex-wrap gap-2">
            <StepPill label="1. Brief" state={getStepState('brief')} />
            <StepPill label="2. Script" state={getStepState('script')} />
            <StepPill label="3. Score" state={getStepState('score')} />
            <StepPill label="4. Validate" state={getStepState('validate')} />
            <StepPill label="5. Produce Audio" state="locked" />
            <StepPill label="6. Final Grade" state="locked" />
            <StepPill label="7. Publish" state="locked" />
          </div>
          {stepMessage ? <div className="mt-3 text-sm font-medium text-green-700">{stepMessage}</div> : null}
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div>
            <div className="text-lg font-bold">Hal Story Intake</div>
            <div className="mt-2 rounded border-2 border-red-500 bg-red-50 p-2 text-sm font-bold text-red-800">
              LIVE HAL BLOCK v2
              <div className="mt-1 text-xs font-semibold text-red-700">rendered genre: {renderedHalGenre || '—'}</div>
              <div className="text-xs font-semibold text-red-700">rendered runtime: {renderedHalRuntime || '—'}</div>
              <div className="text-xs font-semibold text-red-700">rendered episodes: {renderedHalEpisodes || '—'}</div>
              <div className="text-xs font-semibold text-red-700">rendered seed length: {renderedHalSeed.length}</div>
            </div>
            <p className="mt-1 text-sm text-gray-700">
              Answer four fields. Hal fills the canonical V2 template, uses approved ET authors, runs script validation, and runs generate-voices preflight before audio production.
            </p>
            <label className="mt-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={standaloneExceptionEnabled}
                onChange={e => {
                  clearLoadedProductionStateForNewInput()
                  const enabled = e.target.checked
                  setStandaloneExceptionEnabled(enabled)
                  setHalIntake(prev => ({
                    ...prev,
                    episode_count: enabled ? String(STANDALONE_EXCEPTION_EPISODE_COUNT) : '3',
                  }))
                  setForm(prev => ({
                    ...prev,
                    type: enabled ? 'standalone' : 'series',
                    series_total_episodes: enabled ? '' : '3',
                    series_episode_number: enabled ? '' : '1',
                    series_is_finale: enabled ? 'false' : prev.series_is_finale,
                  }))
                }}
                disabled={loading || hasActiveAction}
              />
              <span>
                <span className="font-semibold">Standalone Exception</span>
                <span className="block text-xs">
                  Use only for repairs, legacy stories, or manually approved standalone cases. Normal production stays series-first.
                </span>
              </span>
            </label>
            {queueIntakeNotice ? (
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-sm font-medium text-blue-900">
                {queueIntakeNotice}
              </div>
            ) : null}
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
              <div>renderedHalGenre: {renderedHalGenre || '—'}</div>
              <div>renderedHalRuntime: {renderedHalRuntime || '—'}</div>
              <div>renderedHalEpisodes: {renderedHalEpisodes || '—'}</div>
              <div>renderedHalSeedLength: {renderedHalSeed.length}</div>
              <div>halIntake.genre: {halIntake.genre || '—'}</div>
              <div>form.genre: {form.genre || '—'}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-gray-700">1. Genre</span>
              <select
                className="w-full border rounded p-2"
                value={renderedHalGenre}
                onChange={e => {
                  const nextGenre = e.target.value
                  setHalIntake(prev => ({ ...prev, genre: nextGenre }))
                  setForm(prev => ({ ...prev, genre: nextGenre }))
                }}
                disabled={loading || hasActiveAction}
              >
                <option value="">Choose genre</option>
                {genreOptions.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-gray-700">2. Runtime</span>
              <select
                className="w-full border rounded p-2"
                value={renderedHalRuntime}
                onChange={e => {
                  const nextRuntime = e.target.value
                  setHalIntake(prev => ({ ...prev, runtime_minutes: nextRuntime }))
                  setForm(prev => ({ ...prev, runtime: `${nextRuntime} min` }))
                }}
                disabled={loading || hasActiveAction}
              >
                {['10', '15', '20', '30'].map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-gray-700">3. Episodes</span>
              <select
                className="w-full border rounded p-2"
                value={renderedHalEpisodes}
                onChange={e => {
                  const nextEpisodes = e.target.value
                  setHalIntake(prev => ({ ...prev, episode_count: nextEpisodes }))
                  setForm(prev => ({
                    ...prev,
                    type: nextEpisodes === '1' ? 'standalone' : 'series',
                    series_total_episodes: nextEpisodes === '1' ? '' : nextEpisodes,
                    series_episode_number: nextEpisodes === '1' ? '' : '1',
                  }))
                }}
                disabled={loading || hasActiveAction}
              >
                {standaloneExceptionEnabled ? (
                  <option value={String(STANDALONE_EXCEPTION_EPISODE_COUNT)}>1 episode (standalone exception)</option>
                ) : null}
                {HAL_EPISODE_COUNTS.map(count => (
                  <option key={count} value={String(count)}>{`${count} episodes (series)`}</option>
                ))}
              </select>
            </label>
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
              <div><strong>Derived type:</strong> {Number(renderedHalEpisodes || 3) === 1 ? 'Standalone exception' : 'Series'}</div>
              <div><strong>Author:</strong> {renderedHalGenre ? (selectedHalAuthor?.name || 'No approved match') : 'Choose genre'}</div>
              {selectedHalAuthor ? (
                <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                  <div>selected author: {selectedHalAuthor.name}</div>
                  <div>selection reason: {authorSelectionReason}</div>
                  <div>last author for genre: {lastAuthorForGenre || 'none'}</div>
                  <div>next author index: {nextAuthorIndex >= 0 ? nextAuthorIndex : 'none'}</div>
                  {queueAuthorTarget ? <div>queue target: {queueAuthorTarget}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-gray-700">4. Optional premise/story seed</span>
            <textarea
              className="w-full border rounded p-2"
              rows={3}
              placeholder="Optional. Leave blank and Claude will generate a premise consistent with the genre/runtime."
              value={renderedHalSeed}
              onChange={e => setHalIntake(prev => ({ ...prev, optional_premise: e.target.value }))}
              disabled={loading || hasActiveAction}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runHalCanonicalIntake}
              disabled={loading || hasActiveAction || authorsLoading}
              className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <ButtonLabel loading={activeAction === 'halIntake'}>
                {activeAction === 'halIntake' ? 'Hal Intake Running...' : 'Create Story Prompt'}
              </ButtonLabel>
            </button>
            <div className="text-xs text-gray-600">
              Stops on validation/preflight failure. Does not publish. Audio production still uses the existing ASC handoff controls after preflight passes.
            </div>
          </div>
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Title (optional, Claude can choose)" value={form.title} onChange={e => {
              clearLoadedProductionStateForNewInput()
              setForm({ ...form, title: e.target.value })
            }} />
            <select
              className="border rounded p-2"
              value={form.type}
              onChange={e => {
                clearLoadedProductionStateForNewInput()
                const nextType = e.target.value
                setForm({
                  ...form,
                  type: nextType,
                  series_episode_number: nextType === 'series' ? (form.series_episode_number || '1') : '',
                  series_total_episodes: nextType === 'series' ? (form.series_total_episodes || '3') : '',
                  series_is_finale: nextType === 'series' ? form.series_is_finale : 'false',
                })
              }}
            >
              <option value="series">Series</option>
              {standaloneExceptionEnabled ? <option value="standalone">Standalone Exception</option> : null}
            </select>
          </div>

          {form.type === 'series' ? (
            <div className="border rounded p-3 bg-gray-50 space-y-3">
              <div className="font-semibold">Series Planning</div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  className="border rounded p-2"
                  placeholder="Series Name"
                  value={form.series_name}
                  onChange={e => {
                    clearLoadedProductionStateForNewInput()
                    setForm({ ...form, series_name: e.target.value })
                  }}
                />
                <select
                  className="border rounded p-2"
                  value={form.series_total_episodes}
                  onChange={e => {
                    clearLoadedProductionStateForNewInput()
                    setForm({ ...form, series_total_episodes: e.target.value, series_episode_number: form.series_episode_number || '1' })
                  }}
                >
                  <option value="">Episode Count</option>
                  {SERIES_EPISODE_COUNTS.map(count => (
                    <option key={count} value={String(count)}>{count} episodes</option>
                  ))}
                </select>
              </div>
              <textarea
                className="border rounded p-2 w-full"
                rows={5}
                placeholder="Series Bible / Arc Plan: plan the full series continuity, character arcs, episode turns, reveals, and finale before scripting episode one."
                value={form.series_arc_plan}
                onChange={e => {
                  clearLoadedProductionStateForNewInput()
                  setForm({ ...form, series_arc_plan: e.target.value })
                }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <select className="border rounded p-2" value={form.genre} onChange={e => {
              clearLoadedProductionStateForNewInput()
              setForm({ ...form, genre: e.target.value, author: '', author_style: '', narrative_voice: '' })
            }}>
              <option value="">Choose genre first</option>
              {genreOptions.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
            <input className="border rounded p-2" placeholder="Narrative voice (optional)" value={form.narrative_voice} onChange={e => {
              clearLoadedProductionStateForNewInput()
              setForm({ ...form, narrative_voice: e.target.value })
            }} />
          </div>

          {authorsLoading ? (
            <Spinner label="Loading authors..." />
          ) : form.genre ? (
            <div className="border rounded p-3 bg-gray-50">
              <div className="font-semibold mb-2">Suggested authors for {form.genre}</div>
              {filteredAuthors.length === 0 ? (
                <div className="text-sm text-gray-600">No authors found for this genre yet.</div>
              ) : (
                <div className="space-y-2">
                  {filteredAuthors.map((author) => (
                    <button
                      key={author.id}
                      type="button"
                      onClick={() => pickAuthor(author)}
                      className={`w-full text-left border rounded p-3 ${form.author === author.name ? 'border-black bg-white' : 'border-gray-300 bg-white'}`}
                    >
                      <div className="font-semibold">{author.name}</div>
                      <div className="text-sm text-gray-700">Real author: {author.style_reference || 'Not set'}</div>
                      <div className="text-sm text-gray-700">{author.style_description || 'No style description available.'}</div>
                      <div className="text-sm text-gray-600 mt-1">Narrator: {author.narrator_name || 'Not assigned'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Author pen name" value={form.author} onChange={e => {
              clearLoadedProductionStateForNewInput()
              setForm({ ...form, author: e.target.value })
            }} />
            <input className="border rounded p-2" placeholder="Author style" value={form.author_style} onChange={e => {
              clearLoadedProductionStateForNewInput()
              setForm({ ...form, author_style: e.target.value })
            }} />
          </div>

          {selectedAuthorMeta ? (
            <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
              <div><strong>Real author:</strong> {selectedAuthorMeta.style_reference || 'Not set'}</div>
              <div><strong>Style description:</strong> {selectedAuthorMeta.style_description || 'No style description available.'}</div>
              <div><strong>Type of books:</strong> {selectedAuthorMeta.style_book_type || 'Not set'}</div>
              <div><strong>What stands out:</strong> {selectedAuthorMeta.style_signature_trait || 'Not set'}</div>
              <div><strong>Living or dead:</strong> {selectedAuthorMeta.style_author_living === false ? 'Dead' : 'Living'}</div>
              <div><strong>Year of death:</strong> {selectedAuthorMeta.style_author_death_year ?? '—'}</div>
              <div><strong>Assigned narrator:</strong> {selectedAuthorMeta.narrator_name || 'Not assigned'}</div>
            </div>
          ) : null}

          <textarea className="border rounded p-2 w-full" rows={4} placeholder="Premise" value={form.premise} onChange={e => {
            clearLoadedProductionStateForNewInput()
            setForm({ ...form, premise: e.target.value })
          }} />
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-gray-700">Notes / Constraints</span>
            <textarea
              className="border rounded p-2 w-full"
              rows={4}
              placeholder="Optional constraints for this story, such as character count, location limits, ending requirements, or audio restrictions."
              value={form.requirements}
              onChange={e => {
                clearLoadedProductionStateForNewInput()
                setForm({ ...form, requirements: e.target.value })
              }}
            />
          </label>
          <input className="border rounded p-2 w-full" placeholder="Setting" value={form.setting} onChange={e => {
            clearLoadedProductionStateForNewInput()
            setForm({ ...form, setting: e.target.value })
          }} />
          <input className="border rounded p-2 w-full" placeholder="Runtime" value={form.runtime} onChange={e => {
            clearLoadedProductionStateForNewInput()
            setForm({ ...form, runtime: e.target.value })
          }} />

          <div className="flex items-center gap-4">
            <button disabled={loading || hasActiveAction} className="bg-orange-500 text-white px-4 py-2 rounded disabled:opacity-50" onClick={saveBrief}>
              <ButtonLabel loading={activeAction === 'saveBrief'}>
                {activeAction === 'saveBrief' ? 'Saving Brief...' : 'Save Brief'}
              </ButtonLabel>
            </button>
            {loading && workingMessage ? <Spinner label={workingMessage} /> : null}
          </div>
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-3">
          <div><strong>{seriesPackage ? 'First Episode ID' : 'Story ID'}:</strong> {storyId || 'Not created yet'}</div>
          <div><strong>Status:</strong> {status || '—'}</div>
          <div><strong>Title:</strong> {title || '—'}</div>
          <div><strong>Script Score:</strong> {reviewTotal != null ? `${reviewTotal}/25` : '—'}</div>

          {seriesPackage ? (
            <div className="border rounded p-3 bg-gray-50 space-y-3">
              <div>
                <div className="font-semibold">Series Package</div>
                <div className="text-sm text-gray-700">Series ID: {seriesPackage.series.id}</div>
                <div className="text-sm text-gray-700">Episodes: {seriesPackage.episodes.length}</div>
              </div>
              <div className="text-sm whitespace-pre-wrap border rounded bg-white p-3">
                {seriesPackage.series.description || 'No series bible saved yet.'}
              </div>
              <div className="space-y-2">
                {seriesPackage.episodes.map((episode) => {
                  const score = episode.script_json?.pre_audio_review?.total ?? episode.script_json?.series_score_validate?.score_total
                  const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
                  const passed = episode.status === 'validator_passed' || validation === 'PASS'
                  const failed = episode.status === 'validator_failed' || validation === 'FAIL'
                  const state = passed ? 'Passed' : failed ? 'Failed' : 'Pending'
                  const stateClass = passed
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : failed
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-gray-200 bg-gray-50 text-gray-700'

                  return (
                  <div key={episode.id} className="border rounded bg-white p-3 text-sm">
                    <div className="font-semibold">Episode {episode.episode_number || episode.series_episode_number}: {episode.title}</div>
                    <div className={`mt-2 grid gap-2 rounded border p-2 sm:grid-cols-3 ${stateClass}`}>
                      <button
                        type="button"
                        onClick={() => setEpisodeDetailModal({ kind: 'score', episode })}
                        className="text-left underline-offset-2 hover:underline"
                      >
                        <strong>Score:</strong> {typeof score === 'number' ? `${score}/25` : 'Not scored'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEpisodeDetailModal({ kind: 'validation', episode })}
                        className="text-left underline-offset-2 hover:underline"
                      >
                        <strong>Validation:</strong> {validation || 'Not validated'}
                      </button>
                      <div><strong>State:</strong> {state}</div>
                    </div>
                    <div className="text-gray-700 mt-2">Status: {episode.status}</div>
                    <div className="text-gray-700">Script: {episode.script ? 'Generated' : 'Not generated'}</div>
                    {episode.script_json?.series_generation?.generated_at ? (
                      <div className="text-gray-600">Generated: {episode.script_json.series_generation.generated_at}</div>
                    ) : null}
                    {episode.validator_passed_at ? (
                      <div className="text-gray-600">Validated: {episode.validator_passed_at}</div>
                    ) : null}
                    {episode.status === 'validator_failed' && episode.validator_report ? (
                      <div className="text-red-700 mt-1 whitespace-pre-wrap">{episode.validator_report}</div>
                    ) : null}
                    {episode.brief_json?.description ? <div className="text-gray-700 mt-1">{episode.brief_json.description}</div> : null}
                    {episode.brief_json?.continuity_notes ? <div className="text-gray-600 mt-1">Continuity: {episode.brief_json.continuity_notes}</div> : null}
                  </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 flex-wrap">
            <button disabled={seriesPackage ? !canGeneratePackageScripts : !canGenerate || loading || hasActiveAction} className={generateActionClass} onClick={generateScript}>
              <ButtonLabel loading={activeAction === 'generateScript' || activeAction === 'generateSeriesScripts'}>
                {activeAction === 'generateSeriesScripts'
                  ? packageSomeScriptsPresent ? 'Generating Missing Episodes...' : 'Generating Episodes...'
                  : activeAction === 'generateScript'
                    ? 'Generating...'
                    : seriesPackage
                      ? packageAllScriptsPresent
                        ? '✓ Episode Scripts Generated'
                        : packageSomeScriptsPresent
                          ? 'Generate Missing Episode Scripts'
                          : packageNoScriptsPresent
                            ? 'Generate All Episode Scripts'
                            : 'Generate All Episode Scripts'
                      : 'Generate Script'}
              </ButtonLabel>
            </button>
            <button disabled={!canScore || loading || hasActiveAction} className={scoreActionClass} onClick={scoreScript}>
              <ButtonLabel loading={activeAction === 'scoreScript' || activeAction === 'scoreValidatePackage'}>
                {activeAction === 'scoreValidatePackage'
                  ? 'Scoring + Validating...'
                  : activeAction === 'scoreScript'
                    ? 'Scoring...'
                    : seriesPackage
                      ? packageAllValidationsPass ? '✓ Score + Validate All Episodes' : 'Score + Validate All Episodes'
                      : 'Score Script'}
              </ButtonLabel>
            </button>
            {!seriesPackage ? (
              <button disabled={!canValidate || loading || hasActiveAction} className={validateActionClass} onClick={validateScript}>
                <ButtonLabel loading={activeAction === 'validateScript'}>
                  {activeAction === 'validateScript' ? 'Validating...' : 'Validate Script'}
                </ButtonLabel>
              </button>
            ) : null}
            <button
              disabled={!canProceedToAudioProduction}
              className={produceActionClass}
              onClick={async () => {
                console.log("[V2→ASC] proceed clicked", { storyId, title, status, hasScript: !!script, halPreflightPassedStoryId });
                try {
                  setActiveAction('produceAudio')
                  setLoading(true)
                  setActiveStep('produce')
                  setWorkingMessage('Preparing ASC handoff...')
                  setStepMessage('Preparing ASC handoff...')

                  if (seriesPackage?.series?.id) {
                    const res = await fetch('/api/v2/series-package/produce-audio', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ seriesId: seriesPackage.series.id }),
                    })

                    const data = await readJsonOrDiagnostic(res, 'POST /api/v2/series-package/produce-audio')
                    if (!res.ok || !data.success) {
                      throw new Error(formatDiagnosticReport(data.error) || 'Failed to prepare series package ASC handoff')
                    }

                    if (data?.package) {
                      const pkg = data.package as SeriesPackage
                      const firstEpisode = pkg.episodes?.[0]
                      setSeriesPackage(pkg)
                      setStoryId(firstEpisode?.id || storyId)
                      setStatus((firstEpisode?.status || 'audio_pending') as V2Status)
                    }

                    if (typeof window !== 'undefined') {
                      localStorage.setItem('et_last_series_id_v2', seriesPackage.series.id)
                      localStorage.setItem('et_asc_package_handoff_v1', JSON.stringify(data.handoff))
                      localStorage.removeItem('et_asc_handoff_v1')
                    }

                    const episodeLines = (data.handoff?.episodes || [])
                      .map((episode: any) => `Episode ${episode.episodeNumber}: ${episode.title} (${episode.storyId})`)
                      .join('\n')
                    setReport(`Series package ASC handoff prepared.\n\n${episodeLines}`)
                    setStepMessage('Series package ready for ordered ASC production')
                    window.location.href = '/admin/asc'
                    return
                  }

                  const res = await fetch('/api/v2/produce-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      storyId,
                      title: form.title || title || 'Untitled Story',
                      script,
                    }),
                  })

                  const data = await readJsonOrDiagnostic(res, 'POST /api/v2/produce-audio')
                  if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to prepare ASC handoff')
                  }

                  setStatus('audio_pending')

                  try {
                    const handoff = {
                      storyId: data?.storyId || storyId || '',
                      title: form.title || title || '',
                      author: form.author || '',
                      genre: form.genre || '',
                      queueId: queueId || '',
                      script: script || '',
                      handoffPath: data?.handoffPath || '',
                      status: 'ready_for_asc',
                      updatedAt: new Date().toISOString(),
                    }
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('et_asc_handoff_v1', JSON.stringify(handoff))
                      localStorage.removeItem('et_asc_package_handoff_v1')
                    }
                  } catch (err) {
                    console.error('Failed to prepare admin ASC handoff', err)
                  }

                  try {
                    if (queueId) {
                      await fetch('/api/admin/story-queue', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: queueId, status: 'ready_for_asc' }),
                      })
                    }
                  } catch (err) {
                    console.error('Failed to mark queue ready_for_asc', err)
                  }

                  setReport((prev: string) => {
                    const note = `ASC handoff prepared. ${data?.handoffPath || ''}`.trim()
                    return prev ? `${prev}\n\n${note}` : note
                  })
                  setStepMessage('Sent to ASC')

                  window.location.href = '/admin/asc'
                  return
                } catch (e) {
                  setReport(e instanceof Error ? e.message : 'Unknown error')
                  setStepMessage('Produce Audio failed')
                } finally {
                  setLoading(false)
                  setWorkingMessage('')
                  setActiveStep('')
                  setActiveAction('')
                }
              }}
            >
              <ButtonLabel loading={activeAction === 'produceAudio'}>
                {activeAction === 'produceAudio' ? 'Preparing Audio Handoff...' : 'Proceed to Audio Production'}
              </ButtonLabel>
            </button>
          </div>
          {seriesPackage ? (
            <div className="rounded border border-gray-300 bg-gray-50 p-2 text-xs text-gray-700">
              <strong>Produce readiness:</strong>{' '}
              package {packageExists ? 'yes' : 'no'} | episodes {packageEpisodeCount} | scripts {packageAllScriptsPresent ? 'yes' : 'no'} | validation {packageAllValidationsPass ? 'PASS' : 'not ready'} | loading {loading ? 'yes' : 'no'}
            </div>
          ) : null}
          <div className={`rounded border p-3 text-sm ${readyForHal ? 'border-green-600 bg-green-50 text-green-900' : 'border-amber-500 bg-amber-50 text-amber-900'}`}>
            <div className="font-semibold">{readyForHal ? 'Ready for Hal: Produce Audio' : 'Not ready for Hal'}</div>
            <div className="mt-2 grid gap-1 text-xs">
              {seriesPackage ? (
                <>
                  <div>Package saved: {packageExists ? 'yes' : 'no'}</div>
                  <div>Episode scripts generated: {packageAllScriptsPresent ? 'yes' : 'no'}</div>
                  <div>Episode validations passed: {packageAllValidationsPass ? 'yes' : 'no'}</div>
                  <div>No action running: {halNoActionRunning ? 'yes' : 'no'}</div>
                </>
              ) : (
                <>
                  <div>Story saved: {storyId ? 'yes' : 'no'}</div>
                  <div>Script generated: {script ? 'yes' : 'no'}</div>
                  <div>Validation passed: {status === 'validator_passed' ? 'yes' : 'no'}</div>
                  <div>Generate-voices preflight passed: {storyId && halPreflightPassedStoryId === storyId ? 'yes' : 'no'}</div>
                  <div>No action running: {halNoActionRunning ? 'yes' : 'no'}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {!isPackageMode ? (
          <div className="bg-white border border-black rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Action Report</div>
              {storyId ? (
                <button
                  className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
                  disabled={loading || hasActiveAction}
                  onClick={() => reloadSavedStory(storyId)}
                >
                  <ButtonLabel loading={activeAction === 'reloadSavedStory'}>
                    Reload Saved Story
                  </ButtonLabel>
                </button>
              ) : null}
            </div>
            {loading && workingMessage ? <Spinner label={workingMessage} /> : null}
            {stepMessage ? <div className="text-sm font-medium text-green-700">{stepMessage}</div> : null}
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
              <div>Queue loaded into Hal Intake: {queueLoadedIntoHalIntake ? 'yes' : 'no'}</div>
              <div>renderedHalGenre: {renderedHalGenre || '—'}</div>
              <div>renderedHalRuntime: {renderedHalRuntime || '—'}</div>
              <div>renderedHalEpisodes: {renderedHalEpisodes || '—'}</div>
              <div>renderedHalSeedLength: {renderedHalSeed.length}</div>
              <div>halIntake.genre: {halIntake.genre || '—'}</div>
              <div>form.genre: {form.genre || '—'}</div>
            </div>
            {report ? (
              <pre className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{formatDiagnosticReport(report)}</pre>
            ) : null}
            {!workingMessage && !stepMessage && !report ? (
              <div className="text-sm text-gray-500">No action report yet.</div>
            ) : null}
          </div>
        ) : null}

        {isPackageMode ? (
          <div className="bg-white border border-black rounded-lg p-4 space-y-3">
            <div className="font-semibold">Package Report</div>
            {loading && workingMessage ? <Spinner label={workingMessage} /> : null}
            {stepMessage ? <div className="text-sm font-medium text-green-700">{stepMessage}</div> : null}
            {reviewText ? (
              <pre ref={reviewRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{reviewText}</pre>
            ) : null}
            {report ? (
              <pre ref={validateRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{formatDiagnosticReport(report)}</pre>
            ) : null}
            {packageFailedEpisodes.length > 0 ? (
              <button
                type="button"
                disabled={!canFixPackageIssues}
                onClick={applyPackageIssueFixes}
                className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <ButtonLabel loading={activeAction === 'packageIssueFix'}>
                  {activeAction === 'packageIssueFix' ? (workingMessage || 'Repairing failed episode…') : 'Fix Package Issues'}
                </ButtonLabel>
              </button>
            ) : null}
            {!workingMessage && !stepMessage && !reviewText && !report ? (
              <div className="text-sm text-gray-500">No package report yet.</div>
            ) : null}
          </div>
        ) : null}

        {!isPackageMode ? (
          <>
            <div className="bg-white border border-black rounded-lg p-4 space-y-2">
              <div className="font-semibold">Generated Script</div>
              {!!script ? (
                <textarea ref={scriptRef} className="border rounded p-2 w-full h-80" value={script} readOnly />
              ) : (
                <div className="text-sm text-gray-500">No script generated yet.</div>
              )}
            </div>

            <div className="bg-white border border-black rounded-lg p-4 space-y-2">
              <div className="font-semibold">Script Review</div>
              {!!reviewText ? (
                <>
                  {canFixStandaloneTopFixes ? (
                    <button
                      type="button"
                      disabled={!canFixStandaloneTopFixes}
                      onClick={applyStandaloneTopFixes}
                      className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <ButtonLabel loading={activeAction === 'standaloneTopFix'}>
                        {activeAction === 'standaloneTopFix' ? (workingMessage || 'Fixing script…') : 'Fix Top Fixes'}
                      </ButtonLabel>
                    </button>
                  ) : null}
                  {storyId && script && reviewTotal !== 25 ? (
                    <div className="text-xs text-gray-600">
                      Fix attempts for this script: {topFixAttempts}/{MAX_TOP_FIX_ATTEMPTS_PER_SCRIPT}
                      {noFurtherTopFixRecommended ? ' · No further automatic improvement recommended.' : ''}
                    </div>
                  ) : null}
                  <pre ref={reviewRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{reviewText}</pre>
                </>
              ) : (
                <div className="text-sm text-gray-500">No script review yet.</div>
              )}
            </div>

            <div className="bg-white border border-black rounded-lg p-4 space-y-2">
              <div className="font-semibold">Validation Report</div>
              {!!report ? (
                <>
                  {status === 'validator_failed' && script ? (
                    <button
                      type="button"
                      disabled={applyingValidatorFix || loading || hasActiveAction}
                      onClick={applyValidatorFix}
                      className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <ButtonLabel loading={activeAction === 'validatorFix'}>
                        {activeAction === 'validatorFix' ? 'Fixing Validator Errors...' : 'Fix Validator Errors with Claude'}
                      </ButtonLabel>
                    </button>
                  ) : null}
                  <pre ref={validateRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{report}</pre>
                </>
              ) : (
                <div className="text-sm text-gray-500">No validation output yet.</div>
              )}
            </div>
          </>
        ) : null}

        {episodeDetailModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 text-black shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold">
                    {episodeDetailModal.kind === 'score' ? 'Score Details' : 'Validation Details'}
                  </div>
	                  <div className="text-sm text-gray-700">
	                    Episode {episodeDetailModal.episode.episode_number || episodeDetailModal.episode.series_episode_number}: {episodeDetailModal.episode.title}
	                  </div>
	                  {episodeRepairStatus[episodeDetailModal.episode.id] ? (
	                    <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs font-medium text-blue-900">
	                      {episodeRepairStatus[episodeDetailModal.episode.id]}
	                    </div>
	                  ) : null}
	                </div>
                <button
                  type="button"
                  onClick={() => setEpisodeDetailModal(null)}
                  className="rounded bg-gray-200 px-3 py-2 text-sm font-medium text-black hover:bg-gray-300"
                >
                  Close
                </button>
              </div>

              {episodeDetailModal.kind === 'score' ? (
                <div className="space-y-3 text-sm">
                  {(() => {
                    const topFixes = parseTopFixDetails(episodeDetailModal.episode.script_json?.pre_audio_review?.review_text || '')
                    return topFixes.length > 0 ? (
                      <div>
                        <div className="mb-2 font-semibold">Top Fixes</div>
                        <div className="space-y-2">
                          {topFixes.map((fix, index) => {
                            const applyKey = `${episodeDetailModal.episode.id}:${index}`
                            const isApplying = applyingTopFixKey === applyKey
                            return (
                              <div key={`${fix.area}-${index}`} className="rounded border border-orange-200 bg-orange-50 p-3">
                                <div className="mb-2 flex items-start justify-between gap-3">
                                  <div className="font-semibold text-orange-900">
                                    {index + 1}. {fix.area}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!!applyingTopFixKey || hasActiveAction || !episodeDetailModal.episode.script}
                                    onClick={() => applyEpisodeTopFix(episodeDetailModal.episode, fix, index)}
                                    className="rounded bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    <ButtonLabel loading={isApplying}>
                                      {isApplying ? 'Applying...' : 'Apply This Fix with Claude'}
                                    </ButtonLabel>
                                  </button>
                                </div>
                                <div className="whitespace-pre-wrap text-gray-900">{fix.text}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null
                  })()}
                  <div className="grid gap-2 rounded border border-green-200 bg-green-50 p-3 sm:grid-cols-2">
                    <div>
                      <strong>Total:</strong>{' '}
                      {typeof episodeDetailModal.episode.script_json?.pre_audio_review?.total === 'number'
                        ? `${episodeDetailModal.episode.script_json.pre_audio_review.total}/25`
                        : typeof episodeDetailModal.episode.script_json?.series_score_validate?.score_total === 'number'
                          ? `${episodeDetailModal.episode.script_json.series_score_validate.score_total}/25`
                          : 'Not scored'}
                    </div>
                    <div>
                      <strong>Scored:</strong>{' '}
                      {episodeDetailModal.episode.script_json?.pre_audio_review?.reviewed_at
                        || episodeDetailModal.episode.script_json?.series_score_validate?.scored_at
                        || 'Not available'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Review Text</div>
                    <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-3">
                      {formatDetailValue(episodeDetailModal.episode.script_json?.pre_audio_review?.review_text)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {(() => {
                    const validationResult = episodeDetailModal.episode.validator_result
                      || episodeDetailModal.episode.script_json?.series_score_validate?.validator_result
                    const canFixValidator = (
                      episodeDetailModal.episode.status === 'validator_failed'
                      || validationResult === 'FAIL'
                    ) && !!episodeDetailModal.episode.script && !!episodeDetailModal.episode.validator_report
                    const isApplying = applyingTopFixKey === `${episodeDetailModal.episode.id}:validator`

                    return canFixValidator ? (
                      <button
                        type="button"
                        disabled={!!applyingTopFixKey || hasActiveAction}
                        onClick={() => applyEpisodeValidatorFix(episodeDetailModal.episode)}
                        className="rounded bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <ButtonLabel loading={isApplying}>
                          {isApplying ? 'Fixing Validator Errors...' : 'Fix Validator Errors'}
                        </ButtonLabel>
                      </button>
                    ) : null
                  })()}
                  <div className="grid gap-2 rounded border border-green-200 bg-green-50 p-3 sm:grid-cols-2">
                    <div>
                      <strong>Result:</strong>{' '}
                      {episodeDetailModal.episode.validator_result
                        || episodeDetailModal.episode.script_json?.series_score_validate?.validator_result
                        || 'Not validated'}
                    </div>
                    <div>
                      <strong>Validated:</strong>{' '}
                      {episodeDetailModal.episode.validator_passed_at
                        || episodeDetailModal.episode.script_json?.series_score_validate?.validated_at
                        || 'Not available'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Validator Report</div>
                    <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-3">
                      {formatDetailValue(episodeDetailModal.episode.validator_report)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
