/**
 * halReport.ts — HAL-REPORT-001
 *
 * Live pipeline status reporter for Hal's production reports.
 *
 * PROBLEM THIS SOLVES:
 * Hal's 16:00 ET report on 2026-06-14 stated that job 4e6f2f9e had "no details
 * in error_json" and appeared to be an infrastructure/stale-state blocker.
 * Orion verified the live production_jobs row had full structured error_json:
 *   kind=script_quality_editorial, marc_required=true, retry_count=2/2,
 *   playbookId=pb-014, learningIncidentId=031f320f
 *
 * Hal was reading from agent-state.json (cached org-state storage) rather than
 * querying the live production_jobs + stories tables.
 *
 * RULE: Hal MUST use buildLivePipelineReport() for all production status reports.
 *       Never derive job status from agent-state.json or org-state storage alone.
 *
 * CACHE/LIVE MISMATCH DETECTION:
 * When Hal has a cached report, pass it to detectCacheLiveMismatch() to flag
 * any field that disagrees with the live DB. The live value always wins.
 *
 * USAGE:
 *   import { buildLivePipelineReport } from '@/lib/halReport'
 *   const report = await buildLivePipelineReport(supabase)
 *   // report.jobs[*] has full structured data for each active job
 *   // report.mismatches[] describes any cache/live conflicts
 */

import { classifyTrueState, type TruthClassification } from '@/lib/pipelineTruth'
import { loadActiveMission, type ActiveMission } from '@/lib/missionContext'
import { getPlaybookByKind } from '@/lib/repairPlaybooks'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupabaseLike = {
  from: (table: string) => any
}

export type JobClassification =
  | 'terminal_failed'              // status=failed, no retry path
  | 'terminal_complete'            // status=complete or ready_for_review
  | 'active_running'               // genuinely running (lock fresh)
  | 'active_stall'                 // running but stalled
  | 'zombie'                       // status=running, lock expired
  | 'disqualified_smoke_test'      // failed mid-smoke-test, permanently disqualified
  | 'unknown'

/** A single job's full live state, enriched for Hal's status report. */
export type LiveJobReport = {
  jobId: string
  storyId: string | null
  storyTitle: string | null

  // Active mission slot
  activeMissionSlot: number | null    // 1-indexed slot in the mission stories array
  countsTowardSmokeTest: boolean
  missionDisqualified: boolean        // true if this job is already disqualified for M-1

  // Pipeline Truth classification
  trueState: TruthClassification['trueState']
  jobClassification: JobClassification

  // Raw DB state
  rawStatus: string | null
  rawCurrentStep: string | null
  rawUpdatedAt: string | null
  rawLockedAt: string | null

  // Structured error_json — LIVE from DB, never cached
  hasStructuredErrorJson: boolean
  errorKind: string | null
  errorMessage: string | null
  errorStep: string | null
  marcRequired: boolean | null
  retryCount: number | null
  maxRetries: number | null
  playbookId: string | null
  learningIncidentId: string | null
  safeResumePoint: string | null

  // Clarity flags
  isTerminal: boolean            // job will not self-advance; requires action or is done
  isActiveStall: boolean         // job is supposed to be running but isn't advancing
  isDisqualifiedForM1: boolean   // should be excluded from smoke test tracking

  // Diagnostics
  evidenceSummary: string
  ageMinutes: number | null
  lockAgeMinutes: number | null
  recommendedAction: string | null
}

export type CacheLiveMismatch = {
  jobId: string
  field: string
  cachedValue: unknown
  liveValue: unknown
  recommendation: string
}

export type LivePipelineReport = {
  generatedAt: string
  activeMission: {
    id: string
    name: string
    type: string
    status: string
    storyCount: number
  } | null
  jobs: LiveJobReport[]
  mismatches: CacheLiveMismatch[]
  smokeTestSummary: {
    totalSlots: number
    passing: number
    failed: number
    disqualified: number
    active: number
    waiting: number
  }
}

/** Shape of a raw production_jobs row returned from DB. */
type ProductionJobRow = {
  id: string
  story_id: string | null
  series_id?: string | null
  status: string | null
  current_step: string | null
  locked_at?: string | null
  updated_at?: string | null
  error_json?: any
  state_json?: any
}

/** Shape of a raw stories row returned from DB. */
type StoryRow = {
  id: string
  title: string | null
}

// ---------------------------------------------------------------------------
// Disqualification logic
// ---------------------------------------------------------------------------

