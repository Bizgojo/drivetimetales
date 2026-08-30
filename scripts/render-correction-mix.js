#!/usr/bin/env node
/**
 * render-correction-mix.js — Canonical Episode Correction Assembly Script
 *
 * Usage:
 *   node render-correction-mix.js <storyId> [--mode story_body|segments] [--outro-text "..."] [--output final_mix_ep8_v2.mp3]
 *
 * ── MODES ────────────────────────────────────────────────────────────────────
 *
 * --mode story_body  (DEFAULT when story_body.mp3 exists in storage)
 *   Assembles: [intro_norm] + [story_body] + [outro_norm]
 *   story_body.mp3 is the already-mixed segments+music file from original
 *   production. Do NOT re-normalize it (already done). Do NOT add IO stings
 *   (they were substitutes for the music bed; story_body has pre-roll baked in).
 *
 *   Intro resolution order:
 *     1. intro_corrected.mp3 in storage
 *     2. intro_00.1.mp3 in storage (normalized fallback)
 *     3. story.intro_audio_url from DB
 *
 *   Outro resolution order:
 *     1. outro_corrected.mp3 in storage
 *     2. outro_XXXX.mp3 (story.outro_audio_url from DB)
 *     3. --outro-text fresh render
 *
 *   Validation: duration ±15% of (intro+story_body+outro), first-4s has audio.
 *
 * --mode segments  (existing behaviour)
 *   Re-concatenates raw segment_*.mp3 files with IO stings and root music.
 *   Fixes all known assembly pipeline bugs (see legacy notes below).
 *
 * ── LEGACY NOTES (segments mode) ────────────────────────────────────────────
 *   1. Music: ALWAYS downloads intro_outro_music.mp3 from root bucket.
 *   2. Segment deduplication: single authoritative source, sorted by name.
 *   3. Outro: outro_corrected.mp3 → story.outro_audio_url → --outro-text.
 *   4. No extra silence added.
 *   5. Output always versioned — never overwrites final_mix.mp3.
 *   6. Validation: music present in first 8s, duration in expected range.
 *
 * Assembly (segments mode):
 *   [IO 6s] [intro] [IO 8s] [story segs] [IO 6s] [outro] [IO 6s fade-out]
 * Loudnorm: -16 LUFS, TP=-1.5, LRA=11
 */

process.chdir('/Users/williampostlewaite/Projects/drivetimetales');
require('dotenv').config({ path: '.env.local', override: true });

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── ATL-PARSER-001 position counter — kept in sync with lib/assembleAndVerifyFinalMix.ts ──
// Used for Mechanism B orphan detection before any segment concat.
const PARSER_HEADER_KEYS = [
  'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
  'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
  'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
  'CHARACTER GUIDE', '---',
];

function parseScriptPositionCount(script) {
  const rawLines = script.split('\n');
  const announcerLineIndices = [];
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
    if (explicitScriptStartIdx > -1 && rawIdx < explicitScriptStartIdx &&
        rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) return;
    if (PARSER_HEADER_KEYS.some(k => trimmed.startsWith(k))) return;
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return;
    }
    if (trimmed === '[BEAT]' || trimmed === '[PAUSE]' || /^\[PAUSE:\d/.test(trimmed)) { lineIndex++; return; }
    if (trimmed.startsWith('[SFX:')) { lineIndex++; return; }
    if (trimmed.startsWith('[')) return;
    if (trimmed.startsWith('ANNOUNCER:') && /endless tales presents/i.test(trimmed)) return;
    if (trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/) ||
        trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)) lineIndex++;
  });
  return lineIndex;
}

const FF           = '/opt/homebrew/bin/ffmpeg';
const FFP          = '/opt/homebrew/bin/ffprobe';
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EL_KEY       = process.env.ELEVENLABS_API_KEY;

// BELLE B voice ID for outro re-render
const BELLE_B_VOICE = 'GMhgX8fCR9GUtd3kmlKC';

// ET Signature Sting — prepended to intro when intro_corrected.mp3 is not used
// (intro_corrected.mp3 already has sting baked in; fallback intros do not)
const ET_STING_URL = `${SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`;

// IO music sting durations
const IO_OPEN   = 6;
const IO_BRIDGE = 8;
const IO_MID    = 6;
const IO_CLOSE  = 6;
const IO_VOL    = 0.9;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const STORY_ID = args[0];
if (!STORY_ID || STORY_ID.startsWith('--')) {
  console.error('Usage: node render-correction-mix.js <storyId> [--mode story_body|segments] [--outro-text "..."] [--output filename.mp3]');
  process.exit(1);
}

let outroTextOverride  = null;
let outputFilename     = null;
let modeArg            = null; // null = auto-detect
let excludeSegments    = []; // from --exclude flags (normalized to include .mp3)
let garbleResultFile   = null; // from --garble-result: pre-computed garble evidence file

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--outro-text' && args[i + 1]) {
    outroTextOverride = args[++i];
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFilename = args[++i];
  } else if (args[i] === '--mode' && args[i + 1]) {
    modeArg = args[++i];
    if (!['story_body', 'segments'].includes(modeArg)) {
      console.error(`❌  Unknown --mode "${modeArg}". Valid values: story_body, segments`);
      process.exit(1);
    }
  } else if (args[i] === '--exclude' && args[i + 1]) {
    const seg = args[++i];
    // Normalize: ensure .mp3 suffix
    excludeSegments.push(seg.endsWith('.mp3') ? seg : seg + '.mp3');
  } else if (args[i] === '--garble-result' && args[i + 1]) {
    garbleResultFile = args[++i];
    if (!fs.existsSync(garbleResultFile)) {
      console.error(`❌  --garble-result file not found: ${garbleResultFile}`);
      process.exit(1);
    }
  }
}

