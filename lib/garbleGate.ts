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

export type GarbleGateStatus = 'ok' | 'garbled' | 'unavailable' | 'internal_error';

export interface GarbleGateReport {
  storyId: string;
  storyTitle: string;
  runAt: string;
  model: string;
  thresholds: { warn: number; fail: number };
  gatePassed: boolean;
  /** ATLAS-GARBLE-VERDICT-001: distinguishes story-garbled ('garbled',
   *  fail-closed) from gate-broken ('unavailable' | 'internal_error',
   *  soft-pass with needsAttention). Absent on pre-001 reports. */
  gateStatus?: GarbleGateStatus;
  /** True when render may proceed but a human must notice (gate broken,
   *  or warnings present). Absent on pre-001 reports. */
  needsAttention?: boolean;
  /** Structured gate error detail when gateStatus is unavailable/internal_error. */
  error?: { code: string; message: string } | null;
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
   * True when render may proceed: zero hard-fail segments AND the gate
   * produced a verdict (including the gate-broken soft-pass).
   *
   * ⚠️  If passed === false: HALT. Do not mark the story ready_for_review,
   *     do not publish, do not proceed to mixing. (True garble only —
   *     summary.fail > 0. Gate-broken outcomes pass with needsAttention.)
   *
   * ATLAS-GARBLE-VERDICT-001: runGarbleGate NEVER throws. Every failure
   * mode returns a structured outcome — check .gateStatus to tell
   * story-garbled ('garbled') from gate-broken ('unavailable' |
   * 'internal_error').
   */
  passed: boolean;

  /** Structured gate status: 'ok' | 'garbled' | 'unavailable' | 'internal_error'. */
  gateStatus: GarbleGateStatus;

  /** True when render may proceed but a human must notice (gate broken or warnings). */
  needsAttention: boolean;

  /** Human-readable gate error detail when the gate itself broke. */
  gateError: string | null;

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

// Use process.cwd() (= project root in Next.js) instead of __dirname which resolves
// incorrectly in webpack-bundled App Router context.
const GATE_SCRIPT = path.join(process.cwd(), 'garble-detection-gate.js');

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
  const needsAttention = outcomes.some(o => o.needsAttention);
  const gateError = outcomes.map(o => o.gateError).filter(Boolean).join('; ') || null;
  // Worst status wins: garbled > internal_error > unavailable > ok.
  const rank: Record<GarbleGateStatus, number> = { ok: 0, unavailable: 1, internal_error: 2, garbled: 3 };
  const gateStatus = outcomes.map(o => o.gateStatus).sort((a, b) => rank[b] - rank[a])[0] ?? 'ok';

  return {
    passed:     allFailures.length === 0,
    gateStatus,
    needsAttention,
    gateError,
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
    // ATLAS-GARBLE-VERDICT-001: a spawn/timeout failure is gate-unavailable —
    // a structured verdict (soft-pass with needsAttention), never a throw.
    // runGarbleGate NEVER throws; callers always get an outcome to branch on.
    return unavailableOutcome(
      `Gate process error: ${result.error.message}`,
      storyIdFromArgs(args),
    );
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

  // ATLAS-GARBLE-VERDICT-001: a missing/unparseable report is gate-broken
  // (the gate script always writes one when the storyId is known), so it
  // becomes a structured unavailable verdict — soft-pass with needsAttention —
  // never a throw. Fail-closed is preserved where it matters: any parsed
  // report with summary.fail > 0 / status==='fail' segments still blocks.
  if (!report || !Array.isArray(report.results)) {
    return unavailableOutcome(
      `Gate produced no parseable report (exit=${result.status ?? 'unknown'}` +
      `${reportPath ? `, reportPath=${reportPath}` : ', no report path'}). ` +
      'Treating as gate-unavailable — render may proceed with needs_attention=true.',
      storyIdFromArgs(args),
      reportPath,
      report,
    );
  }

  // Fail-closed mapping (incl. null-WER promotion) lives in outcomeFromReport.
  return outcomeFromReport(report, reportPath);
}

// ---------------------------------------------------------------------------
// ATLAS-GARBLE-VERDICT-001 — structured gate-broken outcome (never throws)
// ---------------------------------------------------------------------------

/** Extract the storyId (first CLI arg) for outcome labelling. */
function storyIdFromArgs(args: string[]): string {
  return args.length > 0 ? args[0] : 'unknown';
}

/**
 * Structured gate-unavailable verdict: the gate itself broke (spawn error,
 * timeout, missing/corrupt report), so no WER verdict exists. Render may
 * proceed — passed=true — but needsAttention=true forces visibility.
 * Exported for tests.
 */
export function unavailableOutcome(
  message: string,
  storyId = 'unknown',
  reportPath: string | null = null,
  report: GarbleGateReport | null = null,
): GarbleGateOutcome {
  return {
    passed: true,
    gateStatus: 'unavailable',
    needsAttention: true,
    gateError: message,
    failures: [],
    warnings: [],
    reportPath,
    report,
  };
}

/**
 * Map a parsed gate report to its outcome verdict (pure, no I/O).
 * Exported for tests. Fail-closed: any fail-status segment blocks.
 */
export function outcomeFromReport(
  report: GarbleGateReport,
  reportPath: string | null = null,
): GarbleGateOutcome {
  const results = Array.isArray(report.results) ? report.results : [];
  const failures: GarbleResult[] = results.filter(r => r.status === 'fail');
  const warnings: GarbleResult[] = results.filter(r => r.status === 'warn');
  const unverifiable = results.filter(
    r => r.wer == null && (r.status === 'ok' || r.status === 'warn')
  );
  for (const u of unverifiable) {
    failures.push({
      ...u,
      status: 'fail',
      whisperText: `${u.whisperText || ''} [fail-closed: null-WER verdict promoted to fail]`.trim(),
    });
  }
  const passed = failures.length === 0;
  const gateStatus: GarbleGateStatus =
    report.gateStatus ?? (report.gatePassed === false || !passed ? 'garbled' : 'ok');
  return {
    passed,
    gateStatus,
    needsAttention: report.needsAttention ?? warnings.length > 0,
    gateError: report.error ? `${report.error.code}: ${report.error.message}` : null,
    failures,
    warnings,
    reportPath,
    report,
  };
}

// Note: CommonJS shim removed — route.ts imports this module via ESM.
// Correction scripts that need CJS can use: const { runGarbleGate } = require('./garble-detection-gate.js')
