import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { annotateStories, evaluateApprovalGate } from '@/lib/story-gates'

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

// ── ASC pipeline step order (for progress % computation) ─────────────────────
const ASC_STEP_ORDER: Record<string, number> = {
  queued:                              1,
  create_story_row:                    2,
  validate_script:                     3,
  generate_episode_script:             4,
  generate_music:                      5,
  series_generate_voices:              6,
  score_validate_package:              7,
  render_final_mix:                    8,
  series_render_final_mix:             8,
  direct_recovery_complete_story_package: 9,
  ready_for_review:                   10,
  complete:                           10,
}
const ASC_STEP_LABELS: Record<string, string> = {
  queued:                              'Queued — awaiting dispatch',
  create_story_row:                    'Creating story record',
  validate_script:                     'Validating script',
  generate_episode_script:             'Writing episode script',
  generate_music:                      'Composing background music',
  series_generate_voices:              'Generating voice audio',
  score_validate_package:              'Validating audio package',
  render_final_mix:                    'Rendering final mix',
  series_render_final_mix:             'Rendering series final mix',
  direct_recovery_complete_story_package: 'Running direct recovery render',
  ready_for_review:                    'Complete — moved to Ready For Review',
  complete:                            'Production complete',
}
const ASC_TOTAL_STEPS = 10
const STALL_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours

// ── Repair category mapping ───────────────────────────────────────────────────
const REPAIR_CATEGORY_LABELS: Record<string, string> = {
  fix_intro:   'Belle Intro',
  fix_music:   'Music',
  fix_story:   'Story Body',
  fix_outro:   'Outro',
  fix_sting:   'Sting',
}

// ── Row types ─────────────────────────────────────────────────────────────────
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
  audio_url?: string | null
  cover_url?: string | null
}

type ProductionJobRow = {
  id: string
  queue_item_id?: string | null
  story_id: string | null
  series_id: string | null
  status: string | null
  current_step: string | null
  completed_at: string | null
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

// ── ATL-CONS-002 enriched ConsoleItem ─────────────────────────────────────────
export type ConsoleItem = {
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

  // Phase C.1 — approval gate
  _approvalGate?: { approvalReady: boolean; blockReasons: string[]; recommendedAction: string | null }
  _gate?: { blocked: boolean; blockedReason?: string; warnings: string[] }

  // ATL-CONS-002 — operational fields
  op?: {
    // Repair
    repairStage?: 'queued_for_repair' | 'being_repaired' | 'vega_review' | 'blocked'
    repairCategories?: string[]           // human-readable: "Belle Intro", "Music"
    parsedRepairReasons?: string[]        // per-episode reason lines parsed from repair_notes
    repairOwner?: string
    repairNextAction?: string
    repairAfterCompletion?: string
    queuePosition?: number
    waitingDays?: number

    // Production
    stepLabel?: string
    progressPct?: number
    isStalled?: boolean
    stalledHours?: number
    productionOwner?: string
    productionNextAction?: string
    productionBlocker?: string | null
    // ATL-MON-002: nested error surfacing
    errorSummary?: string | null
    recoveryAction?: string | null
    seriesDisplay?: string | null
    // ATL-OPS-001 CHANGE 1: story metadata for failed-job displays
    storyTitle?: string | null
    episodeDisplay?: string | null

    // Cold Storage
    reasonStored?: string
    recoverable?: 'YES' | 'NO' | 'MAYBE'
    coldRecommendedAction?: string

    // Queue
    queueSource?: string
    queueOwner?: string
    queueNextAction?: string
    queuePositionIndex?: number
  }

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }
  return null
}

function clean(value: unknown) { return String(value || '').trim() }
function normalizedTitleKey(value: unknown) { return clean(value).toLowerCase().replace(/\s+/g, ' ') }

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
    .map(clean).filter(Boolean).join(' / ') || null
}

