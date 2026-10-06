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

/** Log tag for the pre-fetch /tmp probe (ATLAS-TMP-PROBE-001). */
export const TMP_PREFETCH_PROBE_TAG = '[tmp-probe]'

/** One et-mix-* entry observed by the pre-fetch probe. */
export interface TmpEtMixEntry {
  name: string
  /** Recursive byte size; null when the dir could not be stat'ed. */
  sizeBytes: number | null
}

/** Structured result of the pre-fetch /tmp probe. */
export interface TmpPrefetchProbe {
  stage: string
  /** Free MB on the /tmp filesystem; null when unmeasurable. */
  freeMb: number | null
  /** et-mix-* dir names + sizes present at probe time. */
  etMixDirs: TmpEtMixEntry[]
  /** Peak working-set estimate in bytes; null = placeholder (unknown pre-fetch). */
  peakEstimateBytes: number | null
  /** Human note explaining a placeholder estimate. */
  peakEstimateNote: string | null
}

/** Injectable filesystem surface for probeTmpBeforeFetch (real fs by default). */
export interface TmpProbeFs {
  readdir: (dir: string) => string[] | Promise<string[]>
  dirSizeBytes: (dir: string) => number | null | Promise<number | null>
}

function defaultTmpProbeFs(): TmpProbeFs {
  return {
    readdir: (dir: string) => fs.readdirSync(dir),
    dirSizeBytes: (dir: string) => {
      try {
        let total = 0
        const walk = (p: string): void => {
          const st = fs.statSync(p)
          if (st.isDirectory()) {
            for (const child of fs.readdirSync(p)) walk(path.join(p, child))
          } else {
            total += st.size
          }
        }
        walk(dir)
        return total
      } catch {
        return null
      }
    },
  }
}

