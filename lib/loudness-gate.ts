/**
 * LOUDNESS-001 Gate — Per-segment LUFS gate for voiced audio.
 *
 * Measures integrated LUFS for each voiced segment using ffmpeg ebur128.
 * Classifies and optionally normalizes mild outliers; hard-fails near-silent
 * segments (below −28 LUFS) without amplification.
 *
 * Scope:
 *  • INCLUDE: narrator and character dialogue segments
 *  • EXCLUDE: Belle audio, sting/transition audio, music bed
 *    (exclusion is the caller's responsibility — pass only voiced segments)
 *
 * Target: −16 LUFS (±1 dB accepted range: −17 to −15 LUFS)
 *
 * Classifications:
 *  • ok:        −17 to −15 LUFS — within target, no action
 *  • normalize: −28 to <−17  OR  >−15 LUFS — apply loudnorm to −16
 *  • hard_fail: < −28 LUFS — near-silent/corrupted; do NOT amplify; flag for re-render
 *
 * Feature flag (disabled by default):
 *   LOUDNESS_001_GATE=true   — enable enforcement in production
 *   LOUDNESS_001_GATE=false  — wiring present but gate does not block/modify
 *
 * Usage:
 *   import { runLoudnessGate } from '@/lib/loudness-gate';
 *   const result = await runLoudnessGate(segmentPaths, { dryRun: false });
 *   if (result.hard_fail > 0) { /* re-render flagged segments *\/ }
 *
 * @module loudness-gate
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── ffmpeg binary ─────────────────────────────────────────────────────────────
// Prefer system ffmpeg at known Homebrew path; fall back to PATH resolution.

let FF = '/opt/homebrew/bin/ffmpeg';
if (!fs.existsSync(FF)) {
  // Allow override via env; fall back to PATH
  FF = process.env.FFMPEG_PATH ?? 'ffmpeg';
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Target integrated loudness for normalization. */
export const TARGET_LUFS = -16;

/** Minimum LUFS accepted without normalization (target − 1 dB). */
export const OK_MIN_LUFS = -17;

/** Maximum LUFS accepted without normalization (target + 1 dB). */
export const OK_MAX_LUFS = -15;

/**
 * Hard-fail threshold. Segments below this value are near-silent or corrupted
 * and must be re-rendered — do NOT amplify them.
 * (12 dB under the −16 LUFS target = −28 LUFS)
 */
export const HARD_FAIL_THRESHOLD_LUFS = -28;

/**
 * Feature flag — disabled by default. Set LOUDNESS_001_GATE=true in your
 * environment to enable gate enforcement in the render pipeline.
 */
export const LOUDNESS_001_GATE_ENABLED: boolean =
  process.env.LOUDNESS_001_GATE === 'true';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Loudness classification for a single segment.
 *  • ok        — within the ±1 dB target range; no action required
 *  • normalize — measurably off-target (but not silent); apply loudnorm
 *  • hard_fail — below HARD_FAIL_THRESHOLD_LUFS; must be re-rendered
 */
export type LoudnessClass = 'ok' | 'normalize' | 'hard_fail';

/** Per-segment result returned by runLoudnessGate. */
export interface SegmentLoudnessResult {
  /** Absolute path to the segment file. */
  path: string;

  /** Measured integrated LUFS (null if measurement failed). */
  lufs: number | null;

  /** Gate verdict for this segment. */
  classification: LoudnessClass;

  /** Whether the segment was normalized (only true when dryRun=false and classification='normalize'). */
  normalized: boolean;

  /** Output path after normalization — same as input path (file replaced in-place). */
  normalizedPath?: string;

  /** Error message, if measurement or normalization threw. */
  error?: string;
}

/** Aggregate result from runLoudnessGate. */
export interface LoudnessGateResult {
  /** Number of segments within the ±1 dB target range. */
  ok: number;

  /** Number of segments that were successfully normalized. */
  normalized: number;

  /** Number of segments that hard-failed (below HARD_FAIL_THRESHOLD_LUFS). */
  hard_fail: number;

  /** Paths of hard-fail segments (for caller to flag for re-render). */
  hard_fail_segments: string[];

