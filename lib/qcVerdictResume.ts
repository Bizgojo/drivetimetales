/**
 * RETRY-QC-001 (Marc GO 2026-11-16 15:35 EST): auto-resume a production job
 * that stopped because segment transcript/loudness QC rejected a take.
 *
 * Why: on Nov 15/16 Mercy Island (job 2f68f4cb) sat idle for ~16 hours at
 * series_generate_voices. Whisper heard "now." where the script says "Nell."
 * — a one-word cast-name line that voice QC could not match (similarity
 * 57.1%). The job failed three times, nobody was paged, and the pipeline
 * never retried it because BOTH existing resume classes decline a QC verdict:
 *   - RETRY-NET-001 only resumes transport failures (fetch/socket/5xx).
 *   - the blocked-Belle path only resumes belle_*_blocked errors.
 * A QC verdict is a content judgement, so it was left for a human — but the
 * *cause* was fixable (PR #667 QC-ONE-WORD-NAME-001 relaxed the one-word
 * cast-name rule) and the recovery is a plain retry from saved progress.
 *
 * What: a failed job whose error is a segment transcript/loudness QC verdict
 * is re-queued at the SAME step, up to MAX_QC_RESUMES times, with a longer
 * back-off than network blips. Segments already on disk are skipped, so
 * nothing is redone and no audio is paid for twice.
 *
 * Deliberately NOT covered (these still go to a human):
 *   - REPEATED_IDENTICAL_TRUNCATION: the code already says "Retrying will not
 *     help. Split this segment" and attempts a split rescue first.
 *   - TRANSCRIPT_AMBIGUOUS (Whisper returned "?"/empty): audio is broken, not
 *     a QC threshold; needs the artifact inspected.
 *   - Account-wide causes (bad key, no credits, overage cap).
 */

/** Total automatic resumes of a QC-rejected job before it goes to a human. */
export const MAX_QC_RESUMES = 3

/** Back-off before each resume: 5, 15, 30 minutes. QC disagreement is not a blip. */
export const QC_RESUME_BACKOFF_MS = [5, 15, 30].map((m) => m * 60_000)

/**
 * Segment QC verdicts that a plain retry can clear.
 * Matched against the failing call's error text.
 */
const RESUMABLE_QC_PATTERNS: RegExp[] = [
  // "Segment transcript QC failed for segment_0015.mp3: expected "Nell.", detected "now." (similarity: 57.1%)"
  /Segment transcript QC failed for \S+/,
  // "Segment loudness QC failed for segment_0015.mp3: best candidate ... LUFS"
  /Segment loudness QC failed for \S+/,
]

/**
 * QC verdicts that a retry cannot fix — the audio itself is wrong or the
 * detector is provably stuck. Checked FIRST so they can never be resumed.
 */
const NON_RESUMABLE_QC_PATTERNS: RegExp[] = [
  /REPEATED_IDENTICAL_TRUNCATION/,
  /TRANSCRIPT_AMBIGUOUS/,
  /Whisper returned "\?""?/,
  /Retrying will not help/i,
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

/**
 * Pull the failing call's text out of a job's error_json. Mirrors
 * errorTextOf() in lib/transientResume.ts but ALSO reaches the per-episode
 * series wrapper, where the QC message sits under
 * `episodeResult` / `voiceGenerationReport.failures[]`.
 */
export function qcErrorTextOf(errorJson: unknown): string {
  if (!errorJson) return ''
  if (typeof errorJson === 'string') return errorJson
  if (typeof errorJson !== 'object') return String(errorJson)
  const e = errorJson as Record<string, unknown>
  const parts: unknown[] = [e.message, e.error, e.reason]
  if (e.detail && typeof e.detail === 'object') parts.push((e.detail as Record<string, unknown>).error)
  else parts.push(e.detail)

  for (const key of ['voiceGenerationReport', 'preflightReport', 'episodeResult', 'report']) {
    const nested = e[key]
    if (!nested || typeof nested !== 'object') continue
    const n = nested as Record<string, unknown>
    parts.push(n.error, n.message)
    if (Array.isArray(n.failures)) {
      for (const f of n.failures) {
        if (typeof f === 'string') parts.push(f)
        else if (f && typeof f === 'object') parts.push((f as Record<string, unknown>).error, (f as Record<string, unknown>).message)
      }
    }
  }
  return parts.filter((p) => typeof p === 'string' && p.trim()).join('\n')
}

/** True when the text is a QC verdict a plain retry can clear. */
export function isResumableQcFailure(text: string): boolean {
  if (!text) return false
  if (NON_RESUMABLE_QC_PATTERNS.some((re) => re.test(text))) return false
  return RESUMABLE_QC_PATTERNS.some((re) => re.test(text))
}

export type QcResumeDecision =
  | { action: 'resume'; attempt: number; step: string }
  | { action: 'wait'; attempt: number; retryAtMs: number }
  | { action: 'exhausted'; attempt: number }
  | null

/**
 * Pure decision for one failed job. null = not a resumable QC verdict
 * (leave it alone for a human). 'wait' = eligible but still inside back-off.
 */
export function qcResumeDecision(job: JobLike, nowMs: number = Date.now()): QcResumeDecision {
  if (!job || job.status !== 'failed') return null
  if (String(job.job_type || '').startsWith('TEST_')) return null
  const step = String(job.current_step || '').trim()
  if (!step) return null
  const err = job.error_json && typeof job.error_json === 'object' ? (job.error_json as Record<string, unknown>) : null
  if (err && ACCOUNT_WIDE.has(String(err.transient_cause || ''))) return null
  if (err && err.exhausted === true) return null
  if (!isResumableQcFailure(qcErrorTextOf(job.error_json))) return null
  const state = job.state_json && typeof job.state_json === 'object' ? (job.state_json as Record<string, unknown>) : {}
  const done = Number(state.qcResumeCount ?? 0) || 0
  if (done >= MAX_QC_RESUMES) return { action: 'exhausted', attempt: done }
  const failedAt = Date.parse(String(job.updated_at || ''))
  const backoff = QC_RESUME_BACKOFF_MS[Math.min(done, QC_RESUME_BACKOFF_MS.length - 1)]
  if (Number.isFinite(failedAt) && nowMs - failedAt < backoff) {
    return { action: 'wait', attempt: done + 1, retryAtMs: failedAt + backoff }
  }
  return { action: 'resume', attempt: done + 1, step }
}
