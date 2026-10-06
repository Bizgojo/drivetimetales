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

import { isTransientJobRow } from './transientFailure'

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
    if (isTransientJobRow(job)) return false // TRANSIENT-FAILURE-001
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

export type JobStatusRow = { status?: string | null; updated_at?: string | null; error_json?: unknown; current_step?: string | null }

// ── TRANSIENT-FAILURE-001 (Marc GO 2026-09-28) ──────────────────────────────
// Transient failures (bad key, no credits, rate limit, outage, lost runner —
// see lib/transientFailure.ts) are NOT story defects. They never count toward
// the failure circuit or the retry cap and never park a story. Instead
// dispatch backs off:
//   - wait TRANSIENT_BACKOFF_MS after the newest transient failure, and
//   - pause entirely while TRANSIENT_HOLD_THRESHOLD transient failures sit
//     inside TRANSIENT_HOLD_WINDOW_MS (max ~8 attempts/day on a dead key).
// Both release on their own once the failures age out, or immediately when a
// human clears the story (dispatch_failure_reset_at floors the window).
export const TRANSIENT_BACKOFF_MS = 30 * 60 * 1000           // 30 minutes
export const TRANSIENT_HOLD_THRESHOLD = 4                     // transient failures...
export const TRANSIENT_HOLD_WINDOW_MS = 12 * 60 * 60 * 1000   // ...within 12 hours
// If the outside cause is still not fixed after this many transient failures
// in this window, tell a human (needs_attention with the cause) — still no
// parking in repair_queue, so clearing the flag resumes production.
export const TRANSIENT_ESCALATE_THRESHOLD = 12
export const TRANSIENT_ESCALATE_WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours

/**
 * Recurring outside failure that nobody fixed: returns the count and the most
 * recent cause once TRANSIENT_ESCALATE_THRESHOLD transient failures sit inside
 * TRANSIENT_ESCALATE_WINDOW_MS (floored by a human reset), else null.
 */
export function transientEscalation(
  jobs: JobStatusRow[],
  nowMs: number,
  floorMs: number = 0,
): { transientFailures: number; cause: string } | null {
  const windowStart = Math.max(nowMs - TRANSIENT_ESCALATE_WINDOW_MS, floorMs)
  const rows = jobs
    .filter((job) => cleanStatus(job.status) === 'failed' && isTransientJobRow(job))
    .map((job) => ({ t: Date.parse(job.updated_at || ''), ej: job.error_json as Record<string, unknown> | null }))
    .filter((r) => Number.isFinite(r.t) && r.t >= windowStart)
    .sort((a, b) => a.t - b.t)
  if (rows.length < TRANSIENT_ESCALATE_THRESHOLD) return null
  const newest = rows[rows.length - 1].ej || {}
  return { transientFailures: rows.length, cause: String(newest.transient_cause || newest.kind || 'unknown') }
}

/** Keep only failures that are story defects (drops transient ones). */
export function permanentFailuresOnly<T extends JobStatusRow>(jobs: T[]): T[] {
  return jobs.filter((job) => !isTransientJobRow(job))
}

export type TransientHold = {
  reason: 'transient_backoff' | 'transient_hold'
  transientFailures: number
  retryAfterIso: string
}

/**
 * Decide whether dispatch should wait because of recent TRANSIENT failures.
 * Returns null when dispatch may proceed. Never parks or flags anything.
 * `floorMs` = dispatch_failure_reset_at (a human clear resets the hold).
 */