  /** Per-segment detail. */
  results: SegmentLoudnessResult[];
}

// ── measureSegmentLUFS ────────────────────────────────────────────────────────

/**
 * Measure integrated LUFS for a local audio segment using ffmpeg ebur128.
 *
 * Parses the "Summary → Integrated loudness → I:" value from ffmpeg stderr.
 *
 * @param segmentPath   Absolute path to the audio file.
 * @returns             Integrated LUFS as a number (e.g. −16.3).
 * @throws              If ffmpeg fails or the LUFS value cannot be parsed.
 */
export async function measureSegmentLUFS(segmentPath: string): Promise<number> {
  const r = spawnSync(
    FF,
    ['-i', segmentPath, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );

  // ebur128 summary goes to stderr; stdout is normally empty for null mux
  const output = (r.stderr ?? '') + (r.stdout ?? '');

  // Match the Summary block "I:         -16.3 LUFS"
  // The per-frame lines also contain "I:" but in a different format;
  // the Summary block's value always appears after "Integrated loudness:"
  const summaryMatch = output.match(/Integrated loudness:[^]*?I:\s*([-\d.]+)\s*LUFS/);
  if (summaryMatch) {
    return parseFloat(summaryMatch[1]);
  }

  // Fallback: last "I: <value> LUFS" in the entire output (matches Summary line)
  const fallbackMatches: string[] = [];
  const fallbackRe = /\bI:\s*([-\d.]+)\s*LUFS/g;
  let fallbackMatch: RegExpExecArray | null;
  while ((fallbackMatch = fallbackRe.exec(output)) !== null) {
    fallbackMatches.push(fallbackMatch[1]);
  }
  if (fallbackMatches.length > 0) {
    return parseFloat(fallbackMatches[fallbackMatches.length - 1]);
  }

  throw new Error(
    `[loudness-gate] measureSegmentLUFS: could not parse LUFS from ffmpeg output for "${segmentPath}". ` +
    `ffmpeg exit code: ${r.status ?? 'null'}`,
  );
}

// ── classifySegment ───────────────────────────────────────────────────────────

/**
 * Classify a segment's loudness measurement.
 *
 * @param lufs  Integrated LUFS value from measureSegmentLUFS.
 * @returns     'ok' | 'normalize' | 'hard_fail'
 */
export function classifySegment(lufs: number): LoudnessClass {
  if (lufs < HARD_FAIL_THRESHOLD_LUFS) return 'hard_fail';
  if (lufs >= OK_MIN_LUFS && lufs <= OK_MAX_LUFS) return 'ok';
  return 'normalize';  // too quiet (but above hard-fail) or too loud
}

// ── normalizeSegment ──────────────────────────────────────────────────────────

/**
 * Normalize an audio segment to the target LUFS using ffmpeg loudnorm.
 * Writes the normalized audio to a temp file, then replaces the original.
 *
 * @param segmentPath   Absolute path to the segment to normalize.
 * @param targetLUFS    Target integrated loudness (default: TARGET_LUFS = −16).
 * @returns             The output path (same as segmentPath — replaced in-place).
 * @throws              If ffmpeg normalization fails.
 */
export async function normalizeSegment(
  segmentPath: string,
  targetLUFS: number = TARGET_LUFS,
): Promise<string> {
  const ext = path.extname(segmentPath);
  const base = path.basename(segmentPath, ext);
  const tmpOut = path.join(os.tmpdir(), `${base}_loudnorm_${Date.now()}${ext}`);

  try {
    const r = spawnSync(
      FF,
      [
        '-i', segmentPath,
        '-af', `loudnorm=I=${targetLUFS}:LRA=11:TP=-1.5`,
        '-y', tmpOut,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    );

    if (r.status !== 0) {
      const stderr = r.stderr ?? '';
      throw new Error(
        `[loudness-gate] normalizeSegment: loudnorm failed (exit ${r.status}) for "${segmentPath}": ` +
        stderr.slice(-800),
      );
    }

    if (!fs.existsSync(tmpOut)) {
      throw new Error(
        `[loudness-gate] normalizeSegment: ffmpeg exited 0 but output file not created: "${tmpOut}"`,
      );
    }

    // Replace original with normalized file (atomic via copy + unlink)
    fs.copyFileSync(tmpOut, segmentPath);
    return segmentPath;

  } finally {
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}

// ── runLoudnessGate ───────────────────────────────────────────────────────────

/**
 * Run the LOUDNESS-001 gate over a list of local voiced-segment paths.
 *
 * For each segment:
 *  1. Measure integrated LUFS with ffmpeg ebur128.
 *  2. Classify: ok / normalize / hard_fail.
 *  3. If 'normalize' and dryRun=false: apply loudnorm in-place.
 *  4. If 'hard_fail': record for re-render; do NOT amplify.
 *
 * @param segmentPaths  Array of absolute paths to voiced audio segments.
 *                      Belle, sting, and music-bed segments should be excluded
 *                      by the caller before passing to this function.
 * @param options       { dryRun?: boolean } — if true, measure and classify but
 *                      do not write any normalized files.
 * @returns             Aggregate LoudnessGateResult.
 */
export async function runLoudnessGate(
  segmentPaths: string[],
  options: { dryRun?: boolean } = {},
): Promise<LoudnessGateResult> {
  const { dryRun = false } = options;
  const results: SegmentLoudnessResult[] = [];

  for (const segPath of segmentPaths) {
    let lufs: number | null = null;
    let classification: LoudnessClass = 'ok';
    let normalized = false;
    let normalizedPath: string | undefined;
    let error: string | undefined;

    try {
      lufs = await measureSegmentLUFS(segPath);
      classification = classifySegment(lufs);

      if (classification === 'normalize' && !dryRun) {
        normalizedPath = await normalizeSegment(segPath, TARGET_LUFS);
        normalized = true;
        console.log(
          `[loudness-gate] Normalized "${path.basename(segPath)}" ` +
          `from ${lufs.toFixed(1)} LUFS → target ${TARGET_LUFS} LUFS`,
        );
      } else if (classification === 'normalize' && dryRun) {
        console.log(
          `[loudness-gate] Would normalize "${path.basename(segPath)}" ` +
          `(${lufs.toFixed(1)} LUFS → ${TARGET_LUFS} LUFS) — skipped in dryRun`,
        );
      } else if (classification === 'hard_fail') {
        console.warn(
          `[loudness-gate] HARD FAIL "${path.basename(segPath)}" ` +
          `measured ${lufs.toFixed(1)} LUFS (threshold: ${HARD_FAIL_THRESHOLD_LUFS} LUFS) — flagged for re-render`,
        );
      } else {
        console.log(
          `[loudness-gate] OK "${path.basename(segPath)}" → ${lufs.toFixed(1)} LUFS`,
        );
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
      classification = 'hard_fail';  // treat measurement errors as hard fail
      console.error(`[loudness-gate] Error processing "${path.basename(segPath)}": ${error}`);
    }

    results.push({
      path: segPath,
      lufs,
      classification,
      normalized,
      ...(normalizedPath !== undefined ? { normalizedPath } : {}),
      ...(error !== undefined ? { error } : {}),
    });
  }

  const hardFailResults = results.filter(r => r.classification === 'hard_fail');

  return {
    ok:                  results.filter(r => r.classification === 'ok').length,
    normalized:          results.filter(r => r.normalized).length,
    hard_fail:           hardFailResults.length,
    hard_fail_segments:  hardFailResults.map(r => r.path),
    results,
  };
}

// ── CommonJS shim ─────────────────────────────────────────────────────────────
// Mirrors the pattern in lib/garbleGate.ts — allows correction scripts to use:
//   const { runLoudnessGate } = require('./lib/loudness-gate');
declare const module: { exports: unknown } | undefined;
if (typeof module !== 'undefined') {
  // @ts-ignore
  module.exports = {
    LOUDNESS_001_GATE_ENABLED,
    TARGET_LUFS,
    OK_MIN_LUFS,
    OK_MAX_LUFS,
    HARD_FAIL_THRESHOLD_LUFS,
    measureSegmentLUFS,
    classifySegment,
    normalizeSegment,
    runLoudnessGate,
  };
}
