/**
 * ATLAS-SERIES-PREFLIGHT-SELFFETCH-001 (2026-10-11, Class A)
 *
 * run-next → generate-voices is an in-platform HTTP self-fetch
 * (`runGenerateVoicesPreflightRequest` in
 * app/api/admin/production-jobs/run-next/route.ts). On 2026-10-11
 * 23:30–23:33 UTC three consecutive series_voice_preflight invocations for
 * The Extraction EP1 (jobs e910b19d, 0b44e30b, df24aaa1) died with a bare
 * undici `fetch failed` (status 0 — transport death before any HTTP
 * response, NOT the 120s abort). The cause chain (errno) was discarded, no
 * retry was attempted, and the failure was persisted WITHOUT a transient
 * tag — so dispatch-queue treated an infra blip as a story defect, created
 * a new job every cycle, and the failure circuit parked all 3 episodes in
 * repair_queue.
 *
 * This module holds the pure, unit-tested pieces of the fix:
 *   1. serializeSelfFetchCause — full .cause chain (errno preserved), same
 *      proven shape as serializeFetchErrorCause in lib/pipeline-runner.
 *   2. selfFetchHaystack — "name: message code" per frame, so the ANCHORED
 *      patterns in lib/transientFailure.ts match raw errors. (The stored
 *      composed message "generate-voices preflight request failed: fetch
 *      failed" does NOT match `TypeError: fetch failed` — verified
 *      2026-10-11 — so classification must run on the raw error, not the
 *      composed string. lib/transientFailure.ts is intentionally untouched:
 *      bare "fetch failed" must never match, or story dialogue such as
 *      "the fetch failed" would classify as infra.)
 *   3. isConnectionKindFetchError — connection-kind only (safe to retry:
 *      the server likely never saw the request). Abort/timeout is NOT
 *      connection-kind (the server may still be working).
 *   4. fetchWithConnectionRetry — bounded retry w/ backoff+jitter for
 *      connection-kind throws only. Responses (even 5xx) are returned, never
 *      retried here.
 *
 * No DB writes, no network. Sleep is injectable for tests.
 */

import { classifyTransientFailure, type TransientCause } from './transientFailure'

export type SelfFetchCauseFrame = { name: string; message: string; code?: string }

const MAX_FRAMES = 8

/** Full .cause chain of a fetch error; errno (code) preserved per frame. */
export function serializeSelfFetchCause(err: unknown): SelfFetchCauseFrame[] {
  const frames: SelfFetchCauseFrame[] = []
  const seen = new Set<unknown>()
  const queue: unknown[] = [err]
  while (queue.length > 0 && frames.length < MAX_FRAMES) {
    const cur = queue.shift()
    if (cur == null || seen.has(cur)) continue
    seen.add(cur)
    if (cur instanceof Error) {
      const code = (cur as { code?: unknown }).code
      frames.push({
        name: String(cur.name || 'Error'),
        message: String(cur.message || '').slice(0, 500),
        ...(typeof code === 'string' && code ? { code } : {}),
      })
      if (frames.length >= MAX_FRAMES) break
      const agg = (cur as { errors?: unknown }).errors
      if (Array.isArray(agg)) {
        for (const sub of agg.slice(0, 4)) queue.push(sub)
      }
      const cause = (cur as { cause?: unknown }).cause
      if (cause != null) queue.push(cause)
    } else {
      frames.push({ name: typeof cur, message: String(cur).slice(0, 500) })
    }
  }
  return frames
}

/**
 * Classification haystack for a raw fetch error. "name: message" colon form
 * per frame so anchored lib/transientFailure.ts patterns
 * ("TypeError: fetch failed", "Error: socket hang up") match the RAW error.
 */
export function selfFetchHaystack(err: unknown): string {
  return serializeSelfFetchCause(err)
    .map((f) => `${f.name}: ${f.message}${f.code ? ` ${f.code}` : ''}`)
    .join(' | ')
    .slice(0, 20_000)
}

/** Classify a raw self-fetch transport error (null = not transient). */
export function classifySelfFetchTransportError(err: unknown): TransientCause | null {
  const hay = selfFetchHaystack(err)
  if (!hay.trim()) return null
  return classifyTransientFailure(hay)
}

const CONNECTION_HAY_RE =
  /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR_[A-Z_]+|network/i

/** True only for transport death (safe to retry). Abort/timeout → false. */
export function isConnectionKindFetchError(err: unknown): boolean {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return false
  const hay = serializeSelfFetchCause(err)
    .map((f) => `${f.name} ${f.message} ${f.code ?? ''}`)
    .join(' | ')
  if (/AbortError|TimeoutError|aborted|timed out/i.test(hay)) return false
  return CONNECTION_HAY_RE.test(hay)
}

export type SelfFetchRetryOptions = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitterMs?: number
  sleepFn?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type SelfFetchAttemptLog = { attempt: number; cause: SelfFetchCauseFrame[] }

/**
 * Run doFetch, retrying connection-kind THROWS (never responses) with
 * exponential backoff + jitter. Returns the value plus a per-attempt cause
 * log for forensics. Throws the last error when attempts are exhausted.
 */
export async function fetchWithConnectionRetry<T>(
  doFetch: () => Promise<T>,
  opts: SelfFetchRetryOptions = {},
): Promise<{ value: T; attempts: number; failures: SelfFetchAttemptLog[] }> {
  const attempts = Math.max(1, Math.min(opts.attempts ?? 3, 5))
  const baseDelayMs = opts.baseDelayMs ?? 2000
  const maxDelayMs = opts.maxDelayMs ?? 15000
  const jitterMs = opts.jitterMs ?? 2000
  const sleepFn = opts.sleepFn ?? defaultSleep
  const failures: SelfFetchAttemptLog[] = []

  let lastError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const value = await doFetch()
      return { value, attempts: attempt, failures }
    } catch (err: unknown) {
      lastError = err
      failures.push({ attempt, cause: serializeSelfFetchCause(err) })
      if (attempt >= attempts || !isConnectionKindFetchError(err)) break
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
        + Math.floor(Math.random() * Math.max(0, jitterMs))
      await sleepFn(delay)
    }
  }
  throw lastError
}