export function transientDispatchHold(
  jobs: JobStatusRow[],
  nowMs: number,
  floorMs: number = 0,
): TransientHold | null {
  const windowStart = Math.max(nowMs - TRANSIENT_HOLD_WINDOW_MS, floorMs)
  const failed = jobs
    .filter((job) => cleanStatus(job.status) === 'failed' && isTransientJobRow(job))
    .map((job) => ({ t: Date.parse(job.updated_at || ''), ej: job.error_json as Record<string, unknown> | null }))
    .filter((r) => Number.isFinite(r.t) && r.t >= windowStart)
    .sort((a, b) => a.t - b.t)
  if (failed.length === 0) return null

  const times = failed.map((r) => r.t)
  if (times.length >= TRANSIENT_HOLD_THRESHOLD) {
    // Released when enough of them age out of the window.
    const releaseAt = times[times.length - TRANSIENT_HOLD_THRESHOLD] + TRANSIENT_HOLD_WINDOW_MS
    return { reason: 'transient_hold', transientFailures: times.length, retryAfterIso: new Date(releaseAt).toISOString() }
  }

  // TMP-SPACE-LOW-001: runner_tmp_full backs off on its own escalating
  // schedule (5m/15m/45m + jitter, attempt count = consecutive transient
  // failures, never reset here). Every other cause keeps the flat 30m.
  const newestRow = failed[failed.length - 1]
  const newest = newestRow.t
  const newestCause = String(newestRow.ej?.transient_cause ?? '')
  const backoffMs =
    newestCause === 'runner_tmp_full' ? tmpFullRetryDelayMs(times.length) : TRANSIENT_BACKOFF_MS
  if (nowMs - newest < backoffMs) {
    return { reason: 'transient_backoff', transientFailures: times.length, retryAfterIso: new Date(newest + backoffMs).toISOString() }
  }
  return null
}

/** True when at least one job in the list is non-terminal (dispatch must skip). */
export function hasActiveJob(jobs: JobStatusRow[]): boolean {
  return jobs.some((job) => isNonTerminalJobStatus(job.status))
}

// ── TMP-SPACE-LOW-001 (Marc GO 2026-10-06): mix serialization ───────────────
// Only one mix job per series may run at a time. Two concurrent
// series_render_final_mix (or render_final_mix) jobs for the same series
// double the /tmp footprint and caused the ENOSPC outage. Dispatch must skip
// a series that already has a non-terminal job sitting in a mix step.
// (The pre-existing active_job_exists guard covers series with ANY active
// job; this guard names the mix case explicitly so the skip reason is
// auditable and unit-testable independent of the status snapshot.)
export const MIX_SERIALIZE_STEPS: ReadonlySet<string> = new Set([
  'series_render_final_mix',
  'render_final_mix',
])

/** True when a job row is non-terminal AND sitting in a mix step. */
export function isActiveMixJob(job: JobStatusRow): boolean {
  if (!isNonTerminalJobStatus(job.status)) return false
  return MIX_SERIALIZE_STEPS.has(String(job.current_step ?? '').trim())
}

/** True when the series already has a non-terminal mix job (dispatch must skip). */
export function hasActiveMixJob(jobs: JobStatusRow[]): boolean {
  return jobs.some(isActiveMixJob)
}

// ── TMP-SPACE-LOW-001: escalating back-off for runner_tmp_full ─────────────
// A full /tmp clears as other jobs finish and clean up, so retries escalate
// 5m → 15m → 45m (+jitter) instead of the flat 30m transient back-off.
// The attempt COUNT is preserved (callers pass the consecutive-failure
// count; it is never reset here) and no cap is raised: RETRY_CAP (5) and
// MAX_TRANSIENT_RETRIES_PER_KEY are untouched.
export const TMP_FULL_RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000] as const
/** +/- fraction of added jitter (0–20% on top of the base delay). */
export const TMP_FULL_RETRY_JITTER_FRACTION = 0.2

/**
 * Delay before the next retry for a runner_tmp_full failure.
 * `attempt` is 1-based and preserved across retries (never reset to 1 by
 * this function); attempts beyond the schedule pin to the last tier.
 * `rand` defaults to Math.random and is injectable for tests.
 */
export function tmpFullRetryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const idx = Math.min(Math.max(Math.floor(attempt) - 1, 0), TMP_FULL_RETRY_DELAYS_MS.length - 1)
  const base = TMP_FULL_RETRY_DELAYS_MS[idx]
  const r = Math.min(Math.max(rand(), 0), 1)
  return Math.floor(base * (1 + r * TMP_FULL_RETRY_JITTER_FRACTION))
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
    if (isTransientJobRow(job)) return false // TRANSIENT-FAILURE-001
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
