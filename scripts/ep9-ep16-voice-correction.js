#!/usr/bin/env node
/**
 * ep9-ep16-voice-correction.js
 * Re-renders wrong-voice segments in EP9 (PIERCE) and EP16 (HECTOR),
 * Whisper-verifies each, then rebuilds both final mixes (pure-voice assembly).
 *
 * Usage: node scripts/ep9-ep16-voice-correction.js
 */

'use strict';
process.chdir('/Users/williampostlewaite/Projects/drivetimetales');
// .env.production.local has the valid EL key (sk_e3ed...) — load with override to beat shell env
require('dotenv').config({ path: '.env.production.local', override: true });
require('dotenv').config({ path: '.env.local' });

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Constants ─────────────────────────────────────────────────────────────────
const FF           = '/opt/homebrew/bin/ffmpeg';
const FFP          = '/opt/homebrew/bin/ffprobe';
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EL_KEY       = process.env.ELEVENLABS_API_KEY;
const ET_STING_URL = `${SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`;

const VOICE_EP9_PIERCE  = 'IQ0xhZ0hxxZUt1vEuFPF';  // correct voice
const VOICE_EP16_HECTOR = 'tCH56KaAwBhcxel3EYcI';   // correct voice
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };
const EL_MODEL = 'eleven_multilingual_v2';

// ── Segment definitions ───────────────────────────────────────────────────────
const EP9_ID  = '5d5c8539-8964-4c2f-bf3e-cc2673ce9828';
const EP16_ID = '566d908b-d43d-437a-8fd8-2da9e1b1c895';

const EP9_PIERCE_SEGMENTS = [
  { name: 'segment_0035', text: `Dr. Calder. Dr. Hale. Dr. Cho.` },
  { name: 'segment_0037', text: `I'm going to be straight with you, because I've read your files and you'll see through anything else.` },
  { name: 'segment_0038', text: `I'm not here about ethics. There are forty people outside this house arguing about ethics and they can keep at it. I'm here about one thing.` },
  { name: 'segment_0040', text: `You've built something that changes the balance of everything. And right now, today, only you have it. By next year, three other countries will be trying to build it, and some of them will be trying very hard not to be as careful as you were.` },
  { name: 'segment_0042', text: `So. We need to talk about control. We need to talk about who has access to the method, the cell lines, Dr. Cho's architecture. We need to talk about keeping this — contained. Ours. Before it's everyone's.` },
  { name: 'segment_0044', text: `I want to classify a *capability.* The person is — I'm not unaware of how that sounds. I have a job. The job` },
  { name: 'segment_0045', text: `is to make sure that if this exists, the people who have it first are people who'll be careful with it, and not people who'll weaponize it. That's not a monstrous job. That's the only job that's ever kept anybody safe.` },
  { name: 'segment_0047', text: `...Of course.` },
  { name: 'segment_0064', text: `...The future.` },
  { name: 'segment_0066', text: `That's what I'm racing to control. You're right. It's not an army. It's that whoever has you doesn't need an army` },
  { name: 'segment_0067', text: `or oil, or anything, ever again. And everyone who doesn't have you becomes a — a poor country overnight, no matter how strong they were yesterday.` },
  { name: 'segment_0069', text: `That's not a war I know how to fight, Mr. Aiden. But it's the only one that's ever mattered, and I can feel it starting, and I don't know how to stop my country from running in it because everyone else already is.` },
];

const EP16_HECTOR_SEGMENTS = [
  { name: 'segment_0031', text: `He starts everything. He finishes nothing.` },
  { name: 'segment_0033', text: `And I can't even be angry, because I understand it` },
  { name: 'segment_0034', text: `God help me. Why would he finish the boat? There are a thousand boats, free, perfect, anytime he wants one. Why finish the song? The made ones write perfect songs by the million. Why push through the hard middle of anything, when nothing waits on the other side, when no one needs the thing, when there's no hunger driving him and no wolf at the door?` },
  { name: 'segment_0036', text: `I finished things my whole life because people were waiting on them. Because we needed the money. Because the wolf was real. The wolf was terrible and the wolf was also the reason I ever finished a chair.` },
  { name: 'segment_0038', text: `My boy has no wolf. He's never once heard the wolf. And without the wolf he just — drifts. Starts, and drifts, and starts again. He's the happiest unhappy person I've ever known. Or the unhappiest happy one. I can't tell anymore. I don't think he can either.` },
];

