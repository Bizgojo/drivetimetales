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
  // ATL-PIPE-008: validate_script canonical kinds
  | 'script_description_blocked_word'   // DESCRIPTION contains forbidden word (deterministic, retryable)
  | 'script_card_copy_format'            // TITLE/DESCRIPTION format violation (deterministic, retryable)
  | 'script_quality_editorial'           // AI validator: protagonist/description mismatch, hook, ending (retryable)
  | 'script_story_resolution'            // AI validator: climax offscreen, protagonist passive (retryable)
  | 'script_validator_unknown'           // AI validator: unclassified failure (not auto-retryable, marc_required)
  // ATL-PIPE-009: voice_preflight script structural failure
  | 'script_unlabeled_lines'             // story body contains prose not starting with NARRATOR:/CHARACTER: (retryable)
  // ATL-PIPE-012: ready_for_review gate failures
  | 'rfr_outro_narrator_missing'         // Standalone/finale outro is missing required narrator credit
  | 'rfr_visibility_failed'             // Story is_hidden=true or published_on is set — visibility gate failed
  | 'rfr_audio_missing'                 // final_mix.mp3 not found in storage — audio gate failed
  | 'rfr_gate_unknown'                  // Unclassified ready_for_review gate failure
  // ATL-PIPE-011: transcript QC numeric/currency equivalence
  | 'transcript_numeric_equivalence'     // Whisper returned digit/currency form of a spoken number — accepted after normalization
  // ATL-PIPE-013: transcript QC hyphenated two-digit numeric equivalence
  | 'transcript_hyphenated_numeric'      // Whisper returned digit form of a hyphenated two-digit word-number — accepted after normalization
  // PREMISE-UNIQUENESS-001: brief premise substantially similar to a protected story
  | 'premise_collision'                  // brief bounced for rework; override only by Marc's recorded word (marc_required, not retryable)
  // ATL-PIPE-010: Belle intro/outro validation and repair failure kinds
  | 'belle_quality_hook_missing'         // standalone intro lacks concrete narrative hook (auto-repairable)
  | 'belle_quality_title_missing'        // standalone intro/outro missing story title (auto-repairable)
  | 'belle_quality_listener_missing'     // intro missing [LISTENER_NAME] placeholder (auto-repairable)
  | 'belle_quality_repair_failed'        // repair produced text that still fails deterministic checks (retry up to 2)
  | 'belle_quality_unknown'              // unclassified Belle failure (marc_required after retries)
  // Legacy aliases kept for backward compat with existing error_json rows
  | 'script_blocked_word'
  | 'script_editorial_quality'
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
  /** Number of autonomous retries already attempted for this failure class. */
  retry_count?: number
  /** Maximum retries allowed for this failure class before marc_required escalation. */
  max_retries?: number
  /** Repair playbook selected for this failure. */
  playbookId?: string | null
  /** Pipeline step that can safely resume after repair. */
  safe_resume_point?: string | null
  /** Related production_learning_events row id. */
  learning_incident_id?: string | null
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
