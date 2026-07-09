/**
 * jobLockGuard — fenced writes for production_jobs (ATL-RENDER-STATE-INDEX-001)
 *
 * Incident (2026-07-09 ~19:08Z, The Courthouse Silence, job 79410154):
 * run-next step-completion writes were unguarded `UPDATE … WHERE id = $job`.
 * The pipeline runner aborts its HTTP call to run-next after 90s
 * (AbortSignal.timeout in lib/pipeline-runner/runner.ts → callRunNext), but
 * the Vercel invocation keeps running server-side for minutes (renders are
 * long). That makes every long step a potential "zombie writer":
 *
 *   1. Runner client aborts → logs transient failures → circuit breaker opens
 *      → job marked status='failed' (terminal, leaves the partial-index
 *      predicate; the lock columns are NOT cleared by the circuit breaker).
 *   2. dispatch-queue (per-minute cron) sees no active job for the series and
 *      legitimately inserts a replacement job (queued).
 *   3. The zombie invocation finishes its render and blindly updates its old
 *      row back to status='queued' — re-entering the predicate of
 *      production_jobs_one_active_per_series → duplicate key violation
 *      ("Failed to save series render state: duplicate key value violates
 *      unique constraint production_jobs_one_active_per_series").
 *
 * Before migration 20260709100000 this exact sequence silently produced TWO
 * active jobs for one series (the duplicate-dispatch class that burned us
 * overnight). The index correctly refused the resurrection; the code must
 * now refuse it too, gracefully.
 *
 * Fix: every mid-flight production_jobs write must be *fenced* — it may only
 * land while this invocation still owns the lock:
 *
 *   WHERE id = $job
 *     AND locked_by = $holder          -- our worker still holds the lock
 *     AND locked_at = $lockTakenAt     -- fencing token: OUR lock, not a
 *                                      --   newer re-lock by the same worker
 *     AND status   = 'running'         -- job not superseded (failed by the
 *                                      --   circuit breaker / failJob / ops)
 *
 * If the fence does not match, the write affects 0 rows: the step's work is
 * abandoned (rendered artifacts stay in storage and are picked up by the
 * next attempt's completeness checks) and the replacement job proceeds
 * untouched. The one-active-per-series invariant holds either way.
 */

export type OwnedJobRef = {
  id: string
  locked_by?: string | null
  locked_at?: string | null
}

/**
 * Build the fence filter for a production_jobs write owned by `lockHolderId`.
 *
 * Returns a plain column→value map suitable for PostgREST `.match()`.
 * When `lockHolderId` is omitted it falls back to `job.locked_by` (for code
 * paths that only have the locked row). An unresolvable holder produces a
 * fence that matches nothing — a fenced write with no provable owner must
 * never land.
 */
export function ownedJobFence(
  job: OwnedJobRef,
  lockHolderId?: string | null,
): Record<string, string> {
  const holder = String(lockHolderId ?? job.locked_by ?? '').trim()
  const fence: Record<string, string> = {
    id: job.id,
    locked_by: holder || '__no_lock_holder__',
    status: 'running',
  }
  if (job.locked_at) fence.locked_at = String(job.locked_at)
  return fence
}

/**
 * True when a fenced `.single()` update failed because the fence matched 0
 * rows (PostgREST PGRST116) — i.e. the lock was lost / the job was
 * superseded, NOT a real database error.
 */
export function isLockLostError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST116') return true
  return /multiple \(or no\) rows returned|Cannot coerce the result to a single JSON object/i.test(
    String(error.message || ''),
  )
}

/**
 * Human-readable explanation used when a fenced write is skipped, so job
 * logs clearly distinguish "superseded, intentionally not written" from a
 * real failure.
 */
export function lockLostMessage(step: string, jobId: string): string {
  return (
    `[job-lock-guard] Fenced write skipped at step "${step}" for job ` +
    `${jobId.slice(0, 8)}: lock lost or job superseded (failed/re-dispatched ` +
    `while this invocation was still running). Step output abandoned; the ` +
    `active replacement job owns the series now. ` +
    `(ATL-RENDER-STATE-INDEX-001)`
  )
}

/** Statuses covered by the partial unique indexes in 20260709100000. */
export const ACTIVE_INDEX_STATUSES = ['queued', 'running', 'waiting_for_external'] as const

/** Predicate mirroring production_jobs_one_active_per_series/_story. */
export function isActiveIndexStatus(status: string | null | undefined): boolean {
  return ACTIVE_INDEX_STATUSES.includes(String(status ?? '') as (typeof ACTIVE_INDEX_STATUSES)[number])
}

/**
 * True when a write failed on one of the active-uniqueness partial indexes
 * (Postgres 23505). Callers that legitimately race dispatch (e.g. operator
 * requeue scripts) should treat this as "blocked by design", not a crash.
 */
export function isActiveUniquenessViolation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    /production_jobs_one_active_per_(series|story)/.test(msg) ||
    (error.code === '23505' && /production_jobs/.test(msg))
  )
}