function queueBrief(queueItem: QueueRow) {
  return [clean(queueItem.premise), clean(queueItem.setting)]
    .filter(Boolean).join(' ').slice(0, 420) || null
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
  const a = timestampMs(candidate.updated_at), b = timestampMs(current.updated_at)
  if (a || b) return a > b
  return timestampMs(candidate.created_at) > timestampMs(current.created_at)
}

function dedupeQueueRows(queueRows: QueueRow[]) {
  const byTitle = new Map<string, QueueRow>()
  const untitledRows: QueueRow[] = []
  for (const queueRow of queueRows) {
    const titleKey = extractQueueCoreTitle(queueRow.title)
    if (!titleKey) { untitledRows.push(queueRow); continue }
    const existing = byTitle.get(titleKey)
    if (!existing || isNewerQueueRow(queueRow, existing)) byTitle.set(titleKey, queueRow)
  }
  return [...Array.from(byTitle.values()), ...untitledRows]
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
    if (titleKey && blockingTitleKeys.has(titleKey)) { excludedRows.push(queueRow); continue }
    visibleRows.push(queueRow)
  }
  if (excludedRows.length > 0) {
    console.info('[production-console] Filtered queue items already in workflow', { excludedCount: excludedRows.length })
  }
  return visibleRows
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
  return { series, standalone }
}

// ── ATL-CONS-002: Repair enrichment ──────────────────────────────────────────

function repairCategoriesFromChecklist(checklist: unknown): string[] {
  if (!checklist || typeof checklist !== 'object') return []
  const c = checklist as Record<string, unknown>
  const audioAsc = Array.isArray(c.audio_asc) ? c.audio_asc as string[] : []
  return audioAsc
    .map((key) => REPAIR_CATEGORY_LABELS[key] || key)
    .filter(Boolean)
}

function repairStageFromChecklist(checklist: unknown): 'queued_for_repair' | 'being_repaired' | 'vega_review' | 'blocked' {
  if (!checklist || typeof checklist !== 'object') return 'queued_for_repair'
  const c = checklist as Record<string, unknown>
  const stage = String(c.stage || '').toLowerCase()
  if (stage === 'vega_review') return 'vega_review'
  if (stage === 'in_progress') return 'being_repaired'
  if (stage === 'blocked') return 'blocked'
  return 'queued_for_repair'
}

function parseRepairNotesByEpisode(repairNotes: string | null): string[] {
  if (!repairNotes) return []
  const lines = repairNotes.split('\n').map(s => s.trim()).filter(Boolean)
  // Extract bullet points and episode-specific lines
  const reasons: string[] = []
  let currentEpisode = ''
  for (const line of lines) {
    if (/^Episode\s+\d+/i.test(line) || /^Ep\s+\d+/i.test(line)) {
      currentEpisode = line.replace(/[—–:]+.*$/, '').trim()
    } else if (/^\*\s+|^[-•]\s+/.test(line)) {
      const clean = line.replace(/^\*\s+|^[-•]\s+/, '').trim()
      if (clean) reasons.push(currentEpisode ? `${currentEpisode}: ${clean}` : clean)
    }
  }
  return reasons.length > 0 ? reasons : lines.filter(l => !l.startsWith('Series:') && !l.startsWith('Repair instructions')).slice(0, 4)
}

function repairOwner(stage: string, workflowState: string | null): string {
  if (stage === 'vega_review') return 'Vega'
  if (stage === 'blocked') return 'Orion'
  if (workflowState === 'being_repaired') return 'Hal'
  return 'Hal'
}

function repairNextAction(stage: string, categories: string[]): string {
  const cats = categories.length > 0 ? categories.join(', ') : 'documented issues'
  if (stage === 'vega_review') return `Vega reviews repaired audio — verify ${cats}. Mark PASS or FAIL with notes.`
  if (stage === 'being_repaired') return `Hal re-renders ${cats} via ASC per repair_notes instructions.`
  if (stage === 'blocked') return 'Orion resolves blocker before repair can proceed.'
  return `Hal dispatches repair job to ASC — fix ${cats} per repair_notes instructions.`
}

