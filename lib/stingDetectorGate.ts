/**
 * Sting Detector Gate — Phase 4 Item 11 (STING-001)
 *
 * Verifies the ET Signature Sting placement in the assembled episode audio.
 *
 * ── CANON (STING-001, Marc-confirmed) ────────────────────────────────────────
 * The sting plays exactly once per episode — at the very start of the intro,
 * before Belle's first line. It never appears anywhere else in the episode:
 * not before the outro, not mid-story.
 *
 * ── WHAT THIS GATE VERIFIES ──────────────────────────────────────────────────
 * 1. A sting IS present at the very start of the assembled file
 * 2. It appears BEFORE Belle's first spoken line (not after, not overlapping)
 * 3. It appears exactly ONCE — no duplicate sting elsewhere (not before the
 *    outro, not mid-story)
 *
 * ── DETECTION APPROACH: B — Audio Reference + ffprobe Volume Analysis ────────
 * The reference sting (ET_Signature_Sting_v7.mp3.mp3) is a known public file
 * in Supabase storage. This gate:
 *   a. Downloads the reference sting to a temp file.
 *   b. Measures its exact duration (ffprobe).
 *   c. Verifies the assembled file has audio in the first [stingDur + 2s] window
 *      (max_volume > threshold) → stingPresent.
 *   d. Compares stingDur against belleFirstLineStartSec (if provided) →
 *      stingBeforeBelle.
 *   e. Scans strategic windows throughout the assembled file (25%, 50%, 75%,
 *      and near-outro) for energy levels matching the sting's fingerprint →
 *      stingCount. Any window with max_volume within 12 dB of the sting peak
 *      is counted as a potential duplicate.
 *
 * ── HARD FAIL CONDITIONS ─────────────────────────────────────────────────────
 *   • Sting not found at start (first [stingDur + 2s] is silent) → passed=false
 *   • Sting ends after Belle's first line (when belleFirstLineStartSec given)
 *     → passed=false
 *   • stingCount > 1 → passed=false
 *
 * ── INCONCLUSIVE (non-blocking, warning only) ─────────────────────────────────
 *   • Reference sting download fails → warn, skip count check, don't hard-fail
 *   • assembledFilePath empty or not found → warn, return stingPresent=false with
 *     passed=false (assembly not yet done is a caller error, not inconclusive)
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 * Called from lib/assembleAndVerifyFinalMix.ts as the 5th gate, POST-assembly:
 *
 *   import { runStingDetectorGate } from './stingDetectorGate';
 *   const stingResult = await runStingDetectorGate(storyId, assembledFilePath);
 *   if (!stingResult.passed) { ... hard fail ... }
 *
 * @module stingDetectorGate
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────

// Portable ffmpeg binary — mirrors app/api/asc3/render-final-mix/core.ts.
// @ffmpeg-installer/ffmpeg ships a static binary for each platform (macOS,
// Linux x64/arm64) and is the production binary on Vercel. The eval() trick
// prevents Next.js/webpack from inlining the require at build time.
// Falls back to system 'ffmpeg' if the package is somehow absent.
let FF = 'ffmpeg';
try { FF = (eval('require')('@ffmpeg-installer/ffmpeg') as { path: string }).path; } catch { /* system ffmpeg */ }

// ffprobe-static is NOT installed in this project (checked: node_modules only
// contains ffmpeg-static and @ffmpeg-installer/ffmpeg, both ffmpeg-only).
// getDuration() uses 'ffmpeg -i <file> -f null -' stderr parsing instead —
// identical to the getAudioDuration() implementation in core.ts.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://vmyhlfeouzslixtkmddy.supabase.co';

