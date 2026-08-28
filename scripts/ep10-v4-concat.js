#!/usr/bin/env node
/**
 * ep10-v4-concat.js — EP10 v4 Correction Concat
 *
 * Builds a corrected EP10 final mix by:
 *   1. Listing all segment_*.mp3 files from storage, excluding segment_0089.mp3
 *   2. Downloading all kept segments + intro_00.1.mp3 + outro_0135.mp3
 *   3. Normalizing each section to -16 LUFS, TP=-1.5, LRA=11
 *   4. Inserting 0.5s silence gaps between intro↔story and story↔outro
 *   5. Concatenating: [intro_norm] [0.5s] [story_norm] [0.5s] [outro_norm]
 *   6. Applying peak limiter (same as render-correction-mix.js)
 *   7. Uploading as final_mix_ep10_v4_staging_<timestamp>.mp3 (never overwrites existing)
 *   8. Printing the public listen URL for Marc's approval
 *
 * Does NOT touch stories.audio_url or any DB field.
 * Does NOT overwrite any existing file (timestamped output name).
 * Does NOT call ElevenLabs API.
 * SFX files (sfx_0012 etc.) are excluded — sfx-manifest.json has no position data.
 *
 * Usage:
 *   node scripts/ep10-v4-concat.js [--dry-run]
 *
 * --dry-run: lists what would be included/excluded, then exits without downloading or uploading.
 */

process.chdir('/Users/williampostlewaite/Projects/drivetimetales');
require('dotenv').config({ path: '.env.local', override: true });

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Constants ──────────────────────────────────────────────────────────────────
const STORY_ID    = '8297792c-f315-4320-b1aa-cbd242c3cf1d';
const FOLDER      = STORY_ID; // storage path is asc3/<STORY_ID>/...
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FF  = '/opt/homebrew/bin/ffmpeg';
const FFP = '/opt/homebrew/bin/ffprobe';

// The one bad segment to exclude from v4
const EXCLUDED_SEGMENTS = new Set(['segment_0089.mp3']);

// Pre-built intro/outro files that carry EP10's original voice + style
const INTRO_FILE  = 'intro_00.1.mp3';
const OUTRO_FILE  = 'outro_0135.mp3';

// Silence gap duration (seconds) between sections
const SILENCE_GAP_SECS = 0.5;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getDur(f) {
  const r = spawnSync(FFP, [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', f,
  ]);
  return parseFloat((r.stdout || '').toString().trim()) || 0;
}

