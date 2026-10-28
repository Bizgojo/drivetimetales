/**
 * RETRY-NET-001 (Marc GO 2026-10-28): auto-resume a production job that
 * failed only because the webapp was briefly unreachable.
 *
 * Why: on Oct 28 three Saturday Repair Shop stops were network blips during
 * EC2 deploys ("fetch failed", "Non-JSON response from /api/admin/generate-voices"
 * while .next was being rebuilt). Each needed a human "restart voices". The
 * job was fine; only the self-fetch failed. The per-segment retry wrapper
 * gives up after ~5 seconds, and a deploy takes minutes.
 *
 * What: a failed job whose error is a self-fetch/transport failure (never a
 * story defect) is re-queued at the SAME step after a back-off, up to
 * MAX_TRANSIENT_RESUMES times. The step resumes from its saved progress
 * (voice segments already on disk are skipped), so nothing is redone.
 *
 * Conservative by design: account-wide causes (bad key, no credits) are NOT
 * resumed here — those need a human and dispatch already pauses for them.
 */

export const MAX_TRANSIENT_RESUMES = 6
/** Back-off before each resume: 2, 4, 8, 15, 30, 30 minutes. */
export const TRANSIENT_RESUME_BACKOFF_MS = [2, 4, 8, 15, 30, 30].map((m) => m * 60_000)

/** Error texts produced by THIS app's own self-fetch / transport layer. */
const SELF_FETCH_PATTERNS: RegExp[] = [
  /\bTypeError: fetch failed\b/,
  /^fetch failed$/m,
  /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_[A-Z_]+)\b/,
  /\bError: socket hang up\b/,
  /\b(Non-JSON|Empty) response from \/api\//,
  /\bSeries voice segment fetch failed for Ep\d+ seg\d+: no response after \d+ retries\b/,
  /\b(502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout)\b/,
]

/** Causes that need a human (keys / balances) — never auto-resumed here. */
const ACCOUNT_WIDE = new Set(['elevenlabs_auth_or_quota', 'anthropic_auth_or_credit', 'openai_quota'])

type JobLike = {
  status?: string | null
  current_step?: string | null
  job_type?: string | null
  updated_at?: string | null
  error_json?: unknown
  state_json?: unknown
}

export function errorTextOf(errorJson: unknown): string {
  if (!errorJson) return ''
  if (typeof errorJson === 'string') return errorJson
  if (typeof errorJson !== 'object') return String(errorJson)
  const e = errorJson as Record<string, unknown>
  const parts = [e.message, e.error, e.reason, e.detail && typeof e.detail === 'object' ? (e.detail as Record<string, unknown>).error : e.detail]
  return parts.filter((p) => typeof p === 'string' && p.trim()).join('\n')
}

export function isSelfFetchFailure(text: string): boolean {
  if (!text) return false
  return SELF_FETCH_PATTERNS.some((re) => re.test(text))
}

export type TransientResumeDecision =
  | { action: 'resume'; attempt: number; step: string }
  | { action: 'wait'; attempt: number; retryAtMs: number }
  | { action: 'exhausted'; attempt: number }
  | null

/**
 * Pure decision for one failed job. null = not a transient self-fetch failure
 * (leave it alone). 'wait' = eligible but still inside its back-off window.
 */
export function transientResumeDecision(job: JobLike, nowMs: number = Date.now()): TransientResumeDecision {
  if (!job || job.status !== 'failed') return null
  if (String(job.job_type || '').startsWith('TEST_')) return null
  const step = String(job.current_step || '').trim()
  if (!step) return null
  const err = job.error_json && typeof job.error_json === 'object' ? (job.error_json as Record<string, unknown>) : null
  if (err && ACCOUNT_WIDE.has(String(err.transient_cause || ''))) return null
  if (err && err.exhausted === true) return null
  if (!isSelfFetchFailure(errorTextOf(job.error_json))) return null
  const state = job.state_json && typeof job.state_json === 'object' ? (job.state_json as Record<string, unknown>) : {}
  const done = Number(state.transientResumeCount ?? 0) || 0
  if (done >= MAX_TRANSIENT_RESUMES) return { action: 'exhausted', attempt: done }
  const failedAt = Date.parse(String(job.updated_at || ''))
  const backoff = TRANSIENT_RESUME_BACKOFF_MS[Math.min(done, TRANSIENT_RESUME_BACKOFF_MS.length - 1)]
  if (Number.isFinite(failedAt) && nowMs - failedAt < backoff) {
    return { action: 'wait', attempt: done + 1, retryAtMs: failedAt + backoff }
  }
  return { action: 'resume', attempt: done + 1, step }
}