function repairAfterCompletion(stage: string): string {
  if (stage === 'vega_review') return 'PASS → Ready For Review · FAIL → Repair Queue with Vega notes'
  return 'Hal marks repair complete → Vega Review → Ready For Review (if PASS)'
}

// ── ATL-CONS-002: Production enrichment ──────────────────────────────────────

function productionProgress(currentStep: string | null): number {
  if (!currentStep) return 0
  const stepNum = ASC_STEP_ORDER[currentStep.toLowerCase()] ?? 0
  return Math.round((stepNum / ASC_TOTAL_STEPS) * 100)
}

function productionStepLabel(currentStep: string | null): string {
  if (!currentStep) return 'Unknown step'
  return ASC_STEP_LABELS[currentStep.toLowerCase()] ?? currentStep
}

function productionOwner(currentStep: string | null, isStalled: boolean): string {
  if (isStalled) return 'Atlas (local execution required)'
  if (!currentStep) return 'Atlas'
  const step = currentStep.toLowerCase()
  if (['queued', 'create_story_row', 'validate_script', 'generate_episode_script'].includes(step)) return 'Hal'
  return 'Atlas / ASC'
}

function productionNextAction(currentStep: string | null, isStalled: boolean, stalledHours: number): string {
  if (isStalled) return `Run ASC render locally — render_final_mix cannot execute on Vercel. Stalled ${Math.round(stalledHours)}h.`
  if (!currentStep) return 'Awaiting job dispatch'
  const step = currentStep.toLowerCase()
  if (step === 'queued') return 'Hal dispatches story to ASC production pipeline'
  if (step === 'ready_for_review') return 'Complete — story moved to Ready For Review'
  return `ASC continues at next step after: ${productionStepLabel(currentStep)}`
}

function productionBlocker(currentStep: string | null, isStalled: boolean): string | null {
  if (isStalled && currentStep?.toLowerCase() === 'render_final_mix') {
    return 'render_final_mix cannot run on Vercel — requires local ASC execution environment'
  }
  return null
}

// ── ATL-CONS-002: Cold storage enrichment ────────────────────────────────────

function coldReasonStored(reviewNotes: string | null, repairNotes: string | null): string {
  const notes = (reviewNotes || '').trim()
  if (!notes) return 'No documented reason — audit required'
  if (/\[INCUBATOR\]/i.test(notes)) return 'Recovery candidate — full audio present, paused for production capacity'
  if (/Legacy dormant/i.test(notes)) return 'Legacy dormant series — cancelled before launch'
  if (/Retired catalog.*Origin/i.test(notes)) return 'Retired Origin 2.0 audio series — superseded by ASC3 standard'
  if (/Legacy draft/i.test(notes)) return 'Legacy draft scripts — no audio produced'
  if (/shell|test/i.test(notes)) return 'Shell or test record — no production content'
  if (/orphan|unnamed/i.test(notes)) return 'Orphaned from cancelled series'
  if (/incomplete|cancelled/i.test(notes)) return 'Cancelled or incomplete series'
  if (/Moved to Cold Storage/i.test(notes)) return 'Moved to Cold Storage (reason not documented)'
  return notes.replace(/\[.*?\]/g, '').trim().slice(0, 100) || 'Stored without documented reason'
}

function coldRecoverable(story: StoryRow): 'YES' | 'NO' | 'MAYBE' {
  const notes = (story.review_notes || '').toLowerCase()
  if (/\[incubator\]/i.test(notes)) return 'YES'
  if (story.audio_url && story.cover_url) return 'MAYBE'
  if (story.audio_url && !story.cover_url) return 'MAYBE'
  if (/retired catalog|legacy dormant/i.test(notes)) return 'NO'
  if (!story.audio_url) return 'NO'
  return 'MAYBE'
}

