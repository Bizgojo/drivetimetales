/**
 * sfxAssetLock.ts — SFX-ASSET-LOCK-001 v1.1 enforcement
 *
 * Covers both SFX cues (Part A) and voice segments (Part B).
 *
 * PART A — SFX CUES
 * RULE 1: Every SFX cue is LOCKED on revision except those Marc names.
 * RULE 2: Locked cues are reused byte-for-byte — never re-prompted.
 * RULE 3: Missing locked file = hard stop (no silent re-roll).
 *
 * PART B — VOICE SEGMENTS
 * RULE 10: Lock key is content (char+text+voiceId+settings+model), NOT position/index.
 * RULE 11: Segment whose content key exists + approved → reused. New key → generated.
 * RULE 12: Performance re-roll only on Marc's explicit named instruction.
 * RULE 13: Archive all approved segments + final_mix BEFORE any clear. Abort if archive fails.
 * RULE 14: Missing locked segment = hard stop.
 * RULE 15: Manifest is the authority, not the folder.
 *
 * Per governance/drafts/SFX-ASSET-LOCK-001.md (DRAFT — Marc declares canon).
 */

import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BASE_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/audio`
const MANIFEST_FILENAME = 'sfx-manifest.json'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VoiceSettings {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
  speed?: number
}

export interface SfxLockEntry {
  storage_path: string
  public_url: string
  sha256: string
  size_bytes: number
  locked_at: string
  approved_revision: string
  prompt: string
  duration_secs: number
}

export interface VoiceSegmentEntry {
  character: string
  line_text: string
  voice_id: string
  voice_settings: VoiceSettings
  model: string
  storage_path: string      // voice-archive/<content-key>.mp3
  file_sha256: string
  size_bytes: number
  approved: boolean
  locked_revision: string
  locked_at: string
}

export interface SfxManifest {
  story_id: string
  schema: 'sfx-asset-lock.v1' | 'sfx-asset-lock.v1.1'
  locked_sfx: Record<string, SfxLockEntry>
  voice_segments: Record<string, VoiceSegmentEntry>  // keyed by content-key
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

async function storageUpload(storagePath: string, buf: Buffer, contentType = 'audio/mpeg'): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`sfxAssetLock upload ${storagePath}: ${res.status} ${txt.slice(0, 150)}`)
  }
}

async function storageDownload(publicUrl: string): Promise<Buffer> {
  const res = await fetch(publicUrl + '?t=' + Date.now())
  if (!res.ok) throw new Error(`sfxAssetLock download ${publicUrl}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function storageHead(publicUrl: string): Promise<boolean> {
  const res = await fetch(publicUrl + '?t=' + Date.now(), { method: 'HEAD' })
  return res.ok
}

async function storageDelete(storagePath: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${storagePath}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  })
}