function mb1(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * ATLAS-TMP-PROBE-001 (Marc GO 2026-10-06): pre-fetch /tmp probe.
 *
 * Runs BEFORE the fetch/download stage of a mix render. Captures:
 *   - free MB (numeric) on the /tmp filesystem,
 *   - et-mix-* dir names + recursive sizes,
 *   - peak working-set estimate (placeholder when segment sizes are not
 *     yet known pre-fetch — callers may pass peakEstimateBytes when the
 *     storage listing already carries sizes).
 *
 * Pure + never throws: on any filesystem error the affected field is null
 * and the probe still returns. No DB writes, no network.
 */
export function probeTmpBeforeFetch(
  stage = 'pre-fetch',
  opts?: { dir?: string; peakEstimateBytes?: number; peakEstimateNote?: string; fs?: TmpProbeFs },
): TmpPrefetchProbe {
  const base = opts?.dir ?? os.tmpdir()
  const probeFs = opts?.fs ?? defaultTmpProbeFs()
  let freeMb: number | null = null
  try {
    const free = tmpFreeBytes(base)
    freeMb = free == null ? null : Math.floor(free / 1024 / 1024)
  } catch {
    freeMb = null
  }
  let etMixDirs: TmpEtMixEntry[] = []
  try {
    const names = (probeFs.readdir(base) as unknown) as string[]
    const list = Array.isArray(names) ? names : []
    etMixDirs = list
      .filter((n) => typeof n === 'string' && n.startsWith(ET_MIX_PREFIX))
      .sort()
      .map((n) => ({ name: n, sizeBytes: null as number | null }))
  } catch {
    etMixDirs = []
  }
  // Size each dir individually so one bad dir does not blank the listing.
  // Thenables (async injected fs) are treated as unknown — use the async
  // variant for those. Sync path keeps render hot paths pure-sync.
  etMixDirs = etMixDirs.map((e) => {
    let sizeBytes: number | null = null
    try {
      const s = probeFs.dirSizeBytes(path.join(base, e.name)) as unknown
      sizeBytes = typeof s === 'number' ? s : null
    } catch {
      sizeBytes = null
    }
    return { ...e, sizeBytes }
  })
  return {
    stage,
    freeMb,
    etMixDirs,
    peakEstimateBytes: opts?.peakEstimateBytes ?? null,
    peakEstimateNote:
      opts?.peakEstimateBytes != null
        ? (opts?.peakEstimateNote ?? null)
        : (opts?.peakEstimateNote ?? 'placeholder — segment sizes unknown pre-fetch'),
  }
}

/**
 * Async variant of probeTmpBeforeFetch for injected async filesystems
 * (tests). Real render code uses the sync probeTmpBeforeFetch.
 */
export async function probeTmpBeforeFetchAsync(
  stage = 'pre-fetch',
  opts?: { dir?: string; peakEstimateBytes?: number; peakEstimateNote?: string; fs?: TmpProbeFs },
): Promise<TmpPrefetchProbe> {
  const probe = probeTmpBeforeFetch(stage, { ...opts, fs: { readdir: () => [], dirSizeBytes: () => null } })
  const base = opts?.dir ?? os.tmpdir()
  const probeFs = opts?.fs ?? defaultTmpProbeFs()
  let names: string[] = []
  try {
    names = (await probeFs.readdir(base) as unknown) as string[]
    if (!Array.isArray(names)) names = []
  } catch {
    names = []
  }
  const entries = names.filter((n) => typeof n === 'string' && n.startsWith(ET_MIX_PREFIX)).sort()
  const etMixDirs: TmpEtMixEntry[] = []
  for (const n of entries) {
    let sizeBytes: number | null = null
    try {
      sizeBytes = (await probeFs.dirSizeBytes(path.join(base, n))) ?? null
    } catch {
      sizeBytes = null
    }
    etMixDirs.push({ name: n, sizeBytes })
  }
  return { ...probe, etMixDirs }
}

/**
 * Single-line formatter for the pre-fetch probe. Always embeds the numeric
 * free-MB value (or `unknown`) and the et-mix dir listing so the line is
 * self-contained in production_jobs.logs.
 */
export function formatTmpPrefetchProbe(probe: TmpPrefetchProbe): string {
  const free = probe.freeMb == null ? 'unknown' : String(probe.freeMb)
  const dirs =
    probe.etMixDirs.length === 0
      ? 'none'
      : probe.etMixDirs
          .map((e) => `${e.name}(${e.sizeBytes == null ? 'unknown' : mb1(e.sizeBytes)})`)
          .join(', ')
  const peak =
    probe.peakEstimateBytes != null
      ? mb1(probe.peakEstimateBytes)
      : `unknown(${probe.peakEstimateNote ?? 'placeholder'})`
  return `${TMP_PREFETCH_PROBE_TAG} ${probe.stage}: free_mb=${free} et_mix_dirs=${probe.etMixDirs.length} [${dirs}] peak_estimate=${peak}`
}

/**
 * Run the pre-fetch probe and console.log the formatted line. Returns the
 * structured probe so callers can persist it to production_jobs.logs.
 */
export function logTmpPrefetchProbe(
  stage = 'pre-fetch',
  opts?: { dir?: string; peakEstimateBytes?: number; peakEstimateNote?: string },
): TmpPrefetchProbe {
  const probe = probeTmpBeforeFetch(stage, opts)
  console.log(formatTmpPrefetchProbe(probe))
  return probe
}

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

/** Injectable filesystem surface for sweepStaleEtMixDirs (real fs by default). */
export interface SweepFs {
  readdir: (dir: string) => string[] | Promise<string[]>;
  statMtimeMs: (p: string) => number | Promise<number>;
  rmRecursive: (p: string) => void | Promise<void>;
}

function defaultSweepFs(): SweepFs {
  return {
    readdir: (dir: string) => fs.readdirSync(dir),
    statMtimeMs: (p: string) => fs.statSync(p).mtimeMs,
    rmRecursive: (p: string) => fs.rmSync(p, { recursive: true, force: true }),
  };
}

export interface SweepResult {
  scanned: number;
  removed: number;
  removedNames: string[];
  errors: string[];
}

/**
 * ATLAS-P3-REPAIR-002: sweeper for stale et-mix-* dirs.
 *
 * Removes `et-mix-*` entries under `dir` (default os.tmpdir()) whose mtime
 * is older than `staleMs`. Only ever touches the ET_MIX_PREFIX namespace —
 * nothing else in /tmp. Never throws: per-dir failures are collected in
 * `errors` and the sweep still returns. No DB writes, no network.
 *
 * Render entry points (asc3/render-final-mix/core.ts,
 * lib/assembleAndVerifyFinalMix.ts) call this at startup so a crashed prior
 * invocation cannot starve the next render of /tmp space.
 */
export async function sweepStaleEtMixDirs(
  staleMs: number,
  opts?: { dir?: string; nowMs?: number; fs?: SweepFs },
): Promise<SweepResult> {
  const base = opts?.dir ?? os.tmpdir();
  const sweepFs = opts?.fs ?? defaultSweepFs();
  const now = opts?.nowMs ?? Date.now();
  const result: SweepResult = { scanned: 0, removed: 0, removedNames: [], errors: [] };
  let names: string[];
  try {
    names = (await sweepFs.readdir(base)) ?? [];
  } catch (err) {
    result.errors.push(`readdir ${base}: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
  const targets = (Array.isArray(names) ? names : [])
    .filter(n => typeof n === 'string' && n.startsWith(ET_MIX_PREFIX))
    .sort();
  result.scanned = targets.length;
  for (const name of targets) {
    const full = path.join(base, name);
    let mtime: number;
    try {
      mtime = await sweepFs.statMtimeMs(full);
    } catch (err) {
      result.errors.push(`${name}: stat failed (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    if (now - mtime <= staleMs) continue;
    try {
      await sweepFs.rmRecursive(full);
      result.removed += 1;
      result.removedNames.push(name);
    } catch (err) {
      result.errors.push(`${name}: rm failed (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return result;
}

/** Default staleness for the render-startup sweep (dirs older than this go). */
export const ET_MIX_SWEEP_STALE_MS = 30 * 60 * 1000;

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
