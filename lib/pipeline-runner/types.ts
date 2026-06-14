/**
 * Pipeline Runner — TypeScript types
 *
 * Environment variables consumed by this module:
 *   PIPELINE_ALERT_WEBHOOK_URL  (optional) — POST target for failure/stall alerts.
 *                                            Leave unset while the gateway is loopback-only.
 *   NEXT_PUBLIC_APP_URL         (optional) — Base URL for run-next calls.
 *                                            Defaults to https://drivetimetales.vercel.app
 */

export type RunnerEventKind =
  | 'step_advance'
  | 'failure'
  | 'stall'
  | 'complete'
  | 'budget_exit'
  | 'lease_skip'

export type FailureKind =
  | 'transient'
  | 'loudness'
  | 'semantic_uncertainty'
  | 'story_quality'
  | 'belle_quality'
  | 'cover_art'
  | 'unknown_step'
  | 'unknown_qc'

export type FailureContext = {
  step: string | null
  storyId: string | null
  seriesId: string | null
  episodeNumber: string | number | null
  segmentNumber: string | number | null
  speaker: string | null
  failure: unknown
  report: unknown
}

export type FailureClassification = {
  kind: FailureKind
  retryable: boolean
  needsMarc: boolean
  reason: string
  recommendedAction: string
  context: FailureContext
}

export type StallRecord = {
  step: string | null
  firstSeenAt: number
}

export type RunnerEvent = {
  at: string
  source: 'autonomous-runner'
  event: RunnerEventKind
  jobId: string
  step: string | null
  classification?: FailureClassification
  needs_marc: boolean
  message: string
  raw_snippet?: string
}

export type RunnerResult = {
  jobId: string | null
  stepsCalled: number
  exitReason:
    | 'complete'
    | 'failure'
    | 'stall'
    | 'budget_exit'
    | 'lease_skip'
    | 'no_active_job'
    | 'error'
  message: string
}

export type RunnerConfig = {
  /** Holder identity for the distributed lease (e.g. Vercel invocation ID or hostname). */
  holderId: string
}

// ---------------------------------------------------------------------------
// Structured error_json — mandatory on all failure paths
// ---------------------------------------------------------------------------
// Core rule: No job may be marked status='failed' without a structured
// error_json that has kind, message, step, and marc_required populated.
// An empty or vague error_json (kind='unknown', empty message) is itself
// a failure class (empty_error_json) requiring Marc inspection.

export type StructuredErrorJsonKind =
  | 'narrator_mismatch'
  | 'silence_buffer'
  | 'transcript_qc'
  | 'transcript_question_mark'
  | 'segment_stale_loop'
  | 'belle_quality'
  | 'story_quality'
  | 'cover_art'
  | 'loudness'
  | 'null_lufs_stale'
  | 'transient'
  | 'storage_html_error'
  | 'zombie_stalled'
  | 'stale_runner'
  | 'invalid_rfr'
  | 'empty_error_json'
  | 'mission_context_missing'
  | 'unknown_step'
  | 'unknown_qc'
  | string  // extensible

export type StructuredErrorJson = {
  /** Canonical failure kind — must not be empty or 'unknown' without detail in message. */
  kind: StructuredErrorJsonKind
  /** Human-readable failure description — must be non-empty and specific. */
  message: string
  /** The pipeline step where the failure occurred. */
  step: string | null
  /** Story ID if known. */
  storyId?: string | null
  /** Series ID if known. */
  seriesId?: string | null
  /** Episode number if known. */
  episodeNumber?: string | number | null
  /** Segment number if known. */
  segmentNumber?: string | number | null
  /** Raw error detail for debugging. */
  detail?: unknown
  /** Root cause analysis (optional). */
  rootCause?: string | null
  /** Recommended next action. */
  fixRecommendation?: string | null
  /** Whether Marc's decision is required. */
  marc_required: boolean
  /** Whether the repair playbook can handle this autonomously. */
  autonomous_repair?: boolean
  /** ISO timestamp of the failure. */
  at: string
}

/**
 * Build a minimal valid StructuredErrorJson.
 * Use this wherever a failure path sets error_json.
 */
export function buildStructuredError(
  kind: StructuredErrorJsonKind,
  message: string,
  step: string | null,
  opts: Partial<Omit<StructuredErrorJson, 'kind' | 'message' | 'step' | 'at'>> = {},
): StructuredErrorJson {
  const isVague = !message || message.trim() === ''
  return {
    kind: isVague ? 'empty_error_json' : kind,
    message: isVague ? `Failure at step ${step ?? 'unknown'} — no detail available. Classify as empty_error_json.` : message.trim(),
    step,
    marc_required: opts.marc_required ?? true,
    at: new Date().toISOString(),
    ...opts,
  }
}
