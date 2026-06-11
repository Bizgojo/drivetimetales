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