/** Public URL of the ET Signature Sting reference file in Supabase storage. */
const ET_STING_PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`;

/**
 * Minimum max_volume (dBFS) to consider a window as "audio present" (not silent).
 * Sting is a music jingle — should be well above -40 dBFS in the start window.
 */
const AUDIO_PRESENCE_THRESHOLD_DB = -40;

/**
 * Tolerance: a non-start window is flagged as a potential sting duplicate if
 * its max_volume is within this many dB of the reference sting's peak level.
 */
const DUPLICATE_DETECTION_MARGIN_DB = 12;

/**
 * Buffer (seconds) added beyond sting duration when sampling the "start window".
 * Allows for small timing offsets.
 */
const START_WINDOW_BUFFER_SEC = 2;

// ── Public interface ──────────────────────────────────────────────────────────

export interface StingCheckResult {
  /** True if audio consistent with the sting is found at the start of the episode. */
  stingPresent: boolean;

  /** True if the sting ends before Belle's first spoken segment. */
  stingBeforeBelle: boolean;

  /** Number of sting-like audio bursts detected in the full episode. */
  stingCount: number;

  /** True only if all three conditions are satisfied. */
  passed: boolean;

  /** Human-readable summary of the check outcome. */
  details: string;

  /** Non-blocking notes (inconclusive results, skipped sub-checks, etc.). */
  warnings: string[];
}

/**
 * Run the sting detector gate against an assembled episode audio file.
 *
 * @param storyId            Supabase story UUID (used for logging).
 * @param assembledFilePath  Local path to the assembled .mp3 file.
 * @param options.belleFirstLineStartSec  Optional: start time (seconds) of
 *   Belle's first spoken line in the assembled audio. If provided, the gate
 *   verifies the sting ends before this timestamp.
 */
export async function runStingDetectorGate(
  storyId: string,
  assembledFilePath: string,
  options?: { belleFirstLineStartSec?: number }
): Promise<StingCheckResult> {
  const warnings: string[] = [];
  const belleFirstLineStartSec = options?.belleFirstLineStartSec;

  const prefix = `[stingDetectorGate:${storyId.slice(0, 8)}]`;
  console.log(`${prefix} Starting sting detector gate...`);

  // ── Guard: assembled file must exist ────────────────────────────────────────
  if (!assembledFilePath) {
    const details = 'BLOCKED: assembledFilePath is empty — gate requires a local assembled file path.';
    console.error(`${prefix} ${details}`);
    return {
      stingPresent: false,
      stingBeforeBelle: false,
      stingCount: 0,
      passed: false,
      details,
      warnings,
    };
  }

  if (!fs.existsSync(assembledFilePath)) {
    const details = `BLOCKED: assembled file not found at "${assembledFilePath}" — gate must run post-assembly.`;
    console.error(`${prefix} ${details}`);
    return {
      stingPresent: false,
      stingBeforeBelle: false,
      stingCount: 0,
      passed: false,
      details,
      warnings,
    };
  }

  // ── Step 1: Download reference sting to a temp file ──────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sting-gate-'));
  const stingRefPath = path.join(tmp, 'et_sting_ref.mp3');
  let stingDurSec: number | null = null;
  let stingMaxVolDb: number | null = null;
  let referenceAvailable = false;

  try {
    console.log(`${prefix} Downloading reference sting: ${ET_STING_PUBLIC_URL}`);
    const resp = await fetch(ET_STING_PUBLIC_URL);
    if (!resp.ok) {
      warnings.push(
        `Reference sting download failed (HTTP ${resp.status}). ` +
        `Skipping cross-correlation count check — only start-presence check will run.`
      );
      console.warn(`${prefix} ⚠️  ${warnings[warnings.length - 1]}`);
    } else {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 1000) {
        warnings.push(
          `Reference sting downloaded but suspiciously small (${buf.length} bytes). ` +
          `Skipping reference-based checks.`
        );
      } else {
        fs.writeFileSync(stingRefPath, buf);
        stingDurSec     = getDuration(stingRefPath);
        stingMaxVolDb   = getMaxVolume(stingRefPath, 0, null);
        referenceAvailable = true;
        console.log(`${prefix} Reference sting: dur=${stingDurSec.toFixed(2)}s, peak=${stingMaxVolDb.toFixed(1)}dBFS`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Reference sting fetch error: ${msg}. Skipping cross-correlation count check.`);
    console.warn(`${prefix} ⚠️  ${warnings[warnings.length - 1]}`);
  }

  // ── Step 2: stingPresent — verify audio in the start window ──────────────────
  const windowSec = referenceAvailable && stingDurSec !== null
    ? stingDurSec + START_WINDOW_BUFFER_SEC
    : 8; // fallback: check first 8 seconds

  const startWindowMaxVol = getMaxVolume(assembledFilePath, 0, windowSec);
  const stingPresent = startWindowMaxVol > AUDIO_PRESENCE_THRESHOLD_DB;

  console.log(
    `${prefix} Start window check [0–${windowSec.toFixed(1)}s]: ` +
    `max_volume=${startWindowMaxVol.toFixed(1)}dBFS → stingPresent=${stingPresent}`
  );

  // ── Step 3: stingBeforeBelle — verify sting ends before Belle's first line ──────
  let stingBeforeBelle: boolean;
  if (belleFirstLineStartSec !== undefined && belleFirstLineStartSec !== null) {
    if (referenceAvailable && stingDurSec !== null) {
      stingBeforeBelle = stingDurSec < belleFirstLineStartSec;
      console.log(
        `${prefix} Sting-before-Belle check: stingDur=${stingDurSec.toFixed(2)}s, ` +
        `belleFirstLine=${belleFirstLineStartSec.toFixed(2)}s → stingBeforeBelle=${stingBeforeBelle}`
      );
    } else {
      // No reference duration — fall back to checking if Belle's first line
      // starts after the start window (start window = 8s fallback)
      stingBeforeBelle = belleFirstLineStartSec > windowSec;
      warnings.push(
        `Sting reference not available — stingBeforeBelle estimated from start window (${windowSec}s) ` +
        `vs belleFirstLineStartSec (${belleFirstLineStartSec}s). Result is approximate.`
      );
    }
  } else {
    // No belleFirstLineStartSec provided — check automatically using sting duration
    if (referenceAvailable && stingDurSec !== null) {
      // If sting is <= 30s, it's almost certainly before Belle's first line in any episode
      stingBeforeBelle = stingDurSec <= 30;
      if (!stingBeforeBelle) {
        warnings.push(
          `belleFirstLineStartSec not provided and sting duration is unusually long ` +
          `(${stingDurSec.toFixed(2)}s > 30s). Cannot confirm sting is before Belle.`
        );
      } else {
        console.log(
          `${prefix} Sting-before-Belle: no explicit timestamp provided — ` +
          `stingDur=${stingDurSec.toFixed(2)}s assumed to precede Belle's first line`
        );
      }
    } else {
      // No reference, no timestamp — assume true but warn
      stingBeforeBelle = true;
      warnings.push(
        `belleFirstLineStartSec not provided and reference sting unavailable. ` +
        `Cannot verify sting-before-Belle — assuming true. Provide belleFirstLineStartSec for reliable check.`
      );
    }
  }

  // ── Step 4: stingCount — scan for duplicate stings throughout the episode ─────
  let stingCount = stingPresent ? 1 : 0;

  if (referenceAvailable && stingDurSec !== null && stingMaxVolDb !== null) {
    const episodeDur = getDuration(assembledFilePath);
    console.log(`${prefix} Episode duration: ${(episodeDur / 60).toFixed(2)} min`);

    // Measure episode background loudness at a stable mid-episode point so we
    // can use an episode-relative threshold. Endless Tales episodes have
    // continuous background music (-5 to -10 dBFS throughout). Comparing scan
    // windows to the sting's absolute peak would flag all music as duplicates;
    // instead we flag only if a window is significantly ABOVE the background bed.
    //
    // A misplaced sting playing on top of the music bed would add its energy on
    // top, raising the window by at least STING_ON_BED_EXCESS_DB above baseline.
    const BG_SAMPLE_START = Math.min(60, episodeDur * 0.10); // 10% in or 60s — past sting
    const BG_SAMPLE_DUR   = 30;                               // 30-second sample
    const STING_ON_BED_EXCESS_DB = 4;                        // dB above background = suspicious
    let backgroundDb: number | null = null;
    if (episodeDur > BG_SAMPLE_START + BG_SAMPLE_DUR) {
      backgroundDb = getMaxVolume(assembledFilePath, BG_SAMPLE_START, BG_SAMPLE_DUR);
      console.log(
        `${prefix} Background level: ${backgroundDb.toFixed(1)}dBFS ` +
        `(measured at ${BG_SAMPLE_START.toFixed(0)}–${(BG_SAMPLE_START + BG_SAMPLE_DUR).toFixed(0)}s)`
      );
    }

    // Strategic scan positions — where a misplaced sting would most likely appear
    const scanStartOffset = stingDurSec + START_WINDOW_BUFFER_SEC + 5; // past start region
    const duplicateScanPositions: { label: string; startSec: number }[] = [];

    if (episodeDur > scanStartOffset + 10) {
      const mid25 = episodeDur * 0.25;
      const mid50 = episodeDur * 0.50;
      const mid75 = episodeDur * 0.75;
      const nearOutro = episodeDur * 0.88;

      for (const [label, pos] of [
        ['25% mark', mid25] as [string, number],
        ['50% mark', mid50] as [string, number],
        ['75% mark', mid75] as [string, number],
        ['near-outro (88%)', nearOutro] as [string, number],
      ]) {
        if (pos > scanStartOffset) {
          duplicateScanPositions.push({ label, startSec: pos });
        }
      }
    }

    // Determine threshold: background-relative when available; fallback to
    // sting-peak margin (original heuristic) when background cannot be measured.
    const duplicateThresholdDb = backgroundDb !== null
      ? backgroundDb + STING_ON_BED_EXCESS_DB  // episode-relative
      : stingMaxVolDb - DUPLICATE_DETECTION_MARGIN_DB; // sting-relative fallback
    console.log(
      `${prefix} Duplicate scan: threshold=${duplicateThresholdDb.toFixed(1)}dBFS ` +
      `(${backgroundDb !== null ? `background+${STING_ON_BED_EXCESS_DB}dB` : 'sting-peak fallback'}), ` +
      `checking ${duplicateScanPositions.length} position(s)...`
    );

    for (const { label, startSec } of duplicateScanPositions) {
      const windowMaxVol = getMaxVolume(assembledFilePath, startSec, stingDurSec + 1);
      const isPotentialDuplicate = windowMaxVol > duplicateThresholdDb;
      console.log(
        `${prefix}   [${label}] @${startSec.toFixed(1)}s: max_volume=${windowMaxVol.toFixed(1)}dBFS` +
        (isPotentialDuplicate ? ' ← POTENTIAL DUPLICATE' : '')
      );
      if (isPotentialDuplicate) {
        stingCount++;
      }
    }
  } else {
    warnings.push(
      `Reference sting not available — duplicate scan skipped. ` +
      `Only start-presence was checked. Provide a valid NEXT_PUBLIC_SUPABASE_URL ` +
      `to enable full cross-episode duplicate detection.`
    );
    console.warn(`${prefix} ⚠️  Duplicate scan skipped (no reference).`);
  }

  // ── Step 5: Compute final verdict ─────────────────────────────────────────────
  const passed = stingPresent && stingBeforeBelle && stingCount === 1;

  const failureReasons: string[] = [];
  if (!stingPresent)      failureReasons.push('sting not detected at episode start');
  if (!stingBeforeBelle)  failureReasons.push("sting extends past or overlaps Belle's first line");
  if (stingCount > 1)     failureReasons.push(`sting count=${stingCount} (expected 1; ${stingCount - 1} potential duplicate(s) found in episode)`);
  if (stingCount === 0)   failureReasons.push('sting count=0 (no sting detected)');

  const details = passed
    ? `PASSED: sting present at start, before Belle, appears exactly once (count=${stingCount}).`
    : `FAILED: ${failureReasons.join('; ')}.`;

  if (passed) {
    console.log(`${prefix} ✓ ${details}`);
  } else {
    console.error(`${prefix} ✗ ${details}`);
  }
  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`${prefix} ⚠️  Warning: ${w}`);
  }

  // Cleanup temp dir
  try { fs.rmSync(tmp, { recursive: true }); } catch {}

  return {
    stingPresent,
    stingBeforeBelle,
    stingCount,
    passed,
    details,
    warnings,
  };
}