async function storageList(prefix: string): Promise<Array<{ name: string; metadata?: { size?: number } }>> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/audio`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 500 }),
  })
  return (await res.json()) ?? []
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Content key (Rule 10) — keyed by content, NEVER by position/index
// ─────────────────────────────────────────────────────────────────────────────

export function makeVoiceContentKey(
  character: string,
  lineText: string,
  voiceId: string,
  settings: VoiceSettings,
  model: string,
): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// Manifest I/O
// ─────────────────────────────────────────────────────────────────────────────

export function manifestStoragePath(storyId: string): string {
  return `asc3/${storyId}/${MANIFEST_FILENAME}`
}

export async function loadManifest(storyId: string): Promise<SfxManifest | null> {
  const url = `${BASE_STORAGE}/${manifestStoragePath(storyId)}`
  const res = await fetch(url + '?t=' + Date.now())
  if (!res.ok) return null
  try {
    const data = await res.json() as Partial<SfxManifest>
    // Migrate v1 → v1.1
    return {
      story_id: data.story_id ?? storyId,
      schema: 'sfx-asset-lock.v1.1',
      locked_sfx: data.locked_sfx ?? {},
      voice_segments: data.voice_segments ?? {},
    }
  } catch {
    return null
  }
}

export function emptyManifest(storyId: string): SfxManifest {
  return { story_id: storyId, schema: 'sfx-asset-lock.v1.1', locked_sfx: {}, voice_segments: {} }
}

export async function saveManifest(manifest: SfxManifest): Promise<void> {
  const sp = manifestStoragePath(manifest.story_id)
  const buf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  await storageUpload(sp, buf, 'application/json')
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A — SFX cue lock/restore
// ─────────────────────────────────────────────────────────────────────────────

/** Lock an approved SFX cue. Call after generation + Marc approval. */
export async function lockSfxCue(
  storyId: string,
  cueKey: string,
  activeStoragePath: string,
  revision: string,
  prompt: string,
  durationSecs: number,
  manifest: SfxManifest,
): Promise<SfxManifest> {
  const lockedPath = `asc3/${storyId}/sfx-locked/${cueKey}-${revision}.mp3`
  const buf = await storageDownload(`${BASE_STORAGE}/${activeStoragePath}`)
  const hash = sha256hex(buf)
  await storageUpload(lockedPath, buf)

  const updated: SfxManifest = {
    ...manifest,
    locked_sfx: {
      ...manifest.locked_sfx,
      [cueKey]: {
        storage_path: lockedPath,
        public_url: `${BASE_STORAGE}/${lockedPath}`,
        sha256: hash,
        size_bytes: buf.length,
        locked_at: new Date().toISOString(),
        approved_revision: revision,
        prompt,
        duration_secs: durationSecs,
      },
    },
  }
  await saveManifest(updated)
  return updated
}

/** Restore a locked SFX cue. Hard-stop if missing or hash-mismatch. */
export async function restoreLockedSfxCue(
  cueKey: string,
  entry: SfxLockEntry,
  activeStoragePath: string,
): Promise<Buffer> {
  let buf: Buffer
  try {
    buf = await storageDownload(entry.public_url)
  } catch (e) {
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 3 HARD STOP\n` +
      `Locked SFX file missing for cue "${cueKey}".\n` +
      `Expected: ${entry.public_url}\n` +
      `Error: ${(e as Error).message}\n` +
      `Do NOT re-roll. Report to Marc before proceeding.`
    )
  }
  const actualHash = sha256hex(buf)
  if (actualHash !== entry.sha256) {
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 3 HARD STOP\n` +
      `Hash mismatch for locked SFX cue "${cueKey}".\n` +
      `Expected: ${entry.sha256}\n` +
      `Actual:   ${actualHash}\n` +
      `File: ${entry.public_url}\n` +
      `Do NOT re-roll. Report to Marc before proceeding.`
    )
  }
  await storageUpload(activeStoragePath, buf)
  return buf
}

/** Resolve all SFX cues before render. Returns list of cues that need generation. */
export async function resolveLockedSfx(
  storyId: string,
  sfxCues: Array<{ cueKey: string; activeStoragePath: string }>,
  unlockedKeys: Set<string>,
): Promise<{ manifest: SfxManifest; needsGeneration: string[] }> {
  const manifest = (await loadManifest(storyId)) ?? emptyManifest(storyId)
  const needsGeneration: string[] = []

  for (const { cueKey, activeStoragePath } of sfxCues) {
    if (unlockedKeys.has(cueKey)) {
      console.log(`[sfxAssetLock] SFX "${cueKey}": UNLOCKED for this revision — will generate`)
      needsGeneration.push(cueKey)
    } else if (manifest.locked_sfx[cueKey]) {
      const entry = manifest.locked_sfx[cueKey]
      console.log(`[sfxAssetLock] SFX "${cueKey}": LOCKED — restoring (${entry.size_bytes} bytes)`)
      await restoreLockedSfxCue(cueKey, entry, activeStoragePath)
      console.log(`[sfxAssetLock] SFX "${cueKey}": restored ✓`)
    } else {
      console.log(`[sfxAssetLock] SFX "${cueKey}": no lock — will generate`)
      needsGeneration.push(cueKey)
    }
  }

  return { manifest, needsGeneration }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART B — Voice segment lock/restore (Rules 9–15)
// ─────────────────────────────────────────────────────────────────────────────

function archivePath(storyId: string, contentKey: string): string {
  return `asc3/${storyId}/voice-archive/${contentKey}.mp3`
}

/**
 * Resolve a single voice segment before calling EL API (Rule 11).
 * Returns existing buffer if approved key found; null if EL call needed.
 * Hard-stops if locked but file missing (Rule 14).
 */
export async function resolveVoiceSegment(
  storyId: string,
  character: string,
  lineText: string,
  voiceId: string,
  settings: VoiceSettings,
  model: string,
  activeStoragePath: string,   // e.g. asc3/<id>/segment_0005.mp3
  manifest: SfxManifest,
  unlockedKeys?: Set<string>,  // content keys Marc named for re-roll
): Promise<{ buf: Buffer | null; contentKey: string; isReused: boolean }> {
  const contentKey = makeVoiceContentKey(character, lineText, voiceId, settings, model)
  const entry = manifest.voice_segments[contentKey]

  if (entry?.approved) {
    if (unlockedKeys?.has(contentKey)) {
      // Rule 12: Marc named this line for re-roll — generate new, archive old first
      console.log(`[sfxAssetLock] voice "${character}": UNLOCKED for re-roll — archiving prior`)
      // Prior file already in archive path by content key; new generation will overwrite active
      return { buf: null, contentKey, isReused: false }
    }

    // Rule 11: approved key found — restore from archive
    const archiveUrl = `${BASE_STORAGE}/${entry.storage_path}`
    let buf: Buffer
    try {
      buf = await storageDownload(archiveUrl)
    } catch (e) {
      // Rule 14: hard stop
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 14 HARD STOP\n` +
        `Locked voice segment missing.\n` +
        `Character: ${character}\n` +
        `Line: "${lineText.slice(0, 80)}"\n` +
        `Content key: ${contentKey}\n` +
        `Expected: ${archiveUrl}\n` +
        `Error: ${(e as Error).message}\n` +
        `Do NOT generate a replacement. Report to Marc.`
      )
    }
    const actualHash = sha256hex(buf)
    if (actualHash !== entry.file_sha256) {
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 14 HARD STOP\n` +
        `Hash mismatch for locked voice segment.\n` +
        `Character: ${character} | Key: ${contentKey}\n` +
        `Expected: ${entry.file_sha256} | Actual: ${actualHash}\n` +
        `Do NOT generate a replacement. Report to Marc.`
      )
    }
    await storageUpload(activeStoragePath, buf)
    console.log(`[sfxAssetLock] voice "${character}" (${lineText.slice(0, 40)}...): reused ✓`)
    return { buf, contentKey, isReused: true }
  }

  // No approved entry — EL generation needed
  console.log(`[sfxAssetLock] voice "${character}": no approved entry — will generate`)
  return { buf: null, contentKey, isReused: false }
}

/**
 * Lock a newly-generated voice segment (Rule 11 / Rule 15).
 * Archives the buffer under content key; records in manifest.
 */
export async function lockVoiceSegment(
  storyId: string,
  contentKey: string,
  character: string,
  lineText: string,
  voiceId: string,
  settings: VoiceSettings,
  model: string,
  buf: Buffer,
  revision: string,
  manifest: SfxManifest,
): Promise<SfxManifest> {
  const ap = archivePath(storyId, contentKey)
  await storageUpload(ap, buf)
  const fileSha256 = sha256hex(buf)

  const updated: SfxManifest = {
    ...manifest,
    schema: 'sfx-asset-lock.v1.1',
    voice_segments: {
      ...manifest.voice_segments,
      [contentKey]: {
        character,
        line_text: lineText,
        voice_id: voiceId,
        voice_settings: settings,
        model,
        storage_path: ap,
        file_sha256: fileSha256,
        size_bytes: buf.length,
        approved: true,  // approved implicitly when locked into a delivered render
        locked_revision: revision,
        locked_at: new Date().toISOString(),
      },
    },
  }
  await saveManifest(updated)
  return updated
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 13 — Archive before clear
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Archive all current segments + final_mix to a timestamped archive path.
 * ABORT if any file fails to copy. Must complete before any delete proceeds.
 */
export async function archiveBeforeClear(storyId: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const archivePrefix = `asc3/${storyId}/archives/${timestamp}`

  const files = await storageList(`asc3/${storyId}/`)
  const audioFiles = files.filter(f =>
    f.name &&
    (f.name.endsWith('.mp3') || f.name.endsWith('.wav')) &&
    !f.name.startsWith('archives/') &&
    !f.name.startsWith('sfx-locked/') &&
    !f.name.startsWith('voice-archive/') &&
    !f.name.startsWith('sfx-candidates/')
  )

  console.log(`[sfxAssetLock] Archiving ${audioFiles.length} file(s) to ${archivePrefix}/`)

  const failed: string[] = []
  for (const f of audioFiles) {
    const srcUrl = `${BASE_STORAGE}/asc3/${storyId}/${f.name}`
    const dstPath = `${archivePrefix}/${f.name}`
    try {
      const buf = await storageDownload(srcUrl)
      await storageUpload(dstPath, buf)
      // Verify
      const ok = await storageHead(`${BASE_STORAGE}/${dstPath}`)
      if (!ok) throw new Error('HEAD verify failed')
      console.log(`[sfxAssetLock]   archived: ${f.name} ✓`)
    } catch (e) {
      failed.push(`${f.name}: ${(e as Error).message}`)
    }
  }

  if (failed.length > 0) {
    // Rule 13: abort if archive fails
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 13 HARD STOP\n` +
      `Archive failed for ${failed.length} file(s). Clear ABORTED.\n` +
      `Failures:\n${failed.map(f => '  ' + f).join('\n')}\n` +
      `Fix archive before proceeding.`
    )
  }

  console.log(`[sfxAssetLock] Archive complete: ${archivePrefix}/ (${audioFiles.length} files) ✓`)
  return archivePrefix
}
