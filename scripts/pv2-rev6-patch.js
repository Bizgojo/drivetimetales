#!/usr/bin/env node
/**
 * PV2 rev6 patch
 * 1. Lock footsteps-lena-a → sfx-locked/footsteps-lena-approved.mp3; delete b+c
 * 2. Fix script "We ran" → "Lena ran"; update manifest voice_segments
 * 3. Regenerate segment_0030.mp3 (only changed segment)
 * 4. Trigger render-final-mix via production API
 *
 * Usage: node scripts/pv2-rev6-patch.js
 */
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const EL_API_KEY    = process.env.ELEVENLABS_API_KEY
const sb            = createClient(SUPABASE_URL, SERVICE_KEY)
const STORY_ID      = 'a88084ab-62e3-47f4-9b7a-5cbc32943349'
const BASE          = `${SUPABASE_URL}/storage/v1/object/public/audio`
const FF            = '/opt/homebrew/bin/ffmpeg'

// Voice settings for MARA (from manifest)
const MARA_VOICE_ID  = 'ovUpRQCoNYADjai0c9kP'
const MARA_SETTINGS  = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 }
const MARA_MODEL     = 'eleven_multilingual_v2'

const OLD_LINE_TEXT = 'We ran beneath the park, past old brick arches and a rusted gate. The fleeing figure cut left toward the service stairs. Lena followed. Eli caught my arm beside a wall scratched with names.'
const NEW_LINE_TEXT = 'Lena ran beneath the park, past old brick arches and a rusted gate. The fleeing figure cut left toward the service stairs. Lena followed. Eli caught my arm beside a wall scratched with names.'

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function makeVoiceContentKey(character, lineText, voiceId, settings, model) {
  const payload = JSON.stringify({
    char: character.trim().toUpperCase(),
    text: lineText.trim(),
    voiceId,
    stability: settings.stability,
    similarity_boost: settings.similarity_boost,
    style: settings.style,
    use_speaker_boost: settings.use_speaker_boost,
    speed: settings.speed ?? 1.0,
    model,
  })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

async function storageUpload(sp, buf) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${sp}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Upload ${sp}: ${res.status} ${txt.slice(0, 200)}`)
  }
}

async function storageDelete(sp) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${sp}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) {
    const txt = await res.text()
    console.warn(`  Delete ${sp}: ${res.status} ${txt.slice(0, 100)}`)
  }
}

async function storageDownload(url) {
  const res = await fetch(url + '?t=' + Date.now())
  if (!res.ok) throw new Error(`Download ${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function ffProcess(inputBuf, args, label) {
  const tmpIn  = path.join(os.tmpdir(), `et_rv6_in_${Date.now()}.mp3`)
  const tmpOut = path.join(os.tmpdir(), `et_rv6_out_${Date.now()}.mp3`)
  fs.writeFileSync(tmpIn, inputBuf)
  const finalArgs = ['-i', tmpIn, ...args, '-y', tmpOut]
  const r = spawnSync(FF, finalArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) {
    fs.unlinkSync(tmpIn)
    throw new Error(`ffmpeg [${label}]: ${(r.stderr||Buffer.alloc(0)).toString().slice(-300)}`)
  }
  const out = fs.readFileSync(tmpOut)
  fs.unlinkSync(tmpIn)
  fs.unlinkSync(tmpOut)
  return out
}

function normalizeAudio(buf, label) {
  return ffProcess(buf,
    ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-b:a', '192k'],
    label || 'normalize'
  )
}

function trimSilence(buf) {
  return ffProcess(buf,
    ['-af', 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:stop_periods=1:stop_duration=0.12:stop_threshold=-45dB',
     '-ar', '44100', '-ac', '2', '-b:a', '192k'],
    'trim-silence'
  )
}

async function loadManifest() {
  const url = `${BASE}/asc3/${STORY_ID}/sfx-manifest.json`
  const res = await fetch(url + '?t=' + Date.now())
  if (!res.ok) throw new Error(`Manifest fetch: ${res.status}`)
  return await res.json()
}

async function saveManifest(manifest) {
  const buf = Buffer.from(JSON.stringify(manifest, null, 2))
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/asc3/${STORY_ID}/sfx-manifest.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) throw new Error(`Manifest save: ${res.status} ${(await res.text()).slice(0,150)}`)
}

async function callElevenLabs(text, voiceId, settings, model) {
  console.log(`  → ElevenLabs TTS: voice=${voiceId} (${text.slice(0,60)}...)`)
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: settings,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`ElevenLabs ${res.status}: ${txt.slice(0,200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== PV2 rev6 patch ===\n')

  // ── Step 0: Load current manifest ─────────────────────────────────────────
  console.log('Step 0: Loading manifest...')
  let manifest = await loadManifest()
  console.log(`  Schema: ${manifest.schema}`)
  console.log(`  Locked SFX count: ${Object.keys(manifest.locked_sfx || {}).length}`)
  console.log(`  Voice segments count: ${Object.keys(manifest.voice_segments || {}).length}`)

  // ── Step 1: SFX — verify 6 locked cues ───────────────────────────────────
  console.log('\nStep 1: Verifying 6 locked SFX cues in sfx-locked/...')
  const { data: lockedFiles, error: lfErr } = await sb.storage.from('audio')
    .list(`asc3/${STORY_ID}/sfx-locked`)
  if (lfErr) throw new Error('sfx-locked list: ' + lfErr.message)
  const lockedNames = lockedFiles.map(f => f.name)
  console.log('  Files found:', lockedNames.join(', '))

  const required = ['bell-strike-r4.mp3', 'door-latch-r4.mp3', 'river-roar-r4.mp3',
                    'hum-drip-r4.mp3', 'footsteps-v2-approved.mp3', 'gunshot-v3-approved.mp3']
  const missing = required.filter(n => !lockedNames.includes(n))
  if (missing.length > 0) {
    throw new Error('STOP — missing locked cues: ' + missing.join(', '))
  }
  console.log('  ✅ All 6 locked cues present')

  // ── Step 2: Lock footsteps-lena-a ─────────────────────────────────────────
  console.log('\nStep 2: Locking footsteps-lena-a...')
  const candidatePath = `asc3/${STORY_ID}/sfx-candidates/footsteps-lena-a.mp3`
  const candidateUrl  = `${BASE}/${candidatePath}`
  const footstepsBuf  = await storageDownload(candidateUrl)
  const footstepsSha  = sha256hex(footstepsBuf)
  console.log(`  footsteps-lena-a.mp3: ${footstepsBuf.length} bytes, sha256=${footstepsSha}`)

  const lockedPath  = `asc3/${STORY_ID}/sfx-locked/footsteps-lena-approved.mp3`
  const sfx0006Path = `asc3/${STORY_ID}/sfx_0006.mp3`  // the active cue in storage
  await storageUpload(lockedPath, footstepsBuf)
  console.log(`  ✅ Uploaded → sfx-locked/footsteps-lena-approved.mp3`)
  await storageUpload(sfx0006Path, footstepsBuf)
  console.log(`  ✅ Uploaded → sfx_0006.mp3 (active cue replaced)`)

  // ── Step 3: Delete treatments b and c ────────────────────────────────────
  console.log('\nStep 3: Deleting treatments b and c...')
  await storageDelete(`asc3/${STORY_ID}/sfx-candidates/footsteps-lena-b.mp3`)
  console.log('  ✅ Deleted footsteps-lena-b.mp3')
  await storageDelete(`asc3/${STORY_ID}/sfx-candidates/footsteps-lena-c.mp3`)
  console.log('  ✅ Deleted footsteps-lena-c.mp3')

  // ── Step 4: Update manifest locked_sfx ───────────────────────────────────
  console.log('\nStep 4: Updating manifest locked_sfx...')
  const cueText = 'FOOTSTEPS ON WET STONE, APPROACHING; LOW ELECTRICAL HUM; WATER DRIPPING IN A LARGE CHAMBER'
  manifest.locked_sfx = manifest.locked_sfx || {}
  manifest.locked_sfx['footsteps-lena'] = {
    locked: true,
    cue_text: cueText,
    storage_path: lockedPath,
    public_url: `${BASE}/${lockedPath}`,
    sha256: footstepsSha,
    size_bytes: footstepsBuf.length,
    locked_at: new Date().toISOString(),
    locked_revision: 'rev6',
    duration_secs: null,  // not computed; file is short
    series_signature: false,
  }
  console.log(`  ✅ footsteps-lena entry added (sha256=${footstepsSha})`)

  // ── Step 5: Fix script in DB ──────────────────────────────────────────────
  console.log('\nStep 5: Fixing script in DB...')
  const { data: story, error: fetchErr } = await sb.from('stories')
    .select('script').eq('id', STORY_ID).single()
  if (fetchErr) throw new Error('Script fetch: ' + fetchErr.message)

  if (!story.script.includes(OLD_LINE_TEXT)) {
    throw new Error(`STOP — old line text not found in script:\n"${OLD_LINE_TEXT}"`)
  }
  const newScript = story.script.replace(OLD_LINE_TEXT, NEW_LINE_TEXT)
  const { error: updateErr } = await sb.from('stories')
    .update({ script: newScript }).eq('id', STORY_ID)
  if (updateErr) throw new Error('Script update: ' + updateErr.message)
  console.log('  ✅ Script updated: "We ran" → "Lena ran"')

  // ── Step 6: Content keys ──────────────────────────────────────────────────
  console.log('\nStep 6: Computing content keys...')
  const oldKey = makeVoiceContentKey('MARA', OLD_LINE_TEXT, MARA_VOICE_ID, MARA_SETTINGS, MARA_MODEL)
  const newKey = makeVoiceContentKey('MARA', NEW_LINE_TEXT, MARA_VOICE_ID, MARA_SETTINGS, MARA_MODEL)
  console.log(`  Old key: ${oldKey}`)
  console.log(`  New key: ${newKey}`)
  if (!manifest.voice_segments[oldKey]) {
    console.warn(`  ⚠️  Old key not in manifest — may have been rotated. Proceeding anyway.`)
  } else {
    console.log('  ✅ Old key confirmed in manifest')
  }

  // ── Step 7: Regenerate segment_0030.mp3 ──────────────────────────────────
  console.log('\nStep 7: Regenerating segment_0030.mp3 via ElevenLabs...')
  let newSegBuf = await callElevenLabs(NEW_LINE_TEXT, MARA_VOICE_ID, MARA_SETTINGS, MARA_MODEL)
  console.log(`  Raw: ${newSegBuf.length} bytes`)

  // Silence trim
  newSegBuf = trimSilence(newSegBuf)
  console.log(`  After trim: ${newSegBuf.length} bytes`)

  // Loudness normalize
  newSegBuf = normalizeAudio(newSegBuf, 'normalize segment_0030')
  console.log(`  After normalize: ${newSegBuf.length} bytes`)

  const newSegSha = sha256hex(newSegBuf)
  console.log(`  sha256: ${newSegSha}`)

  // ── Step 8: Upload to voice-archive ──────────────────────────────────────
  console.log('\nStep 8: Uploading to voice-archive...')
  const archivePath = `asc3/${STORY_ID}/voice-archive/${newKey}.mp3`
  await storageUpload(archivePath, newSegBuf)
  console.log(`  ✅ voice-archive/${newKey}.mp3`)

  // ── Step 9: Upload as segment_0030.mp3 ───────────────────────────────────
  console.log('\nStep 9: Uploading segment_0030.mp3...')
  const segmentPath = `asc3/${STORY_ID}/segment_0030.mp3`
  await storageUpload(segmentPath, newSegBuf)
  console.log(`  ✅ segment_0030.mp3`)

  // ── Step 10: Update manifest voice_segments ───────────────────────────────
  console.log('\nStep 10: Updating manifest voice_segments...')
  // Remove old key, add new
  const updatedVoiceSegments = { ...manifest.voice_segments }
  if (updatedVoiceSegments[oldKey]) {
    delete updatedVoiceSegments[oldKey]
    console.log(`  Removed old key: ${oldKey}`)
  }
  updatedVoiceSegments[newKey] = {
    character: 'MARA',
    line_text: NEW_LINE_TEXT,
    voice_id: MARA_VOICE_ID,
    voice_settings: MARA_SETTINGS,
    model: MARA_MODEL,
    storage_path: archivePath,
    file_sha256: newSegSha,
    size_bytes: newSegBuf.length,
    approved: true,
    locked_revision: 'rev6',
    locked_at: new Date().toISOString(),
  }
  manifest.voice_segments = updatedVoiceSegments
  await saveManifest(manifest)
  console.log(`  ✅ Manifest updated — new key: ${newKey}`)

  // ── Step 11: Trigger render-final-mix ─────────────────────────────────────
  console.log('\nStep 11: Triggering render-final-mix...')
  const renderRes = await fetch('https://app.endless-tales.com/api/asc3/render-final-mix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: STORY_ID }),
  })
  const renderJson = await renderRes.json().catch(() => ({ raw: renderRes.status }))
  if (!renderRes.ok || !renderJson.success) {
    console.error('  ❌ render-final-mix failed:', JSON.stringify(renderJson).slice(0, 400))
    process.exit(1)
  }
  console.log('  ✅ render-final-mix complete')

  // ── Step 12: Fetch final mix URL ──────────────────────────────────────────
  console.log('\nStep 12: Fetching final mix URL...')
  const { data: updated } = await sb.from('stories')
    .select('story_audio_url').eq('id', STORY_ID).single()
  const finalMixUrl = `${BASE}/asc3/${STORY_ID}/final_mix.mp3`
  console.log(`  ✅ Final mix: ${finalMixUrl}`)

  console.log('\n=== PV2 rev6 COMPLETE ===')
  console.log('')
  console.log('Mix URL:', finalMixUrl)
  console.log('')
  console.log('Voice segments regenerated:')
  console.log('  • segment_0030.mp3 — MARA: "Lena ran beneath the park..."')
  console.log('    Old key:', oldKey)
  console.log('    New key:', newKey)
  console.log('')
  console.log('SFX cue inventory (in script order):')
  console.log('  1. sfx_0000.mp3  | ~0:00 | REEDY RIVER ROAR, CLOSE AND FORCEFUL, 2s         | locked: NO (generated rev4)')
  console.log('  2. sfx_0001.mp3  | ~0:03 | PURE SILENCE, 1s                                  | locked: NO (silence)')
  console.log('  3. sfx_0006.mp3  | ~0:24 | FOOTSTEPS ON WET STONE, APPROACHING + HUM + DRIP  | locked: YES → footsteps-lena-approved.mp3')
  console.log('  4. sfx_0022.mp3  | ~1:12 | MASSIVE IRON MILL BELL, 8s                        | locked: YES → bell-strike-r4.mp3')
  console.log('  5. sfx_0027.mp3  | ~2:00 | HEAVY WATER SPLASH, PERSON RUNNING INTO WATER     | locked: NO (generated rev4)')
  console.log('  6. sfx_0028.mp3  | ~2:01 | RAPID FOOTSTEPS RUNNING ON WET STONE              | locked: YES → footsteps-v2-approved.mp3')
  console.log('  7. sfx_0034.mp3  | ~2:18 | METALLIC LATCH CLICK + HEAVY IRON DOOR OVER STONE | locked: YES → door-latch-r4.mp3')
  console.log('  8. sfx_0043.mp3  | ~3:20 | SINGLE GUNSHOT, SHARP CRACK, BRICK CHAMBER        | locked: YES → gunshot-v3-approved.mp3')
  console.log('')
  console.log('Locked SFX cue sha256:')
  console.log(`  footsteps-lena-approved.mp3: ${footstepsSha}`)
  console.log('')
  console.log('Story URL:', `https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3/${STORY_ID}/final_mix.mp3`)
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message || e)
  process.exit(1)
})
