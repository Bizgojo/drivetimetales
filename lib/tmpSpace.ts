/**
 * TMP-SPACE-LOW-001 (Marc GO 2026-10-06)
 *
 * Shared runner-disk helpers for every code path that stages audio in /tmp
 * (assembleAndVerifyFinalMix, personalizedFinalMix, render scripts).
 *
 * Policy:
 *   - Early abort: throw a TMP_SPACE_LOW-marked error when free space drops
 *     below TMP_ABORT_MIN_BYTES (50 MB) mid-render. The marker classifies via
 *     lib/transientFailure.ts as `runner_tmp_full` (infra-transient), so
 *     dispatch backs off and retries instead of parking the story.
 *   - Post-cleanup warn: log a warning when free space is still below
 *     TMP_WARN_BYTES (200 MB) after temp-dir cleanup.
 *   - Naming: every mix temp dir uses the `et-mix-<label>-*` prefix so a
 *     sweeper can safely target stale mix dirs without touching anything else.
 *
 * This module is pure Node (fs/os/path only) so render scripts and Next.js
 * lib code can share it. No DB writes, no network.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/** Abort a render when free /tmp space drops below this (50 MB). */
export const TMP_ABORT_MIN_BYTES = 50 * 1024 * 1024

/** Warn after cleanup when free /tmp space is still below this (200 MB). */
export const TMP_WARN_BYTES = 200 * 1024 * 1024

/**
 * Max parallel segment downloads during a mix render. The plan's core.ts
 * Fluid-render change (10 → 4) has no direct counterpart in this repo —
 * segment downloads here are sequential or small Promise.all batches — so
 * this constant caps them explicitly at 4 via limitedParallel().
 */
export const RENDER_DOWNLOAD_CONCURRENCY = 4

/** Prefix for every mix temp dir. Safe for sweeper targeting. */
export const ET_MIX_PREFIX = 'et-mix-'

/** Marker embedded in abort errors so classification needs no errno parsing. */
export const TMP_SPACE_LOW_MARKER = 'TMP_SPACE_LOW'

/** Free bytes on the filesystem holding `dir` (defaults to os.tmpdir()). */
export function tmpFreeBytes(dir: string = os.tmpdir()): number | null {
  try {
    const st = fs.statvfsSync(dir)
    return Number(st.bavail) * Number(st.bsize)
  } catch {
    return null
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Log free /tmp space at a render stage (after download, after assembly,
 * post-cleanup). Returns free bytes (null when unmeasurable). Warns when
 * free < TMP_WARN_BYTES after cleanup.
 */
export function logTmpSpace(
  stage: string,
  extra?: { peakEstimateBytes?: number; dir?: string },
): number | null {
  const free = tmpFreeBytes(extra?.dir)
  const parts = [`[tmp-space] ${stage}: free=${free == null ? 'unknown' : mb(free)}`]
  if (extra?.peakEstimateBytes != null) parts.push(`peak_estimate=${mb(extra.peakEstimateBytes)}`)
  const line = parts.join(' ')
  if (free != null && free < TMP_WARN_BYTES && /cleanup|post/i.test(stage)) {
    console.warn(`${line} — WARN below ${mb(TMP_WARN_BYTES)} post-cleanup`)
  } else {
    console.log(line)
  }
  return free
}

/**
 * Throw a TMP_SPACE_LOW-marked (hence transient-classified) error when free
 * space is below `minBytes` (default 50 MB). Call mid-render: after the
 * download loop and before ffmpeg concat. `statFree` is injectable for tests.
 */
export function assertTmpSpaceOrThrow(
  stage: string,
  minBytes: number = TMP_ABORT_MIN_BYTES,
  statFree?: () => number | null,
): void {
  const free = statFree ? statFree() : tmpFreeBytes()
  if (free == null) return // unmeasurable — do not block the render
  if (free < minBytes) {
    throw new Error(
      `${TMP_SPACE_LOW_MARKER}: free ${mb(free)} < required ${mb(minBytes)} at stage "${stage}" ` +
        `(ENOSPC guard; runner_tmp_full — safe to retry after back-off)`,
    )
  }
}

/** Build an `et-mix-<label>-*` mkdtemp prefix for a mix temp dir. */
export function etMixPrefix(label: string): string {
  const clean = String(label || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'job'
  return path.join(os.tmpdir(), `${ET_MIX_PREFIX}${clean}-`)
}

/**
 * Run `tasks` with at most `limit` in flight (default
 * RENDER_DOWNLOAD_CONCURRENCY). Preserves order. Rejects on first error
 * like Promise.all.
 */
export async function limitedParallel<T>(
  tasks: Array<() => Promise<T>>,
  limit: number = RENDER_DOWNLOAD_CONCURRENCY,
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), tasks.length) }, async () => {
    while (next < tasks.length) {
      const idx = next
      next += 1
      results[idx] = await tasks[idx]()
    }
  })
  await Promise.all(workers)
  return results
}