function getMaxVolume(f, ss = 0, t = null) {
  const ffArgs = ['-i', f];
  if (ss > 0) ffArgs.push('-ss', String(ss));
  if (t !== null) ffArgs.push('-t', String(t));
  ffArgs.push('-af', 'volumedetect', '-f', 'null', '-');
  const r = spawnSync(FF, ffArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  const out = (r.stderr || '').toString();
  const m = out.match(/max_volume:\s*([-\d.]+)/);
  return m ? parseFloat(m[1]) : -999;
}

async function dl(url, dest, label) {
  process.stdout.write(`   dl ${label}... `);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  console.log(`done (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
}

function ff(ffArgs, label) {
  if (label) process.stdout.write(`   ${label}... `);
  const r = spawnSync(FF, ffArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString();
    throw new Error(`ffmpeg [${label || '?'}]:\n${err.slice(-800)}`);
  }
  if (label) console.log('done');
}

function normalize(inP, outP, label) {
  ff([
    '-i', inP,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outP,
  ], label);
}

function concatFiles(files, out, label) {
  const lst = out + '.lst';
  fs.writeFileSync(lst, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  ff([
    '-f', 'concat', '-safe', '0', '-i', lst,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out,
  ], label);
  fs.unlinkSync(lst);
}

function makeSilence(outP, durationSecs) {
  ff([
    '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(durationSecs),
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outP,
  ], `silence ${durationSecs}s`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── List storage ────────────────────────────────────────────────────────────
  log(`Listing storage: asc3/${FOLDER}/`);
  const { data: storageFiles, error: listErr } = await sb.storage.from('audio').list(`asc3/${FOLDER}`, {
    limit: 500,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (listErr) throw new Error('Storage list failed: ' + listErr.message);

  const allNames = (storageFiles || []).map(f => f.name);

  // Verify required files exist
  if (!allNames.includes(INTRO_FILE)) throw new Error(`Missing required file: ${INTRO_FILE}`);
  if (!allNames.includes(OUTRO_FILE)) throw new Error(`Missing required file: ${OUTRO_FILE}`);

  // Segments: all segment_*.mp3, sorted, with exclusion applied
  const allSegments = allNames
    .filter(n => n.startsWith('segment_') && n.endsWith('.mp3'))
    .sort();

  const keptSegments = allSegments.filter(n => !EXCLUDED_SEGMENTS.has(n));
  const excludedSegs = allSegments.filter(n => EXCLUDED_SEGMENTS.has(n));

  // SFX files (exist but manifest has no position data — excluded from v4)
  const sfxFiles = allNames.filter(n => n.startsWith('sfx_') && n.endsWith('.mp3')).sort();

  // Existing final_mix files (for context)
  const existingMixes = allNames.filter(n => n.startsWith('final_mix')).sort();

  // ── DRY-RUN report ──────────────────────────────────────────────────────────
  log('\n══════════════════════════════════════════════════════');
  log('  EP10 v4 Concat — DRY-RUN PLAN');
  log('══════════════════════════════════════════════════════');
  log(`  Story ID : ${STORY_ID}`);
  log(`  Dry run  : ${DRY_RUN}`);
  log('');
  log(`  INCLUDED (voice files):`);
  log(`    ✓ ${INTRO_FILE}  ← intro (voice, normalized)`);
  log(`    ✓ [${keptSegments.length} segments]  ← story narration`);
  log(`    ✓ ${OUTRO_FILE}  ← outro (voice, normalized)`);
  log('');
  log(`  EXCLUDED (bad segment):`);
  for (const s of excludedSegs) {
    log(`    ✗ ${s}  ← EXCLUDED: contains problematic content for v4`);
  }
  log('');
  log(`  EXCLUDED (SFX — no manifest position data):`);
  if (sfxFiles.length === 0) {
    log('    (none)');
  } else {
    for (const s of sfxFiles) {
      log(`    ✗ ${s}  ← excluded: sfx-manifest.json has no position data; cannot safely interleave`);
    }
    log('');
    log('  ⚠️  NOTE: 6 SFX files exist in storage but sfx-manifest.json has empty position maps.');
    log('           They cannot be safely interleaved without knowing their original insertion points.');
    log('           Marc should confirm: include SFX at original positions, or voice-only is acceptable?');
  }
  log('');
  log(`  EXISTING MIXES (not touched):`);
  for (const m of existingMixes) {
    log(`    • ${m}`);
  }
  log('');
  log(`  ASSEMBLY ORDER:`);
  log(`    [intro_00.1.mp3 normalized]`);
  log(`    [${SILENCE_GAP_SECS}s silence]`);
  log(`    [${keptSegments.length} segments concatenated + normalized]`);
  log(`    [${SILENCE_GAP_SECS}s silence]`);
  log(`    [outro_0135.mp3 normalized]`);
  log('');
  log(`  LOUDNORM: -16 LUFS, TP=-1.5, LRA=11 (each section independently)`);
  log(`  LIMITER : alimiter peak at -0.04 dBFS (same as render-correction-mix.js)`);
  log(`  OUTPUT  : final_mix_ep10_v4_staging_<timestamp>.mp3`);
  log(`  UPLOAD  : asc3/${FOLDER}/final_mix_ep10_v4_staging_<timestamp>.mp3`);
  log(`  DB      : no changes — audio_url NOT updated`);
  log('');
  log('  SEGMENT ROSTER (kept):');
  log(`    First 5 : ${keptSegments.slice(0, 5).join(', ')}`);
  log(`    Last 5  : ${keptSegments.slice(-5).join(', ')}`);
  log(`    Total   : ${keptSegments.length} of ${allSegments.length} segments`);

  if (DRY_RUN) {
    log('\n══ DRY-RUN COMPLETE — exiting without downloads or uploads ══');
    return;
  }

  // ── Real run ────────────────────────────────────────────────────────────────
  log('\n══ REAL RUN — beginning download + assemble + upload ══');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep10-v4-'));
  log(`Temp dir: ${tmp}`);

  try {
    const segDir   = path.join(tmp, 'segs');
    const introRaw = path.join(tmp, 'intro_raw.mp3');
    const outroRaw = path.join(tmp, 'outro_raw.mp3');
    const introNrm = path.join(tmp, 'intro_norm.mp3');
    const outroNrm = path.join(tmp, 'outro_norm.mp3');
    const storyRaw = path.join(tmp, 'story_raw.mp3');
    const storyNrm = path.join(tmp, 'story_norm.mp3');
    const silA     = path.join(tmp, 'silence_a.mp3');
    const silB     = path.join(tmp, 'silence_b.mp3');
    const concatP  = path.join(tmp, 'concat.mp3');
    const limitedP = path.join(tmp, 'final_limited.mp3');
    fs.mkdirSync(segDir);

    const base = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${FOLDER}`;

    // 1. Download intro + outro
    log('\n⬇️  Downloading intro + outro...');
    await dl(`${base}/${INTRO_FILE}`, introRaw, INTRO_FILE);
    await dl(`${base}/${OUTRO_FILE}`, outroRaw, OUTRO_FILE);

    // 2. Download segments
    log(`\n⬇️  Downloading ${keptSegments.length} segments...`);
    const segPaths = [];
    for (let i = 0; i < keptSegments.length; i++) {
      const name = keptSegments[i];
      const dest = path.join(segDir, name);
      const r = await fetch(`${base}/${name}`);
      if (!r.ok) throw new Error(`Segment download failed (${r.status}): ${name}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      segPaths.push(dest);
      if ((i + 1) % 25 === 0 || i + 1 === keptSegments.length) {
        log(`  ${i + 1}/${keptSegments.length} downloaded`);
      }
    }

    // 3. Normalize
    log('\n🔊  Normalizing sections...');
    normalize(introRaw, introNrm, 'normalize intro');
    normalize(outroRaw, outroNrm, 'normalize outro');

    log('\n🔊  Concatenating + normalizing segments...');
    concatFiles(segPaths, storyRaw, `concat ${segPaths.length} segments`);
    normalize(storyRaw, storyNrm, 'normalize story narration');

    // 4. Generate silence gaps
    log('\n🔇  Generating silence gaps...');
    makeSilence(silA, SILENCE_GAP_SECS);
    makeSilence(silB, SILENCE_GAP_SECS);

    // 5. Concat all sections
    log('\n🎬  Building final concat...');
    const introDur  = getDur(introNrm);
    const storyDur  = getDur(storyNrm);
    const outroDur  = getDur(outroNrm);
    const totalExpected = introDur + SILENCE_GAP_SECS + storyDur + SILENCE_GAP_SECS + outroDur;

    log(`  intro: ${introDur.toFixed(1)}s | story: ${(storyDur / 60).toFixed(2)} min | outro: ${outroDur.toFixed(1)}s`);
    log(`  total expected: ${(totalExpected / 60).toFixed(2)} min`);

    concatFiles(
      [introNrm, silA, storyNrm, silB, outroNrm],
      concatP,
      'concat intro + silence + story + silence + outro',
    );

    // 6. Peak limiter (same settings as render-correction-mix.js)
    ff([
      '-i', concatP,
      '-af', 'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', limitedP,
    ], 'apply limiter');

    const finalDur = getDur(limitedP);
    const finalSzMB = (fs.statSync(limitedP).size / 1024 / 1024).toFixed(1);
    log(`  Output: ${finalSzMB} MB, ${(finalDur / 60).toFixed(2)} min (${finalDur.toFixed(0)}s)`);

    // 7. Validation
    log('\n✅  Validating...');
    const errors = [];

    const openVol = getMaxVolume(limitedP, 0, 4);
    if (openVol < -60) {
      errors.push(`First-4s audio check FAILED: max_volume=${openVol}dB`);
    } else {
      log(`  ✓ First-4s audio present: ${openVol.toFixed(1)} dBFS`);
    }

    const durLo = totalExpected * 0.85;
    const durHi = totalExpected * 1.15;
    if (finalDur < durLo || finalDur > durHi) {
      errors.push(`Duration ${finalDur.toFixed(1)}s outside ±15% range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
    } else {
      log(`  ✓ Duration ${finalDur.toFixed(1)}s in range [${durLo.toFixed(0)}–${durHi.toFixed(0)}s]`);
    }

    // Story body spot checks
    const bodyStart = introDur + SILENCE_GAP_SECS;
    const checkPositions = [
      bodyStart + storyDur * 0.25,
      bodyStart + storyDur * 0.50,
      bodyStart + storyDur * 0.75,
    ];
    const fingerprints = checkPositions.map(pos => ({
      pos: pos.toFixed(1),
      vol: getMaxVolume(limitedP, pos, 2),
    }));
    log(`  ✓ Story body spot-checks: ${fingerprints.map(f => `@${f.pos}s=${f.vol.toFixed(1)}dB`).join(', ')}`);
    for (const fp of fingerprints) {
      if (fp.vol < -60) {
        errors.push(`Story body silence at @${fp.pos}s: max_volume=${fp.vol}dB`);
      }
    }

    if (errors.length) {
      log('\n❌  VALIDATION FAILED — not uploading:');
      for (const e of errors) log(`  - ${e}`);
      throw new Error('Validation failed: ' + errors.join('; '));
    }
    log('  All validation checks passed');

    // 8. Upload
    const ts = Date.now();
    const storageName = `final_mix_ep10_v4_staging_${ts}.mp3`;
    const storagePath = `asc3/${FOLDER}/${storageName}`;

    log(`\n☁️  Uploading as ${storageName}...`);
    const buf = fs.readFileSync(limitedP);
    const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, {
      contentType: 'audio/mpeg',
      upsert: false, // fail if file exists (timestamped, should never collide)
      cacheControl: '0',
    });
    if (upErr) throw new Error('Upload failed: ' + upErr.message);

    const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath);

    log('\n✅  DONE');
    log(`   File    : ${storageName}`);
    log(`   Duration: ${(finalDur / 60).toFixed(2)} min (${finalDur.toFixed(0)}s)`);
    log(`   Size    : ${finalSzMB} MB`);
    log(`   URL     : ${publicUrl}`);

    console.log('\n=== EP10 v4 SUMMARY ===');
    console.log(JSON.stringify({
      storyId: STORY_ID,
      version: 'v4',
      outputFile: storageName,
      url: publicUrl,
      durationSecs: finalDur,
      durationMin: parseFloat((finalDur / 60).toFixed(2)),
      sizeMB: parseFloat(finalSzMB),
      segmentCount: keptSegments.length,
      excludedSegments: Array.from(EXCLUDED_SEGMENTS),
      sfxExcluded: sfxFiles,
      validationPassed: true,
    }, null, 2));

  } finally {
    try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}
  }
}

main().catch(e => {
  console.error('\n❌  FATAL:', e.message);
  process.exit(1);
});
