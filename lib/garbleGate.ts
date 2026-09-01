/**
 * Garble Detection Gate — TypeScript Integration Wrapper
 *
 * Call this before any story is marked ready_for_review.
 * If it returns passed=false, halt — do not mark ready, do not publish,
 * do not proceed to mixing. Period.
 *
 * Covers BOTH pipelines:
 *  1. core.ts          — fresh-generation pipeline
 *  2. correction scripts (ep8_v5_correction.js, ep8-correction-render.js, etc.)
 *                       — correction/re-render pipeline
 *
 * Usage in core.ts:
 *   import { runGarbleGate } from './garbleGate';
 *   const gateResult = await runGarbleGate(storyId);
 *   if (!gateResult.passed) {
 *     throw new Error(`Garble gate failed: ${gateResult.failures.map(f => f.segName).join(', ')}`);
 *   }
 *
 * Usage in correction scripts:
 *   const { runGarbleGate } = require('./lib/garbleGate');
 *   const gateResult = await runGarbleGate(storyId, [103]);
 *   if (!gateResult.passed) {
 *     console.error('CORRECTION FAILED GARBLE CHECK — do not mark ready');
 *     process.exit(1);
 *   }
 */

import { spawnSync } from 'child_process';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GarbleResult {
  /** 1-based segment number (corresponds to line N in story script) */
  segNum: number;

  /** Zero-padded segment name, e.g. "segment_0103" */
  segName: string;

  /** Gate verdict for this segment */
  status: 'ok' | 'warn' | 'fail' | 'skipped' | 'missing';

  /**
   * Word Error Rate (0.0–1.0+).
   * null for skipped/missing segments or when Whisper failed.
   */
  wer: number | null;

  /** Full expected text from the story script (after prefix stripping) */
  expectedText: string;

  /** Raw Whisper transcription of the actual audio */
  whisperText: string;
}

export interface GarbleGateReport {
  storyId: string;
  storyTitle: string;
  runAt: string;
  model: string;
  thresholds: { warn: number; fail: number };
  gatePassed: boolean;
  summary: {
    ok: number;
    warn: number;
    fail: number;
    skipped: number;
    missing: number;
    total: number;
  };
  results: GarbleResult[];
}

export interface GarbleGateOutcome {
  /**
   * True only if zero hard-fail segments were detected.
   * Warnings do NOT cause passed=false.
   *
   * ⚠️  If passed === false: HALT. Do not mark the story ready_for_review,
   *     do not publish, do not proceed to mixing.
   */
  passed: boolean;

  /** Segments that hard-failed the WER threshold (>40% word error rate) */
  failures: GarbleResult[];

  /** Segments that are borderline and need human review (20–40% WER) */
  warnings: GarbleResult[];

  /** Path to the JSON report written by the gate process */
  reportPath: string | null;

  /** Full structured report (null if the gate script itself crashed) */
  report: GarbleGateReport | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATE_SCRIPT = path.resolve(__dirname, '../garble-detection-gate.js');

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the garble detection gate for a story.
 *
 * ⚠️  Call this before any story is marked ready_for_review.
 *     If it returns passed=false, halt — do not mark ready, do not publish,
 *     do not proceed to mixing.
 *
 * @param storyId   UUID of the story in Supabase `stories` table
 * @param segments  Optional list of 1-based segment numbers to check.
 *                  If omitted, ALL segments in the story are checked.
 * @returns         GarbleGateOutcome — inspect .passed before proceeding
 */
export async function runGarbleGate(
  storyId: string,
  segments?: number[]
): Promise<GarbleGateOutcome> {
  const args: string[] = [storyId];

  if (segments && segments.length > 0) {
    if (segments.length === 1) {
      args.push(String(segments[0]));
    } else {
      // Detect contiguous range or list
      const sorted = [...segments].sort((a, b) => a - b);
      const isContiguous =
        sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
      if (isContiguous) {
        args.push(`${sorted[0]}-${sorted[sorted.length - 1]}`);
      } else {
        // Non-contiguous: run each segment individually and merge results
        return runSegmentList(storyId, sorted);
      }
    }
  }

  return runGateProcess(args);
}

// ---------------------------------------------------------------------------
// Internal: run the gate for a non-contiguous segment list
// ---------------------------------------------------------------------------

async function runSegmentList(
  storyId: string,
  segments: number[]
): Promise<GarbleGateOutcome> {
  const outcomes: GarbleGateOutcome[] = [];

  for (const seg of segments) {
    const o = await runGateProcess([storyId, String(seg)]);
    outcomes.push(o);
  }

  // Merge outcomes
  const allFailures = outcomes.flatMap(o => o.failures);
  const allWarnings = outcomes.flatMap(o => o.warnings);
  const reportPaths = outcomes.map(o => o.reportPath).filter(Boolean);

  return {
    passed:     allFailures.length === 0,
    failures:   allFailures,
    warnings:   allWarnings,
    reportPath: reportPaths[reportPaths.length - 1] ?? null,
    report:     null, // merged runs don't produce a single combined report
  };
}

// ---------------------------------------------------------------------------
// Internal: invoke the gate as a child process and parse its JSON report
// ---------------------------------------------------------------------------

async function runGateProcess(args: string[]): Promise<GarbleGateOutcome> {
  const result = spawnSync('node', [GATE_SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,   // 10 minutes max
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      // Ensure env vars pass through to child
      NEXT_PUBLIC_SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  });

  // Print stdout/stderr so callers see gate output in their logs
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error('[garbleGate] Gate process error:', result.error.message);
    // Return a failed outcome on process error — don't swallow it
    return {
      passed:     false,
      failures:   [],
      warnings:   [],
      reportPath: null,
      report:     null,
    };
  }

  // Parse JSON report path from stdout
  const reportPathMatch = (result.stdout ?? '').match(/JSON report:\s+(\S+\.json)/);
  const reportPath      = reportPathMatch ? reportPathMatch[1] : null;

  let report: GarbleGateReport | null = null;
  if (reportPath) {
    try {
      const { readFileSync } = await import('fs');
      report = JSON.parse(readFileSync(reportPath, 'utf8')) as GarbleGateReport;
    } catch {
      // Report parse failure is non-fatal for the outcome decision
    }
  }

  const failures: GarbleResult[] = report?.results.filter(r => r.status === 'fail') ?? [];
  const warnings: GarbleResult[] = report?.results.filter(r => r.status === 'warn') ?? [];

  // Gate exit code: 0 = pass, 1 = fail, 2 = fatal
  const passed = result.status === 0;

  return { passed, failures, warnings, reportPath, report };
}

// Note: CommonJS shim removed — route.ts imports this module via ESM.
// Correction scripts that need CJS can use: const { runGarbleGate } = require('./garble-detection-gate.js')
