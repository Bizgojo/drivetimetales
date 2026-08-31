/**
 * assembleAndVerifyFinalMix — Canonical verified episode segment assembly.
 *
 * This is the ONLY code path that should produce a finished episode mix from
 * raw segments. It enforces both orphan-detection and garble-detection before
 * any audio output is written. If either check hard-fails the function returns
 * { success: false } and writes no output file.
 *
 * ── CHECKS ────────────────────────────────────────────────────────────────────
 *  1. Orphan detection   — Mechanism B (HIGH confidence): segments whose position
 *     index ≥ parsed script length are beyond the script boundary and must be
 *     excluded. Auto-fails if any are present in the passed segments list.
 *
 *  2. Garble detection   — Delegates to garble-detection-gate.js via the
 *     existing garbleGate.ts wrapper. A HARD FAIL (WER > 40%) on any voice
 *     segment blocks assembly.
 *
 * ── ASSEMBLY ──────────────────────────────────────────────────────────────────
 *  When both checks pass (and dryRun=false):
 *   a. Downloads all segments from Supabase storage.
 *   b. ffmpeg-concat to a single MP3 file.
 *   c. Uploads the result as outputFilename.
 *   d. Uploads a scan-report-v{N}.json to the same storage folder.
 *   e. Returns { success: true, outputPath: publicUrl, scanReport }.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *  Next.js / core.ts (ESM import):
 *    import { assembleAndVerifyFinalMix } from '@/lib/assembleAndVerifyFinalMix';
 *
 *  Correction scripts (CommonJS — via the shim at the bottom of this file):
 *    const { assembleAndVerifyFinalMix } = require('./lib/assembleAndVerifyFinalMix');
 *
 * @module assembleAndVerifyFinalMix
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runGarbleGate, type GarbleGateOutcome } from './garbleGate';
import { runVoiceMapGate, type VoiceMapGateOutcome } from './voiceMapGate';
import { runBelleStructureGate, type BelleGateOutcome } from './belleStructureGate';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanReport {
  storyId: string;
  buildTimestamp: string;
  outputFilename: string;
  segmentCount: number;
  excludedSegments: string[];
  orphanCheck: {
    passed: boolean;
    /** Mechanism B orphans: segment names whose position ≥ script length */
    flagged: string[];
  };
  garbleCheck: {
    passed: boolean;
    failures: { segment: string; wer: number }[];
    warnings: { segment: string; wer: number }[];
  };
  voiceCheck: {
    passed: boolean;
    failures: { segment: string; character: string; actualVoiceId: string; expectedVoiceId: string }[];
    inconclusive: { segment: string; character: string | null; note: string }[];
  };
  belleCheck: {
    passed: boolean;
    failures: { rule: string; verdict: string; details: string }[];
    inconclusive: { rule: string; verdict: string; details: string }[];
    warnings: string[];
  };
}

export interface AssembleResult {
  success: boolean;
  /** Supabase public URL for the assembled output (only set on success + dryRun=false) */
  outputPath?: string;
  scanReport: ScanReport;
  errors: string[];
}

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FF           = '/opt/homebrew/bin/ffmpeg';
const FFP          = '/opt/homebrew/bin/ffprobe';

// ATL-PARSER-001 header keys — kept in sync with lib/scriptLineIndex.ts
const HEADER_KEYS = [
  'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
  'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
  'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
  'CHARACTER GUIDE', '---',
];

// ── Internal: ATL-PARSER-001 position count (Mechanism B bound) ───────────────

/**
 * Parse the story script and return the total number of counted positions.
 * Uses the canonical ATL-PARSER-001 counting rules — identical to scriptLineIndex.ts.
 * We only need the count here, not the full position list.
 */
function parseScriptPositionCount(script: string): number {
  const rawLines = script.split('\n');

  const announcerLineIndices: number[] = [];
  rawLines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return;
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerLineIndices.push(i);
  });
  const firstAnnouncerIdx = announcerLineIndices[0] ?? -1;
  const lastAnnouncerIdx  = announcerLineIndices[announcerLineIndices.length - 1] ?? -1;

  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'));
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'));
  const scriptStartIdx = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx;
  const headerEndIdx   = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1);

  let lineIndex = 0;

  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return;

    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return;

    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return;
    }

    // [BEAT] / [PAUSE] / [PAUSE:N]
    if (
      trimmed === '[BEAT]' ||
      trimmed === '[PAUSE]' ||
      /^\[PAUSE:\d+(?:\.\d+)?\]$/.test(trimmed)
    ) { lineIndex++; return; }

    // [SFX: ...]
    if (trimmed.startsWith('[SFX:')) { lineIndex++; return; }

    // Other bare bracket lines — not counted
    if (trimmed.startsWith('[')) return;

    // Skip "ANNOUNCER: Endless Tales presents..."
    if (trimmed.startsWith('ANNOUNCER:') && /endless tales presents/i.test(trimmed)) return;

    // [SPEAKER]: text
    const bracketDm = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/);
    if (bracketDm) { lineIndex++; return; }

    // Standard SPEAKER: text
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/);
    if (dm) lineIndex++;
  });

  return lineIndex;
}

