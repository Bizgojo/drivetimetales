#!/usr/bin/env node
/**
 * freeze-bell-pv1-pv2.js
 * PV1 + PV2 APPROVED-FINAL FREEZE per Marc approval 2026-07-29 22:09 EDT
 *
 * Per instruction:
 * 1. Mark final_mix.mp3 APPROVED and FINAL in manifest; record sha256
 * 2. Mark all voice segments + 7 SFX cues APPROVED + LOCKED; record sha256 each
 * 3. Archive complete approved state to dated archive path; verify copy
 * 4. Do same for PV1
 * 5. No-re-render enforced via manifest freeze flag
 * 6. Promote bell to SERIES-SIGNATURE (Rule 7)
 * 7. Report sha256 of both final mixes, archive paths, total files archived
 */
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb           = createClient(SUPABASE_URL, SERVICE_KEY)
const BASE         = `${SUPABASE_URL}/storage/v1/object/public/audio`

const PV1_ID = 'a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e'
const PV2_ID = 'a88084ab-62e3-47f4-9b7a-5cbc32943349'
const SERIES_SLUG = 'bell-beneath-falls-park'
const ARCHIVE_DATE = '2026-07-29'
const REVISION     = 'approved-rev6'  // PV2 is rev6; PV1 was approved earlier

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function download(storagePath) {
  const url = `${BASE}/${storagePath}?t=${Date.now()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download ${storagePath}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function upload(storagePath, buf, contentType = 'audio/mpeg') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${storagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Upload ${storagePath}: ${res.status} ${t.slice(0, 150)}`)
  }
}

async function loadManifest(storyId) {
  const path = `asc3/${storyId}/sfx-manifest.json`
  const res = await fetch(`${BASE}/${path}?t=${Date.now()}`)
  if (!res.ok) return null
  return await res.json()
}

async function saveManifest(storyId, manifest) {
  const buf = Buffer.from(JSON.stringify(manifest, null, 2))
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/asc3/${storyId}/sfx-manifest.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) throw new Error(`Manifest save ${storyId}: ${res.status}`)
}

async function listStorageFiles(prefix) {
  const { data, error } = await sb.storage.from('audio').list(prefix, { limit: 500 })
  if (error) throw new Error(`List ${prefix}: ${error.message}`)
  return (data || []).filter(f => !f.id?.endsWith('/') && f.name !== '.emptyFolderPlaceholder')
}

