/**
 * Shared Airtable fetch helpers for admin marketing routes.
 *
 * - Exponential backoff retry for transient failures (429 + 5xx + network).
 * - 429 honors the server Retry-After header before falling back to backoff.
 * - 401/403/404 are NEVER retried; callers map them to distinct responses.
 * - Never logs credential values (only status codes / table ids).
 */

export class AirtableHttpError extends Error {
  readonly status: number
  readonly retryAfterMs: number | null

  constructor(status: number, tableLabel: string, retryAfterMs: number | null = null) {
    // Body intentionally omitted: Airtable error bodies can echo request
    // details and must never reach logs alongside auth material.
    super(`Airtable request failure ${tableLabel} ${status}`)
    this.name = 'AirtableHttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }

  /** True for auth/identity failures that retry can never fix. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** True when the record/table/view does not exist. */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** True when the request was rate-limited. */
  get isRateLimited(): boolean {
    return this.status === 429
  }
}

export interface RetryOptions {
  /** Max attempts including the initial call. Default 4. */
  maxAttempts?: number
  /** Base delay in ms before doubling. Default 500. */
  baseDelayMs?: number
  /** Cap for any single delay in ms. Default 8000. */
  maxDelayMs?: number
  /** Sleep implementation (overridable in tests). */
  sleep?: (ms: number) => Promise<void>
  /** Fetch implementation (overridable in tests). */
  fetchImpl?: typeof fetch
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000)
  }
  const dateMs = Date.parse(value)
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now()
    if (delta > 0) return Math.min(delta, 60_000)
  }
  return null
}

/**
 * fetch() with exponential backoff. Retries 429 (honoring Retry-After),
 * 5xx, and network errors. Throws AirtableHttpError for HTTP failures
 * without retrying 401/403/404.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tableLabel: string,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    maxAttempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    sleep = defaultSleep,
    fetchImpl = fetch,
  } = options

  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response
    try {
      response = await fetchImpl(url, init)
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) break
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs))
      continue
    }

    if (response.ok) return response

    const retryAfterMs = response.status === 429
      ? parseRetryAfterMs(response.headers.get('retry-after'))
      : null

    // Drain the body so sockets can be reused; body content is discarded,
    // never logged (may contain request details).
    try { await response.text() } catch { /* ignore */ }

    const error = new AirtableHttpError(response.status, tableLabel, retryAfterMs)

    // Auth failures and missing records are permanent — fail fast, no retry.
    if (error.isAuthFailure || error.isNotFound) throw error

    lastError = error
    if (attempt === maxAttempts) break

    // 429 prefers the server's Retry-After; 5xx uses exponential backoff.
    const backoffMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
    const delayMs = response.status === 429 && retryAfterMs !== null
      ? Math.min(retryAfterMs, maxDelayMs)
      : backoffMs
    await sleep(delayMs)
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Map an AirtableHttpError to the HTTP status the route should return. */
export function statusForAirtableError(error: unknown): number {
  if (error instanceof AirtableHttpError) {
    if (error.isAuthFailure) return 502 // upstream credential rejected; route stays 401 for its own auth
    if (error.isNotFound) return 404
    if (error.isRateLimited) return 429
    return 502
  }
  return 500
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

/**
 * Minimal in-memory TTL cache for successful GET payloads.
 * Per-process, short TTL; safe for read-only admin list endpoints.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { expiresAt: Date.now() + this.ttlMs, value })
  }

  clear(): void {
    this.entries.clear()
  }
}