/**
 * A job is disqualified for the M-1 smoke test if it:
 * - Is the specific evidence jobs we explicitly must not touch, OR
 * - Has a terminal failure with marc_required=true and retry exhausted, OR
 * - Its trueState is FAILED_NEEDS_MARC or FAILED_EMPTY_ERROR with no retry remaining
 */
const M1_DISQUALIFIED_JOB_IDS = new Set([
  // ATL-PIPE-009 evidence jobs
  'f82c650c',
  '50890c8d',
  // ATL-PIPE-010 evidence jobs
  'f0d999d0',
  'c01b6f25',
  // ATL-PIPE-011 evidence jobs
  'bcf42530',
  '709cfb2e',
  // ATL-PIPE-012 evidence jobs
  'ad9c6af9',
])

function isJobDisqualifiedForM1(
  jobId: string,
  trueState: TruthClassification['trueState'],
  errorJson: any,
): boolean {
  if (M1_DISQUALIFIED_JOB_IDS.has(jobId)) return true
  if (trueState === 'FAILED_NEEDS_MARC') {
    const retryCount = Number(errorJson?.retry_count ?? errorJson?.detail?.retry_count ?? NaN)
    const maxRetries = Number(errorJson?.max_retries ?? errorJson?.detail?.max_retries ?? NaN)
    // If retry exhausted (count === max) → disqualified
    if (Number.isFinite(retryCount) && Number.isFinite(maxRetries) && retryCount >= maxRetries) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Error JSON extraction
// ---------------------------------------------------------------------------

function extractErrorJsonFields(errorJson: any): {
  hasStructuredErrorJson: boolean
  errorKind: string | null
  errorMessage: string | null
  errorStep: string | null
  marcRequired: boolean | null
  retryCount: number | null
  maxRetries: number | null
  playbookId: string | null
  learningIncidentId: string | null
  safeResumePoint: string | null
} {
  const empty = {
    hasStructuredErrorJson: false,
    errorKind: null,
    errorMessage: null,
    errorStep: null,
    marcRequired: null,
    retryCount: null,
    maxRetries: null,
    playbookId: null,
    learningIncidentId: null,
    safeResumePoint: null,
  }

  if (!errorJson || typeof errorJson !== 'object') return empty

  const kind = typeof errorJson.kind === 'string' && errorJson.kind.trim()
    ? errorJson.kind.trim()
    : null
  const message = typeof errorJson.message === 'string' && errorJson.message.trim()
    ? errorJson.message.trim()
    : null

  // A structured error_json must have at least a 'kind' field set (not empty/vague)
  const isStructured = Boolean(kind && kind !== 'unknown_qc' && kind !== '')
  if (!isStructured && !message) return empty

  // Detail sub-object may carry extra fields
  const detail = errorJson.detail && typeof errorJson.detail === 'object' ? errorJson.detail : {}

  const retryCount = errorJson.retry_count != null ? Number(errorJson.retry_count)
    : detail.retry_count != null ? Number(detail.retry_count)
    : null

  const maxRetries = errorJson.max_retries != null ? Number(errorJson.max_retries)
    : detail.max_retries != null ? Number(detail.max_retries)
    : null

  const playbookId = typeof errorJson.playbookId === 'string' ? errorJson.playbookId
    : typeof detail.playbookId === 'string' ? detail.playbookId
    : null

  const learningIncidentId = typeof errorJson.learningIncidentId === 'string' ? errorJson.learningIncidentId
    : typeof detail.learningIncidentId === 'string' ? detail.learningIncidentId
    : null

  const safeResumePoint = typeof errorJson.safe_resume_point === 'string' ? errorJson.safe_resume_point
    : typeof detail.safe_resume_point === 'string' ? detail.safe_resume_point
    : null

  const marcRequired = typeof errorJson.marc_required === 'boolean' ? errorJson.marc_required
    : null

  return {
    hasStructuredErrorJson: true,
    errorKind: kind,
    errorMessage: message,
    errorStep: typeof errorJson.step === 'string' ? errorJson.step : null,
    marcRequired,
    retryCount: Number.isFinite(retryCount) ? retryCount as number : null,
    maxRetries: Number.isFinite(maxRetries) ? maxRetries as number : null,
    playbookId,
    learningIncidentId,
    safeResumePoint,
  }
}

// ---------------------------------------------------------------------------
// Job classification
// ---------------------------------------------------------------------------

function classifyJob(
  trueState: TruthClassification['trueState'],
  isDisqualifiedForM1: boolean,
): JobClassification {
  if (isDisqualifiedForM1) return 'disqualified_smoke_test'
  switch (trueState) {
    case 'COMPLETE':
    case 'WAITING_FOR_REVIEW':
      return 'terminal_complete'
    case 'FAILED_NEEDS_MARC':
    case 'FAILED_EMPTY_ERROR':
      return 'terminal_failed'
    case 'FAILED_AUTONOMOUS':
      return 'active_running'  // autonomous repair pending
    case 'ZOMBIE':
      return 'zombie'
    case 'STALLED':
      return 'active_stall'
    case 'ACTIVE':
      return 'active_running'
    default:
      return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Recommended action
// ---------------------------------------------------------------------------

function buildRecommendedAction(
  jobClassification: JobClassification,
  trueState: TruthClassification['trueState'],
  marcRequired: boolean | null,
  errorKind: string | null,
  playbookId: string | null,
  safeResumePoint: string | null,
): string | null {
  switch (jobClassification) {
    case 'terminal_complete':
      return 'Job complete or waiting for Marc review. No action needed.'
    case 'disqualified_smoke_test':
      return 'Job is a disqualified evidence job. Do not reset or modify.'
    case 'zombie':
      return `ZOMBIE: clear lease, re-queue from ${safeResumePoint ?? 'last step'}. Autonomous repair eligible.`
    case 'active_stall':
      return `STALL: job is running but not advancing. Atlas review required. Step: ${safeResumePoint ?? 'unknown'}.`
    case 'terminal_failed':
      if (marcRequired) {
        const pb = playbookId ? ` Follow playbook: ${playbookId}.` : ''
        return `FAILED (marc_required=true): ${errorKind ?? 'unknown kind'}.${pb} Marc decision required.`
      }
      return `FAILED (autonomous): ${errorKind ?? 'unknown kind'}. System should auto-repair.`
    case 'active_running':
      return 'Job is actively processing. No action needed.'
    default:
      return 'Unable to determine recommended action. Atlas review required.'
  }
}

// ---------------------------------------------------------------------------
// Core: buildLivePipelineReport
// ---------------------------------------------------------------------------

/**
 * Builds a complete live pipeline report by querying production_jobs + stories + active mission.
 *
 * MUST be called fresh every time Hal generates a status report.
 * Never cache the output of this function in agent-state.json as a replacement for re-calling it.
 *
 * @param supabase   Supabase client (service role)
 * @param options    Optional filters
 */
export async function buildLivePipelineReport(
  supabase: SupabaseLike,
  options: {
    /** If provided, only include these job IDs in the report. Otherwise includes all non-complete. */
    jobIds?: string[]
    /** If provided, use these as the "live" jobs (for testing — skips DB query). */
    _liveJobsOverride?: ProductionJobRow[]
    /** If provided, use these as the "live" stories (for testing — skips DB query). */
    _liveStoriesOverride?: StoryRow[]
    /** If provided, use this as the active mission (for testing — skips DB query). */
    _activeMissionOverride?: ActiveMission | null
    /** Include complete jobs in the report (default: false). */
    includeComplete?: boolean
  } = {},
): Promise<LivePipelineReport> {
  const now = new Date().toISOString()

  // ── Load active mission ───────────────────────────────────────────────────
  const activeMission = options._activeMissionOverride !== undefined
    ? options._activeMissionOverride
    : await loadActiveMission(supabase).catch(() => null)

  const missionStoryIds = new Set(
    (activeMission?.stories || []).map((s: any) => String(s.storyId || ''))
  )

  // ── Query live production_jobs ────────────────────────────────────────────
  let liveJobs: ProductionJobRow[]
  if (options._liveJobsOverride) {
    liveJobs = options._liveJobsOverride
  } else {
    let query = supabase
      .from('production_jobs')
      .select('id,story_id,series_id,status,current_step,locked_at,updated_at,error_json,state_json')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (options.jobIds && options.jobIds.length > 0) {
      query = query.in('id', options.jobIds)
    } else if (!options.includeComplete) {
      // Exclude complete jobs unless requested
      query = query.neq('status', 'complete')
    }

    const { data, error } = await query
    if (error) throw new Error(`Failed to query production_jobs for live report: ${error.message}`)
    liveJobs = (data || []) as ProductionJobRow[]
  }

  // ── Query stories for titles ──────────────────────────────────────────────
  const storyIdsSet = new Set(liveJobs.map(j => j.story_id).filter(Boolean) as string[])
  const storyIds = Array.from(storyIdsSet)
  let storyMap = new Map<string, string | null>()

  if (options._liveStoriesOverride) {
    options._liveStoriesOverride.forEach(s => storyMap.set(s.id, s.title))
  } else if (storyIds.length > 0) {
    const { data: stories } = await supabase
      .from('stories')
      .select('id,title')
      .in('id', storyIds)
    ;(stories || []).forEach((s: StoryRow) => storyMap.set(s.id, s.title))
  }

  // ── Build per-job report entries ──────────────────────────────────────────
  const jobs: LiveJobReport[] = []

  for (const job of liveJobs) {
    const truth = classifyTrueState({
      id: job.id,
      status: job.status,
      current_step: job.current_step,
      locked_at: job.locked_at,
      updated_at: job.updated_at,
      error_json: job.error_json,
    })

    const errorFields = extractErrorJsonFields(job.error_json)
    const disqualified = isJobDisqualifiedForM1(job.id, truth.trueState, job.error_json)
    const jobClass = classifyJob(truth.trueState, disqualified)

    // Mission slot lookup
    let activeMissionSlot: number | null = null
    let countsTowardSmokeTest = false
    if (activeMission && job.story_id) {
      const idx = (activeMission.stories || []).findIndex(
        (s: any) => String(s.storyId || '') === String(job.story_id)
      )
      if (idx >= 0) {
        activeMissionSlot = idx + 1
        countsTowardSmokeTest = true
      }
    }

    const isTerminal = ['terminal_failed', 'terminal_complete', 'disqualified_smoke_test'].includes(jobClass)
    const isActiveStall = jobClass === 'active_stall' || jobClass === 'zombie'

    const ageMs = job.updated_at
      ? Date.now() - new Date(job.updated_at).getTime()
      : null
    const lockAgeMs = job.locked_at
      ? Date.now() - new Date(job.locked_at).getTime()
      : null

    // Recommended action: use playbook if available
    let recommendedAction = buildRecommendedAction(
      jobClass,
      truth.trueState,
      errorFields.marcRequired,
      errorFields.errorKind,
      errorFields.playbookId,
      truth.safeResumePoint,
    )

    // Enrich with playbook detail if errorKind is present
    if (errorFields.errorKind && !errorFields.playbookId) {
      const pb = getPlaybookByKind(errorFields.errorKind)
      if (pb) {
        recommendedAction = `Follow playbook ${pb.id}: ${pb.title} — ${recommendedAction}`
      }
    }

    jobs.push({
      jobId: job.id,
      storyId: job.story_id,
      storyTitle: job.story_id ? (storyMap.get(job.story_id) ?? null) : null,

      activeMissionSlot,
      countsTowardSmokeTest,
      missionDisqualified: disqualified && countsTowardSmokeTest,

      trueState: truth.trueState,
      jobClassification: jobClass,

      rawStatus: job.status,
      rawCurrentStep: job.current_step,
      rawUpdatedAt: job.updated_at ?? null,
      rawLockedAt: job.locked_at ?? null,

      ...errorFields,

      isTerminal,
      isActiveStall,
      isDisqualifiedForM1: disqualified,

      evidenceSummary: truth.evidenceSummary,
      ageMinutes: ageMs !== null ? Math.round(ageMs / 60_000) : null,
      lockAgeMinutes: lockAgeMs !== null ? Math.round(lockAgeMs / 60_000) : null,
      recommendedAction,
    })
  }

  // ── Smoke test summary ────────────────────────────────────────────────────
  const missionSlotJobs = jobs.filter(j => j.countsTowardSmokeTest)
  const smokeTestSummary = {
    totalSlots: activeMission?.stories?.length ?? 0,
    passing: missionSlotJobs.filter(j => j.jobClassification === 'terminal_complete').length,
    failed: missionSlotJobs.filter(j => j.jobClassification === 'terminal_failed').length,
    disqualified: missionSlotJobs.filter(j => j.missionDisqualified).length,
    active: missionSlotJobs.filter(j => j.jobClassification === 'active_running').length,
    waiting: missionSlotJobs.filter(j => j.rawCurrentStep === 'ready_for_review').length,
  }

  return {
    generatedAt: now,
    activeMission: activeMission ? {
      id: activeMission.id,
      name: activeMission.mission_name,
      type: activeMission.mission_type,
      status: activeMission.status,
      storyCount: (activeMission.stories || []).length,
    } : null,
    jobs,
    mismatches: [],   // populated by detectCacheLiveMismatches() if caller passes cached data
    smokeTestSummary,
  }
}

// ---------------------------------------------------------------------------
// Cache/live mismatch detection
// ---------------------------------------------------------------------------

export type CachedJobSummary = {
  jobId: string
  /** What the cached report claims for error_json detail. */
  cachedErrorDetail?: string | null
  /** What the cached report says about error_json presence. */
  cachedHasErrorJson?: boolean | null
  /** What the cached report says the kind is. */
  cachedErrorKind?: string | null
  /** What the cached report says about marc_required. */
  cachedMarcRequired?: boolean | null
  /** What the cached report says the current_step is. */
  cachedCurrentStep?: string | null
  /** What the cached report says the status is. */
  cachedStatus?: string | null
}

/**
 * Compares cached report values against live DB values for a specific job.
 *
 * Returns an array of CacheLiveMismatch entries describing any conflicts.
 * The LIVE DB value always wins — the mismatch report is informational only.
 *
 * Example use case (the triggering incident):
 *   cached: { cachedHasErrorJson: false, cachedErrorDetail: 'no details in error_json' }
 *   live:   { hasStructuredErrorJson: true, errorKind: 'script_quality_editorial' }
 *   → MISMATCH: hasStructuredErrorJson (cached=false, live=true)
 */
export function detectCacheLiveMismatches(
  cached: CachedJobSummary,
  liveJob: LiveJobReport,
): CacheLiveMismatch[] {
  const mismatches: CacheLiveMismatch[] = []

  function flag(field: string, cachedValue: unknown, liveValue: unknown, recommendation: string) {
    mismatches.push({ jobId: liveJob.jobId, field, cachedValue, liveValue, recommendation })
  }

  // error_json presence
  if (cached.cachedHasErrorJson === false && liveJob.hasStructuredErrorJson === true) {
    flag(
      'hasStructuredErrorJson',
      false,
      true,
      'CACHE/LIVE MISMATCH: Cached report says "no details in error_json" but live DB has a structured error_json. Trust live DB. Do not report "no error_json details" unless live row is actually empty.',
    )
  }
  if (cached.cachedHasErrorJson === true && liveJob.hasStructuredErrorJson === false) {
    flag(
      'hasStructuredErrorJson',
      true,
      false,
      'CACHE/LIVE MISMATCH: Cached report says error_json is present but live DB shows empty/unstructured. The job may have had its error cleared or was re-queued.',
    )
  }

  // error kind
  if (cached.cachedErrorKind != null && liveJob.errorKind != null &&
      cached.cachedErrorKind !== liveJob.errorKind) {
    flag(
      'errorKind',
      cached.cachedErrorKind,
      liveJob.errorKind,
      `CACHE/LIVE MISMATCH: error_json.kind disagrees. Cached="${cached.cachedErrorKind}", live="${liveJob.errorKind}". Trust live DB.`,
    )
  }

  // marc_required
  if (cached.cachedMarcRequired != null && liveJob.marcRequired != null &&
      cached.cachedMarcRequired !== liveJob.marcRequired) {
    flag(
      'marcRequired',
      cached.cachedMarcRequired,
      liveJob.marcRequired,
      `CACHE/LIVE MISMATCH: marc_required disagrees. Cached=${cached.cachedMarcRequired}, live=${liveJob.marcRequired}. Trust live DB.`,
    )
  }

  // current_step
  if (cached.cachedCurrentStep != null && liveJob.rawCurrentStep != null &&
      cached.cachedCurrentStep !== liveJob.rawCurrentStep) {
    flag(
      'currentStep',
      cached.cachedCurrentStep,
      liveJob.rawCurrentStep,
      `CACHE/LIVE MISMATCH: current_step disagrees. Cached="${cached.cachedCurrentStep}", live="${liveJob.rawCurrentStep}". Trust live DB.`,
    )
  }

  // status
  if (cached.cachedStatus != null && liveJob.rawStatus != null &&
      cached.cachedStatus !== liveJob.rawStatus) {
    flag(
      'status',
      cached.cachedStatus,
      liveJob.rawStatus,
      `CACHE/LIVE MISMATCH: status disagrees. Cached="${cached.cachedStatus}", live="${liveJob.rawStatus}". Trust live DB.`,
    )
  }

  return mismatches
}

/**
 * Annotates an existing LivePipelineReport with cache/live mismatches
 * for a set of cached summaries. Returns a new report with mismatches populated.
 */
export function annotateMismatches(
  report: LivePipelineReport,
  cachedSummaries: CachedJobSummary[],
): LivePipelineReport {
  const mismatches: CacheLiveMismatch[] = []
  const liveJobMap = new Map(report.jobs.map(j => [j.jobId, j]))

  for (const cached of cachedSummaries) {
    const liveJob = liveJobMap.get(cached.jobId)
    if (!liveJob) continue
    mismatches.push(...detectCacheLiveMismatches(cached, liveJob))
  }

  return { ...report, mismatches }
}