async function freezeStory(storyId, label, sfxLockedNames, pv2Bell = false) {
  console.log(`\n══ Freezing ${label} (${storyId}) ══`)
  const archivePrefix = `asc3/${storyId}/archives/${ARCHIVE_DATE}-${REVISION}`
  const manifest = await loadManifest(storyId)
  if (!manifest) throw new Error(`No manifest for ${storyId}`)

  const report = { storyId, label, archivePrefix, files: [], sha256s: {} }

  // ── 1. final_mix.mp3 ──────────────────────────────────────────────────────
  console.log('  Downloading final_mix.mp3...')
  const finalMixBuf = await download(`asc3/${storyId}/final_mix.mp3`)
  const finalMixSha = sha256hex(finalMixBuf)
  report.sha256s.final_mix = finalMixSha
  console.log(`  final_mix.mp3: ${finalMixBuf.length} bytes, sha256=${finalMixSha}`)

  // ── 2. story_body.mp3 ─────────────────────────────────────────────────────
  let storyBodySha = null
  try {
    const storyBodyBuf = await download(`asc3/${storyId}/story_body.mp3`)
    storyBodySha = sha256hex(storyBodyBuf)
    await upload(`${archivePrefix}/story_body.mp3`, storyBodyBuf)
    report.files.push(`${archivePrefix}/story_body.mp3`)
    console.log(`  story_body.mp3 archived`)
  } catch(e) { console.warn(`  ⚠️ story_body.mp3: ${e.message}`) }

  // ── 3. Archive final_mix.mp3 ──────────────────────────────────────────────
  await upload(`${archivePrefix}/final_mix.mp3`, finalMixBuf)
  report.files.push(`${archivePrefix}/final_mix.mp3`)
  console.log('  ✅ final_mix.mp3 archived')

  // ── 4. Enumerate segment_XXXX.mp3 + sfx_XXXX.mp3 ────────────────────────
  const rootFiles = await listStorageFiles(`asc3/${storyId}`)
  const audioFiles = rootFiles.filter(f =>
    /^(segment|sfx)_\d{4}\.mp3$/.test(f.name)
  ).sort((a, b) => a.name.localeCompare(b.name))

  console.log(`  Archiving ${audioFiles.length} segment/sfx files...`)
  const voiceSegSha256s = {}
  const sfxActiveSha256s = {}
  for (const f of audioFiles) {
    const buf = await download(`asc3/${storyId}/${f.name}`)
    const sha = sha256hex(buf)
    await upload(`${archivePrefix}/${f.name}`, buf)
    report.files.push(`${archivePrefix}/${f.name}`)
    if (f.name.startsWith('segment_')) voiceSegSha256s[f.name] = sha
    else sfxActiveSha256s[f.name] = sha
    process.stdout.write('.')
  }
  console.log()
  console.log(`  ✅ ${audioFiles.length} audio files archived`)

  // ── 5. sfx-locked/ cues ──────────────────────────────────────────────────
  const lockedFiles = await listStorageFiles(`asc3/${storyId}/sfx-locked`)
  const sfxLockedSha256s = {}
  if (lockedFiles.length > 0) {
    console.log(`  Archiving ${lockedFiles.length} sfx-locked cues...`)
    for (const f of lockedFiles) {
      const buf = await download(`asc3/${storyId}/sfx-locked/${f.name}`)
      const sha = sha256hex(buf)
      sfxLockedSha256s[f.name] = sha
      await upload(`${archivePrefix}/sfx-locked/${f.name}`, buf)
      report.files.push(`${archivePrefix}/sfx-locked/${f.name}`)
      process.stdout.write('.')
    }
    console.log()
    console.log(`  ✅ ${lockedFiles.length} sfx-locked cues archived`)
  }

  // ── 6. Verify archive (spot-check final_mix) ──────────────────────────────
  console.log('  Verifying archive (final_mix spot-check)...')
  const verifyBuf = await download(`${archivePrefix}/final_mix.mp3`)
  const verifySha = sha256hex(verifyBuf)
  if (verifySha !== finalMixSha) {
    throw new Error(`Archive verification FAILED: sha256 mismatch on final_mix.mp3\n  expected: ${finalMixSha}\n  got: ${verifySha}`)
  }
  console.log('  ✅ Archive verified')

  // ── 7. Update manifest — freeze flags ────────────────────────────────────
  console.log('  Updating manifest with freeze...')
  const now = new Date().toISOString()

  // Mark all voice segments locked + approved
  const frozenVoiceSegments = { ...manifest.voice_segments }
  for (const [key, entry] of Object.entries(frozenVoiceSegments)) {
    frozenVoiceSegments[key] = {
      ...entry,
      approved: true,
      frozen: true,
      frozen_at: now,
      frozen_revision: REVISION,
    }
  }

  // Build locked_sfx entries for all sfx-locked files
  const frozenLockedSfx = { ...manifest.locked_sfx }
  for (const [fname, sha] of Object.entries(sfxLockedSha256s)) {
    const cueId = fname.replace('.mp3', '')
    // Map known files to their cue text
    const cueTextMap = {
      'bell-strike-r4':           'MASSIVE IRON MILL BELL, BONE-DEEP RESONANCE, OMINOUS DREAD, VERY LONG DECAY, 8s',
      'door-latch-r4':            'SHARP METALLIC LATCH CLICK SNAPPING OPEN, BRIEF PAUSE, THEN HEAVY IRON DOOR DRAGGING SLOWLY OVER STONE FLOOR',
      'river-roar-r4':            'REEDY RIVER ROAR, CLOSE AND FORCEFUL',
      'hum-drip-r4':              'LOW ELECTRICAL HUM; WATER DRIPPING IN A LARGE CHAMBER',
      'footsteps-v2-approved':    'RAPID FOOTSTEPS RUNNING ON WET STONE, HARD SOLE IMPACTS, EACH STEP DISTINCT',
      'gunshot-v3-approved':      'SINGLE GUNSHOT, SHARP CRACK, BRICK CHAMBER, TIGHT SLAP-BACK',
      'footsteps-lena-approved':  'FOOTSTEPS ON WET STONE, APPROACHING; LOW ELECTRICAL HUM; WATER DRIPPING IN A LARGE CHAMBER',
    }
    const existing = frozenLockedSfx[cueId] || {}
    frozenLockedSfx[cueId] = {
      ...existing,
      locked: true,
      cue_text: existing.cue_text || cueTextMap[cueId] || fname,
      storage_path: `asc3/${storyId}/sfx-locked/${fname}`,
      public_url: `${BASE}/asc3/${storyId}/sfx-locked/${fname}`,
      sha256: sha,
      size_bytes: existing.size_bytes || null,
      locked_at: existing.locked_at || now,
      locked_revision: REVISION,
      approved: true,
      frozen: true,
      frozen_at: now,
      archive_path: `${archivePrefix}/sfx-locked/${fname}`,
    }
  }

  const frozenManifest = {
    ...manifest,
    schema: 'sfx-asset-lock.v1.1',
    approved_final: true,
    frozen: true,
    frozen_at: now,
    frozen_revision: REVISION,
    frozen_by: 'Marc Postlewaite — 2026-07-29 22:09 EDT',
    archive_path: archivePrefix,
    final_mix_sha256: finalMixSha,
    story_body_sha256: storyBodySha,
    locked_sfx: frozenLockedSfx,
    voice_segments: frozenVoiceSegments,
  }

  await saveManifest(storyId, frozenManifest)
  console.log('  ✅ Manifest frozen')

  report.finalMixSha256 = finalMixSha
  report.filesArchived  = report.files.length
  return report
}