function coldRecommendedAction(story: StoryRow, recoverable: string): string {
  const notes = (story.review_notes || '').toLowerCase()
  if (/\[incubator\]/i.test(notes)) return 'Move to Production'
  if (recoverable === 'YES') return 'Move to Production'
  if (story.audio_url && recoverable === 'MAYBE') return 'Move to Repair'
  if (/retired|legacy/i.test(notes)) return 'Keep For Training'
  if (!story.audio_url) return 'Keep For Training'
  return 'Audit Required'
}

// ── ATL-CONS-002: Queue enrichment ───────────────────────────────────────────

function queueSource(queueItem: QueueRow): string {
  const src = clean(queueItem.source || queueItem.author_target)
  if (!src || src.toLowerCase() === 'null') {
    const notes = (queueItem.notes || '').toLowerCase()
    if (/google docs|gdoc/i.test(notes)) return 'Marc Google Docs'
    if (/hal/i.test(notes)) return 'Hal Generated'
    return 'Story Queue'
  }
  if (/hal/i.test(src)) return 'Hal Generated'
  if (/google/i.test(src)) return 'Marc Google Docs'
  return 'Story Queue'
}

function queueNextAction(status: string | null | undefined): string {
  const s = (status || '').toLowerCase()
  if (s === 'in_v2' || s === 'dispatched') return 'Hal dispatches to ASC — awaiting production slot'
  if (s === 'complete') return 'Production complete — verify story landed in Ready For Review'
  if (s === 'queued') return 'Hal reviews brief and dispatches to ASC'
  return 'Hal reviews queue item and confirms dispatch'
}

// ── Core item builders ────────────────────────────────────────────────────────

function itemFromStories(stories: StoryRow[], type: 'series' | 'story', jobs: ProductionJobRow[] = []): ConsoleItem {
  const sorted = [...stories].sort((a, b) => (episodeNumber(a) || 999) - (episodeNumber(b) || 999))
  const first = sorted[0]
  const seriesId = first?.series_id || null
  const affectedEpisodes = sorted.map(episodeNumber).filter((value): value is number => value !== null)
  const relatedJobs = jobs.filter((job) =>
    Boolean((seriesId && job.series_id === seriesId) || sorted.some((story) => job.story_id === story.id))
  )

  const repairChecklist = sorted.map((story) => story.repair_checklist).find(Boolean) || null
  const repairNotes = sorted.map((story) => clean(story.repair_notes)).find(Boolean) || null
  const hasDocumentedRepair = sorted.some(s => clean(s.repair_notes) || (s.repair_checklist && typeof s.repair_checklist === 'object' && Object.keys(s.repair_checklist as object).length > 0))

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
    repairNotes,
    repairChecklist,
    reviewNotes: sorted.map((story) => clean(story.review_notes)).find(Boolean) || null,
    warning: hasDocumentedRepair ? null : 'No documented repair issue found.',
    jobs: relatedJobs.map((job) => ({ id: job.id, status: job.status, currentStep: job.current_step, updatedAt: job.updated_at })),
  }
}

function itemsForStories(stories: StoryRow[], jobs: ProductionJobRow[] = []) {
  const grouped = groupStories(stories)
  return [
    ...Array.from(grouped.series.values()).map((group) => itemFromStories(group, 'series', jobs)),
    ...grouped.standalone.map((story) => itemFromStories([story], 'story', jobs)),
  ].sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''))
}

// ── ATL-CONS-002: Build repair items with enrichment ─────────────────────────

function buildRepairItems(stories: StoryRow[], jobs: ProductionJobRow[]): ConsoleItem[] {
  const base = itemsForStories(stories, jobs)
  const now = Date.now()

  return base.map((item, idx) => {
    const stage = repairStageFromChecklist(item.repairChecklist)
    const categories = repairCategoriesFromChecklist(item.repairChecklist)
    const parsedReasons = parseRepairNotesByEpisode(item.repairNotes)
    const owner = repairOwner(stage, item.workflowState)
    const updatedMs = timestampMs(item.lastUpdated)
    const waitingDays = updatedMs > 0 ? Math.floor((now - updatedMs) / (1000 * 60 * 60 * 24)) : 0

    return {
      ...item,
      op: {
        repairStage: stage,
        repairCategories: categories,
        parsedRepairReasons: parsedReasons,
        repairOwner: owner,
        repairNextAction: repairNextAction(stage, categories),
        repairAfterCompletion: repairAfterCompletion(stage),
        queuePosition: idx + 1,
        waitingDays,
      },
    }
  })
}

