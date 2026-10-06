/**
 * ATLAS-P3-REPAIR-002 — render fetch/mix error surfacing.
 *
 * Pure helpers (no I/O) shared by the asc3 render core:
 *
 *  - Chunk timeout: per-segment / per-asset download budget
 *    (RENDER_CHUNK_TIMEOUT_MS, default 120s). Failures surface as
 *    DOWNLOAD_TIMEOUT / DOWNLOAD_HTTP_<status> / DOWNLOAD_FETCH_ERROR so
 *    operators can tell a slow chunk from a dead host from a 404.
 *
 *  - Mix timeout: per-ffmpeg-invocation budget (RENDER_MIX_TIMEOUT_MS,
 *    default 600s — inside the 740s runner deadline for the calls that
 *    matter, generous everywhere else). Failures surface as
 *    MIX_TIMEOUT / MIX_KILLED / MIX_OOM / MIX_FAILED so a SIGKILLed ffmpeg
 *    is never misread as a corrupt segment.
 *
 * Timeout vs kill disambiguation: Node's execFile timeout kills with
 * SIGTERM (err.killed=true, signal='SIGTERM') — identical to an external
 * SIGTERM. The wrapper records start time; killed + elapsed >= budget is a
 * MIX_TIMEOUT, killed well under budget is a MIX_KILLED.
 */

export const RENDER_CHUNK_TIMEOUT_MS =
  Number(process.env.RENDER_CHUNK_TIMEOUT_MS ?? 120_000) || 120_000

export const RENDER_MIX_TIMEOUT_MS =
  Number(process.env.RENDER_MIX_TIMEOUT_MS ?? 600_000) || 600_000

export type DownloadErrorKind = 'timeout' | 'http' | 'fetch'

/**
 * Build a distinct, greppable download error. Pure — unit-tested.
 *
 * @param err       The caught fetch error (or HTTP status wrapper)
 * @param url       Chunk URL (echoed so logs identify the asset)
 * @param timeoutMs Chunk budget that was enforced
 * @param attempt   1-based attempt number
 */
export function classifyDownloadError(
  err: unknown,
  url: string,
  timeoutMs: number,
  attempt: number,
): { kind: DownloadErrorKind; error: Error } {
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err)
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /aborted|timed out/i.test(msg)
  ) {
    return {
      kind: 'timeout',
      error: new Error(
        `DOWNLOAD_TIMEOUT after ${timeoutMs}ms (attempt ${attempt}): ${url}`,
      ),
    }
  }
  const httpMatch = msg.match(/Download failed (\d{3})/)
  if (httpMatch) {
    return {
      kind: 'http',
      error: new Error(`DOWNLOAD_HTTP_${httpMatch[1]} (attempt ${attempt}): ${url} — ${msg}`),
    }
  }
  return {
    kind: 'fetch',
    error: new Error(`DOWNLOAD_FETCH_ERROR (attempt ${attempt}): ${url} — ${msg}`),
  }
}

export type FfmpegErrorKind = 'timeout' | 'killed' | 'oom' | 'failed'

export interface FfmpegFailureShape {
  signal?: unknown
  code?: unknown
  killed?: unknown
  stderr?: unknown
  message?: unknown
}

/**
 * Distinguish timeout / kill / OOM / plain ffmpeg failure. Pure — unit-tested.
 *
 * @param err       The caught execFile error (shape-typed, never throws)
 * @param label     Human label for the invocation (e.g. 'final mix')
 * @param timeoutMs Budget the wrapper enforced
 * @param elapsedMs Wall time the invocation actually ran
 */
export function classifyFfmpegError(
  err: unknown,
  label: string,
  timeoutMs: number,
  elapsedMs: number,
): { kind: FfmpegErrorKind; error: Error } {
  const shape = (err ?? {}) as FfmpegFailureShape
  const signal = String(shape.signal ?? '')
  const code = String(shape.code ?? '')
  const stderrTail = String(shape.stderr ?? '').slice(-500)
  const msg = err instanceof Error ? err.message : String(shape.message ?? err)
  const detail = `${msg}${stderrTail ? ` | stderr: ${stderrTail}` : ''}`.slice(0, 800)

  if (
    code === 'ENOMEM' ||
    /out of memory|heap out of memory|\bOOM\b/i.test(`${msg} ${stderrTail}`)
  ) {
    return { kind: 'oom', error: new Error(`MIX_OOM (${label}): ${detail}`) }
  }
  const wasKilled =
    shape.killed === true || signal === 'SIGKILL' || signal === 'SIGTERM'
  if (wasKilled) {
    // Our own timeout kills at the budget; anything killed well under budget
    // was killed from outside (container OOM-killer, deploy, operator).
    if (elapsedMs + 5_000 >= timeoutMs) {
      return {
        kind: 'timeout',
        error: new Error(`MIX_TIMEOUT after ${elapsedMs}ms (budget ${timeoutMs}ms, ${label}): ${detail}`),
      }
    }
    return {
      kind: 'killed',
      error: new Error(
        `MIX_KILLED by ${signal || 'external signal'} after ${elapsedMs}ms (${label}): ${detail} ` +
          `(possible container OOM-killer / deploy eviction — check runner memory)`,
      ),
    }
  }
  return { kind: 'failed', error: new Error(`MIX_FAILED (${label}): ${detail}`) }
}