// Safety: never allow overwriting final_mix.mp3
if (outputFilename === 'final_mix.mp3') {
  console.error('❌  BLOCKED: --output may not be "final_mix.mp3". Use a versioned name.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getDur(f) {
  const r = spawnSync(FFP, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', f]);
  return parseFloat((r.stdout || '').toString().trim()) || 0;
}

function getMaxVolume(f, ss = 0, t = null) {
  const args = ['-i', f];
  if (ss > 0) args.push('-ss', String(ss));
  if (t !== null) args.push('-t', String(t));
  args.push('-af', 'volumedetect', '-f', 'null', '-');
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const out = (r.stderr || '').toString();
  const m = out.match(/max_volume:\s*([-\d.]+)/);
  return m ? parseFloat(m[1]) : -999;
}

async function dl(url, dest, label) {
  if (label) process.stdout.write(`   dl ${label}... `);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  if (label) console.log(`done (${(fs.statSync(dest).size / 1024).toFixed(0)}KB)`);
}

function ff(args, label) {
  if (label) process.stdout.write(`   ${label}... `);
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString();
    throw new Error(`ffmpeg [${label || '?'}]:\n${err.slice(-800)}`);
  }
  if (label) console.log('done');
}

function concatFiles(files, out, label) {
  const lst = out + '.lst';
  fs.writeFileSync(lst, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', lst,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out], label);
  fs.unlinkSync(lst);
}

function mkSting(src, out, dur, { fadeIn = 0.3, fadeOut = 0.5, vol = IO_VOL } = {}) {
  const fadeOutSt = Math.max(0, dur - fadeOut);
  ff([
    '-stream_loop', '-1', '-i', src,
    '-t', String(dur),
    '-af', `volume=${vol},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutSt}:d=${fadeOut}`,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out,
  ]);
}

function normalize(inP, outP, label) {
  ff(['-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outP], label);
}

async function renderBelleB(text, outPath) {
  log(`  EL render Belle B: "${text.slice(0, 70)}..."`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE}`, {
    method: 'POST',
    headers: {
      'xi-api-key': EL_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.62,
        similarity_boost: 0.80,
        style: 0.15,
        use_speaker_boost: true,
        speed: 0.95,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '(no body)');
    throw new Error(`ElevenLabs API ${res.status}: ${err.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`EL returned tiny buffer: ${buf.length} bytes`);
  fs.writeFileSync(outPath, buf);
  const dur = getDur(outPath);
  log(`    Written ${buf.length} bytes, dur=${dur.toFixed(2)}s`);
  return dur;
}

// ── story_body mode ───────────────────────────────────────────────────────────

async function runStoryBodyMode({ story, sb, FOLDER, storageFiles, tmp, outputFilename, outroTextOverride }) {
  log('\n══════════════════════════════════════════');
  log('  MODE: story_body (intro + body + outro)');
  log('══════════════════════════════════════════');

  // ── Intro resolution ────────────────────────────────────────────────────
  log('\n🎙  Resolving intro...');
  const introRawP = path.join(tmp, 'intro_raw.mp3');
  let introSource = null;

  const hasIntroCorrected = (storageFiles || []).some(f => f.name === 'intro_corrected.mp3');
  const hasIntroNorm      = (storageFiles || []).some(f => f.name === 'intro_00.1.mp3');

  if (hasIntroCorrected) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/intro_corrected.mp3`;
    await dl(url, introRawP, 'intro_corrected.mp3');
    introSource = 'storage:intro_corrected.mp3';
    log('  ✓ Using intro_corrected.mp3 from storage');
  } else if (hasIntroNorm) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/intro_00.1.mp3`;
    await dl(url, introRawP, 'intro_00.1.mp3');
    introSource = 'storage:intro_00.1.mp3';
    log('  ✓ Fallback: using intro_00.1.mp3 from storage');
  } else if (story.intro_audio_url) {
    await dl(story.intro_audio_url, introRawP, 'intro (DB url)');
    introSource = 'db:intro_audio_url';
    log('  ✓ Fallback: using intro_audio_url from DB');
  } else {
    throw new Error('No intro source found: no intro_corrected.mp3, no intro_00.1.mp3, no DB intro_audio_url');
  }

  // ── story_body download ─────────────────────────────────────────────────
  log('\n📖  Downloading story_body.mp3...');
  const storyBodyP = path.join(tmp, 'story_body.mp3');
  const storyBodyUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/story_body.mp3`;
  await dl(storyBodyUrl, storyBodyP, 'story_body.mp3');
  const storyBodySource = 'storage:story_body.mp3';
  log('  ✓ story_body.mp3 downloaded');

  // ── Outro resolution ────────────────────────────────────────────────────
  log('\n🎙  Resolving outro...');
  const outroRawP = path.join(tmp, 'outro_raw.mp3');
  let outroSource = null;

  const hasOutroCorrected = (storageFiles || []).some(f => f.name === 'outro_corrected.mp3');

  if (hasOutroCorrected) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/outro_corrected.mp3`;
    await dl(url, outroRawP, 'outro_corrected.mp3');
    outroSource = 'storage:outro_corrected.mp3';
    log('  ✓ Using outro_corrected.mp3 from storage');
  } else if (story.outro_audio_url) {
    await dl(story.outro_audio_url, outroRawP, 'outro (DB url)');
    outroSource = 'db:outro_audio_url';
    log('  ✓ Fallback: using outro_audio_url from DB');
  } else if (outroTextOverride) {
    await renderBelleB(outroTextOverride, outroRawP);
    outroSource = 'rendered:outro-text';
    log('  ✓ Fallback: fresh outro rendered from --outro-text');
  } else {
    throw new Error('No outro source found: no outro_corrected.mp3, no DB outro_audio_url, no --outro-text');
  }

  // ── Normalize intro and outro (NOT story_body) ──────────────────────────
  log('\n🔊  Normalizing intro and outro (-16 LUFS)...');
  const introNormRawP = path.join(tmp, 'intro_norm_raw.mp3');
  const outroNormP    = path.join(tmp, 'outro_norm.mp3');

  normalize(introRawP, introNormRawP, 'normalize intro');
  normalize(outroRawP, outroNormP, 'normalize outro');

  // ── STING — unconditional prepend when intro is not intro_corrected.mp3 ──
  // intro_corrected.mp3 already has ET Signature Sting baked in.
  // All other intro sources (intro_00.1.mp3, DB url) do NOT — prepend sting.
  let introNormP = introNormRawP;
  if (introSource !== 'storage:intro_corrected.mp3') {
    log('\n🔔  Prepending ET Signature Sting (intro_corrected not used)...');
    const stingRawP  = path.join(tmp, 'et_sting.mp3');
    const stingNormP = path.join(tmp, 'et_sting_norm.mp3');
    await dl(ET_STING_URL, stingRawP, 'ET_Signature_Sting_v7.mp3');
    normalize(stingRawP, stingNormP, 'normalize ET sting');
    const introWithStingP = path.join(tmp, 'intro_with_sting.mp3');
    concatFiles([stingNormP, introNormRawP], introWithStingP, 'concat sting+intro');
    introNormP = introWithStingP;
    log(`  ✓ Sting prepended (${getDur(stingNormP).toFixed(1)}s) → intro total ${getDur(introNormP).toFixed(1)}s`);
  } else {
    log('  ✓ Using intro_corrected.mp3 — sting already embedded, no prepend needed');
  }

  const introDur     = getDur(introNormP);
  const storyBodyDur = getDur(storyBodyP);
  const outroDur     = getDur(outroNormP);
  const totalExpected = introDur + storyBodyDur + outroDur;

  log(`  intro (with sting if added): ${introDur.toFixed(1)}s`);
  log(`  story_body: ${(storyBodyDur / 60).toFixed(2)} min (${storyBodyDur.toFixed(0)}s)`);
  log(`  outro:      ${outroDur.toFixed(1)}s`);
  log(`  total expected: ${(totalExpected / 60).toFixed(2)} min`);

  // ── Timeline ────────────────────────────────────────────────────────────
  log('\n⏱   Timeline:');
  log(`    0.0s → ${introDur.toFixed(1)}s  [intro+sting]`);
  log(`    ${introDur.toFixed(1)}s → ${(introDur + storyBodyDur).toFixed(1)}s  [story_body]`);
  log(`    ${(introDur + storyBodyDur).toFixed(1)}s → ${totalExpected.toFixed(1)}s  [outro]`);

  // ── Concat ──────────────────────────────────────────────────────────────
  log('\n🎬  Building final mix (intro + story_body + outro)...');
  const concatP  = path.join(tmp, 'concat.mp3');
  const limitedP = path.join(tmp, 'final_limited.mp3');

  concatFiles([introNormP, storyBodyP, outroNormP], concatP, 'concat intro+body+outro');

  ff(['-i', concatP,
    '-af', 'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', limitedP], 'apply limiter');

  const finalDur   = getDur(limitedP);
  const finalSzMB  = (fs.statSync(limitedP).size / 1024 / 1024).toFixed(1);
  log(`  Output: ${finalSzMB} MB, ${(finalDur / 60).toFixed(2)} min`);

  // ── VALIDATION ──────────────────────────────────────────────────────────
  log('\n✅  Validating...');
  const errors = [];

  // 1. First-4s audio check (should have audio, not silence)
  const openVol = getMaxVolume(limitedP, 0, 4);
  if (openVol < -60) {
    errors.push(`First-4s audio check FAILED: max_volume=${openVol}dB (expected > -60dB)`);
  } else {
    log(`  ✓ First-4s audio present: max_volume=${openVol.toFixed(1)}dB`);
  }

  // 2. Duration check: must be within ±15% of expected
  const durLo = totalExpected * 0.85;
  const durHi = totalExpected * 1.15;
  if (finalDur < durLo || finalDur > durHi) {
    errors.push(`Duration ${finalDur.toFixed(1)}s outside expected range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
  } else {
    log(`  ✓ Duration ${finalDur.toFixed(1)}s in range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
  }

  // 3. Spot-check story_body region has audio (at 25%, 50%, 75%)
  const bodyStart = introDur;
  const checkPositions = [
    bodyStart + storyBodyDur * 0.25,
    bodyStart + storyBodyDur * 0.50,
    bodyStart + storyBodyDur * 0.75,
  ];
  const fingerprints = checkPositions.map(pos => ({
    pos: pos.toFixed(1),
    vol: getMaxVolume(limitedP, pos, 2),
  }));
  log(`  ✓ story_body spot-checks: ${fingerprints.map(f => `@${f.pos}s=${f.vol.toFixed(1)}dB`).join(', ')}`);
  for (const fp of fingerprints) {
    if (fp.vol < -60) {
      errors.push(`story_body silence at @${fp.pos}s: max_volume=${fp.vol}dB`);
    }
  }

  if (errors.length) {
    log('\n❌  VALIDATION FAILED — not uploading:');
    for (const e of errors) log(`  - ${e}`);
    throw new Error('Validation failed: ' + errors.join('; '));
  }
  log('  All validation checks passed');

  // ── Upload ──────────────────────────────────────────────────────────────
  const storageName = outputFilename || `final_mix_${STORY_ID}_corrected.mp3`;
  if (storageName === 'final_mix.mp3') {
    throw new Error('BLOCKED: will not upload as final_mix.mp3');
  }
  const storagePath = `asc3/${FOLDER}/${storageName}`;

  log(`\n☁️   Uploading as ${storageName}...`);
  const buf = fs.readFileSync(limitedP);
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '0',
  });
  if (upErr) throw new Error('Upload failed: ' + upErr.message);

  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath);

  log(`\n✅  DONE`);
  log(`   File: ${storageName}`);
  log(`   Duration: ${(finalDur / 60).toFixed(2)} min (${finalDur.toFixed(0)}s)`);
  log(`   Size: ${finalSzMB} MB`);
  log(`   URL: ${publicUrl}`);

  console.log('\n=== RENDER SUMMARY ===');
  console.log(JSON.stringify({
    mode: 'story_body',
    storyId: STORY_ID,
    outputFile: storageName,
    url: publicUrl,
    durationSecs: finalDur,
    durationMin: parseFloat((finalDur / 60).toFixed(2)),
    sizeMB: parseFloat(finalSzMB),
    introSource,
    storyBodySource,
    outroSource,
    introDurSecs: parseFloat(introDur.toFixed(2)),
    storyBodyDurSecs: parseFloat(storyBodyDur.toFixed(2)),
    outroDurSecs: parseFloat(outroDur.toFixed(2)),
    expectedDurSecs: parseFloat(totalExpected.toFixed(2)),
    validationPassed: true,
  }));

  return { publicUrl, finalDur, storageName };
}

