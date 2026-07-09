/**
 * Dispatch guards — shared status logic for the production dispatch pipeline
 * and every UI surface that displays "active" production jobs.
 *
 * ATL-DISPATCH-DEFECTS-001 (2026-07-09):
 *  1. Story/series-level failure circuit: >=3 failed jobs for the same
 *     story_id/series_id inside a rolling 2h window opens the circuit —
 *     dispatch must NOT create another job; the stories move to repair_queue.
 *     (The per-job circuit breaker in the runner is insufficient because each
 *     dispatch retry is a NEW job row.)
 *  2. Active-job uniqueness: never create a job for a series / standalone
 *     story that already has a non-terminal job. Backed by partial unique
 *     indexes (see supabase/migrations/20260709100000_production_jobs_active_uniqueness.sql).
 *  3. UI "active" definition: only status IN ('running','queued') may render
 *     as active. Terminal statuses (failed/cancelled/complete) must NEVER
 *     render as active.
 */

// Non-terminal statuses — a job in one of these states blocks new dispatch
// for the same series/story.
export const NON_TERMINAL_JOB_STATUSES = ['queued', 'running', 'waiting_for_external'] as const

// Terminal statuses — these must never be displayed as "active" anywhere.
export const TERMINAL_JOB_STATUSES = ['failed', 'cancelled', 'complete'] as const

// The only statuses a UI panel may present as "active".
export const UI_ACTIVE_JOB_STATUSES = ['running', 'queued'] as const

// Rolling-window failure circuit (story/series level, NOT per-job).
export const DISPATCH_FAILURE_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours
export const DISPATCH_FAILURE_THRESHOLD = 3                  // failed jobs within the window

// Retry cap (PIPE-AUDIT-001 item 4): failed jobs inside RETRY_CAP_WINDOW_MS
// block re-dispatch once RETRY_CAP is reached. The window start is floored by
// per-story dispatch_failure_reset_at and the global
// RETRY_CAP_IGNORE_FAILURES_BEFORE env (set to the last relevant fix deploy)
// so infra-era failures whose causes are already fixed stop counting.
export const RETRY_CAP = 5
export const RETRY_CAP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Compute the timestamp (ms) from which failed jobs count toward the retry
 * cap: the newest of (now - window), the per-story reset, and the global
 * ignore-before floor. Invalid/absent dates are ignored.
 */
export function retryCapWindowStartMs(
  nowMs: number,
  opts: {
    windowMs?: number
    /** stories.dispatch_failure_reset_at — per-story reset with audit trail. */
    resetAtIso?: string | null
    /** RETRY_CAP_IGNORE_FAILURES_BEFORE — global floor (last fix deploy). */
    ignoreBeforeIso?: string | null
  } = {},
): number {
  const windowMs = opts.windowMs ?? RETRY_CAP_WINDOW_MS
  let start = nowMs - windowMs
  for (const iso of [opts.resetAtIso, opts.ignoreBeforeIso]) {
    const parsed = Date.parse(iso || '')
    if (Number.isFinite(parsed) && parsed > start) start = parsed
  }
  return start
}

/** Count failed jobs at/after the retry-cap window start. */
export function countRetryCapFailures(
  jobs: JobStatusRow[],
  nowMs: number,
  opts: Parameters<typeof retryCapWindowStartMs>[1] = {},
): number {
  const start = retryCapWindowStartMs(nowMs, opts)
  return jobs.filter((job) => {
    if (cleanStatus(job.status) !== 'failed') return false
    const failedAt = Date.parse(job.updated_at || '')
    return Number.isFinite(failedAt) && failedAt >= start
  }).length
}

function cleanStatus(status: unknown): string {
  return String(status ?? '').trim().toLowerCase()
}

export function isNonTerminalJobStatus(status: unknown): boolean {
  return (NON_TERMINAL_JOB_STATUSES as readonly string[]).includes(cleanStatus(status))
}

export function isTerminalJobStatus(status: unknown): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(cleanStatus(status))
}

/** True only for statuses a UI may render as "active" (running/queued). */
export function isUiActiveJobStatus(status: unknown): boolean {
  return (UI_ACTIVE_JOB_STATUSES as readonly string[]).includes(cleanStatus(status))
}

export type JobStatusRow = { status?: string | null; updated_at?: string | null }

/** True when at least one job in the list is non-terminal (dispatch must skip). */
export function hasActiveJob(jobs: JobStatusRow[]): boolean {
  return jobs.some((job) => isNonTerminalJobStatus(job.status))
}

/**
 * Count failed jobs whose updated_at falls inside the rolling window.
 * updated_at is used because that is when the job reached its failed state.
 */
export function countRecentFailures(
  jobs: JobStatusRow[],
  nowMs: number,
  windowMs: number = DISPATCH_FAILURE_WINDOW_MS,
): number {
  const cutoff = nowMs - windowMs
  return jobs.filter((job) => {
    if (cleanStatus(job.status) !== 'failed') return false
    const failedAt = Date.parse(job.updated_at || '')
    return Number.isFinite(failedAt) && failedAt >= cutoff
  }).length
}

/**
 * Story/series-level failure circuit. Open (true) => dispatch must NOT create
 * another job for this story/series; move it to repair_queue instead.
 */
export function failureCircuitOpen(
  jobs: JobStatusRow[],
  nowMs: number,
  threshold: number = DISPATCH_FAILURE_THRESHOLD,
  windowMs: number = DISPATCH_FAILURE_WINDOW_MS,
): boolean {
  return countRecentFailures(jobs, nowMs, windowMs) >= threshold
}

/**
 * Display name for a pipeline runner worker: the actual pipeline_runner_state
 * id (short form). Replaces legacy stage names (Larry/Curly/Moe/Groucho) which
 * did not correspond to real worker ids and misled operators.
 * 'production-runner:worker-3' -> 'worker-3'; unknown ids pass through as-is.
 */
export function runnerDisplayName(workerId: string | null | undefined): string {
  const id = String(workerId || '').trim()
  if (!id) return 'unknown-worker'
  return id.startsWith('production-runner:') ? id.slice('production-runner:'.length) : id
}

export type PartitionableJobItem = {
  status?: string | null
  op?: { isStalled?: boolean } | null
}

/**
 * Partition production-console items so terminal jobs can never land in the
 * "active" bucket. Order of precedence: stalled -> terminal -> active -> waiting.
 */
export function partitionProductionItems<T extends PartitionableJobItem>(items: T[]): {
  active: T[]
  stalled: T[]
  terminal: T[]
  waiting: T[]
} {
  const active: T[] = []
  const stalled: T[] = []
  const terminal: T[] = []
  const waiting: T[] = []
  for (const item of items) {
    if (item.op?.isStalled === true) { stalled.push(item); continue }
    if (isTerminalJobStatus(item.status)) { terminal.push(item); continue }
    if (isUiActiveJobStatus(item.status)) { active.push(item); continue }
    waiting.push(item)
  }
  return { active, stalled, terminal, waiting }
}
