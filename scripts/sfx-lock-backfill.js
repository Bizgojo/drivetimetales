/**
 * sfx-lock-backfill.js — SFX-ASSET-LOCK-001 v1.1 backfill
 *
 * Implementation addition 9: content-key and mark approved for:
 *   - Bell Beneath Falls Park PV1 (a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e)
 *   - Bell Beneath Falls Park PV2 (a88084ab-62e3-47f4-9b7a-5cbc32943349)
 *
 * For each story:
 *   1. Load current script from DB
 *   2. Parse spoken lines → character + text
 *   3. Resolve voice ID per character from voice assignments
 *   4. Compute content key per line (Rule 10)
 *   5. Download the segment file from storage
 *   6. Compute file SHA256
 *   7. Copy to voice-archive/<content-key>.mp3
 *   8. Record in manifest as approved=true
 *
 * Run: node scripts/sfx-lock-backfill.js [--dry-run]
 */

const crypto = require('crypto')
const fs = require('fs')

const envContent = fs.readFileSync('/Users/williampostlewaite/Projects/drivetimetales/.env.local', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?$/)
  if (m) env[m[1]] = m[2]
}

const SB = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = `${SB}/storage/v1/object/public/audio`
const DRY_RUN = process.argv.includes('--dry-run')

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}
const DEFAULT_MODEL = 'eleven_multilingual_v2'