// ── segments mode ────────────────────────────────────────────────────────────
// Music bed replaces IO stings (MIX_SPEC SUNSET-MIX-SPEC-001, Aug 26 2026).
// Assembly: [intro_norm] + [story_body + music bed @ 12%] + [outro_norm]
// No intro_outro_music.mp3 IO stings — that music is retired from segments mode.
//
// PREREQUISITE — MISSING-STORY-MUSIC-001 (Marc ruling 2026-08-27, HARD FAIL):
// asc3/<STORY_ID>/background_music.mp3 MUST exist in Supabase storage before running.
// This script will throw MISSING_STORY_MUSIC and abort if the file is absent.
// Generate story-specific music via kie.ai/Suno first. The shared root
// intro_outro_music.mp3 is NEVER acceptable as a music bed for any specific story.

async function runSegmentsMode({ story, sb, FOLDER, storageFiles, tmp, outputFilename, outroTextOverride, excludeSegments }) {
  log('\n══════════════════════════════════════════');
  log('  MODE: segments (music bed, no IO stings)');
  log('══════════════════════════════════════════');

  // ── Segment listing — SINGLE AUTHORITATIVE SOURCE ─────────────────────────
  // Segments explicitly excluded from final mix.
  // NOTE: segment_0122.mp3 permanent exclusion was removed 2026-08-27 for EP8 v12 full
  // fresh re-render. In the new numbering (all 144 segs from current script), segment_0122
  // is "NARRATOR: Ruth showed him how..." — valid narration, must NOT be excluded.
  // CLI --exclude flags add to this set per-run for story-specific orphans.
  const EXCLUDED_SEGMENTS = new Set([
    // (empty — full fresh re-render, all segments are valid per current script)
  ]);

  // Merge CLI --exclude flags into EXCLUDED_SEGMENTS
  if (excludeSegments && excludeSegments.length > 0) {
    for (const seg of excludeSegments) {
      EXCLUDED_SEGMENTS.add(seg);
    }
    log(`  CLI --exclude flags: ${excludeSegments.join(', ')}`);
  }

  const rawSegs = (storageFiles || [])
    .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
    .filter(f => {
      if (EXCLUDED_SEGMENTS.has(f.name)) {
        log(`  Excluding: ${f.name} (in exclusion list — orphaned or duplicate)`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // DEDUPLICATE by name
  const seenNames = new Set();
  const segs = rawSegs.filter(s => {
    if (seenNames.has(s.name)) {
      log(`  WARN: duplicate segment name in listing: ${s.name} — skipped`);
      return false;
    }
    seenNames.add(s.name);
    return true;
  });

  if (!segs.length) throw new Error(`No segment_*.mp3 files found in asc3/${FOLDER}/`);
  const excludedCount = EXCLUDED_SEGMENTS.size;
  log(`  Excluding ${excludedCount} segments: [${Array.from(EXCLUDED_SEGMENTS).sort().join(', ')}]`);
  log(`  ${segs.length} unique segments after exclusion (${rawSegs.length - segs.length} dupes removed)`);

  // ── ASSEMBLEANDVERIFYFINALYMIX: ORPHAN CHECK (Mechanism B) ────────────────────
  // Wired from lib/assembleAndVerifyFinalMix.ts: verify no segment position
  // ≥ script length (definitive Mechanism B orphans). Hard-fail blocks assembly.
  log('\n🔍  assembleAndVerifyFinalMix — orphan check (Mechanism B)...');
  let orphanFlaggedNames = [];
  if (story.script) {
    const parsedPositionCount = parseScriptPositionCount(story.script);
    orphanFlaggedNames = segs
      .map(f => f.name)
      .filter(name => {
        const m = name.match(/^segment_(\d{4})\.mp3$/);
        return m && parseInt(m[1], 10) >= parsedPositionCount;
      });
    if (orphanFlaggedNames.length > 0) {
      throw new Error(
        `ORPHAN_CHECK_FAILED (assembleAndVerifyFinalMix): ` +
        `${orphanFlaggedNames.length} segment(s) beyond script boundary ` +
        `(${parsedPositionCount} positions). Pass them via --exclude: ${orphanFlaggedNames.join(', ')}`
      );
    }
    log(`  ✓ Orphan check: all ${segs.length} segments within ${parsedPositionCount}-position bound`);
  } else {
    log('  ⚠️  Orphan check skipped — story.script not available (add \'script\' to DB select)');
  }

  // ── ASSEMBLEANDVERIFYFINALYMIX: GARBLE DETECTION GATE ──────────────────────
  // Wired from lib/assembleAndVerifyFinalMix.ts: run garble-detection-gate.js
  // against all segments. Any HARD FAIL (WER > 40%) blocks assembly.
  // When --garble-result <file> is provided: load pre-computed evidence, skip
  // inline Whisper re-run, validate 128 v6 segments are clean in loaded data.
  log('\n🔍  assembleAndVerifyFinalMix — garble detection gate...');
  let garbleReport = null;
  let garbleVerificationSource = 'inline:garble-detection-gate.js';

  if (garbleResultFile) {
    // ── PRE-COMPUTED GARBLE EVIDENCE (Marc ruling 2026-08-30) ────────────────
    log(`  Using pre-computed garble evidence: ${garbleResultFile}`);
    let precomputed;
    try {
      precomputed = JSON.parse(fs.readFileSync(garbleResultFile, 'utf8'));
    } catch (e) {
      throw new Error(`GARBLE_RESULT_PARSE_ERROR: cannot read --garble-result file: ${e.message}`);
    }

    // Validate the loaded report covers this story
    if (precomputed.storyId && precomputed.storyId !== STORY_ID) {
      throw new Error(
        `GARBLE_RESULT_STORY_MISMATCH: file is for storyId=${precomputed.storyId}, ` +
        `expected ${STORY_ID}`
      );
    }

    // Validate overall verdict is CLEARED
    const overallVerdict = precomputed.overallVerdict || '';
    if (overallVerdict !== 'CLEARED') {
      throw new Error(
        `GARBLE_RESULT_NOT_CLEARED: overallVerdict="${overallVerdict}" — ` +
        `only CLEARED evidence is accepted as garble gate bypass`
      );
    }

    // Validate garble section verdict (must be CLEARED or FALSE_POSITIVE_CASCADE)
    const garbleVerdict = precomputed.garbleDetection?.verdict || '';
    const confirmedRealFailures = precomputed.garbleDetection?.rootCauseAnalysis?.confirmedRealFailures ?? null;
    const isAcceptable =
      garbleVerdict.startsWith('FALSE_POSITIVE_CASCADE') ||
      garbleVerdict.includes('PASSED') ||
      garbleVerdict.includes('CLEARED') ||
      precomputed.garbleDetection?.gatePassed === true ||
      confirmedRealFailures === 0;
    if (!isAcceptable) {
      throw new Error(
        `GARBLE_RESULT_UNACCEPTABLE: garbleDetection.verdict="${garbleVerdict}" ` +
        `with confirmedRealFailures=${confirmedRealFailures} — cannot accept as clean evidence`
      );
    }

    // Validate v6 segment count: after applying excludeSegments, expect 128
    const assembledCount = segs.length;
    log(`  ✓ Pre-computed evidence validated:`);
    log(`    file:            ${garbleResultFile}`);
    log(`    scanId:          ${precomputed.scanId || 'n/a'}`);
    log(`    version:         v${precomputed.version || '?'}`);
    log(`    generatedAt:     ${precomputed.generatedAt || 'n/a'}`);
    log(`    generatedBy:     ${precomputed.generatedBy || 'n/a'}`);
    log(`    overallVerdict:  ${overallVerdict}`);
    log(`    garbleVerdict:   ${garbleVerdict}`);
    log(`    confirmedFails:  ${confirmedRealFailures ?? 'not recorded'}`);
    log(`    v6 seg count:    ${assembledCount} (after ${excludeSegments.length} exclusions)`);
    if (assembledCount !== 128) {
      log(`  ⚠️  Warning: expected 128 v6 segments but assembled ${assembledCount}`);
    } else {
      log(`    ✓ 128 v6 segments confirmed clean via pre-computed evidence`);
    }
    log('  ✓ Garble detection gate: PASSED (pre-computed evidence accepted)');

    garbleReport = precomputed;
    garbleVerificationSource = `pre-computed:${path.basename(garbleResultFile)}:${precomputed.scanId || 'v' + (precomputed.version || '?')}:generatedAt=${precomputed.generatedAt || 'n/a'}`;

  } else {
    // ── INLINE GARBLE RE-RUN ─────────────────────────────────────────────────
    log('  (Whisper transcription of all segments — may take several minutes)');
    const garbleGateScript = path.join(__dirname, '..', 'garble-detection-gate.js');
    const garbleResult = spawnSync(
      'node',
      [garbleGateScript, STORY_ID],
      {
        encoding: 'utf8',
        timeout: 20 * 60 * 1000,   // 20 min max — Whisper on all segments
        maxBuffer: 30 * 1024 * 1024,
      }
    );
    if (garbleResult.stdout) process.stdout.write(garbleResult.stdout);
    if (garbleResult.stderr) process.stderr.write(garbleResult.stderr);
    if (garbleResult.error) {
      throw new Error(`GARBLE_GATE_PROCESS_ERROR (assembleAndVerifyFinalMix): ${garbleResult.error.message}`);
    }
    if (garbleResult.status === 2) {
      throw new Error('GARBLE_GATE_FATAL (assembleAndVerifyFinalMix): gate encountered a fatal error — no output written');
    }
    if (garbleResult.status === 1) {
      throw new Error('GARBLE_CHECK_FAILED (assembleAndVerifyFinalMix): corrupted audio detected — no output written');
    }
    log('  ✓ Garble detection gate: PASSED');

    // Parse the gate\'s JSON report for inclusion in the scan report
    const garbleReportMatch = (garbleResult.stdout || '').match(/JSON report:\s+(\S+\.json)/);
    if (garbleReportMatch) {
      try { garbleReport = JSON.parse(fs.readFileSync(garbleReportMatch[1], 'utf8')); } catch {}
    }
    garbleVerificationSource = 'inline:garble-detection-gate.js';
  }

  const hasOutroCorrected = (storageFiles || []).some(f => f.name === 'outro_corrected.mp3');
  log(`  outro_corrected.mp3 in storage: ${hasOutroCorrected}`);

  const segDir = path.join(tmp, 'segs');
  fs.mkdirSync(segDir);

  const introP    = path.join(tmp, 'intro.mp3');
  const outroP    = path.join(tmp, 'outro_raw.mp3');
  const musicBedP = path.join(tmp, 'music_bed_src.mp3');

  // ── MUSIC BED: story-specific background_music.mp3 — REQUIRED, no fallback ──
  // MIX_SPEC SUNSET-MIX-SPEC-001: genre music bed at 12% under dialogue.
  // NOTE: IO stings from intro_outro_music.mp3 are RETIRED — not used here.
  // MISSING-STORY-MUSIC-001 (2026-08-27, Marc ruling): missing background_music.mp3
  // is a HARD FAIL. This has silently fallen back to root intro_outro_music.mp3 twice
  // (EP8 and EP9) — producing wrong music for both episodes. The root file is NEVER
  // the correct background music for any specific story. Generate story-specific music
  // via kie.ai/Suno before running this script.
  log('\n🎵  Resolving music bed source...');
  const hasStoryBgMusic = (storageFiles || []).some(f => f.name === 'background_music.mp3');
  let musicBedSource;
  if (hasStoryBgMusic) {
    const bgMusicUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/background_music.mp3`;
    await dl(bgMusicUrl, musicBedP, 'background_music.mp3');
    musicBedSource = `storage:asc3/${FOLDER}/background_music.mp3`;
    log('  ✓ Using story-specific background_music.mp3');
  } else {
    throw new Error(
      `MISSING_STORY_MUSIC: No background_music.mp3 found in storage for story ${STORY_ID}.\n` +
      `Generate story-specific music first (kie.ai/Suno with story's SUNO PROMPT), upload as:\n` +
      `  asc3/${FOLDER}/background_music.mp3\n` +
      `Then re-run this script. DO NOT proceed with the shared root intro_outro_music.mp3 —\n` +
      `it is never the correct background music for any specific story.\n` +
      `(MISSING-STORY-MUSIC-001: third occurrence, now a hard gate per Marc ruling 2026-08-27)`
    );
  }
  const musicBedDur = getDur(musicBedP);
  if (musicBedDur < 1) {
    throw new Error('FATAL: music bed source downloaded but duration < 1s — aborting');
  }
  log(`  Music bed source duration: ${musicBedDur.toFixed(1)}s — OK`);

  // ── INTRO (resolution order: intro_corrected.mp3 → intro_00.1.mp3 → DB url) ─
  log('\n🎙  Resolving intro...');
  let introSource = null;
  const hasIntroCorrected = (storageFiles || []).some(f => f.name === 'intro_corrected.mp3');
  const hasIntroNorm      = (storageFiles || []).some(f => f.name === 'intro_00.1.mp3');

  if (hasIntroCorrected) {
    const introCorUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/intro_corrected.mp3`;
    await dl(introCorUrl, introP, 'intro_corrected.mp3');
    introSource = 'storage:intro_corrected.mp3';
    log('  ✓ Using intro_corrected.mp3 from storage (ET sting already baked in)');
  } else if (hasIntroNorm) {
    const introNormUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/intro_00.1.mp3`;
    await dl(introNormUrl, introP, 'intro_00.1.mp3');
    introSource = 'storage:intro_00.1.mp3';
    log('  ✓ Fallback: using intro_00.1.mp3 from storage');
  } else if (story.intro_audio_url) {
    await dl(story.intro_audio_url, introP, 'intro (DB url)');
    introSource = 'db:intro_audio_url';
    log('  ✓ Fallback: using intro_audio_url from DB');
  } else {
    throw new Error('No intro source found: no intro_corrected.mp3, no intro_00.1.mp3, no DB intro_audio_url');
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────────
  // SEGMENTS MODE OUTRO RULE: outro_corrected.mp3 is "ET sting + Belle narration" —
  // incompatible with v2 outro-with-music overlay. Use raw Belle narration only.
  log('\n🎙  Resolving outro (segments mode — skipping outro_corrected.mp3)...');
  let outroSource = null;
  if (outroTextOverride) {
    await renderBelleB(outroTextOverride, outroP);
    outroSource = 'rendered:outro-text';
  } else {
    // Look for stale-tagged raw outro (outro_NNNN.mp3.stale-aug24)
    const staleOutroFile = (storageFiles || []).find(f => /^outro_\d{4}\.mp3\.stale-aug24$/.test(f.name));
    if (staleOutroFile) {
      const staleUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/${staleOutroFile.name}`;
      await dl(staleUrl, outroP, staleOutroFile.name);
      outroSource = `storage:${staleOutroFile.name} (raw Belle narration)`;
      log(`  ✓ Using raw outro: ${staleOutroFile.name} (bypassing outro_corrected.mp3 — has sting baked in)`);
    } else {
      await dl(story.outro_audio_url, outroP, 'outro (DB url)');
      outroSource = 'db:outro_audio_url';
      log('  ✓ Using outro_audio_url from DB');
    }
  }

  // ── SEGMENTS: download all to segDir ─────────────────────────────────────
  log('\n⬇️   Downloading segments...');
  const segPaths = [];
  for (let i = 0; i < segs.length; i++) {
    const dest = path.join(segDir, segs[i].name);
    const segUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}/${segs[i].name}`;
    const r = await fetch(segUrl);
    if (!r.ok) throw new Error(`Segment download failed (${r.status}): ${segs[i].name}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    segPaths.push(dest);
    if ((i + 1) % 25 === 0 || i + 1 === segs.length) {
      log(`  ${i + 1}/${segs.length} downloaded`);
    }
  }

  const downloadedCount = fs.readdirSync(segDir).filter(f => f.endsWith('.mp3')).length;
  if (downloadedCount !== segs.length) {
    throw new Error(`Segment count mismatch: listed ${segs.length}, downloaded ${downloadedCount}`);
  }
  log(`  All ${downloadedCount} segments verified`);

  // ── NORMALIZE voice tracks ────────────────────────────────────────────────
  log('\n🔊  Normalizing voice...');
  const introNorm  = path.join(tmp, 'intro_norm.mp3');
  const outroNorm  = path.join(tmp, 'outro_norm.mp3');
  const storyRaw   = path.join(tmp, 'story_raw.mp3');
  const storyNorm  = path.join(tmp, 'story_norm.mp3');

  normalize(introP, introNorm, 'normalize intro');
  normalize(outroP, outroNorm, 'normalize outro');

  concatFiles(segPaths, storyRaw, `concat ${segPaths.length} segments`);
  normalize(storyRaw, storyNorm, 'normalize story');

  const introDur  = getDur(introNorm);
  const outroDur  = getDur(outroNorm);
  const storyDur  = getDur(storyNorm);

  log(`  intro: ${introDur.toFixed(1)}s | story: ${(storyDur/60).toFixed(2)} min | outro: ${outroDur.toFixed(1)}s`);

  // ── MUSIC BED v2: preroll(2.5s@65%) + bed(storyDur@12%) + swell(2s@0.85) ─────
  log('\n🎵  Building v2 music shape (preroll+bed+swell)...');
  const shapedMusicP  = path.join(tmp, 'music_shaped.mp3');
  const delayedStoryP = path.join(tmp, 'story_delayed.mp3');
  const storyBodyP    = path.join(tmp, 'story_body.mp3');

  const musicShapeFilter =
    `[0:a]atrim=start=0:duration=2.5,asetpts=PTS-STARTPTS,volume=0.65,afade=t=in:st=0:d=0.5[pre];` +
    `[0:a]atrim=start=0:duration=${storyDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.12[bed];` +
    `[0:a]atrim=start=0:duration=2.0,asetpts=PTS-STARTPTS,volume=0.85,afade=t=in:st=0:d=2.0[swell];` +
    `[pre][bed][swell]concat=n=3:v=0:a=1[music_out]`;

  ff(['-stream_loop', '-1', '-i', musicBedP,
    '-filter_complex', musicShapeFilter,
    '-map', '[music_out]',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', shapedMusicP], 'shape music (preroll+bed+swell)');

  // Delay story narration by 2500ms to align with preroll
  ff(['-i', storyNorm, '-af', 'adelay=2500|2500',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', delayedStoryP], 'delay story 2.5s');

  // Mix delayed narration + shaped music (duration=longest preserves swell tail)
  ff(['-i', delayedStoryP, '-i', shapedMusicP,
    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[mixed]',
    '-map', '[mixed]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', storyBodyP],
    'mix narration + shaped music');

  const storyBodyDur = getDur(storyBodyP);
  log(`  Story body (with swell): ${(storyBodyDur/60).toFixed(2)} min`);

  // ── OUTRO WITH MUSIC v2 ──────────────────────────────────────────────────
  // v2 outro: music ducks from swell peak (0.85) under Belle, then fades 2s after Belle ends
  log('\n🎵  Building v2 outro with music (duck+fade)...');
  const V2_DUCK_VOL  = 0.06;    // MUSICBED-001: Marc ruling 2026-08-28 (was 0.019)
  const V2_DUCK_RAMP = 0.5;     // seconds: ramp from 0.85 → 0.019
  const V2_TAIL_FADE = 3.0;     // MUSICBED-001: Marc ruling 2026-08-28 (was 2.0)

  const belleEnd    = V2_DUCK_RAMP + outroDur;
  const fadeEnd     = belleEnd + V2_TAIL_FADE;
  const outroBed    = fadeEnd + 0.5;  // music clip length + buffer

  const outroVolExpr =
    `if(lt(t,${V2_DUCK_RAMP.toFixed(3)}),` +
      `0.85+(${V2_DUCK_VOL}-0.85)*t/${V2_DUCK_RAMP},` +
    `if(lt(t,${belleEnd.toFixed(3)}),${V2_DUCK_VOL},` +
    `max(0,${V2_DUCK_VOL}*(1-(t-${belleEnd.toFixed(3)})/${V2_TAIL_FADE}))))`;

  const outroMusicClipP = path.join(tmp, 'outro_music_clip.mp3');
  const outroBelleDelP  = path.join(tmp, 'outro_belle_del.mp3');
  const outroWithMusicP = path.join(tmp, 'outro_with_music.mp3');

  // Extract shaped outro music
  ff(['-stream_loop', '-1', '-t', String(outroBed), '-i', musicBedP,
    '-filter_complex',
    `[0:a]atrim=duration=${outroBed},asetpts=PTS-STARTPTS,volume='${outroVolExpr}':eval=frame[out]`,
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroMusicClipP],
    'shape outro music (duck+fade)');

  // Delay Belle narration by duck ramp
  ff(['-i', outroNorm,
    '-af', `adelay=${Math.round(V2_DUCK_RAMP*1000)}|${Math.round(V2_DUCK_RAMP*1000)}`,
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroBelleDelP],
    'delay Belle outro 0.5s');

  // Mix Belle + outro music (volume=2 compensates amix ÷2)
  ff(['-i', outroBelleDelP, '-i', outroMusicClipP,
    '-filter_complex',
    '[0:a][1:a]amix=inputs=2:duration=longest[mixed];[mixed]volume=2[out]',
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroWithMusicP],
    'mix Belle + outro music');

  const outroWithMusicDur = getDur(outroWithMusicP);
  log(`  outro_with_music: ${outroWithMusicDur.toFixed(1)}s (duck+fade under ${outroDur.toFixed(1)}s Belle + ${V2_TAIL_FADE}s tail)`);

  // ── Timeline ──────────────────────────────────────────────────────────────
  const sections = [
    ['Belle B intro', introDur],
    ['Story body + music (v2)', storyBodyDur],
    ['Outro with music (v2)', outroWithMusicDur],
  ];
  let t = 0;
  log('\n⏱   Timeline:');
  for (const [label, dur] of sections) {
    log(`    ${t.toFixed(1)}s → ${(t+dur).toFixed(1)}s  [${label}]`);
    t += dur;
  }
  const totalExpected = introDur + storyBodyDur + outroWithMusicDur;
  log(`    Total expected: ${(totalExpected/60).toFixed(2)} min`);

  // ── Concat final mix ──────────────────────────────────────────────────────
  log('\n🎬  Building final mix (intro + story-body + outro-with-music)...');
  const finalP   = path.join(tmp, 'final_mix.mp3');
  const limitedP = path.join(tmp, 'final_limited.mp3');

  concatFiles(
    [introNorm, storyBodyP, outroWithMusicP],
    finalP,
    'concat intro + story-body + outro-with-music',
  );

  ff(['-i', finalP,
    '-af', 'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', limitedP], 'apply limiter');

  const finalDur  = getDur(limitedP);
  const finalSzMB = (fs.statSync(limitedP).size / 1024 / 1024).toFixed(1);
  log(`  Output: ${finalSzMB} MB, ${(finalDur/60).toFixed(2)} min`);

  // ── VALIDATION ────────────────────────────────────────────────────────────
  log('\n✅  Validating...');
  const errors = [];

  const openVol = getMaxVolume(limitedP, 0, 4);
  if (openVol < -60) {
    errors.push(`First-4s audio check FAILED: max_volume=${openVol}dB (expected > -60dB)`);
  } else {
    log(`  ✓ First-4s audio present: max_volume=${openVol.toFixed(1)}dB`);
  }

  const durLo = totalExpected * 0.85;
  const durHi = totalExpected * 1.15;
  if (finalDur < durLo || finalDur > durHi) {
    errors.push(`Duration ${finalDur.toFixed(1)}s outside expected range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
  } else {
    log(`  ✓ Duration ${finalDur.toFixed(1)}s in range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
  }

  const storyStart = introDur;
  const checkPositions = [
    storyStart + storyBodyDur * 0.25,
    storyStart + storyBodyDur * 0.50,
    storyStart + storyBodyDur * 0.75,
  ];
  const fingerprints = checkPositions.map(pos => ({
    pos: pos.toFixed(1),
    vol: getMaxVolume(limitedP, pos, 2),
  }));
  log(`  ✓ Spot-check fingerprints (3 positions): ${fingerprints.map(f => `@${f.pos}s=${f.vol.toFixed(1)}dB`).join(', ')}`);

  if (errors.length) {
    log('\n❌  VALIDATION FAILED — not uploading:');
    for (const e of errors) log(`  - ${e}`);
    throw new Error('Validation failed: ' + errors.join('; '));
  }
  log('  All validation checks passed');

  // ── Upload ────────────────────────────────────────────────────────────────
  const storageName = outputFilename || `final_mix_${STORY_ID}_corrected.mp3`;
  if (storageName === 'final_mix.mp3') {
    throw new Error('BLOCKED: will not upload as final_mix.mp3');
  }
  const storagePath = `asc3/${FOLDER}/${storageName}`;

  log(`\n☁️   Uploading as ${storageName}...`);
  const buf = fs.readFileSync(limitedP);
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '0',
  });
  if (upErr) throw new Error('Upload failed: ' + upErr.message);

  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath);

  // ── ASSEMBLEANDVERIFYFINALYMIX: SCAN REPORT ────────────────────────────────
  // Wired from lib/assembleAndVerifyFinalMix.ts: write scan-report-v{N}.json
  // to the same Supabase storage folder as the output file.
  log('\n📊  Writing scan report (assembleAndVerifyFinalMix contract)...');
  const scanReport = {
    storyId: STORY_ID,
    buildTimestamp: new Date().toISOString(),
    outputFilename: storageName,
    segmentCount: segs.length,
    excludedSegments: Array.from(EXCLUDED_SEGMENTS),
    orphanCheck: {
      passed: true,
      flagged: orphanFlaggedNames,  // empty — would have thrown above if non-empty
    },
    garbleCheck: {
      passed: true,
      verificationSource: garbleVerificationSource,
      ...(garbleResultFile ? {
        garble_result_source: garbleReport?.garble_result_source ||
          `${garbleReport?.source || path.basename(garbleResultFile)} (${garbleReport?.sourceNote || 'pre-computed'})`,
      } : {}),
      failures: garbleReport?.results?.filter(r => r.status === 'fail')
        ?.map(r => ({ segment: r.segName + '.mp3', wer: r.wer })) ?? [],
      warnings: garbleReport?.results?.filter(r => r.status === 'warn')
        ?.map(r => ({ segment: r.segName + '.mp3', wer: r.wer })) ?? [],
      precomputedEvidence: garbleResultFile ? {
        file: path.basename(garbleResultFile),
        scanId: garbleReport?.scanId,
        version: garbleReport?.version,
        generatedAt: garbleReport?.generatedAt,
        overallVerdict: garbleReport?.overallVerdict,
      } : null,
    },
  };
  const existingReportVersions = (storageFiles || [])
    .map(f => f.name.match(/^scan-report-v(\d+)\.json$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const nextReportN = existingReportVersions.length > 0
    ? Math.max(...existingReportVersions) + 1 : 1;
  const reportName  = `scan-report-v${nextReportN}.json`;
  const reportBuf   = Buffer.from(JSON.stringify(scanReport, null, 2));
  const { error: reportErr } = await sb.storage.from('audio').upload(
    `asc3/${FOLDER}/${reportName}`, reportBuf, {
      contentType: 'application/json',
      upsert: false,
      cacheControl: '0',
    }
  );
  if (reportErr) {
    log(`  ⚠️  Scan report upload failed (non-fatal): ${reportErr.message}`);
  } else {
    log(`  ✓ Scan report: ${reportName}`);
  }

  log(`\n✅  DONE`);
  log(`   File: ${storageName}`);
  log(`   Duration: ${(finalDur/60).toFixed(2)} min (${finalDur.toFixed(0)}s)`);
  log(`   Size: ${finalSzMB} MB`);
  log(`   URL: ${publicUrl}`);

  console.log('\n=== RENDER SUMMARY ===');
  console.log(JSON.stringify({
    mode: 'segments',
    storyId: STORY_ID,
    outputFile: storageName,
    url: publicUrl,
    durationSecs: finalDur,
    durationMin: parseFloat((finalDur / 60).toFixed(2)),
    sizeMB: parseFloat(finalSzMB),
    segmentCount: segs.length,
    outroSource,
    musicBedSource,
    garbleVerificationSource,
    validationPassed: true,
    scanReport,
  }));

  return { publicUrl, finalDur, storageName };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY);

  // ── DB lookup ─────────────────────────────────────────────────────────────
  log(`Looking up story ${STORY_ID}`);
  const { data: story, error } = await sb.from('stories')
    .select('id, title, episode_number, intro_audio_url, outro_audio_url, story_audio_url, script')
    .eq('id', STORY_ID).single();
  if (error || !story) throw new Error('Story not found: ' + (error?.message || STORY_ID));
  log(`EP${story.episode_number}: "${story.title}"`);

  // Extract storage folder from story_audio_url or intro_audio_url
  const folderMatch = (story.story_audio_url || story.intro_audio_url || '').match(/asc3\/([^/]+)\//);
  if (!folderMatch) throw new Error('Cannot extract storage folder from story URLs');
  const FOLDER = folderMatch[1];

  // ── Storage listing ────────────────────────────────────────────────────────
  log('Listing storage files...');
  const { data: storageFiles, error: listErr } = await sb.storage.from('audio').list(`asc3/${FOLDER}`, {
    limit: 500,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (listErr) throw new Error('Storage list failed: ' + listErr.message);

  // ── Mode detection ─────────────────────────────────────────────────────────
  const hasStoryBody = (storageFiles || []).some(f => f.name === 'story_body.mp3');
  let mode = modeArg;
  if (!mode) {
    if (!hasStoryBody) {
      mode = 'segments';
      log('  Auto-mode: segments (no story_body.mp3 found)');
    } else {
      // Compare story_body.mp3 timestamp vs newest segment timestamp
      const storyBodyFile = (storageFiles || []).find(f => f.name === 'story_body.mp3');
      const storyBodyTs = storyBodyFile?.updated_at || storyBodyFile?.created_at || null;
      const segFiles = (storageFiles || []).filter(f => /^segment_\d{4}\.mp3$/.test(f.name));
      const newestSegTs = segFiles
        .map(f => f.updated_at || f.created_at)
        .filter(Boolean)
        .sort()
        .pop() || null;

      if (storyBodyTs && newestSegTs && new Date(newestSegTs) > new Date(storyBodyTs)) {
        const newerCount = segFiles.filter(f => {
          const ts = f.updated_at || f.created_at;
          return ts && new Date(ts) > new Date(storyBodyTs);
        }).length;
        log(`⚠️  Auto-mode: segments (${newerCount} segment(s) newer than story_body.mp3 — reuse would silently revert voice fixes)`);
        log(`    story_body: ${storyBodyTs}`);
        log(`    newest seg: ${newestSegTs}`);
        mode = 'segments';
      } else {
        log(`✅ Auto-mode: story_body (story_body.mp3 is current — safe to reuse)`);
        mode = 'story_body';
      }
    }
  } else {
    log(`  Mode: ${mode} (explicit --mode flag)`);
    if (mode === 'story_body' && !hasStoryBody) {
      throw new Error('--mode story_body requested but story_body.mp3 not found in storage');
    }
  }

  // ── Temp workspace ────────────────────────────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-correct-'));
  log(`Temp dir: ${tmp}`);

  try {
    const ctx = { story, sb, FOLDER, storageFiles, tmp, outputFilename, outroTextOverride, excludeSegments };
    if (mode === 'story_body') {
      await runStoryBodyMode(ctx);
    } else {
      await runSegmentsMode(ctx);
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}
  }
}

main().catch(e => {
  console.error('\n❌  FATAL:', e.message);
  process.exit(1);
});
