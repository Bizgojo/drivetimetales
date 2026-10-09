/**
 * COVER-PIPELINE-DECOUPLE-001 — Cover Retry Module (cover_retry)
 *
 * Task 4 (Marc directive 2026-10-08): cover generation failures must retry
 * through a dedicated module instead of failing the package on first error.
 *
 * Triggers (retryable failure classes):
 *   - invalid_composition — luminance/brightness gate failed, unreadable layout
 *   - missing_subject    — no clear focal subject / unrelated generic scenery
 *   - failed_render      — provider HTTP 5xx/429, non-JSON, non-image download
 *   - empty_asset        — provider returned no image data / empty buffer
 *
 * Policy: up to COVER_MAX_RETRIES (3) retries. Each retry regenerates the
 * prompt via Holly (Strategos prompt hook), re-dispatches generation, and
 * re-validates the result. Non-retryable failures (auth, bad request,
 * unknown kinds) return immediately so the caller can flag cover_missing.
 *
 * Pure + injectable (no network, no DB) so regression tests run with mocks
 * and no paid image-model API calls.
 */

export const COVER_MAX_RETRIES = 3

/** Failed retries ≥ this count fires cover_missing_alert (early warning, non-blocking). */
export const COVER_ALERT_AFTER_FAILED_RETRIES = 2

export type CoverFailureClass =
  | 'invalid_composition'
  | 'missing_subject'
  | 'failed_render'
  | 'empty_asset'
  | 'non_retryable'

export interface ClassifiedCoverFailure {
  failureClass: CoverFailureClass
  retryable: boolean
  reason: string
}

/**
 * Classify a cover generation failure from its message + optional details.
 * Mirrors the failure shapes produced by /api/asc3/regenerate-cover
 * (coverFailure substeps) and the luminance gate.
 */
export function classifyCoverFailure(
  message: string,
  details?: { substep?: string; status?: number },
): ClassifiedCoverFailure {
  const msg = String(message || '')
  const substep = String(details?.substep || '')
  const status = Number(details?.status || 0)
  const text = `${msg} ${substep}`.toLowerCase()

  // Auth / client errors are never retried (Marc-governed keys / bad request).
  if (status === 401 || status === 403 || /unauthorized|invalid api key|forbidden/i.test(text)) {
    return { failureClass: 'non_retryable', retryable: false, reason: 'Provider auth failure — Marc-governed key issue, not a render defect.' }
  }
  if (status === 400 || /bad request|invalid request|content_policy|policy violation|safety system/i.test(text)) {
    return { failureClass: 'non_retryable', retryable: false, reason: 'Provider rejected the request — prompt/policy issue, retry needs Marc-visible prompt change.' }
  }

  if (/no image data|returned no|empty|zero bytes|no image/i.test(text)) {
    return { failureClass: 'empty_asset', retryable: true, reason: 'Provider returned no image data (empty asset).' }
  }
  if (/non-json|invalid json|non-image response|download|upload|network|timeout|timed out|fetch failed|http 5|http 429|rate limit|overloaded|server error|generation error/i.test(text)) {
    return { failureClass: 'failed_render', retryable: true, reason: 'Render transport failure (provider error, bad payload, or download failure).' }
  }
  if (/luminance|too dark|brightness|composition|unreadable|thumbnail/i.test(text)) {
    return { failureClass: 'invalid_composition', retryable: true, reason: 'Composition failed validation (luminance/brightness/readability).' }
  }
  if (/no subject|missing subject|generic|unrelated scenery|no focal|subject/i.test(text)) {
    return { failureClass: 'missing_subject', retryable: true, reason: 'Render lacks the required focal subject.' }
  }

  return { failureClass: 'non_retryable', retryable: false, reason: 'Unclassified cover failure — not safe to auto-retry.' }
}

/**
 * Holly prompt regeneration hook: given the base prompt + failure class +
 * attempt number, produce the retry prompt. Callers pass this as
 * regeneratePrompt; Holly owns prompt strategy, the module owns retry discipline.
 */
