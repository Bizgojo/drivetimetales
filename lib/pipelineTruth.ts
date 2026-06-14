/**
 * Pipeline Truth Layer
 *
 * Classifies the TRUE state of a production job from evidence,
 * not from the status field alone.
 *
 * Problem this solves:
 * - status='running' means nothing if locked_at is stale
 * - status='failed' doesn't tell you if the failure is autonomous-repaired
 * - status='complete' could mean ready_for_review OR fully done
 * - A zombie job looks 'running' until someone checks the lease
 *
 * Core rule: The Pipeline Truth Layer is the authoritative source of
 * "what is really happening" for Command Center and repair playbooks.
 * It classifies from multiple evidence signals.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A job is a zombie if it's running but lock hasn't been refreshed in this long. */
const ZOMBIE_LOCK_STALE_MS = 30 * 60 * 1000  // 30 min

/** A job is stalled if it's been on the same step for this long without completion. */
const STALL_STEP_MS = 45 * 60 * 1000  // 45 min

/** A job is a phantom if it's waiting_for_external for longer than this. */
const PHANTOM_EXTERNAL_MS = 2 * 60 * 60 * 1000  // 2 hr

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TruthState =
  | 'ACTIVE'                    // Genuinely processing — lease fresh, recent updates
  | 'ZOMBIE'                    // status=running, lock stale or absent
  | 'STALLED'                   // On the same step for too long without progress
  | 'PHANTOM'                   // waiting_for_external with no trigger for too long
  | 'FAILED_NEEDS_MARC'         // Failed, human decision required
  | 'FAILED_AUTONOMOUS'         // Failed, system can auto-repair without Marc
  | 'FAILED_EMPTY_ERROR'        // Failed, but error_json is empty/vague — can't classify
  | 'WAITING_FOR_REVIEW'        // At ready_for_review — normal terminal state
  | 'COMPLETE'                  // Job fully complete
  | 'UNKNOWN'                   // Cannot classify from available evidence

export type TruthClassification = {
  trueState: TruthState
  status: string
  currentStep: string | null
  evidenceSummary: string
  marcRequired: boolean
  safeResumePoint: string | null
  autonomousRepairKind: string | null
  structuredErrorKind: string | null
  ageMs: number
  lockAgeMs: number | null
}