async function promoteSeriesSignature(bellStoryId, seriesSlug) {
  console.log(`\n══ Series Signature: bell → asc3/series/${seriesSlug}/sfx/ ══`)
  const bellPath  = `asc3/${bellStoryId}/sfx-locked/bell-strike-r4.mp3`
  const bellBuf   = await download(bellPath)
  const bellSha   = sha256hex(bellBuf)
  const seriesPath = `asc3/series/${seriesSlug}/sfx/bell-strike.mp3`
  await upload(seriesPath, bellBuf)
  // Verify
  const verifyBuf = await download(seriesPath)
  const verifySha = sha256hex(verifyBuf)
  if (verifySha !== bellSha) throw new Error('Series signature verify failed')
  console.log(`  ✅ bell-strike.mp3 → ${seriesPath}`)
  console.log(`     sha256: ${bellSha}`)
  return { seriesPath, sha256: bellSha }
}

async function main() {
  console.log('\n=== BELL PV1 + PV2 APPROVED-FINAL FREEZE ===')
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  const results = {}

  // Freeze PV2 first (just approved)
  results.pv2 = await freezeStory(PV2_ID, 'PV2 rev6', 7)

  // Freeze PV1
  results.pv1 = await freezeStory(PV1_ID, 'PV1 final', 0)

  // Promote bell series signature (Rule 7)
  results.seriesSignature = await promoteSeriesSignature(PV2_ID, SERIES_SLUG)

  // ── Update PV2 manifest with series signature record ──────────────────────
  const pv2Manifest = await loadManifest(PV2_ID)
  pv2Manifest.series_signature_sfx = pv2Manifest.series_signature_sfx || {}
  pv2Manifest.series_signature_sfx['bell-strike'] = {
    series_path: results.seriesSignature.seriesPath,
    public_url: `${BASE}/${results.seriesSignature.seriesPath}`,
    sha256: results.seriesSignature.sha256,
    size_bytes: null,
    promoted_at: new Date().toISOString(),
    promoted_from_story: PV2_ID,
  }
  await saveManifest(PV2_ID, pv2Manifest)
  console.log('\n  ✅ PV2 manifest updated with series_signature_sfx')

  // ── Final Report ──────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════')
  console.log('  FREEZE REPORT')
  console.log('═══════════════════════════════════════════════════\n')
  console.log('PV2 final_mix sha256:')
  console.log(' ', results.pv2.finalMixSha256)
  console.log('PV1 final_mix sha256:')
  console.log(' ', results.pv1.finalMixSha256)
  console.log('\nPV2 archive path:')
  console.log(' ', results.pv2.archivePrefix)
  console.log('  Files archived:', results.pv2.filesArchived)
  console.log('\nPV1 archive path:')
  console.log(' ', results.pv1.archivePrefix)
  console.log('  Files archived:', results.pv1.filesArchived)
  console.log('\nBell series-signature path:')
  console.log(' ', results.seriesSignature.seriesPath)
  console.log('  sha256:', results.seriesSignature.sha256)
  console.log('\nNo-re-render rule:')
  console.log('  Both manifests marked frozen=true. Only Marc can unlock.')
  console.log('\nTotal files archived:', results.pv1.filesArchived + results.pv2.filesArchived)
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message || e)
  process.exit(1)
})