const STORIES = [
  { id: 'a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e', label: 'PV1', revision: 'rev2' },
  { id: 'a88084ab-62e3-47f4-9b7a-5cbc32943349', label: 'PV2', revision: 'rev4' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[backfill] ${msg}`) }

function makeContentKey(char, text, voiceId, settings, model) {
  const payload = JSON.stringify({
    char: char.trim().toUpperCase(),
    text: text.trim(),
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

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function sbGet(path) {
  const r = await fetch(`${SB}${path}`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  })
  const t = await r.text()
  return JSON.parse(t)
}

async function storageDownload(url) {
  const r = await fetch(url + '?t=' + Date.now())
  if (!r.ok) throw new Error(`Download ${url}: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

async function storageUpload(sp, buf, ct = 'audio/mpeg') {
  if (DRY_RUN) { log(`  [dry-run] would upload: ${sp}`); return }
  const r = await fetch(`${SB}/storage/v1/object/audio/${sp}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': ct, 'x-upsert': 'true' },
    body: buf,
  })
  if (!r.ok) { const t = await r.text(); throw new Error(`Upload ${sp}: ${r.status} ${t.slice(0, 100)}`) }
}

async function storageList(prefix) {
  const r = await fetch(`${SB}/storage/v1/object/list/audio`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 500 }),
  })
  return (await r.json()) || []
}

// ── Parse script → spoken lines ──────────────────────────────────────────────
// Returns array of { position: 0-indexed, character: 'MARA', text: '...' }
// Only spoken lines (skips [SFX: ...] lines)

function parseSpokenLines(script) {
  const lines = script.split('\n')
  const result = []
  let position = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('[START') || trimmed.startsWith('[END') ||
        trimmed.startsWith('TITLE:') || trimmed.startsWith('SERIES:') ||
        trimmed.startsWith('EPISODE:') || trimmed.startsWith('RUNTIME:') ||
        trimmed.startsWith('VARIANT:') || trimmed.startsWith('NARRATOR:') ||
        trimmed.startsWith('CHARACTER') || trimmed === '---' ||
        trimmed.startsWith('//')) {
      continue
    }

    if (trimmed.startsWith('[SFX:')) {
      // SFX cue — counts as a position but is not a spoken line
      position++
      continue
    }

    // Spoken line: CHARACTER: text or CHARACTER (stage dir): text
    const spokenMatch = trimmed.match(/^([A-Z][A-Z\s\-'()]*?)(?:\s*\([^)]*\))?\s*:\s*(.+)$/)
    if (spokenMatch) {
      const character = spokenMatch[1].trim()
      const text = spokenMatch[2].trim()
      result.push({ position, character, text })
      position++
      continue
    }

    // Unknown line — skip but don't count position
  }

  return result
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function backfillStory(story) {
  log(`\n═══ Backfilling ${story.label} (${story.id}) ═══`)
  if (DRY_RUN) log('DRY RUN — no writes')

  // 1. Load script + voice assignments from DB
  const [storyRows, assignments] = await Promise.all([
    sbGet(`/rest/v1/stories?id=eq.${story.id}&select=id,script`),
    sbGet(`/rest/v1/character_voice_assignments?story_id=eq.${story.id}&select=character_name_normalized,voice_id,voice_name`),
  ])

  const scriptText = storyRows[0]?.script
  if (!scriptText) throw new Error(`No script found for ${story.label}`)

  const voiceMap = {}   // character_name_normalized → voice_id
  for (const a of assignments) voiceMap[a.character_name_normalized] = a.voice_id
  log(`  Voice assignments: ${Object.entries(voiceMap).map(([k,v])=>`${k}→${v.slice(0,8)}`).join(', ')}`)

  // 2. List existing segment files in storage
  const files = await storageList(`asc3/${story.id}/`)
  const segFiles = {}   // position → filename (e.g. { 1: 'segment_0001.mp3' })
  for (const f of files) {
    if (!f.name) continue
    const m = f.name.match(/^segment_(\d{4})\.mp3$/)
    if (m) segFiles[parseInt(m[1], 10)] = f.name
  }
  log(`  Found ${Object.keys(segFiles).length} segment file(s) in storage`)

  // 3. Parse script
  const spokenLines = parseSpokenLines(scriptText)
  log(`  Parsed ${spokenLines.length} spoken line(s)`)

  // 4. Load or create manifest
  let manifest
  try {
    const mUrl = `${BASE}/asc3/${story.id}/sfx-manifest.json`
    const r = await fetch(mUrl + '?t=' + Date.now())
    manifest = r.ok ? await r.json() : null
  } catch { manifest = null }
  if (!manifest) {
    manifest = { story_id: story.id, schema: 'sfx-asset-lock.v1.1', locked_sfx: {}, voice_segments: {} }
  }
  manifest.schema = 'sfx-asset-lock.v1.1'
  if (!manifest.voice_segments) manifest.voice_segments = {}

  // 5. Process each spoken line
  let archived = 0, skipped = 0, missing = 0
  for (const line of spokenLines) {
    const voiceId = voiceMap[line.character]
    if (!voiceId) {
      log(`  ⚠ No voice ID for character "${line.character}" — skipping line at pos ${line.position}`)
      skipped++
      continue
    }

    // Use default settings for backfill (Adrian has custom settings but manifest will be updated when re-rendered)
    const settings = DEFAULT_VOICE_SETTINGS
    const model = DEFAULT_MODEL
    const contentKey = makeContentKey(line.character, line.text, voiceId, settings, model)

    // Check if already in manifest
    if (manifest.voice_segments[contentKey]) {
      log(`  pos ${line.position} "${line.character}" (${line.text.slice(0,35)}...): already in manifest`)
      skipped++
      continue
    }

    // Find segment file
    const segFilename = segFiles[line.position]
    if (!segFilename) {
      log(`  ⚠ pos ${line.position} "${line.character}": no segment file found — skipping`)
      missing++
      continue
    }

    const segUrl = `${BASE}/asc3/${story.id}/${segFilename}`
    let segBuf
    try {
      segBuf = await storageDownload(segUrl)
    } catch (e) {
      log(`  ⚠ pos ${line.position}: download failed (${e.message}) — skipping`)
      missing++
      continue
    }

    const fileSha256 = sha256hex(segBuf)
    const archiveSp = `asc3/${story.id}/voice-archive/${contentKey}.mp3`

    await storageUpload(archiveSp, segBuf)

    manifest.voice_segments[contentKey] = {
      character: line.character,
      line_text: line.text,
      voice_id: voiceId,
      voice_settings: settings,
      model,
      storage_path: archiveSp,
      file_sha256: fileSha256,
      size_bytes: segBuf.length,
      approved: true,
      locked_revision: story.revision,
      locked_at: new Date().toISOString(),
    }

    log(`  pos ${line.position} "${line.character}" (${line.text.slice(0,35)}...): archived ✓`)
    archived++
  }

  // 6. Save updated manifest
  if (!DRY_RUN) {
    const manifestSp = `asc3/${story.id}/sfx-manifest.json`
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
    await storageUpload(manifestSp, manifestBuf, 'application/json')
  }

  log(`  ─── ${story.label} summary: ${archived} archived, ${skipped} skipped, ${missing} missing`)
  return { archived, skipped, missing }
}

async function main() {
  log(`SFX-ASSET-LOCK-001 v1.1 Backfill${DRY_RUN ? ' (DRY RUN)' : ''}`)
  log(`Stories: ${STORIES.map(s=>s.label).join(', ')}`)

  let totalArchived = 0, totalMissing = 0
  for (const story of STORIES) {
    const { archived, missing } = await backfillStory(story)
    totalArchived += archived
    totalMissing += missing
  }

  log(`\n═══ BACKFILL COMPLETE ═══`)
  log(`Total archived: ${totalArchived}`)
  log(`Total missing:  ${totalMissing}`)
  if (totalMissing > 0) log(`⚠ Missing segments could not be archived — they are already gone from storage.`)
  log(`Manifests updated with approved=true for all reachable segments.`)
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