// Minimal shape we need from a job record
export type JobSnapshot = {
  id?: string
  status?: string | null
  current_step?: string | null
  locked_at?: string | null
  updated_at?: string | null
  error_json?: unknown
  logs?: unknown[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageMs(isoTimestamp: string | null | undefined): number {
  if (!isoTimestamp) return Infinity
  const t = new Date(isoTimestamp).getTime()
  return Number.isFinite(t) ? Date.now() - t : Infinity
}

function errorKind(errorJson: unknown): string | null {
  if (!errorJson || typeof errorJson !== 'object') return null
  const e = errorJson as Record<string, unknown>
  const kind = String(e.kind || e.failure_type || e.type || '').trim()
  return kind || null
}

function errorMessage(errorJson: unknown): string {
  if (!errorJson) return ''
  if (typeof errorJson === 'string') return errorJson
  if (typeof errorJson === 'object') {
    const e = errorJson as Record<string, unknown>
    return String(e.message || e.error || e.reason || JSON.stringify(e)).slice(0, 500)
  }
  return String(errorJson)
}

function isVagueError(errorJson: unknown): boolean {
  if (!errorJson) return true
  const msg = errorMessage(errorJson)
  if (!msg || msg === '{}' || msg === 'null' || msg === 'undefined') return true
  // error_json with only unknown/empty kind and no message
  if (typeof errorJson === 'object') {
    const e = errorJson as Record<string, unknown>
    const kind = String(e.kind || '').trim()
    const message = String(e.message || '').trim()
    if (kind === 'unknown' && !message) return true
    if (!kind && !message) return true
  }
  return false
}

/** Known failure kinds that can be repaired autonomously without Marc */
const AUTONOMOUS_REPAIR_KINDS = new Set([
  'transient',
  'loudness',
  'zombie_stalled',
  'narrator_mismatch_db_fallback',
  'stale_runner',
  'storage_html_error',
])

/** Known failure kinds that always require Marc */
const MARC_REQUIRED_KINDS = new Set([
  'semantic_uncertainty',
  'story_quality',
  'cover_art',
  'belle_quality_marc',
  'narrator_mismatch_no_db_value',
])

// ---------------------------------------------------------------------------
// Core classification
// ---------------------------------------------------------------------------

export function classifyTrueState(job: JobSnapshot, nowMs: number = Date.now()): TruthClassification {
  const status = String(job.status || '').trim()
  const currentStep = job.current_step ? String(job.current_step).trim() : null
  const lockAge = job.locked_at
    ? nowMs - new Date(job.locked_at).getTime()
    : null
  const jobAge = job.updated_at
    ? nowMs - new Date(job.updated_at).getTime()
    : Infinity

  // ── Complete / terminal states ──────────────────────────────────────────

  if (status === 'complete' || currentStep === 'complete') {
    return {
      trueState: 'COMPLETE',
      status,
      currentStep,
      evidenceSummary: 'Job reached terminal complete status.',
      marcRequired: false,
      safeResumePoint: null,
      autonomousRepairKind: null,
      structuredErrorKind: null,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  if (currentStep === 'ready_for_review') {
    return {
      trueState: 'WAITING_FOR_REVIEW',
      status,
      currentStep,
      evidenceSummary: 'Job is at ready_for_review — awaiting Marc approval.',
      marcRequired: false,
      safeResumePoint: null,
      autonomousRepairKind: null,
      structuredErrorKind: null,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  // ── Zombie detection ────────────────────────────────────────────────────
  // status=running but lock is expired or absent for >30min

  if (status === 'running') {
    const lockStale = lockAge === null || lockAge > ZOMBIE_LOCK_STALE_MS
    if (lockStale) {
      return {
        trueState: 'ZOMBIE',
        status,
        currentStep,
        evidenceSummary: lockAge === null
          ? `Job is status=running but has no lock. Likely a zombie (lock was never acquired or was dropped).`
          : `Job is status=running but lock is ${Math.round(lockAge / 60_000)}min old (>${ZOMBIE_LOCK_STALE_MS / 60_000}min threshold). Zombie.`,
        marcRequired: false,
        safeResumePoint: currentStep,
        autonomousRepairKind: 'stale_runner',
        structuredErrorKind: 'zombie_stalled',
        ageMs: jobAge,
        lockAgeMs: lockAge,
      }
    }

    // Lock is fresh — check for step stall
    if (jobAge > STALL_STEP_MS) {
      return {
        trueState: 'STALLED',
        status,
        currentStep,
        evidenceSummary: `Job is running with a fresh lock but has not advanced in ${Math.round(jobAge / 60_000)}min. Step may be hung.`,
        marcRequired: true,
        safeResumePoint: currentStep,
        autonomousRepairKind: null,
        structuredErrorKind: null,
        ageMs: jobAge,
        lockAgeMs: lockAge,
      }
    }

    return {
      trueState: 'ACTIVE',
      status,
      currentStep,
      evidenceSummary: `Job actively running step "${currentStep}". Lock is ${lockAge !== null ? `${Math.round(lockAge / 60_000)}min old` : 'absent'}. Updated ${Math.round(jobAge / 60_000)}min ago.`,
      marcRequired: false,
      safeResumePoint: null,
      autonomousRepairKind: null,
      structuredErrorKind: null,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  // ── Queued / waiting states ─────────────────────────────────────────────

  if (status === 'queued') {
    return {
      trueState: 'ACTIVE',
      status,
      currentStep,
      evidenceSummary: 'Job is queued and waiting for the runner to pick it up.',
      marcRequired: false,
      safeResumePoint: null,
      autonomousRepairKind: null,
      structuredErrorKind: null,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  if (status === 'waiting_for_external') {
    if (jobAge > PHANTOM_EXTERNAL_MS) {
      return {
        trueState: 'PHANTOM',
        status,
        currentStep,
        evidenceSummary: `Job has been waiting_for_external for ${Math.round(jobAge / 60_000)}min (>${PHANTOM_EXTERNAL_MS / 60_000}hr threshold). External trigger may have been dropped.`,
        marcRequired: true,
        safeResumePoint: currentStep,
        autonomousRepairKind: null,
        structuredErrorKind: null,
        ageMs: jobAge,
        lockAgeMs: lockAge,
      }
    }
    return {
      trueState: 'ACTIVE',
      status,
      currentStep,
      evidenceSummary: 'Job is waiting for an external trigger (normal state, not yet phantom).',
      marcRequired: false,
      safeResumePoint: null,
      autonomousRepairKind: null,
      structuredErrorKind: null,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  // ── Failed states ───────────────────────────────────────────────────────

  if (status === 'failed') {
    const errorJson = job.error_json

    if (isVagueError(errorJson)) {
      return {
        trueState: 'FAILED_EMPTY_ERROR',
        status,
        currentStep,
        evidenceSummary: `Job failed but error_json is empty or vague. Cannot classify without inspection. Current step: "${currentStep}".`,
        marcRequired: true,
        safeResumePoint: currentStep,
        autonomousRepairKind: null,
        structuredErrorKind: null,
        ageMs: jobAge,
        lockAgeMs: lockAge,
      }
    }

    const kind = errorKind(errorJson)
    const message = errorMessage(errorJson)

    if (kind && AUTONOMOUS_REPAIR_KINDS.has(kind)) {
      return {
        trueState: 'FAILED_AUTONOMOUS',
        status,
        currentStep,
        evidenceSummary: `Job failed with autonomous-repairable error kind="${kind}". ${message}`,
        marcRequired: false,
        safeResumePoint: currentStep,
        autonomousRepairKind: kind,
        structuredErrorKind: kind,
        ageMs: jobAge,
        lockAgeMs: lockAge,
      }
    }

    const marcNeeded = kind ? MARC_REQUIRED_KINDS.has(kind) : true
    return {
      trueState: 'FAILED_NEEDS_MARC',
      status,
      currentStep,
      evidenceSummary: `Job failed. kind="${kind || 'unclassified'}". ${message}`,
      marcRequired: marcNeeded,
      safeResumePoint: currentStep,
      autonomousRepairKind: null,
      structuredErrorKind: kind,
      ageMs: jobAge,
      lockAgeMs: lockAge,
    }
  }

  // ── Fallback ────────────────────────────────────────────────────────────

  return {
    trueState: 'UNKNOWN',
    status,
    currentStep,
    evidenceSummary: `Cannot classify job state. status="${status}", step="${currentStep}".`,
    marcRequired: true,
    safeResumePoint: currentStep,
    autonomousRepairKind: null,
    structuredErrorKind: null,
    ageMs: jobAge,
    lockAgeMs: lockAge,
  }
}

// ---------------------------------------------------------------------------
// Batch classification for Command Center
// ---------------------------------------------------------------------------

export type JobTruthSummary = TruthClassification & {
  jobId: string
  storyId: string | null
  seriesId: string | null
}

export function classifyJobBatch(
  jobs: (JobSnapshot & { id?: string; story_id?: string | null; series_id?: string | null })[],
  nowMs: number = Date.now(),
): JobTruthSummary[] {
  return jobs.map(job => ({
    ...classifyTrueState(job, nowMs),
    jobId: String(job.id || ''),
    storyId: job.story_id ? String(job.story_id) : null,
    seriesId: job.series_id ? String(job.series_id) : null,
  }))
}