export function buildStrategosRetryPrompt(
  basePrompt: string,
  failureClass: CoverFailureClass,
  attempt: number,
): string {
  const base = String(basePrompt || '').slice(0, 4000)
  const prefix: Record<Exclude<CoverFailureClass, 'non_retryable'>, string> = {
    invalid_composition:
      'HARD COVER RETRY CONSTRAINT (Holly, attempt %N%): the previous render failed composition validation (too dark / unreadable at thumbnail size). Regenerate BRIGHTER with a large, clearly-lit foreground subject, strong subject-background separation, lifted midtones, and no full-frame darkness.',
    missing_subject:
      'HARD COVER RETRY CONSTRAINT (Holly, attempt %N%): the previous render had no clear focal subject. Regenerate with ONE dominant story-specific foreground subject (face, key object, or named place), centered or upper-half, large in frame — no generic landscapes.',
    failed_render:
      'HARD COVER RETRY CONSTRAINT (Holly, attempt %N%): the previous render transport failed. Regenerate the same story-faithful scene with simplified geometry and a single clear subject to maximise render success.',
    empty_asset:
      'HARD COVER RETRY CONSTRAINT (Holly, attempt %N%): the previous call returned an empty asset. Regenerate the same story-faithful scene with simplified geometry and a single clear subject.',
  }
  const head = (prefix[failureClass as keyof typeof prefix] || prefix.failed_render).replace('%N%', String(attempt))
  return `${head} ${base}`.slice(0, 4000)
}

export interface CoverRetryOptions<T> {
  /** Max retries after the initial attempt (default COVER_MAX_RETRIES = 3). */
  maxRetries?: number
  /** Holly prompt hook: (basePrompt, failureClass, attemptNumber) => retryPrompt. */
  regeneratePrompt?: (basePrompt: string, failureClass: CoverFailureClass, attempt: number) => string
  /** Re-validation hook: return an error message when the result is invalid, null when valid. */
  validate?: (result: T) => string | null
  /** Fired after each failed attempt (alert wiring, logging). Never allowed to throw. */
  onRetry?: (info: { attempt: number; failureClass: CoverFailureClass; reason: string; willRetry: boolean }) => void
  /** Override classification (tests / special cases). */
  classify?: (message: string, details?: { substep?: string; status?: number }) => ClassifiedCoverFailure
}

export interface CoverRetryResult<T> {
  ok: boolean
  result?: T
  attempts: number
  failureClass?: CoverFailureClass
  lastError?: string
}

/**
 * Run generate() with Holly retry discipline.
 * - Attempt 1 uses basePrompt; retries use regeneratePrompt output.
 * - validate() failures are classified as invalid_composition (retryable).
 * - Never throws: exhaustion returns { ok:false } so callers flag cover_missing.
 */
export async function withCoverRetry<T>(
  basePrompt: string,
  generate: (prompt: string, attempt: number) => Promise<T>,
  opts: CoverRetryOptions<T> = {},
): Promise<CoverRetryResult<T>> {
  const maxRetries = Math.max(0, Number(opts.maxRetries ?? COVER_MAX_RETRIES))
  const regenerate = opts.regeneratePrompt || buildStrategosRetryPrompt
  const classify = opts.classify || classifyCoverFailure
  let prompt = basePrompt
  let lastError = ''
  let failureClass: CoverFailureClass = 'non_retryable'

  const totalAttempts = 1 + maxRetries
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const result = await generate(prompt, attempt)
      if (opts.validate) {
        const invalidReason = opts.validate(result)
        if (invalidReason) {
          failureClass = 'invalid_composition'
          lastError = invalidReason
          const willRetry = attempt < totalAttempts
          try { opts.onRetry?.({ attempt, failureClass, reason: invalidReason, willRetry }) } catch { /* never break retry */ }
          if (willRetry) {
            prompt = regenerate(basePrompt, failureClass, attempt + 1)
            continue
          }
          return { ok: false, attempts: attempt, failureClass, lastError }
        }
      }
      return { ok: true, result, attempts: attempt }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const details = (err && typeof err === 'object' && 'details' in err)
        ? (err as { details?: { substep?: string; status?: number } }).details
        : undefined
      const classified = classify(msg, details)
      failureClass = classified.failureClass
      lastError = msg
      const willRetry = classified.retryable && attempt < totalAttempts
      try { opts.onRetry?.({ attempt, failureClass, reason: classified.reason, willRetry }) } catch { /* never break retry */ }
      if (!willRetry) {
        return { ok: false, attempts: attempt, failureClass, lastError }
      }
      prompt = regenerate(basePrompt, failureClass, attempt + 1)
    }
  }
  return { ok: false, attempts: totalAttempts, failureClass, lastError }
}