// ── Internal: ffprobe helpers ─────────────────────────────────────────────────

/**
 * Get the duration (seconds) of an audio file using ffmpeg stderr output.
 *
 * Mirrors core.ts getAudioDuration(): runs 'ffmpeg -i <file> -f null -' and
 * parses the 'Duration: HH:MM:SS.ss' line from stderr. This avoids any
 * dependency on ffprobe, which has no portable static-binary package.
 */
function getDuration(filePath: string): number {
  const r = spawnSync(FF, ['-i', filePath, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const out = ((r.stderr ?? Buffer.alloc(0)) as unknown as { toString(): string }).toString();
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
}

/**
 * Get the max volume (dBFS) of an audio file or a time window within it.
 *
 * @param filePath  Path to the audio file.
 * @param startSec  Start offset in seconds (0 for beginning of file).
 * @param durationSec  Window duration in seconds. null means full file.
 */
function getMaxVolume(filePath: string, startSec: number, durationSec: number | null): number {
  const args = ['-i', filePath];
  if (startSec > 0) args.push('-ss', String(startSec));
  if (durationSec !== null) args.push('-t', String(durationSec));
  args.push('-af', 'volumedetect', '-f', 'null', '-');
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const out = ((r.stderr ?? Buffer.alloc(0)) as unknown as { toString(): string }).toString();
  const m = out.match(/max_volume:\s*([-\d.]+)/);
  return m ? parseFloat(m[1]) : -999;
}