// ── ATL-MON-002: Error summary builder for failed / stalled production jobs ───

type ErrorSummaryResult = {
  summary: string
  recoveryAction: string | null
}

function buildErrorSummary(errorJson: any): ErrorSummaryResult | null {
  if (!errorJson || typeof errorJson !== 'object') return null

  // render_final_mix null_lufs_segments failure
  const rmr = errorJson.renderFinalMixReport
  if (rmr && typeof rmr === 'object') {
    if (rmr.kind === 'null_lufs_segments') {
      const affectedCount = Array.isArray(rmr.affectedSegments) ? rmr.affectedSegments.length : '?'
      const summary = [
        `Error: ${rmr.error ?? 'NULL_LUFS_PRE_ASSEMBLY_GATE_FAILED'}`,
        `Message: ${rmr.message ?? 'Segments have null LUFS'}`,
        `Affected segments: ${affectedCount}`,
        rmr.remediation ? `Remediation: ${rmr.remediation}` : null,
      ].filter(Boolean).join(' | ')
      return {
        summary,
        recoveryAction: 'Reset job to generate_voices step — null-LUFS segments will auto-regenerate.',
      }
    }
    // Other renderFinalMixReport kinds
    const summary = [
      rmr.error ? `Error: ${rmr.error}` : null,
      rmr.message ? `Message: ${rmr.message}` : null,
    ].filter(Boolean).join(' | ')
    return { summary: summary || JSON.stringify(rmr).slice(0, 200), recoveryAction: null }
  }

  // validate_story_resolution failure
  const srr = errorJson.storyResolutionReport
  if (srr && typeof srr === 'object') {
    const parts = [
      srr.reason ? `Reason: ${srr.reason}` : null,
      srr.confidence != null ? `Confidence: ${srr.confidence}` : null,
    ].filter(Boolean)
    return {
      summary: parts.length > 0 ? parts.join(' | ') : 'Story resolution validation failed',
      recoveryAction: null,
    }
  }

  // Fallback: surface top-level error/message, then truncate full JSON
  const topLevel = [
    errorJson.error ? `Error: ${errorJson.error}` : null,
    errorJson.message ? `Message: ${errorJson.message}` : null,
    errorJson.step ? `Step: ${errorJson.step}` : null,
  ].filter(Boolean).join(' | ')

  if (topLevel) return { summary: topLevel, recoveryAction: null }

  const fallback = JSON.stringify(errorJson)
  return { summary: fallback.slice(0, 300) + (fallback.length > 300 ? '…' : ''), recoveryAction: null }
}

// ── ATL-CONS-002: Build in-production items with enrichment ──────────────────

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