// ── Internal: ffmpeg helpers (same as render-correction-mix.js) ───────────────

function ffRun(args: string[], label?: string): void {
  if (label) process.stdout.write(`   [avfm] ${label}... `);
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr ?? Buffer.alloc(0)).toString();
    throw new Error(`ffmpeg [${label ?? '?'}]: ${err.slice(-600)}`);
  }
  if (label) console.log('done');
}

function getDur(filePath: string): number {
  const r = spawnSync(FFP, [
    '-v', 'quiet',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(((r.stdout ?? '') as unknown as string).toString().trim()) || 0;
}

function concatSegments(files: string[], out: string, label?: string): void {
  const lst = out + '.lst';
  fs.writeFileSync(lst, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  ffRun([
    '-f', 'concat', '-safe', '0', '-i', lst,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out,
  ], label);
  fs.unlinkSync(lst);
}

// ── Internal: helpers ─────────────────────────────────────────────────────────

function segIndexFromName(name: string): number | null {
  const m = name.match(/^segment_(\d{4})\.mp3$/);
  return m ? parseInt(m[1], 10) : null;
}

const DEFAULT_BELLE_CHECK: ScanReport['belleCheck'] = {
  passed: true,
  failures: [],
  inconclusive: [],
  warnings: [],
};

function makeScanReport(
  storyId: string,
  buildTimestamp: string,
  outputFilename: string,
  segments: string[],
  excludedSegments: string[],
  orphanCheck: ScanReport['orphanCheck'],
  garbleCheck: ScanReport['garbleCheck'],
  voiceCheck: ScanReport['voiceCheck'],
  belleCheck: ScanReport['belleCheck'] = DEFAULT_BELLE_CHECK,
): ScanReport {
  return {
    storyId,
    buildTimestamp,
    outputFilename,
    segmentCount: segments.length,
    excludedSegments,
    orphanCheck,
    garbleCheck,
    voiceCheck,
    belleCheck,
  };
}

async function writeScanReport(
  sb: SupabaseClient,
  folder: string,
  report: ScanReport,
): Promise<string> {
  // Determine next version number from existing scan-report-vN.json files
  const { data: files } = await sb.storage.from('audio').list(`asc3/${folder}`, {
    limit: 500,
    sortBy: { column: 'name', order: 'asc' },
  });
  const existingVersions = (files ?? [])
    .map(f => f.name.match(/^scan-report-v(\d+)\.json$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => parseInt(m[1], 10));
  const nextN  = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;
  const name   = `scan-report-v${nextN}.json`;
  const buf    = Buffer.from(JSON.stringify(report, null, 2));

  const { error } = await sb.storage.from('audio').upload(`asc3/${folder}/${name}`, buf, {
    contentType: 'application/json',
    upsert: false,
    cacheControl: '0',
  });
  if (error) {
    console.warn(`[assembleAndVerifyFinalMix] Warning: scan report upload failed: ${error.message}`);
  }

  return name;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Assemble and verify a final episode segment mix.
 *
 * This is the ONLY code path any pipeline should use to produce a finished
 * episode mix. It enforces orphan detection and garble detection before any
 * audio output is written.
 *
 * @param opts.storyId         Supabase story UUID
 * @param opts.segments        Ordered list of segment filenames (e.g. ['segment_0000.mp3', ...])
 * @param opts.outputFilename  Versioned output name — must not be 'final_mix.mp3'
 * @param opts.excludeSegments Additional segments to exclude from assembly
 * @param opts.dryRun          If true, run all checks but do not write any output file
 */
export async function assembleAndVerifyFinalMix(opts: {
  storyId: string;
  segments: string[];
  outputFilename: string;
  excludeSegments?: string[];
  dryRun?: boolean;
}): Promise<AssembleResult> {
  const { storyId, outputFilename, dryRun = false } = opts;

  if (outputFilename === 'final_mix.mp3') {
    return {
      success: false,
      scanReport: makeScanReport(storyId, new Date().toISOString(), outputFilename, [], [], { passed: false, flagged: [] }, { passed: false, failures: [], warnings: [] }, { passed: false, failures: [], inconclusive: [] }),
      errors: ['BLOCKED: outputFilename must not be "final_mix.mp3". Use a versioned name.'],
    };
  }

  const excludeSet        = new Set(opts.excludeSegments ?? []);
  const segments          = opts.segments.filter(s => !excludeSet.has(s));
  const buildTimestamp    = new Date().toISOString();
  const errors: string[]  = [];

  // ── 0. Validate environment ───────────────────────────────────────────────

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      success: false,
      scanReport: makeScanReport(storyId, buildTimestamp, outputFilename, segments, Array.from(excludeSet), { passed: false, flagged: [] }, { passed: false, failures: [], warnings: [] }, { passed: false, failures: [], inconclusive: [] }),
      errors: ['Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'],
    };
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 1. Fetch story (script + storage folder URL) ──────────────────────────

  const { data: story, error: storyErr } = await sb
    .from('stories')
    .select('script, story_audio_url, intro_audio_url')
    .eq('id', storyId)
    .single();

  if (storyErr || !story?.script) {
    return {
      success: false,
      scanReport: makeScanReport(storyId, buildTimestamp, outputFilename, segments, Array.from(excludeSet), { passed: false, flagged: [] }, { passed: false, failures: [], warnings: [] }, { passed: false, failures: [], inconclusive: [] }),
      errors: [`Cannot fetch story script: ${storyErr?.message ?? 'script column empty'}`],
    };
  }

  const positionCount = parseScriptPositionCount(story.script);
  console.log(`[assembleAndVerifyFinalMix] Script positions: ${positionCount}, segments: ${segments.length}`);

  // ── 2. Orphan check — Mechanism B (HIGH confidence) ──────────────────────
  // Any segment whose 0-based index ≥ script position count is beyond the
  // script boundary and will never be reached during playback. These are
  // definitive orphans — auto-excluded from the mix per Phase 4 spec.

  const orphanFlagged: string[] = [];
  for (const seg of segments) {
    const idx = segIndexFromName(seg);
    if (idx === null) continue; // non-standard name format, pass through
    if (idx >= positionCount) {
      orphanFlagged.push(seg);
    }
  }

  const orphanPassed = orphanFlagged.length === 0;
  if (!orphanPassed) {
    errors.push(
      `Orphan check FAILED: ${orphanFlagged.length} segment(s) beyond script boundary ` +
      `(script has ${positionCount} positions). Flagged: ${orphanFlagged.join(', ')}`
    );
    console.error(`[assembleAndVerifyFinalMix] ${errors[errors.length - 1]}`);
  } else {
    console.log(`[assembleAndVerifyFinalMix] ✓ Orphan check passed (all segments within ${positionCount}-position bound)`);
  }

  // ── 3. Garble detection gate ──────────────────────────────────────────────

  const voiceSegIndices: number[] = segments
    .map(s => segIndexFromName(s))
    .filter((idx): idx is number => idx !== null)
    .sort((a, b) => a - b);

  // ── 3a. Voice map gate ────────────────────────────────────────────────────
  // Verifies every segment was rendered with the character's CURRENT assigned
  // voice from series_character_roster (is_locked=true). Catches recast-but-not-
  // re-rendered segments (e.g. EP10 segment_0089 — Hector in old voice).
  // This check runs BEFORE garble detection (cheaper; no Whisper required).

  let voicePassed = false;
  const voiceFailures: { segment: string; character: string; actualVoiceId: string; expectedVoiceId: string }[] = [];
  const voiceInconclusive: { segment: string; character: string | null; note: string }[] = [];

  try {
    console.log(`[assembleAndVerifyFinalMix] Running voice map gate on ${segments.length} segment(s)...`);
    const voiceOutcome: VoiceMapGateOutcome = await runVoiceMapGate(storyId, segments);
    voicePassed = voiceOutcome.passed;

    for (const f of voiceOutcome.failures) {
      voiceFailures.push({
        segment:          f.segName + '.mp3',
        character:        f.character ?? '',
        actualVoiceId:    f.actualVoiceId ?? '',
        expectedVoiceId:  f.expectedVoiceId ?? '',
      });
    }
    for (const i of voiceOutcome.inconclusive) {
      voiceInconclusive.push({
        segment:   i.segName + '.mp3',
        character: i.character,
        note:      i.note ?? '',
      });
    }

    if (!voicePassed) {
      errors.push(
        `Voice map gate FAILED: ${voiceFailures.length} segment(s) rendered with wrong voice. ` +
        voiceFailures.map(f => `${f.segment}(char=${f.character},actual=${f.actualVoiceId},expected=${f.expectedVoiceId})`).join(', ')
      );
      console.error(`[assembleAndVerifyFinalMix] ${errors[errors.length - 1]}`);
    } else {
      console.log(
        `[assembleAndVerifyFinalMix] ✓ Voice map gate passed` +
        (voiceInconclusive.length > 0 ? ` (${voiceInconclusive.length} inconclusive)` : '')
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Voice map gate error: ${msg}`);
    voicePassed = false;
  }

  let garblePassed = false;
  const garbleFailures: { segment: string; wer: number }[] = [];
  const garbleWarnings: { segment: string; wer: number }[] = [];

  try {
    console.log(`[assembleAndVerifyFinalMix] Running garble gate on ${voiceSegIndices.length} segment index(es)...`);
    const garbleOutcome: GarbleGateOutcome = await runGarbleGate(storyId, voiceSegIndices);
    garblePassed = garbleOutcome.passed;

    for (const f of garbleOutcome.failures) {
      garbleFailures.push({ segment: f.segName + '.mp3', wer: f.wer ?? 0 });
    }
    for (const w of garbleOutcome.warnings) {
      garbleWarnings.push({ segment: w.segName + '.mp3', wer: w.wer ?? 0 });
    }

    if (!garblePassed) {
      errors.push(
        `Garble check FAILED: ${garbleFailures.length} segment(s) exceed WER threshold. ` +
        garbleFailures.map(f => `${f.segment}(WER=${f.wer.toFixed(2)})`).join(', ')
      );
      console.error(`[assembleAndVerifyFinalMix] ${errors[errors.length - 1]}`);
    } else {
      console.log(
        `[assembleAndVerifyFinalMix] ✓ Garble gate passed` +
        (garbleWarnings.length > 0 ? ` (${garbleWarnings.length} warning(s))` : '')
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Garble gate error: ${msg}`);
    garblePassed = false;
  }

  // ── 3c. BELLE structure gate ──────────────────────────────────────────────
  // Structural backstop — validates BELLE B intro/outro structure against
  // BELLE-001 through BELLE-006. Hard-fail checks only:
  //   BELLE-001: multi-line intro
  //   BELLE-003: listener name in outro
  //   BELLE-004: first episode intro missing title/author
  //   BELLE-005: finale outro missing title/author recap
  //   BELLE-006: interior episode naming title/author (INCONCLUSIVE — not blocking)

  let bellePassed = false;
  const belleCheckFailures: { rule: string; verdict: string; details: string }[] = [];
  const belleCheckInconclusive: { rule: string; verdict: string; details: string }[] = [];
  const belleCheckWarnings: string[] = [];

  try {
    console.log(`[assembleAndVerifyFinalMix] Running BELLE structure gate...`);
    const belleOutcome: BelleGateOutcome = await runBelleStructureGate(storyId);
    bellePassed = belleOutcome.passed;

    for (const c of belleOutcome.checks) {
      if (c.verdict === 'fail') {
        belleCheckFailures.push({ rule: c.rule, verdict: c.verdict, details: c.details });
      } else if (c.verdict === 'inconclusive') {
        belleCheckInconclusive.push({ rule: c.rule, verdict: c.verdict, details: c.details });
      }
    }
    for (const w of belleOutcome.warnings) belleCheckWarnings.push(w);

    if (!bellePassed) {
      errors.push(
        `BELLE structure gate FAILED: ${belleCheckFailures.length} rule(s) violated. ` +
        belleCheckFailures.map(f => `${f.rule}: ${f.details.slice(0, 120)}`).join('; ')
      );
      console.error(`[assembleAndVerifyFinalMix] ${errors[errors.length - 1]}`);
    } else {
      console.log(
        `[assembleAndVerifyFinalMix] ✓ BELLE structure gate passed` +
        (belleCheckInconclusive.length > 0 ? ` (${belleCheckInconclusive.length} inconclusive)` : '')
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`BELLE structure gate error: ${msg}`);
    bellePassed = false;
  }

  // ── Build scan report (populated regardless of check outcome) ─────────────

  const scanReport = makeScanReport(
    storyId, buildTimestamp, outputFilename, segments, Array.from(excludeSet),
    { passed: orphanPassed, flagged: orphanFlagged },
    { passed: garblePassed, failures: garbleFailures, warnings: garbleWarnings },
    { passed: voicePassed, failures: voiceFailures, inconclusive: voiceInconclusive },
    { passed: bellePassed, failures: belleCheckFailures, inconclusive: belleCheckInconclusive, warnings: belleCheckWarnings },
  );

  // ── 4. Abort on any check failure — no output written ────────────────────

  if (!orphanPassed || !garblePassed || !voicePassed || !bellePassed) {
    console.error('[assembleAndVerifyFinalMix] ✗ Checks failed — no output written');
    return { success: false, scanReport, errors };
  }

  // ── 5. Dry run: checks passed, skip assembly ──────────────────────────────

  if (dryRun) {
    console.log('[assembleAndVerifyFinalMix] dryRun=true — all checks passed, skipping assembly');
    return { success: true, scanReport, errors: [] };
  }

  // ── 6. Assemble: download segments → ffmpeg concat → upload ──────────────

  // Determine storage folder from story URLs
  const folderMatch = (story.story_audio_url || story.intro_audio_url || '').match(/asc3\/([^/]+)\//);
  if (!folderMatch) {
    return {
      success: false,
      scanReport,
      errors: ['Cannot determine Supabase storage folder from story URLs (story_audio_url / intro_audio_url)'],
    };
  }
  const FOLDER = folderMatch[1];

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avfm-'));
  try {
    // ── 6a. Download segments ───────────────────────────────────────────────
    const segDir   = path.join(tmp, 'segs');
    fs.mkdirSync(segDir);
    const segPaths: string[] = [];

    console.log(`[assembleAndVerifyFinalMix] Downloading ${segments.length} segments from asc3/${FOLDER}/...`);
    for (let i = 0; i < segments.length; i++) {
      const seg   = segments[i];
      const { data, error } = await sb.storage.from('audio').download(`asc3/${FOLDER}/${seg}`);
      if (error) throw new Error(`Segment download failed (${seg}): ${error.message}`);
      const localPath = path.join(segDir, seg);
      fs.writeFileSync(localPath, Buffer.from(await data.arrayBuffer()));
      segPaths.push(localPath);
      if ((i + 1) % 25 === 0 || i + 1 === segments.length) {
        console.log(`  ${i + 1}/${segments.length} downloaded`);
      }
    }

    // ── 6b. Verify download count ───────────────────────────────────────────
    const downloaded = fs.readdirSync(segDir).filter(f => f.endsWith('.mp3')).length;
    if (downloaded !== segments.length) {
      throw new Error(`Segment count mismatch: listed ${segments.length}, downloaded ${downloaded}`);
    }

    // ── 6c. ffmpeg concat (same logic as render-correction-mix.js concatFiles) ─
    const concatOut = path.join(tmp, 'segments_assembled.mp3');
    concatSegments(segPaths, concatOut, `concat ${segPaths.length} segments`);

    const assembledDur  = getDur(concatOut);
    const assembledSize = (fs.statSync(concatOut).size / 1024 / 1024).toFixed(1);
    console.log(`[assembleAndVerifyFinalMix] Assembled: ${assembledSize} MB, ${(assembledDur / 60).toFixed(2)} min`);

    // ── 6d. Upload output file ──────────────────────────────────────────────
    const storagePath = `asc3/${FOLDER}/${outputFilename}`;
    console.log(`[assembleAndVerifyFinalMix] Uploading as ${outputFilename}...`);
    const buf = fs.readFileSync(concatOut);
    const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, {
      contentType: 'audio/mpeg',
      upsert: true,
      cacheControl: '0',
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath);

    // ── 6e. Write scan report to same storage folder (atomic alongside output) ─
    const reportName = await writeScanReport(sb, FOLDER, scanReport);
    console.log(`[assembleAndVerifyFinalMix] ✓ Scan report: ${reportName}`);

    console.log(`[assembleAndVerifyFinalMix] ✓ DONE — ${outputFilename} (${assembledSize} MB, ${(assembledDur / 60).toFixed(2)} min)`);
    console.log(`[assembleAndVerifyFinalMix]   URL: ${publicUrl}`);

    return { success: true, outputPath: publicUrl, scanReport, errors: [] };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[assembleAndVerifyFinalMix] Assembly error: ${msg}`);
    return { success: false, scanReport, errors: [msg] };
  } finally {
    try { fs.rmSync(tmp, { recursive: true }); } catch {}
  }
}

// ── CommonJS shim ─────────────────────────────────────────────────────────────
// Allows correction scripts to: const { assembleAndVerifyFinalMix } = require('./lib/assembleAndVerifyFinalMix');
// This mirrors the pattern in lib/garbleGate.ts.
declare const module: { exports: unknown } | undefined;
if (typeof module !== 'undefined') {
  // @ts-ignore
  module.exports = { assembleAndVerifyFinalMix };
  // @ts-ignore
  module.exports.assembleAndVerifyFinalMix = assembleAndVerifyFinalMix;
}
