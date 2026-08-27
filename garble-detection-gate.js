#!/usr/bin/env node
/**
 * Garble Detection Gate — Phase 4, Item 1
 *
 * Hard-failing audio content inspection script that Whisper-transcribes every
 * segment's actual audio and diffs it against the intended script line via WER.
 *
 * PARSER: Uses the canonical ATL-PARSER-001 parseScriptPositions logic —
 * identical to lib/scriptLineIndex.ts. Segments are 0-based (segment_0000.mp3
 * is index 0, segment_0103.mp3 is index 103). Never use naïve non-empty-line
 * counting — it gives wrong segment numbers.
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
 *   0 — All checked segments OK (warnings allowed)
 *   1 — One or more HARD FAILs detected (garbled audio)
 *   2 — Fatal error (DB failure, missing env, bad args)
 */

'use strict';

process.chdir('/Users/williampostlewaite/Projects/drivetimetales');
require('dotenv').config({ path: '.env.local', override: true });

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { spawnSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WHISPER_BIN   = '/opt/homebrew/bin/whisper';
const WHISPER_MODEL = 'base.en';
const WER_HARD_FAIL = 0.40;   // WER > 40% = HARD FAIL
const WER_WARN      = 0.20;   // WER > 20% = WARNING

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FATAL] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------------------------------------------------------------------------
// ATL-PARSER-001 — Canonical script position parser (ported from lib/scriptLineIndex.ts)
// MUST stay in sync with lib/scriptLineIndex.ts. Segment numbers are 0-based.
// ---------------------------------------------------------------------------

const HEADER_KEYS = [
  'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
  'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
  'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
  'CHARACTER GUIDE', '---',
];

function isAnnouncerSpeaker(speaker) {
  const s = speaker.trim().toUpperCase();
  return s === 'ANNOUNCER' || s === 'BELLE B' || s === 'SANDY';
}

/**
 * Parse every counted position from a story script.
 * Returns { index (0-based), kind, speaker, text, isExpected, rawLineNumber }.
 * This is the canonical ATL-PARSER-001 implementation — do not replace with
 * ad-hoc line counting.
 */
function parseScriptPositions(script) {
  const rawLines = script.split('\n');

  // Locate announcer lines (first = intro, last = outro)
  const announcerLineIndices = [];
  rawLines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return;
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerLineIndices.push(i);
  });
  const firstAnnouncerIdx = announcerLineIndices[0] ?? -1;
  const lastAnnouncerIdx  = announcerLineIndices[announcerLineIndices.length - 1] ?? -1;

  // Find drama body boundary
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'));
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'));
  const scriptStartIdx  = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx;
  const headerEndIdx    = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1);

  const positions = [];
  let lineIndex = 0;

  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Skip pre-script lines unless they ARE the designated intro or outro announcer
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return;

    // Skip structural header keys
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return;

    // Skip header-zone NARRATOR/ANNOUNCER lines
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return;
    }

    // [BEAT]
    if (trimmed === '[BEAT]') {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'BEAT', text: '0.75', isExpected: true, rawLineNumber: rawIdx + 1 });
      return;
    }

    // [PAUSE]
    if (trimmed === '[PAUSE]') {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'PAUSE', text: '1', isExpected: true, rawLineNumber: rawIdx + 1 });
      return;
    }

    // [PAUSE:N]
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+(?:\.\d+)?)\]$/);
    if (pauseMatch) {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'PAUSE', text: pauseMatch[1], isExpected: true, rawLineNumber: rawIdx + 1 });
      return;
    }

    // [SFX: ...]
    if (trimmed.startsWith('[SFX:')) {
      const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim();
      positions.push({ index: lineIndex++, kind: 'sfx', speaker: 'SFX', text: sfxText, isExpected: false, rawLineNumber: rawIdx + 1 });
      return;
    }

    // [SPEAKER]: text (bracket dialogue format)
    const bracketDm = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/);
    if (bracketDm) {
      const speaker = bracketDm[1].trim();
      const text    = bracketDm[2].trim();
      positions.push({ index: lineIndex++, kind: 'voice', speaker, text, isExpected: !isAnnouncerSpeaker(speaker), rawLineNumber: rawIdx + 1 });
      return;
    }

    // Other bare bracket lines — do NOT increment lineIndex
    if (trimmed.startsWith('[')) return;

    // Skip "ANNOUNCER: Endless Tales presents..."
    if (trimmed.startsWith('ANNOUNCER:') && /endless tales presents/i.test(trimmed)) return;

    // Standard dialogue: SPEAKER: text
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/);
    if (dm) {
      const speaker = dm[1].trim();
      const text    = dm[2].trim();
      positions.push({ index: lineIndex++, kind: 'voice', speaker, text, isExpected: !isAnnouncerSpeaker(speaker), rawLineNumber: rawIdx + 1 });
    }
  });

  return positions;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const [,, storyId, rangeArg] = process.argv;

