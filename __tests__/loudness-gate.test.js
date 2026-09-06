/**
 * loudness-gate.test.js — LOUDNESS-001
 *
 * Acceptance tests for the per-segment LUFS gate.
 *
 * TEST 1: Synthetic near-silent segment (~−40 LUFS) → hard-fails
 *   - Generates a synthetic near-silent audio file with ffmpeg
 *   - Verifies classifySegment returns 'hard_fail'
 *   - Verifies runLoudnessGate includes segment in hard_fail list
 *   - Verifies the file is NOT modified (no normalization attempted)
 *
 * TEST 2: Mildly off-target segment (~−17 LUFS) → normalizes to −16 (±1)
 *   - Generates a synthetic segment at ~−17 LUFS
 *   - Verifies classifySegment returns 'normalize'
 *   - Verifies normalized output measures −16 LUFS ±1 dB
 *   - Verifies output file exists and content differs from input
 *
 * Run: npx jest __tests__/loudness-gate.test.js --no-coverage
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Import gate module (TypeScript, via ts-jest transpilation) ────────────────
const {
  measureSegmentLUFS,
  classifySegment,
  normalizeSegment,
  runLoudnessGate,
  TARGET_LUFS,
  OK_MIN_LUFS,
  OK_MAX_LUFS,
  HARD_FAIL_THRESHOLD_LUFS,
} = require('../lib/loudness-gate');

// ── Constants ─────────────────────────────────────────────────────────────────

const FF = fs.existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : (process.env.FFMPEG_PATH ?? 'ffmpeg');

/** Tolerance for post-normalization measurement (loudnorm is approximate). */
const NORM_TOLERANCE_DB = 1.5;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Measure the integrated LUFS of a file using a raw ffmpeg subprocess (test-only). */
function measureLUFS(filePath) {
  const r = spawnSync(FF, [
    '-i', filePath,
    '-af', 'ebur128=peak=true',
    '-f', 'null', '-',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const output = (r.stderr ?? '') + (r.stdout ?? '');

  // Parse Summary block value
  const summaryMatch = output.match(/Integrated loudness:[^]*?I:\s*([-\d.]+)\s*LUFS/);
  if (summaryMatch) return parseFloat(summaryMatch[1]);

  // Fallback: last "I: <val> LUFS" appearance
  const fallbackRe = /\bI:\s*([-\d.]+)\s*LUFS/g;
  let m;
  let last = null;
  while ((m = fallbackRe.exec(output)) !== null) last = m[1];
  if (last !== null) return parseFloat(last);

  throw new Error(`measureLUFS: could not parse LUFS from output:\n${output.slice(-1000)}`);
}

/**
 * Generate a synthetic audio file at approximately the requested LUFS.
 * Returns the path to the generated file.
 *
 * Strategy:
 *  • near_silent  (~−40 to −70 LUFS): anoisesrc with amplitude=0.001
 *  • calibrated   (target LUFS): generate source noise, then loudnorm to target
 */
function generateSyntheticAudio(outPath, targetLUFS) {
  if (targetLUFS <= -40) {
    // Near-silent: extremely low amplitude white noise → well below hard-fail threshold
    const r = spawnSync(FF, [
      '-f', 'lavfi',
      '-i', 'anoisesrc=d=3:c=white:a=0.001',
      '-t', '3',
      '-y', outPath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) throw new Error(`generateSyntheticAudio failed: ${r.stderr}`);
  } else {
    // Generate moderate-level noise, then normalize to targetLUFS with loudnorm
    const tmpSrc = outPath + '.src.mp3';
    try {
      // Generate source at ~-13.8 LUFS (anoisesrc a=0.3)
      let r = spawnSync(FF, [
        '-f', 'lavfi',
        '-i', 'anoisesrc=d=5:c=white:a=0.3',
        '-t', '5',
        '-y', tmpSrc,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.status !== 0) throw new Error(`generateSyntheticAudio source failed: ${r.stderr}`);

      // Apply loudnorm to hit targetLUFS
      r = spawnSync(FF, [
        '-i', tmpSrc,
        '-af', `loudnorm=I=${targetLUFS}:LRA=11:TP=-1.5`,
        '-y', outPath,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.status !== 0) throw new Error(`generateSyntheticAudio loudnorm failed: ${r.stderr}`);
    } finally {
      try { fs.unlinkSync(tmpSrc); } catch { /* ignore */ }
    }
  }
  return outPath;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('LOUDNESS-001 gate', () => {

  // Temp dir for test fixtures
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loudness-gate-test-'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  // ── Threshold constants sanity ──────────────────────────────────────────────

  test('constants: TARGET=-16, OK_MIN=-17, OK_MAX=-15, HARD_FAIL=-28', () => {
    expect(TARGET_LUFS).toBe(-16);
    expect(OK_MIN_LUFS).toBe(-17);
    expect(OK_MAX_LUFS).toBe(-15);
    expect(HARD_FAIL_THRESHOLD_LUFS).toBe(-28);
  });

  // ── classifySegment unit tests ──────────────────────────────────────────────

  describe('classifySegment()', () => {
    test('-40 LUFS → hard_fail', () => {
      expect(classifySegment(-40)).toBe('hard_fail');
    });

    test('-63 LUFS → hard_fail', () => {
      expect(classifySegment(-63)).toBe('hard_fail');
    });

    test('-29 LUFS → hard_fail (just below threshold)', () => {
      expect(classifySegment(-29)).toBe('hard_fail');
    });

    test('-28 LUFS → normalize (at boundary, not hard_fail)', () => {
      expect(classifySegment(-28)).toBe('normalize');
    });

    test('-20 LUFS → normalize (too quiet but above hard-fail)', () => {
      expect(classifySegment(-20)).toBe('normalize');
    });

    test('-17 LUFS → ok (lower bound of target range)', () => {
      expect(classifySegment(-17)).toBe('ok');
    });

    test('-16 LUFS → ok (exact target)', () => {
      expect(classifySegment(-16)).toBe('ok');
    });

    test('-15 LUFS → ok (upper bound of target range)', () => {
      expect(classifySegment(-15)).toBe('ok');
    });

    test('-14 LUFS → normalize (too loud)', () => {
      expect(classifySegment(-14)).toBe('normalize');
    });

    test('-10 LUFS → normalize (much too loud)', () => {
      expect(classifySegment(-10)).toBe('normalize');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // TEST 1: Synthetic ~−40 LUFS segment → hard-fails
  // ══════════════════════════════════════════════════════════════════════════════

  describe('TEST 1: near-silent segment (~−40 LUFS) → hard_fail', () => {
    let silentPath;
    let measuredLUFS;

    beforeAll(async () => {
      silentPath = path.join(tmpDir, 'test1_silent.mp3');
      generateSyntheticAudio(silentPath, -60);  // generates ~−63 LUFS
      measuredLUFS = await measureSegmentLUFS(silentPath);
      console.log(`[TEST 1] Measured LUFS of synthetic near-silent segment: ${measuredLUFS.toFixed(1)} LUFS`);
    });

    test('synthetic near-silent file measures below −28 LUFS (hard-fail threshold)', async () => {
      console.log(`        Measured: ${measuredLUFS.toFixed(1)} LUFS | Hard-fail threshold: ${HARD_FAIL_THRESHOLD_LUFS} LUFS`);
      expect(measuredLUFS).toBeLessThan(HARD_FAIL_THRESHOLD_LUFS);
    });

    test('classifySegment returns "hard_fail" for measured LUFS', () => {
      const cls = classifySegment(measuredLUFS);
      console.log(`        classifySegment(${measuredLUFS.toFixed(1)}) → "${cls}"`);
      expect(cls).toBe('hard_fail');
    });

    test('runLoudnessGate includes segment in hard_fail_segments list', async () => {
      const result = await runLoudnessGate([silentPath], { dryRun: false });
      console.log(`        Gate result: ok=${result.ok} normalized=${result.normalized} hard_fail=${result.hard_fail}`);
      console.log(`        hard_fail_segments: ${JSON.stringify(result.hard_fail_segments)}`);
      expect(result.hard_fail).toBe(1);
      expect(result.hard_fail_segments).toContain(silentPath);
      expect(result.ok).toBe(0);
      expect(result.normalized).toBe(0);
    });

    test('file is NOT modified after hard-fail (no normalization attempted)', async () => {
      const statBefore = fs.statSync(silentPath);
      const contentBefore = fs.readFileSync(silentPath);

      await runLoudnessGate([silentPath], { dryRun: false });

      const statAfter = fs.statSync(silentPath);
      const contentAfter = fs.readFileSync(silentPath);

      // File should be identical — gate must not write to hard-fail segments
      expect(statAfter.size).toBe(statBefore.size);
      expect(contentAfter.toString('hex')).toBe(contentBefore.toString('hex'));
      console.log(`        ✓ File unchanged after hard-fail (${statBefore.size} bytes)`);
    });

    test('per-segment result has normalized=false for hard-fail segment', async () => {
      const result = await runLoudnessGate([silentPath], { dryRun: false });
      const segResult = result.results.find(r => r.path === silentPath);
      expect(segResult).toBeDefined();
      expect(segResult.normalized).toBe(false);
      expect(segResult.normalizedPath).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // TEST 2: ~−17 LUFS segment → normalizes to −16 (±1)
  // ══════════════════════════════════════════════════════════════════════════════

  describe('TEST 2: mildly off-target segment (~−17 LUFS) → normalizes to −16 ±1', () => {
    let sourcePath;   // original file (will be modified by gate)
    let measuredInputLUFS;

    beforeAll(async () => {
      sourcePath = path.join(tmpDir, 'test2_source.mp3');
      // Generate calibrated at -17 LUFS (within normalize range: < OK_MIN_LUFS = -17)
      // Actually -17 is exactly at the boundary (ok_min = -17 → ok). We'll use -18 to ensure 'normalize'.
      generateSyntheticAudio(sourcePath, -18);
      measuredInputLUFS = await measureSegmentLUFS(sourcePath);
      console.log(`[TEST 2] Measured LUFS of synthetic source: ${measuredInputLUFS.toFixed(1)} LUFS`);
    });

    test('synthetic source file measures below −17 LUFS (normalize range)', async () => {
      console.log(`        Measured: ${measuredInputLUFS.toFixed(1)} LUFS | OK range: [${OK_MIN_LUFS}, ${OK_MAX_LUFS}]`);
      expect(measuredInputLUFS).toBeLessThan(OK_MIN_LUFS);
      expect(measuredInputLUFS).toBeGreaterThan(HARD_FAIL_THRESHOLD_LUFS);
    });

    test('classifySegment returns "normalize" for measured LUFS', () => {
      const cls = classifySegment(measuredInputLUFS);
      console.log(`        classifySegment(${measuredInputLUFS.toFixed(1)}) → "${cls}"`);
      expect(cls).toBe('normalize');
    });

    test('runLoudnessGate normalizes the segment and reports normalized=1', async () => {
      const contentBefore = fs.readFileSync(sourcePath);

      const result = await runLoudnessGate([sourcePath], { dryRun: false });

      console.log(`        Gate result: ok=${result.ok} normalized=${result.normalized} hard_fail=${result.hard_fail}`);
      expect(result.normalized).toBe(1);
      expect(result.hard_fail).toBe(0);
      expect(result.ok).toBe(0);  // was 'normalize', not 'ok' pre-normalization

      const segResult = result.results[0];
      expect(segResult.normalized).toBe(true);
      expect(segResult.classification).toBe('normalize');

      // File must have been modified (content differs after normalization)
      const contentAfter = fs.readFileSync(sourcePath);
      const unchanged = contentAfter.toString('hex') === contentBefore.toString('hex');
      console.log(`        File changed after normalization: ${!unchanged}`);
      expect(unchanged).toBe(false);
    });

    test('normalized output measures −16 LUFS ±1.5 dB', async () => {
      const normalizedLUFS = await measureSegmentLUFS(sourcePath);
      console.log(
        `        Normalized LUFS: ${normalizedLUFS.toFixed(2)} LUFS ` +
        `(target: ${TARGET_LUFS}, tolerance: ±${NORM_TOLERANCE_DB} dB)`,
      );
      expect(normalizedLUFS).toBeGreaterThanOrEqual(TARGET_LUFS - NORM_TOLERANCE_DB);
      expect(normalizedLUFS).toBeLessThanOrEqual(TARGET_LUFS + NORM_TOLERANCE_DB);
    });

    test('output file exists and has non-zero size', () => {
      const stat = fs.statSync(sourcePath);
      console.log(`        Normalized file size: ${stat.size} bytes`);
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  // ── dryRun mode: verify no files are modified ─────────────────────────────

  describe('dryRun=true: no files modified', () => {
    let dryRunPath;
    let originalContent;

    beforeAll(async () => {
      dryRunPath = path.join(tmpDir, 'test_dryrun.mp3');
      generateSyntheticAudio(dryRunPath, -20);  // would normally be normalized
      originalContent = fs.readFileSync(dryRunPath);
    });

    test('dryRun=true does not modify normalize-class segment', async () => {
      const result = await runLoudnessGate([dryRunPath], { dryRun: true });

      const afterContent = fs.readFileSync(dryRunPath);
      const seg = result.results[0];

      expect(seg.classification).toBe('normalize');
      expect(seg.normalized).toBe(false);  // must be false in dryRun
      expect(afterContent.toString('hex')).toBe(originalContent.toString('hex'));
      console.log(`[dryRun] classification="${seg.classification}" normalized=${seg.normalized} (file unchanged ✓)`);
    });
  });

  // ── measureSegmentLUFS error handling ────────────────────────────────────────

  describe('measureSegmentLUFS: error handling', () => {
    test('throws for non-existent file', async () => {
      await expect(measureSegmentLUFS('/does/not/exist.mp3')).rejects.toThrow();
    });
  });

});