function buildInProductionItems(jobs: ProductionJobRow[], stories: StoryRow[], queueById: Map<string, QueueRow>): ConsoleItem[] {
  // Show active, stalled (cancelled at render_final_mix), AND failed jobs (for ATL-MON-002 error display)
  const relevantJobs = jobs.filter((job) => {
    const status = clean(job.status).toLowerCase()
    const step = clean(job.current_step).toLowerCase()
    const isActive = ['queued', 'running', 'waiting_for_external', 'processing', 'in_progress'].includes(status)
    // Stalled: cancelled while at a render step — needs local execution
    const isStalled = status === 'cancelled' && ['render_final_mix', 'series_render_final_mix'].includes(step)
    // ATL-MON-002: failed jobs — show for visibility so Marc can read error details
    const isFailed = status === 'failed'
    return isActive || isStalled || isFailed
  })

  const storyById = new Map(stories.map((story) => [story.id, story]))
  const seriesTitles = new Map<string, string>()
  for (const [seriesId, groupedStories] of Array.from(groupStories(stories).series.entries())) {
    seriesTitles.set(seriesId, titleForStories(groupedStories))
  }

  // Deduplicate: one item per series or story
  const seen = new Set<string>()
  const items: ConsoleItem[] = []
  const now = Date.now()

  for (const job of relevantJobs) {
    const dedupeKey = job.series_id ? `series:${job.series_id}` : job.story_id ? `story:${job.story_id}` : `job:${job.id}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const story = job.story_id ? storyById.get(job.story_id) || null : null
    const queue = queuePayload(jobQueueItem(job, queueById))
    const currentStep = job.current_step
    const status = clean(job.status).toLowerCase()
    const step = clean(currentStep).toLowerCase()

    const updatedMs = timestampMs(job.updated_at)
    const stalledMs = updatedMs > 0 ? now - updatedMs : 0
    const isStalled = status === 'cancelled' && ['render_final_mix', 'series_render_final_mix'].includes(step)
    const stalledHours = stalledMs / (1000 * 60 * 60)

    const progressPct = productionProgress(currentStep)
    const stepLabel = productionStepLabel(currentStep)
    const owner = productionOwner(currentStep, isStalled)
    const nextAction = productionNextAction(currentStep, isStalled, stalledHours)
    const blocker = productionBlocker(currentStep, isStalled)

    // Series/episode context from story or job state
    const seriesName = story?.series_name || job.state_json?.seriesTitle || null
    const epNumber = story?.episode_number || null
    const epTotal = story?.series_total || job.state_json?.totalEpisodes || null

    // ATL-MON-002: surface nested error details for failed jobs
    const isFailed = status === 'failed'
    const errorSummaryResult = isFailed ? buildErrorSummary(job.error_json) : null

    // ATL-MON-002: fix series_id === null showing "unknown" — show "Standalone" instead
    const seriesDisplay = job.series_id ? (seriesTitles.get(job.series_id) || job.series_id) : 'Standalone'

    // ATL-OPS-001 CHANGE 1: story metadata for failed-job displays
    const storyTitle = story?.title || clean(job.state_json?.storyTitle || '') || null
    const episodeDisplay = epNumber ? `Ep ${epNumber}` : null

    items.push({
      key: `job:${job.id}`,
      type: job.series_id ? 'series' : story ? 'story' : 'job',
      title: jobTitle(job, storyById, seriesTitles, queueById),
      seriesId: job.series_id,
      storyId: job.story_id,
      episodeCount: queue?.episodeCount || Number(job.state_json?.totalEpisodes || (job.series_id ? 0 : 1)) || 0,
      affectedEpisodes: epNumber ? [epNumber] : [],
      workflowState: story?.workflow_state || null,
      status: job.status,
      lastUpdated: job.updated_at || job.created_at,
      owner,
      repairNotes: null,
      repairChecklist: null,
      reviewNotes: null,
      warning: null,
      jobs: [{ id: job.id, status: job.status, currentStep, updatedAt: job.updated_at }],
      queue,
      op: {
        stepLabel,
        progressPct,
        isStalled,
        stalledHours: Math.round(stalledHours),
        productionOwner: owner,
        productionNextAction: nextAction,
        productionBlocker: blocker,
        // ATL-MON-002: error details for failed jobs
        errorSummary: errorSummaryResult?.summary ?? null,
        recoveryAction: errorSummaryResult?.recoveryAction ?? null,
        seriesDisplay,
        // ATL-OPS-001 CHANGE 1: story metadata fields
        storyTitle: storyTitle || null,
        episodeDisplay: episodeDisplay || null,
      },
    })
  }

  return items
}

// ── ATL-CONS-002: Build cold storage items with enrichment ───────────────────

function buildColdStorageItems(stories: StoryRow[], jobs: ProductionJobRow[]): ConsoleItem[] {
  const base = itemsForStories(stories, jobs)
  return base.map((item) => {
    // Prefer first story's review_notes for reason derivation
    const grouped = groupStories(stories)
    const storyMatch = [
      ...Array.from(grouped.series.values()).flat(),
      ...grouped.standalone,
    ].find(s => item.key.includes(s.id) || item.key.includes(s.series_id || ''))

    const reasonStored = coldReasonStored(item.reviewNotes, item.repairNotes)
    const rec = storyMatch ? coldRecoverable(storyMatch) : (item.reviewNotes ? 'MAYBE' : 'NO')
    const recommendedAction = storyMatch ? coldRecommendedAction(storyMatch, rec) : 'Audit Required'

    return {
      ...item,
      op: {
        reasonStored,
        recoverable: rec,
        coldRecommendedAction: recommendedAction,
      },
    }
  })
}

// ── ATL-CONS-002: Build queue items with enrichment ──────────────────────────

function queueItemToConsoleItem(queueItem: QueueRow, positionIndex: number): ConsoleItem {
  const queue = queuePayload(queueItem)
  const source = queueSource(queueItem)
  const nextAction = queueNextAction(queueItem.status)
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
    owner: 'Hal',
    repairNotes: null,
    repairChecklist: null,
    reviewNotes: null,
    warning: null,
    jobs: [],
    queue,
    op: {
      queueSource: source,
      queueOwner: 'Hal',
      queueNextAction: nextAction,
      queuePositionIndex: positionIndex + 1,
    },
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const storyColumns = [
      'id', 'title', 'author', 'status', 'workflow_state',
      'review_notes', 'repair_notes', 'repair_checklist',
      'updated_at', 'created_at', 'series_id', 'series_name',
      'episode_number', 'series_total', 'series_total_episodes',
      'owner', 'audio_url', 'cover_url',
    ]
    const legacyStoryColumns = storyColumns.filter((c) => !['owner', 'audio_url', 'cover_url'].includes(c))

    let storiesResult: any = await supabase
      .from('stories')
      .select(storyColumns.join(','))
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (storiesResult.error && /owner|audio_url|cover_url|schema cache|column/i.test(storiesResult.error.message || '')) {
      storiesResult = await supabase
        .from('stories')
        .select(legacyStoryColumns.join(','))
        .order('updated_at', { ascending: false })
        .limit(1000)
      if (storiesResult.data) {
        storiesResult.data = storiesResult.data.map((s: any) => ({ ...s, owner: null, audio_url: null, cover_url: null }))
      }
    }

    if (storiesResult.error) return json({ success: false, error: storiesResult.error.message }, 500)

    const jobsResult = await supabase
      .from('production_jobs')
      .select('id,queue_item_id,story_id,series_id,status,current_step,completed_at,updated_at,created_at,state_json,error_json')
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (jobsResult.error) return json({ success: false, error: jobsResult.error.message }, 500)

    const queueResult = await supabase
      .from('story_queue_items')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1000)

    if (queueResult.error) {
      console.warn('[production-console] story_queue_items query failed — returning empty queue:', queueResult.error.message)
    }

    const stories = (storiesResult.data || []) as StoryRow[]
    const jobs = (jobsResult.data || []) as ProductionJobRow[]
    const queueRows = (queueResult.error ? [] : (queueResult.data || [])) as QueueRow[]
    const queueById = new Map(queueRows.map((item) => [item.id, item]))
    const storyByIdForAlerts = new Map(stories.map((s) => [s.id, s]))

    // Filter queue rows not already in a workflow state
    const visibleQueueRows = filterQueueRowsAlreadyInWorkflow(dedupeQueueRows(queueRows), stories)

    // Repair Queue
    const repairStories = stories.filter((s) => s.workflow_state === 'repair_queue' || s.workflow_state === 'being_repaired')

    // Cold Storage (excluding incubator)
    const storageStories = stories.filter((s) => s.workflow_state === 'cold_storage' || s.workflow_state === 'unpublished_library')
    const incubatorStories = storageStories.filter(isIncubatorTagged)
    const coldStories = storageStories.filter((s) => !isIncubatorTagged(s))

    // RFR (kept for legacy/Phase C.1 consumers — not shown in ATL-CONS-002 console)
    const rawRFRStories = stories.filter((s) => s.workflow_state === 'ready_for_review')
    const annotatedRFRStories = annotateStories(rawRFRStories as unknown as Record<string, unknown>[])
    const completedJobStoryIds = new Set<string>()
    for (const job of jobs) {
      if (!job.story_id) continue
      const status = String(job.status ?? '').toLowerCase().trim()
      const step   = String(job.current_step ?? '').toLowerCase().trim()
      const done   = Boolean(job.completed_at) && (
        status === 'complete' ||
        ['ready_for_review', 'complete_story_package', 'series_render_final_mix', 'render_final_mix'].includes(step)
      )
      if (done) completedJobStoryIds.add(job.story_id)
    }

    // ATL-OPS-001 CHANGE 2: recent failures (last 24h) for alert banner
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentFailedJobs = jobs.filter(
      (j) => clean(j.status).toLowerCase() === 'failed' && (j.updated_at || '') > cutoff24h
    )
    const recentFailures = recentFailedJobs.map((job) => {
      const story = job.story_id ? storyByIdForAlerts.get(job.story_id) || null : null
      const storyTitle = story?.title || clean(job.state_json?.storyTitle || '') || 'Unknown'
      const seriesNameForAlert = story?.series_name || null
      const seriesDisplayForAlert = seriesNameForAlert || (job.series_id ? job.series_id : 'Standalone')
      const episodeNum = story?.episode_number || null
      const episodeDisplayForAlert = episodeNum ? `Ep ${episodeNum}` : null
      const updatedMs = timestampMs(job.updated_at)
      const minutesSinceFailed = updatedMs > 0 ? Math.round((Date.now() - updatedMs) / 60000) : 0
      const errorJson = job.error_json && typeof job.error_json === 'object' ? job.error_json : {}
      const step = String(errorJson.step || job.current_step || '').trim()
      const errMsg = String(errorJson.message || errorJson.error || errorJson.reason || '').trim()
      const errorSummary = [step, errMsg].filter(Boolean).join(' — ') || 'Unknown error'
      return {
        jobId: job.id,
        storyId: job.story_id || null,
        storyTitle,
        seriesDisplay: seriesDisplayForAlert,
        episodeDisplay: episodeDisplayForAlert,
        minutesSinceFailed,
        errorSummary,
      }
    })

    return json({
      success: true,
      fetchedAt: new Date().toISOString(),
      // ATL-OPS-001 CHANGE 2: red alert banner data
      recentFailures,
      // ATL-CONS-002: four operational sections
      repairItems:      buildRepairItems(repairStories, jobs),
      inProductionItems: buildInProductionItems(jobs, stories, queueById),
      coldStorageItems:  buildColdStorageItems(coldStories, jobs),
      incubatorItems:    itemsForStories(incubatorStories, jobs),
      queueItems:        visibleQueueRows.map((row, idx) => queueItemToConsoleItem(row, idx)),
      // ATL-VIS-001: individual story counts before series grouping
      repairStoriesCount: repairStories.length,
      coldStoriesCount: storageStories.length,
      // Legacy RFR fields kept for Phase C.1 compatibility
      readyForReviewItems: annotatedRFRStories.map(annotated => {
        const storyId = String((annotated as any).id ?? '')
        const approvalGate = evaluateApprovalGate(
          annotated as unknown as Record<string, unknown>,
          completedJobStoryIds.has(storyId)
        )
        return {
          ...itemsForStories([annotated as unknown as StoryRow], jobs)[0],
          _gate: annotated._gate,
          _approvalGate: approvalGate,
        }
      }).filter(Boolean),
    })
  } catch (err: any) {
    console.error('[production-console] GET failed:', err)
    return json({ success: false, error: err?.message || 'Failed to load production console' }, 500)
  }
}