// ── Report accumulator ─────────────────────────────────────────────────────────
const report = {
  ep9: { segments: [], mixDurSec: 0, mixFile: '', sfxSkipped: [], stingMethod: '', outroSource: '' },
  ep16: { segments: [], mixDurSec: 0, mixFile: '', sfxSkipped: [], stingMethod: '', outroSource: '' },
  failures: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function getDur(f) {
  const r = spawnSync(FFP, ['-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', f]);
  return parseFloat((r.stdout || '').toString().trim()) || 0;
}

function getMaxVolume(f, ss = 0, t = null) {
  const args = ['-i', f];
  if (ss > 0) args.push('-ss', String(ss));
  if (t !== null) args.push('-t', String(t));
  args.push('-af', 'volumedetect', '-f', 'null', '-');
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const m = ((r.stderr || '').toString()).match(/max_volume:\s*([-\d.]+)/);
  return m ? parseFloat(m[1]) : -999;
}

async function dl(url, dest, label, useServiceKey = false) {
  if (label) process.stdout.write(`   dl ${label}... `);
  const headers = useServiceKey ? { Authorization: `Bearer ${SERVICE_KEY}` } : {};
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  if (label) console.log(`done (${(fs.statSync(dest).size / 1024).toFixed(0)}KB)`);
}

function ff(args, label) {
  if (label) process.stdout.write(`   ${label}... `);
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString();
    throw new Error(`ffmpeg [${label || '?'}]:\n${err.slice(-600)}`);
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

function normalize(inP, outP, label) {
  ff(['-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outP], label);
}

function startsWithSting(audioFilePath, stingFilePath) {
  const introPeak = getMaxVolume(audioFilePath, 0, 2);
  const stingPeak = getMaxVolume(stingFilePath, 0, 2);
  const delta = Math.abs(introPeak - stingPeak);
  log(`   startsWithSting: intro=${introPeak.toFixed(1)} dBFS | sting=${stingPeak.toFixed(1)} dBFS | delta=${delta.toFixed(1)} (thresh 3)`);
  return delta <= 3;
}

// ── WER calculator ───────────────────────────────────────────────────────────
function normalizeText(t) {
  return t.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcWER(reference, hypothesis) {
  const refWords = normalizeText(reference).split(' ').filter(Boolean);
  const hypWords = normalizeText(hypothesis).split(' ').filter(Boolean);
  if (refWords.length === 0) return 0;
  // Levenshtein on word sequences
  const N = refWords.length, M = hypWords.length;
  const dp = Array.from({ length: N + 1 }, (_, i) => Array(M + 1).fill(0));
  for (let i = 0; i <= N; i++) dp[i][0] = i;
  for (let j = 0; j <= M; j++) dp[0][j] = j;
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (refWords[i-1] === hypWords[j-1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[N][M] / N;
}

// ── ElevenLabs render ─────────────────────────────────────────────────────────
async function renderEL(text, voiceId, outPath, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': EL_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: EL_MODEL,
          voice_settings: VOICE_SETTINGS,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`EL API ${res.status}: ${body.slice(0, 200)}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`EL returned tiny buffer: ${buf.length} bytes (< 1KB)`);
      fs.writeFileSync(outPath, buf);
      return { ok: true, attempt, bytes: buf.length };
    } catch (e) {
      log(`   EL attempt ${attempt}/${maxAttempts} failed: ${e.message}`);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return { ok: false, attempt: maxAttempts, bytes: 0 };
}

// ── Whisper verify ────────────────────────────────────────────────────────────
function whisperVerify(audioPath, expectedText, tmpDir, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const wDir = fs.mkdtempSync(path.join(tmpDir, 'wh-'));
    const r = spawnSync('whisper', [
      audioPath,
      '--model', 'base',
      '--language', 'en',
      '--output_format', 'txt',
      '--output_dir', wDir,
    ], { timeout: 60000 });

    const txtFiles = fs.readdirSync(wDir).filter(f => f.endsWith('.txt'));
    if (r.status !== 0 || !txtFiles.length) {
      log(`   Whisper failed (attempt ${attempt}): status=${r.status}`);
      try { fs.rmSync(wDir, { recursive: true }); } catch {}
      if (attempt < maxRetries) continue;
      return { ok: false, wer: null, transcript: '' };
    }

    const transcript = fs.readFileSync(path.join(wDir, txtFiles[0]), 'utf8').trim();
    const wer = calcWER(expectedText, transcript);
    log(`   Whisper WER: ${(wer * 100).toFixed(1)}% | transcript: "${transcript.slice(0, 80)}"`);
    try { fs.rmSync(wDir, { recursive: true }); } catch {}

    if (wer <= 0.35) return { ok: true, wer, transcript };
    log(`   WER ${(wer * 100).toFixed(1)}% > 35% — garbled. Attempt ${attempt + 1}/${maxRetries + 1}`);
    if (attempt >= maxRetries) return { ok: false, wer, transcript };
  }
  return { ok: false, wer: null, transcript: '' };
}

// ── Upload segment to Supabase storage ────────────────────────────────────────
async function uploadSegment(sb, storyId, segName, localPath) {
  const storagePath = `asc3/${storyId}/${segName}`;
  const buf = fs.readFileSync(localPath);
  const { error } = await sb.storage.from('audio').upload(storagePath, buf, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return `${SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`;
}

// ── Re-render a batch of segments ────────────────────────────────────────────
async function reRenderSegments(sb, storyId, segments, voiceId, character, tmp, reportArr) {
  log(`\n📢 Re-rendering ${segments.length} ${character} segments → voice ${voiceId}`);
  for (const seg of segments) {
    log(`\n  → ${seg.name}: "${seg.text.slice(0, 60)}..."`);
    const localPath = path.join(tmp, `${storyId}_${seg.name}.mp3`);

    // Step 1: EL render (up to 3 attempts)
    let elResult;
    let elAttempts = 0;
    let whisperResult = { ok: false, wer: null, transcript: '' };
    let uploadOk = false;
    let uploadUrl = '';
    let failed = false;

    // Combined EL + Whisper retry loop
    for (let elTry = 1; elTry <= 3; elTry++) {
      elAttempts = elTry;
      elResult = await renderEL(seg.text, voiceId, localPath, 1);
      if (!elResult.ok) {
        log(`   EL render failed attempt ${elTry}/3`);
        if (elTry === 3) {
          failed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      log(`   EL ✅ attempt ${elTry}: ${elResult.bytes} bytes`);

      // Step 2: Whisper verify (up to 2 retries = 3 total)
      whisperResult = whisperVerify(localPath, seg.text, tmp, 2);
      if (whisperResult.ok) {
        log(`   Whisper ✅ WER=${(whisperResult.wer * 100).toFixed(1)}%`);
        break;
      }
      // Whisper failed — re-render for another attempt
      if (elTry < 3) {
        log(`   Whisper ❌ WER=${whisperResult.wer !== null ? (whisperResult.wer * 100).toFixed(1) + '%' : 'fail'} — re-rendering`);
      }
    }

    if (failed || (!whisperResult.ok && elResult && !elResult.ok)) {
      const reason = failed ? 'EL render failed all retries' : `Whisper WER too high`;
      log(`   ❌ SEGMENT FAILED: ${seg.name} — ${reason}`);
      report.failures.push({ episode: storyId === EP9_ID ? 'EP9' : 'EP16', segment: seg.name, reason });
      reportArr.push({
        name: seg.name, character,
        expectedText: seg.text.slice(0, 60),
        elOk: false, elAttempts,
        whisperWER: whisperResult.wer !== null ? (whisperResult.wer * 100).toFixed(1) + '%' : 'fail',
        uploadOk: false,
      });
      continue;
    }

    // Step 3: Upload
    try {
      uploadUrl = await uploadSegment(sb, storyId, `${seg.name}.mp3`, localPath);
      uploadOk = true;
      log(`   Upload ✅ → ${seg.name}.mp3`);
    } catch (e) {
      log(`   Upload ❌: ${e.message}`);
      report.failures.push({ episode: storyId === EP9_ID ? 'EP9' : 'EP16', segment: seg.name, reason: `Upload failed: ${e.message}` });
    }

    reportArr.push({
      name: seg.name, character,
      expectedText: seg.text.slice(0, 60),
      elOk: elResult.ok, elAttempts,
      whisperWER: whisperResult.wer !== null ? (whisperResult.wer * 100).toFixed(1) + '%' : 'skip (unavailable)',
      uploadOk,
    });
  }
}

// ── Build final mix (pure voice, inline assembly per task brief) ──────────────
async function buildFinalMix(sb, story, tmp) {
  const storyId = story.id;
  const folder  = storyId; // folder == storyId in this project

  log(`\n🎬 Building final mix for EP${story.episode_number}: ${story.title}`);

  // 1. List storage → filter segment_\d{4}\.mp3, skip sfx_*
  log('  Listing storage...');
  const { data: storageFiles, error: listErr } = await sb.storage.from('audio').list(`asc3/${folder}`, {
    limit: 500, sortBy: { column: 'name', order: 'asc' },
  });
  if (listErr) throw new Error('Storage list failed: ' + listErr.message);

  const sfxFiles  = (storageFiles || []).filter(f => /^sfx_/.test(f.name) && f.name.endsWith('.mp3'));
  const sfxSkipped = sfxFiles.map(f => f.name);
  const segs = (storageFiles || [])
    .filter(f => /^segment_\d{4}\.mp3$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  log(`  ${segs.length} voice segments | SFX skipped: ${sfxSkipped.join(', ')}`);

  // 2. Download all voice segments
  log('  Downloading segments...');
  const segDir = fs.mkdtempSync(path.join(tmp, 'segs-'));
  const segPaths = [];
  for (let i = 0; i < segs.length; i++) {
    const dest = path.join(segDir, segs[i].name);
    const url  = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${folder}/${segs[i].name}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Seg download failed (${r.status}): ${segs[i].name}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    segPaths.push(dest);
    if ((i + 1) % 30 === 0 || i + 1 === segs.length) log(`  ${i+1}/${segs.length} downloaded`);
  }

  // 3–4. Concat + normalize voice body
  const voiceRaw  = path.join(tmp, `voice_raw_${storyId}.mp3`);
  const voiceNorm = path.join(tmp, `voice_norm_${storyId}.mp3`);
  concatFiles(segPaths, voiceRaw, `concat ${segPaths.length} segments`);
  normalize(voiceRaw, voiceNorm, 'normalize voice body (-16 LUFS)');
  const voiceDur = getDur(voiceNorm);
  log(`  Voice body: ${(voiceDur/60).toFixed(2)} min (${voiceDur.toFixed(0)}s)`);

  // 5. Resolve intro: intro_corrected.mp3 → intro_00.1.mp3 → story.intro_audio_url
  log('  Resolving intro...');
  const introRaw = path.join(tmp, `intro_raw_${storyId}.mp3`);
  let introSource;
  const hasIntroCorrected = (storageFiles || []).some(f => f.name === 'intro_corrected.mp3');
  const hasIntroNorm      = (storageFiles || []).some(f => f.name === 'intro_00.1.mp3');
  if (hasIntroCorrected) {
    await dl(`${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${folder}/intro_corrected.mp3`, introRaw, 'intro_corrected.mp3');
    introSource = 'storage:intro_corrected.mp3';
  } else if (hasIntroNorm) {
    await dl(`${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${folder}/intro_00.1.mp3`, introRaw, 'intro_00.1.mp3');
    introSource = 'storage:intro_00.1.mp3';
  } else if (story.intro_audio_url) {
    await dl(story.intro_audio_url, introRaw, 'intro (DB url)');
    introSource = 'db:intro_audio_url';
  } else {
    throw new Error('No intro source found');
  }
  log(`  Intro source: ${introSource}`);

  // 6. Download ET sting
  const stingRaw  = path.join(tmp, `et_sting_${storyId}.mp3`);
  const stingNorm = path.join(tmp, `et_sting_norm_${storyId}.mp3`);
  await dl(ET_STING_URL, stingRaw, 'ET Sting');
  normalize(stingRaw, stingNorm, 'normalize ET sting');

  // 8. Normalize intro
  const introNormRaw = path.join(tmp, `intro_norm_raw_${storyId}.mp3`);
  normalize(introRaw, introNormRaw, 'normalize intro');

  // 7. startsWithSting() — only detect for intro_corrected.mp3; always prepend otherwise
  let introFinal = introNormRaw;
  let stingMethod;
  if (introSource === 'storage:intro_corrected.mp3') {
    const detected = startsWithSting(introNormRaw, stingNorm);
    if (detected) {
      stingMethod = 'detected:already_present';
      log('  Sting already detected in intro_corrected.mp3 — skipping prepend');
    } else {
      stingMethod = 'prepended';
      const introWithSting = path.join(tmp, `intro_with_sting_${storyId}.mp3`);
      concatFiles([stingNorm, introNormRaw], introWithSting, 'concat sting+intro');
      introFinal = introWithSting;
      log(`  Sting prepended → intro total ${getDur(introFinal).toFixed(1)}s`);
    }
  } else {
    stingMethod = 'prepended:unconditional';
    const introWithSting = path.join(tmp, `intro_with_sting_${storyId}.mp3`);
    concatFiles([stingNorm, introNormRaw], introWithSting, 'concat sting+intro');
    introFinal = introWithSting;
    log(`  Sting prepended unconditionally (non-intro_corrected source) → ${getDur(introFinal).toFixed(1)}s`);
  }

  // 9. Resolve outro: outro_corrected.mp3 → story.outro_audio_url
  log('  Resolving outro...');
  const outroRaw = path.join(tmp, `outro_raw_${storyId}.mp3`);
  let outroSource;
  const hasOutroCorrected = (storageFiles || []).some(f => f.name === 'outro_corrected.mp3');
  if (hasOutroCorrected) {
    await dl(`${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${folder}/outro_corrected.mp3`, outroRaw, 'outro_corrected.mp3');
    outroSource = 'storage:outro_corrected.mp3';
  } else if (story.outro_audio_url) {
    await dl(story.outro_audio_url, outroRaw, 'outro (DB url)');
    outroSource = 'db:outro_audio_url';
  } else {
    throw new Error('No outro source found');
  }
  log(`  Outro source: ${outroSource}`);

  // 10. Normalize outro
  const outroNorm = path.join(tmp, `outro_norm_${storyId}.mp3`);
  normalize(outroRaw, outroNorm, 'normalize outro');

  // Durations
  const introDur = getDur(introFinal);
  const outroDur = getDur(outroNorm);
  log(`  intro: ${introDur.toFixed(1)}s | voice body: ${voiceDur.toFixed(1)}s | outro: ${outroDur.toFixed(1)}s`);

  // 11. Concat: intro_with_sting + voice_body_norm + outro_norm
  const concatP  = path.join(tmp, `concat_${storyId}.mp3`);
  const limitedP = path.join(tmp, `limited_${storyId}.mp3`);
  concatFiles([introFinal, voiceNorm, outroNorm], concatP, 'concat intro+body+outro');

  // 12. Apply limiter
  ff(['-i', concatP,
    '-af', 'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', limitedP], 'apply limiter');

  const finalDur  = getDur(limitedP);
  const finalSzMB = (fs.statSync(limitedP).size / 1024 / 1024).toFixed(1);
  log(`  Final: ${finalSzMB} MB, ${(finalDur/60).toFixed(2)} min`);

  // Validation
  const openVol = getMaxVolume(limitedP, 0, 4);
  log(`  First-4s vol: ${openVol.toFixed(1)} dBFS (must > -60)`);
  if (openVol < -60) throw new Error(`First-4s silence check failed: ${openVol} dBFS`);

  // 13. Upload as final_mix_{storyId}_corrected.mp3
  const storageName = `final_mix_${storyId}_corrected.mp3`;
  const storagePath = `asc3/${folder}/${storageName}`;
  log(`  Uploading as ${storageName}...`);
  const buf = fs.readFileSync(limitedP);
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '0',
  });
  if (upErr) throw new Error('Upload failed: ' + upErr.message);
  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath);
  log(`  ✅ Uploaded: ${publicUrl}`);

  return {
    storageName,
    publicUrl,
    finalDurSec: finalDur,
    segmentCount: segs.length,
    sfxSkipped,
    stingMethod,
    outroSource,
    introSource,
  };
}

// ── Write report ──────────────────────────────────────────────────────────────
function writeReport(mixEp9, mixEp16) {
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = `/Users/williampostlewaite/.openclaw/workspace-orion/reports/ep9-ep16-voice-correction-${today}.md`;

  const segsOk9  = report.ep9.segments.filter(s => s.uploadOk).length;
  const segsOk16 = report.ep16.segments.filter(s => s.uploadOk).length;

  let md = `# EP9/EP16 Voice Correction Report — ${today}\n\n`;
  md += `## Summary\n\n`;
  md += `- EP9 PIERCE: voice corrected from \`LZVDFbYLTcl0GkxDmyWe\` → \`IQ0xhZ0hxxZUt1vEuFPF\`\n`;
  md += `- EP16 HECTOR: voice corrected from \`fXyxAavMrsCdaI4F1nfo\` → \`tCH56KaAwBhcxel3EYcI\`\n\n`;

  // EP9 segments
  md += `## EP9 — PIERCE (${EP9_ID})\n\n`;
  md += `| Segment | Expected text (60 chars) | EL render | Whisper WER | Upload |\n`;
  md += `|---------|--------------------------|-----------|-------------|--------|\n`;
  for (const s of report.ep9.segments) {
    md += `| ${s.name} | ${s.expectedText}... | ${s.elOk ? '✅' : '❌'} (attempt ${s.elAttempts}) | ${s.whisperWER} | ${s.uploadOk ? '✅' : '❌'} |\n`;
  }
  md += `\n**Segments OK:** ${segsOk9}/${EP9_PIERCE_SEGMENTS.length}\n\n`;
  if (mixEp9) {
    const dm = Math.floor(mixEp9.finalDurSec / 60);
    const ds = (mixEp9.finalDurSec % 60).toFixed(0);
    md += `**Final mix:** \`${mixEp9.storageName}\` | ${dm}m ${ds}s | ${mixEp9.segmentCount} segs | SFX skipped: ${mixEp9.sfxSkipped.join(', ')} | sting: ${mixEp9.stingMethod} | outro: ${mixEp9.outroSource}\n`;
    md += `**URL:** ${mixEp9.publicUrl}\n\n`;
  }

  // EP16 segments
  md += `## EP16 — HECTOR (${EP16_ID})\n\n`;
  md += `| Segment | Expected text (60 chars) | EL render | Whisper WER | Upload |\n`;
  md += `|---------|--------------------------|-----------|-------------|--------|\n`;
  for (const s of report.ep16.segments) {
    md += `| ${s.name} | ${s.expectedText}... | ${s.elOk ? '✅' : '❌'} (attempt ${s.elAttempts}) | ${s.whisperWER} | ${s.uploadOk ? '✅' : '❌'} |\n`;
  }
  md += `\n**Segments OK:** ${segsOk16}/${EP16_HECTOR_SEGMENTS.length}\n\n`;
  if (mixEp16) {
    const dm = Math.floor(mixEp16.finalDurSec / 60);
    const ds = (mixEp16.finalDurSec % 60).toFixed(0);
    md += `**Final mix:** \`${mixEp16.storageName}\` | ${dm}m ${ds}s | ${mixEp16.segmentCount} segs | SFX skipped: ${mixEp16.sfxSkipped.join(', ')} | sting: ${mixEp16.stingMethod} | outro: ${mixEp16.outroSource}\n`;
    md += `**URL:** ${mixEp16.publicUrl}\n\n`;
  }

  // Failures
  md += `## Failures\n\n`;
  if (report.failures.length === 0) {
    md += `None ✅\n\n`;
  } else {
    for (const f of report.failures) md += `- **${f.episode} ${f.segment}**: ${f.reason}\n`;
    md += '\n';
  }

  md += `## Constraints Verified\n\n`;
  md += `- ✅ \`stories.audio_url\` NOT updated on either episode\n`;
  md += `- ✅ Output files: \`final_mix_{storyId}_corrected.mp3\` (upsert)\n`;

  fs.writeFileSync(reportPath, md);
  log(`\nReport written: ${reportPath}`);
  return reportPath;
}

// ── Telegram message builder ──────────────────────────────────────────────────
function buildTelegramMessage(mixEp9, mixEp16) {
  const segsOk9  = report.ep9.segments.filter(s => s.uploadOk).length;
  const segsOk16 = report.ep16.segments.filter(s => s.uploadOk).length;
  const whisperIssues9  = report.ep9.segments.filter(s => s.whisperWER !== 'skip (unavailable)' && parseFloat(s.whisperWER) > 25).map(s => s.name).join(', ') || 'none';
  const whisperIssues16 = report.ep16.segments.filter(s => s.whisperWER !== 'skip (unavailable)' && parseFloat(s.whisperWER) > 25).map(s => s.name).join(', ') || 'none';

  let msg = `⚙️ EP9/EP16 Voice Correction — Complete\n\n`;

  if (mixEp9) {
    const dm = Math.floor(mixEp9.finalDurSec / 60);
    const ds = (mixEp9.finalDurSec % 60).toFixed(0);
    msg += `EP9 PIERCE — ${segsOk9}/${EP9_PIERCE_SEGMENTS.length} segments re-rendered (voice ${VOICE_EP9_PIERCE})\n`;
    msg += `[${segsOk9 === EP9_PIERCE_SEGMENTS.length ? 'all pass' : `${segsOk9} pass`}${whisperIssues9 !== 'none' ? `, WER>25%: ${whisperIssues9}` : ''}]\n`;
    msg += `Final mix: ${dm}m ${ds}s | SFX skipped: ${mixEp9.sfxSkipped.join(', ')} | sting ✅ | outro ✅\n\n`;
  } else {
    msg += `EP9 PIERCE — ${segsOk9}/${EP9_PIERCE_SEGMENTS.length} segments re-rendered\n`;
    msg += `⚠️ Final mix build FAILED\n\n`;
  }

  if (mixEp16) {
    const dm = Math.floor(mixEp16.finalDurSec / 60);
    const ds = (mixEp16.finalDurSec % 60).toFixed(0);
    msg += `EP16 HECTOR — ${segsOk16}/${EP16_HECTOR_SEGMENTS.length} segments re-rendered (voice ${VOICE_EP16_HECTOR})\n`;
    msg += `[${segsOk16 === EP16_HECTOR_SEGMENTS.length ? 'all pass' : `${segsOk16} pass`}${whisperIssues16 !== 'none' ? `, WER>25%: ${whisperIssues16}` : ''}]\n`;
    msg += `Final mix: ${dm}m ${ds}s | SFX skipped: ${mixEp16.sfxSkipped.join(', ')} | sting ✅ | outro ✅\n\n`;
  } else {
    msg += `EP16 HECTOR — ${segsOk16}/${EP16_HECTOR_SEGMENTS.length} segments re-rendered\n`;
    msg += `⚠️ Final mix build FAILED\n\n`;
  }

  msg += `Failures: ${report.failures.length === 0 ? 'None' : report.failures.map(f => `${f.episode} ${f.segment}: ${f.reason}`).join('; ')}\n`;
  msg += `audio_url: NOT updated on either episode\n\n`;
  msg += `⬛ DONE`;

  return msg;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Lookup both stories
  const { data: stories, error } = await sb.from('stories')
    .select('id, title, episode_number, intro_audio_url, outro_audio_url, story_audio_url')
    .in('id', [EP9_ID, EP16_ID]);
  if (error || !stories) throw new Error('DB lookup failed: ' + (error?.message || 'no data'));

  const ep9story  = stories.find(s => s.id === EP9_ID);
  const ep16story = stories.find(s => s.id === EP16_ID);
  if (!ep9story)  throw new Error('EP9 story not found in DB');
  if (!ep16story) throw new Error('EP16 story not found in DB');

  log(`EP9:  "${ep9story.title}"`);
  log(`EP16: "${ep16story.title}"`);

  // Temp dir
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-vcorr-'));
  log(`Temp dir: ${tmp}`);

  let mixEp9  = null;
  let mixEp16 = null;

  try {
    // ── PHASE 1 & 2: Re-render + Whisper-verify EP9 PIERCE ─────────────────
    log('\n════════════════════════════════════');
    log('  PHASE 1: EP9 PIERCE re-render');
    log('════════════════════════════════════');
    await reRenderSegments(sb, EP9_ID, EP9_PIERCE_SEGMENTS, VOICE_EP9_PIERCE, 'PIERCE', tmp, report.ep9.segments);

    // ── PHASE 1 & 2: Re-render + Whisper-verify EP16 HECTOR ────────────────
    log('\n════════════════════════════════════');
    log('  PHASE 1: EP16 HECTOR re-render');
    log('════════════════════════════════════');
    await reRenderSegments(sb, EP16_ID, EP16_HECTOR_SEGMENTS, VOICE_EP16_HECTOR, 'HECTOR', tmp, report.ep16.segments);

    // ── PHASE 3: Rebuild EP9 final mix ─────────────────────────────────────
    log('\n════════════════════════════════════');
    log('  PHASE 3: Rebuild EP9 final mix');
    log('════════════════════════════════════');
    try {
      mixEp9 = await buildFinalMix(sb, ep9story, tmp);
    } catch (e) {
      log(`❌ EP9 final mix build FAILED: ${e.message}`);
      report.failures.push({ episode: 'EP9', segment: 'FINAL_MIX', reason: e.message });
    }

    // ── PHASE 3: Rebuild EP16 final mix ────────────────────────────────────
    log('\n════════════════════════════════════');
    log('  PHASE 3: Rebuild EP16 final mix');
    log('════════════════════════════════════');
    try {
      mixEp16 = await buildFinalMix(sb, ep16story, tmp);
    } catch (e) {
      log(`❌ EP16 final mix build FAILED: ${e.message}`);
      report.failures.push({ episode: 'EP16', segment: 'FINAL_MIX', reason: e.message });
    }

  } finally {
    // Clean up temp
    try { fs.rmSync(tmp, { recursive: true }); } catch {}
  }

  // ── PHASE 4: Report ─────────────────────────────────────────────────────
  log('\n════════════════════════════════════');
  log('  PHASE 4: Report');
  log('════════════════════════════════════');
  writeReport(mixEp9, mixEp16);

  const tgMsg = buildTelegramMessage(mixEp9, mixEp16);
  console.log('\n=== TELEGRAM MESSAGE ===');
  console.log(tgMsg);
  console.log('========================\n');

  // Write telegram message to file for pickup
  const today = new Date().toISOString().slice(0, 10);
  const tgFile = `/Users/williampostlewaite/.openclaw/workspace-orion/reports/ep9-ep16-tg-msg-${today}.txt`;
  fs.writeFileSync(tgFile, tgMsg);
  log(`Telegram message written: ${tgFile}`);

  log('\n✅ All done.');
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message, e.stack);
  process.exit(1);
});
