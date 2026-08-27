#!/usr/bin/env node
/**
 * Garble Detection Gate — Phase 4, Item 1
 *
 * Hard-failing audio content inspection script that Whisper-transcribes every
 * segment's actual audio and diffs it against the intended script line.
 *
 * Mandatory gate: must pass before any story is marked ready_for_review,
 * promoted to Marc, or sent to final mixing.
 *
 * Usage:
 *   node garble-detection-gate.js <story_id> [segment_or_range]
 *
 * Examples:
 *   node garble-detection-gate.js 410d82dc-1dbd-4470-b8e8-a45f1c615597
 *   node garble-detection-gate.js 410d82dc-1dbd-4470-b8e8-a45f1c615597 103
 *   node garble-detection-gate.js 410d82dc-1dbd-4470-b8e8-a45f1c615597 1-50
 *
 * Exit codes:
 *   0 — All segments OK (warnings allowed)
 *   1 — One or more HARD FAILs detected (garbled audio)
 *   2 — Fatal error (DB failure, missing segment, env misconfiguration)
 */

'use strict';

process.chdir('/Users/williampostlewaite/Projects/drivetimetales');
require('dotenv').config({ path: '.env.local', override: true });

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { spawnSync, execSync } = require('child_process');
const { createClient }        = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WHISPER_BIN    = '/opt/homebrew/bin/whisper';
const WHISPER_MODEL  = 'base.en';
const WER_HARD_FAIL  = 0.40;   // >40% = FAIL
const WER_WARN       = 0.20;   // >20% = WARNING

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FATAL] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------------------------------------------------------------------------
// Regex patterns for lines to skip (non-vocal content)
// ---------------------------------------------------------------------------
const NON_VOCAL_RE = /^\[(BEAT|PAUSE|SFX|MUSIC|SOUND|SILENCE|TRANSITION|STING|FADE)[^]*/i;

// Prefixes to strip from script lines before comparison
const PREFIX_RE = /^(?:NARRATOR|[A-Z][A-Z0-9 _'-]{0,30}):\s*/;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const [,, storyId, rangeArg] = process.argv;

if (!storyId) {
  console.error('Usage: node garble-detection-gate.js <story_id> [segment_or_range]');
  console.error('  Examples: node garble-detection-gate.js <id>');
  console.error('            node garble-detection-gate.js <id> 103');
  console.error('            node garble-detection-gate.js <id> 1-50');
  process.exit(2);
}

function parseRange(arg, max) {
  if (!arg) return Array.from({ length: max }, (_, i) => i + 1);
  if (/^\d+$/.test(arg)) return [parseInt(arg, 10)];
  const m = arg.match(/^(\d+)-(\d+)$/);
  if (m) {
    const lo = parseInt(m[1], 10), hi = Math.min(parseInt(m[2], 10), max);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  console.error(`[FATAL] Invalid range format: "${arg}". Use "103" or "1-50".`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

function stripPrefix(line) {
  return line.replace(PREFIX_RE, '');
}

// ---------------------------------------------------------------------------
// Word Error Rate (WER) — Levenshtein on word tokens
// Symmetric: based on reference token count (expected words)
// ---------------------------------------------------------------------------

function wer(reference, hypothesis) {
  const ref = reference.split(' ').filter(Boolean);
  const hyp = hypothesis.split(' ').filter(Boolean);

  if (ref.length === 0 && hyp.length === 0) return 0;
  if (ref.length === 0) return 1;        // expected silence → anything = fail
  if (hyp.length === 0) return 1;        // expected speech  → silence = fail

  // Dynamic programming edit distance on word tokens
  const m = ref.length, n = hyp.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n] / m;
}

// ---------------------------------------------------------------------------
// Whisper transcription
// ---------------------------------------------------------------------------

function transcribeWithWhisper(audioPath, tmpDir) {
  const outDir = path.join(tmpDir, 'whisper-out');
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync(
    WHISPER_BIN,
    [audioPath, '--model', WHISPER_MODEL, '--output_format', 'txt', '--output_dir', outDir],
    { encoding: 'utf8', timeout: 120_000 }
  );

  if (result.status !== 0 || result.error) {
    throw new Error(`Whisper failed (status ${result.status}): ${result.stderr || result.error}`);
  }

  const base     = path.basename(audioPath, path.extname(audioPath));
  const txtPath  = path.join(outDir, `${base}.txt`);
  if (!fs.existsSync(txtPath)) {
    throw new Error(`Whisper did not produce output file: ${txtPath}`);
  }
  return fs.readFileSync(txtPath, 'utf8').trim();
}

// ---------------------------------------------------------------------------
// Download a segment from Supabase storage
// ---------------------------------------------------------------------------

async function downloadSegment(storyId, segNum, destDir) {
  const segName = `segment_${String(segNum).padStart(4, '0')}.mp3`;
  const storagePath = `asc3/${storyId}/${segName}`;
  const localPath   = path.join(destDir, segName);

  const { data, error } = await sb.storage.from('audio').download(storagePath);
  if (error) throw Object.assign(new Error(error.message), { code: 'NOT_FOUND', segName });

  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  return localPath;
}

// ---------------------------------------------------------------------------
// Gate result type
// ---------------------------------------------------------------------------

// GarbleResult: { segNum, segName, status, wer, expectedSnippet, whisperText }

function makeResult(segNum, status, werScore, expectedFull, whisperText) {
  return {
    segNum,
    segName: `segment_${String(segNum).padStart(4, '0')}`,
    status,        // 'ok' | 'warn' | 'fail' | 'skipped' | 'missing'
    wer: werScore,
    expectedFull,  // full original expected text
    whisperText,   // raw whisper transcript
  };
}

// ---------------------------------------------------------------------------
// Pretty-print a single result line
// ---------------------------------------------------------------------------

function printResult(r) {
  const tag = r.status === 'ok'
    ? `[OK]   `
    : r.status === 'warn'
      ? `[WARN] `
      : r.status === 'fail'
        ? `[FAIL] `
        : r.status === 'skipped'
          ? `[SKIP] `
          : `[MISS] `;

  const werStr = r.wer !== null ? `(WER: ${r.wer.toFixed(2)}) ` : '';

  if (r.status === 'ok') {
    const snippet = r.expectedFull.substring(0, 60) + (r.expectedFull.length > 60 ? '…' : '');
    console.log(`${tag}${r.segName}  ${werStr}"${snippet}"`);
  } else if (r.status === 'skipped') {
    console.log(`${tag}${r.segName}  [non-vocal line — no speech expected]`);
  } else if (r.status === 'missing') {
    console.log(`${tag}${r.segName}  [not found in storage]`);
  } else {
    const expSnip = r.expectedFull.substring(0, 60) + (r.expectedFull.length > 60 ? '…' : '');
    const actSnip = r.whisperText.substring(0, 60) + (r.whisperText.length > 60 ? '…' : '');
    console.log(`${tag}${r.segName}  ${werStr}expected: "${expSnip}" | whisper: "${actSnip}"`);
  }
}

// ---------------------------------------------------------------------------
// Main gate logic
// ---------------------------------------------------------------------------

async function runGate(storyId, segmentNumbers) {
  console.log(`\n=== GARBLE DETECTION GATE ===`);
  console.log(`Story:    ${storyId}`);
  console.log(`Segments: ${segmentNumbers.length === 1 ? segmentNumbers[0] : `${segmentNumbers[0]}–${segmentNumbers[segmentNumbers.length-1]} (${segmentNumbers.length} total)`}`);
  console.log(`Model:    Whisper ${WHISPER_MODEL}\n`);

  // 1. Fetch script from DB
  const { data: storyData, error: storyError } = await sb
    .from('stories')
    .select('title, script')
    .eq('id', storyId)
    .single();

  if (storyError || !storyData) {
    console.error(`[FATAL] Could not fetch story ${storyId}: ${storyError?.message}`);
    process.exit(2);
  }

  console.log(`Story:    "${storyData.title}"`);

  // 2. Parse script → segment map
  const rawLines = storyData.script.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const totalSegments = rawLines.length;
  console.log(`Script:   ${totalSegments} non-empty lines\n`);

  // Map: line_number (1-based) → text
  const segmentMap = {};
  for (let i = 0; i < rawLines.length; i++) {
    segmentMap[i + 1] = rawLines[i];
  }

  // 3. Create temp working dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garble-gate-'));

  // 4. Process each segment
  const results = [];

  for (const segNum of segmentNumbers) {
    if (!segmentMap[segNum]) {
      // Segment number beyond script length
      results.push(makeResult(segNum, 'missing', null, '', '[beyond script length]'));
      printResult(results[results.length - 1]);
      continue;
    }

    const rawLine = segmentMap[segNum];

    // Skip non-vocal lines
    if (NON_VOCAL_RE.test(rawLine)) {
      results.push(makeResult(segNum, 'skipped', null, rawLine, ''));
      printResult(results[results.length - 1]);
      continue;
    }

    // Strip speaker prefix for comparison
    const expectedText   = stripPrefix(rawLine);
    const expectedNormal = normalise(expectedText);

    let audioPath;
    try {
      audioPath = await downloadSegment(storyId, segNum, tmpDir);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        results.push(makeResult(segNum, 'missing', null, rawLine, '[not found in storage]'));
        printResult(results[results.length - 1]);
        continue;
      }
      throw err;
    }

    let whisperRaw;
    try {
      whisperRaw = transcribeWithWhisper(audioPath, tmpDir);
    } catch (err) {
      console.warn(`  [WARN] Whisper failed for ${path.basename(audioPath)}: ${err.message}`);
      results.push(makeResult(segNum, 'warn', null, rawLine, '[whisper error]'));
      printResult(results[results.length - 1]);
      continue;
    }

    const whisperNormal = normalise(whisperRaw);
    const werScore      = wer(expectedNormal, whisperNormal);

    let status;
    if (werScore > WER_HARD_FAIL) {
      status = 'fail';
    } else if (werScore > WER_WARN) {
      status = 'warn';
    } else {
      status = 'ok';
    }

    const result = makeResult(segNum, status, werScore, expectedText, whisperRaw);
    results.push(result);
    printResult(result);

    // Clean up audio file (keep whisper output for JSON report)
    try { fs.unlinkSync(audioPath); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const fails    = results.filter(r => r.status === 'fail');
  const warns    = results.filter(r => r.status === 'warn');
  const oks      = results.filter(r => r.status === 'ok');
  const skipped  = results.filter(r => r.status === 'skipped');
  const missing  = results.filter(r => r.status === 'missing');

  console.log('\n' + '─'.repeat(72));

  if (fails.length > 0) {
    console.log(`\nGATE RESULT: FAILED — ${fails.length} segment(s) with corrupted audio`);
    console.log('\nFailed segments:');
    for (const f of fails) {
      console.log(`  ${f.segName}  WER: ${f.wer.toFixed(2)}`);
      console.log(`    expected: "${f.expectedFull.substring(0, 100)}"`);
      console.log(`    whisper:  "${f.whisperText.substring(0, 100)}"`);
    }
  } else {
    console.log(`\nGATE RESULT: PASSED`);
  }

  console.log(`\nSummary: ${oks.length} OK | ${warns.length} WARN | ${fails.length} FAIL | ${skipped.length} SKIPPED | ${missing.length} MISSING`);

  // ---------------------------------------------------------------------------
  // JSON report
  // ---------------------------------------------------------------------------

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = `/tmp/garble-gate-${storyId}-${ts}.json`;
  const report = {
    storyId,
    storyTitle: storyData.title,
    runAt: new Date().toISOString(),
    model: WHISPER_MODEL,
    thresholds: { warn: WER_WARN, fail: WER_HARD_FAIL },
    gatePassed: fails.length === 0,
    summary: {
      ok: oks.length,
      warn: warns.length,
      fail: fails.length,
      skipped: skipped.length,
      missing: missing.length,
      total: results.length,
    },
    results: results.map(r => ({
      segNum: r.segNum,
      segName: r.segName,
      status: r.status,
      wer: r.wer,
      expectedText: r.expectedFull,
      whisperText: r.whisperText,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report: ${reportPath}`);

  // Clean up temp dir (whisper output already captured in report)
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

  return { passed: fails.length === 0, failures: fails, warnings: warns, report, reportPath };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  try {
    // Fetch script to know total segment count (needed for "all" mode)
    let segmentNumbers;

    if (!rangeArg) {
      // Need to know total segments first
      const { data, error } = await sb
        .from('stories')
        .select('script')
        .eq('id', storyId)
        .single();
      if (error) {
        console.error(`[FATAL] Could not fetch story script: ${error.message}`);
        process.exit(2);
      }
      const total = data.script.split('\n').map(l => l.trim()).filter(l => l.length > 0).length;
      segmentNumbers = parseRange(null, total);
    } else {
      segmentNumbers = parseRange(rangeArg, 99999);
    }

    const { passed } = await runGate(storyId, segmentNumbers);
    process.exit(passed ? 0 : 1);

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(2);
  }
})();