if (!storyId) {
  console.error('Usage: node garble-detection-gate.js <story_id> [segment_or_range]');
  console.error('       Segment numbers are 0-based (canonical ATL-PARSER-001).');
  console.error('  Examples: node garble-detection-gate.js <id>');
  console.error('            node garble-detection-gate.js <id> 103');
  console.error('            node garble-detection-gate.js <id> 0-50');
  process.exit(2);
}

function parseRange(arg, lo, hi) {
  if (!arg) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  if (/^\d+$/.test(arg)) return [parseInt(arg, 10)];
  const m = arg.match(/^(\d+)-(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10), b = Math.min(parseInt(m[2], 10), hi);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  console.error(`[FATAL] Invalid range: "${arg}". Use "103" or "0-50".`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Word Error Rate (WER) via Levenshtein on word tokens
// ---------------------------------------------------------------------------

function wer(reference, hypothesis) {
  const ref = reference.split(' ').filter(Boolean);
  const hyp = hypothesis.split(' ').filter(Boolean);
  if (ref.length === 0 && hyp.length === 0) return 0;
  if (ref.length === 0) return 1;
  if (hyp.length === 0) return 1;

  const m = ref.length, n = hyp.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = ref[i - 1] === hyp[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
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

  const base    = path.basename(audioPath, path.extname(audioPath));
  const txtPath = path.join(outDir, `${base}.txt`);
  if (!fs.existsSync(txtPath)) {
    throw new Error(`Whisper produced no output at ${txtPath}`);
  }
  return fs.readFileSync(txtPath, 'utf8').trim();
}

// ---------------------------------------------------------------------------
// Download segment from Supabase storage
// ---------------------------------------------------------------------------

async function downloadSegment(storyId, segIndex, destDir) {
  const segName    = `segment_${String(segIndex).padStart(4, '0')}.mp3`;
  const storagePath = `asc3/${storyId}/${segName}`;
  const localPath  = path.join(destDir, segName);

  const { data, error } = await sb.storage.from('audio').download(storagePath);
  if (error) throw Object.assign(new Error(error.message), { code: 'NOT_FOUND', segName });

  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  return localPath;
}

// ---------------------------------------------------------------------------
// Result type helpers
// ---------------------------------------------------------------------------

function makeResult(segIndex, status, werScore, expectedText, whisperText) {
  return {
    segIndex,
    segName: `segment_${String(segIndex).padStart(4, '0')}`,
    status,          // 'ok' | 'warn' | 'fail' | 'skipped' | 'missing'
    wer: werScore,
    expectedText,
    whisperText,
  };
}

function printResult(r) {
  const tag = { ok: '[OK]   ', warn: '[WARN] ', fail: '[FAIL] ', skipped: '[SKIP] ', missing: '[MISS] ' }[r.status] ?? '[???]  ';
  const werStr = r.wer !== null ? `(WER: ${r.wer.toFixed(2)}) ` : '';

  if (r.status === 'ok') {
    const snip = r.expectedText.substring(0, 60) + (r.expectedText.length > 60 ? '…' : '');
    console.log(`${tag}${r.segName}  ${werStr}"${snip}"`);
  } else if (r.status === 'skipped') {
    console.log(`${tag}${r.segName}  [non-voice segment — silence/sfx, no transcript comparison]`);
  } else if (r.status === 'missing') {
    console.log(`${tag}${r.segName}  [not found in storage — segment may have been skipped or not yet generated]`);
  } else {
    const expSnip = r.expectedText.substring(0, 60) + (r.expectedText.length > 60 ? '…' : '');
    const actSnip = r.whisperText.substring(0, 60) + (r.whisperText.length > 60 ? '…' : '');
    console.log(`${tag}${r.segName}  ${werStr}expected: "${expSnip}" | whisper: "${actSnip}"`);
  }
}

// ---------------------------------------------------------------------------
// Main gate logic
// ---------------------------------------------------------------------------

async function runGate(storyId, requestedIndices) {
  console.log(`\n=== GARBLE DETECTION GATE (ATL-PARSER-001) ===`);
  console.log(`Story:    ${storyId}`);
  console.log(`Model:    Whisper ${WHISPER_MODEL}`);
  console.log(`Thresholds: WARN >=${(WER_WARN*100).toFixed(0)}% WER | FAIL >=${(WER_HARD_FAIL*100).toFixed(0)}% WER\n`);

  // 1. Fetch script
  const { data: storyData, error: storyError } = await sb
    .from('stories')
    .select('title, script')
    .eq('id', storyId)
    .single();

  if (storyError || !storyData) {
    console.error(`[FATAL] Cannot fetch story ${storyId}: ${storyError?.message}`);
    process.exit(2);
  }

  console.log(`Title:    "${storyData.title}"`);

  // 2. Parse positions using canonical ATL-PARSER-001 parser
  const positions = parseScriptPositions(storyData.script);
  const maxIndex  = positions.length > 0 ? positions[positions.length - 1].index : 0;
  console.log(`Positions: ${positions.length} total (indices 0–${maxIndex})`);

  // Build index → position map
  const posMap = {};
  for (const p of positions) posMap[p.index] = p;

  // Determine which indices to check
  const indicesToCheck = requestedIndices ?? Array.from({ length: maxIndex + 1 }, (_, i) => i);
  console.log(`Checking: ${indicesToCheck.length === 1 ? indicesToCheck[0] : `${indicesToCheck[0]}–${indicesToCheck[indicesToCheck.length-1]} (${indicesToCheck.length})`}\n`);

  // 3. Create temp working dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garble-gate-'));
  const results = [];

  for (const idx of indicesToCheck) {
    const pos = posMap[idx];

    if (!pos) {
      // Index is beyond the parsed positions — no such segment
      results.push(makeResult(idx, 'missing', null, '', '[index beyond script positions]'));
      printResult(results[results.length - 1]);
      continue;
    }

    // Non-voice segments (silence/sfx) — no speech to compare
    if (pos.kind !== 'voice') {
      results.push(makeResult(idx, 'skipped', null, `[${pos.kind.toUpperCase()}: ${pos.speaker}]`, ''));
      printResult(results[results.length - 1]);
      continue;
    }

    // Announcer lines are expected=false — they don't get segment_ files; skip
    if (!pos.isExpected) {
      results.push(makeResult(idx, 'skipped', null, `[ANNOUNCER: ${pos.speaker}]`, ''));
      printResult(results[results.length - 1]);
      continue;
    }

    const expectedText   = pos.text || '';
    const expectedNormal = normalise(expectedText);

    // Download audio
    let audioPath;
    try {
      audioPath = await downloadSegment(storyId, idx, tmpDir);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        results.push(makeResult(idx, 'missing', null, expectedText, '[not found in storage]'));
        printResult(results[results.length - 1]);
        continue;
      }
      throw err;
    }

    // Transcribe with Whisper
    let whisperRaw;
    try {
      whisperRaw = transcribeWithWhisper(audioPath, tmpDir);
    } catch (err) {
      console.warn(`  [WARN] Whisper failed for segment_${String(idx).padStart(4,'0')}: ${err.message}`);
      results.push(makeResult(idx, 'warn', null, expectedText, '[whisper error]'));
      printResult(results[results.length - 1]);
      try { fs.unlinkSync(audioPath); } catch {}
      continue;
    }

    const whisperNormal = normalise(whisperRaw);
    const werScore      = wer(expectedNormal, whisperNormal);
    const status        = werScore > WER_HARD_FAIL ? 'fail' : werScore > WER_WARN ? 'warn' : 'ok';

    results.push(makeResult(idx, status, werScore, expectedText, whisperRaw));
    printResult(results[results.length - 1]);

    try { fs.unlinkSync(audioPath); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const fails   = results.filter(r => r.status === 'fail');
  const warns   = results.filter(r => r.status === 'warn');
  const oks     = results.filter(r => r.status === 'ok');
  const skipped = results.filter(r => r.status === 'skipped');
  const missing = results.filter(r => r.status === 'missing');

  console.log('\n' + '─'.repeat(72));

  if (fails.length > 0) {
    console.log(`\nGATE RESULT: FAILED — ${fails.length} segment(s) with corrupted audio`);
    console.log('\nFailed segments:');
    for (const f of fails) {
      console.log(`  ${f.segName}  WER: ${f.wer.toFixed(2)}`);
      console.log(`    expected: "${f.expectedText.substring(0, 100)}"`);
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
    parser: 'ATL-PARSER-001 (0-based canonical)',
    thresholds: { warn: WER_WARN, fail: WER_HARD_FAIL },
    gatePassed: fails.length === 0,
    summary: { ok: oks.length, warn: warns.length, fail: fails.length, skipped: skipped.length, missing: missing.length, total: results.length },
    results: results.map(r => ({ segIndex: r.segIndex, segName: r.segName, status: r.status, wer: r.wer, expectedText: r.expectedText, whisperText: r.whisperText })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report: ${reportPath}`);

  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

  return { passed: fails.length === 0, failures: fails, warnings: warns, report, reportPath };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  try {
    let requestedIndices = null;

    if (rangeArg) {
      // Need the total count to bound the range
      const { data, error } = await sb.from('stories').select('script').eq('id', storyId).single();
      if (error) { console.error(`[FATAL] ${error.message}`); process.exit(2); }
      const positions = parseScriptPositions(data.script);
      const maxIdx = positions.length > 0 ? positions[positions.length - 1].index : 0;
      requestedIndices = parseRange(rangeArg, 0, maxIdx);
    }

    const { passed } = await runGate(storyId, requestedIndices);
    process.exit(passed ? 0 : 1);

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(2);
  }
})();
