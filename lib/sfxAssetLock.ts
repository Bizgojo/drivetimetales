/**
 * sfxAssetLock.ts — SFX-ASSET-LOCK-001 v1.1 enforcement
 *
 * PART A — SFX CUES (Rules 1–8)
 * RULE 1: Every SFX cue LOCKED on revision except Marc-named ones.
 * RULE 2: Locked cues reused byte-for-byte — never re-prompted.
 * RULE 3: Missing/hash-mismatch locked file = HARD STOP, abort, no replacement.
 * RULE 4: Clear/reset must SKIP locked assets, never delete them.
 * RULE 5: Only Marc unlocks. No agent self-unlocks or self-improves.
 * RULE 6: Manifest is authority; per cue: id, cue_text, path, sha256, locked, revision.
 * RULE 7: Series-signature cues promoted to series-level path, identical across episodes.
 * RULE 8: render-final-mix validates manifest before mix; abort on mismatch.
 *
 * PART B — VOICE SEGMENTS (Rules 9–15)
 * RULE 10: Lock key = sha256(char+text+voiceId+settings+model). Never position/index.
 * RULE 11: Existing approved key → reused. No key → generated.
 * RULE 12: Re-roll only on Marc's explicit instruction, prior archived, Marc chooses.
 * RULE 13: Archive all segments+final_mix BEFORE any clear. Abort if archive fails.
 * RULE 14: Missing/hash-mismatch locked segment = HARD STOP.
 * RULE 15: Manifest records per segment: key, char, text, voice, settings, model, path, sha256, approved, revision.
 *
 * Per governance/drafts/SFX-ASSET-LOCK-001.md v1.1 (DRAFT — Marc declares canon).
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

/** Rule 6 — SFX cue manifest entry */
export interface SfxLockEntry {
  locked: true
  cue_text: string           // script SFX line text (Rule 6: "script cue text")
  storage_path: string       // asc3/<story_id>/sfx-locked/<cue-id>-<rev>.mp3
  public_url: string
  sha256: string
  size_bytes: number
  locked_at: string
  locked_revision: string
  duration_secs: number
  series_signature: boolean  // Rule 7
}

/** Rule 7 — series-level signature asset */
export interface SeriesSignatureEntry {
  series_path: string        // asc3/series/<series-slug>/sfx/<cue-id>.mp3
  public_url: string
  sha256: string
  size_bytes: number
  promoted_at: string
  promoted_from_story: string
}

/** Rule 15 — voice segment manifest entry */
export interface VoiceSegmentEntry {
  character: string
  line_text: string
  voice_id: string
  voice_settings: VoiceSettings
  model: string
  storage_path: string       // voice-archive/<content-key>.mp3
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
  series_signature_sfx: Record<string, SeriesSignatureEntry>
  voice_segments: Record<string, VoiceSegmentEntry>
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

async function storageUpload(sp: string, buf: Buffer, ct = 'audio/mpeg'): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${sp}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': ct, 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`sfxAssetLock upload ${sp}: ${res.status} ${txt.slice(0, 150)}`)
  }
}

async function storageDownload(url: string): Promise<Buffer> {
  const res = await fetch(url + '?t=' + Date.now())
  if (!res.ok) throw new Error(`sfxAssetLock download ${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function storageHead(url: string): Promise<boolean> {
  const res = await fetch(url + '?t=' + Date.now(), { method: 'HEAD' })
  return res.ok
}

async function storageDelete(sp: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${sp}`, {
    method: 'DELETE', headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
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
    return {
      story_id: data.story_id ?? storyId,
      schema: 'sfx-asset-lock.v1.1',
      locked_sfx: data.locked_sfx ?? {},
      series_signature_sfx: data.series_signature_sfx ?? {},
      voice_segments: data.voice_segments ?? {},
    }
  } catch { return null }
}

export function emptyManifest(storyId: string): SfxManifest {
  return { story_id: storyId, schema: 'sfx-asset-lock.v1.1', locked_sfx: {}, series_signature_sfx: {}, voice_segments: {} }
}

export async function saveManifest(manifest: SfxManifest): Promise<void> {
  const buf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  await storageUpload(manifestStoragePath(manifest.story_id), buf, 'application/json')
}

// ─────────────────────────────────────────────────────────────────────────────
// Content key (Rule 10)
// ─────────────────────────────────────────────────────────────────────────────

export function makeVoiceContentKey(
  character: string, lineText: string, voiceId: string, settings: VoiceSettings, model: string,
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
// PART A — SFX
// ─────────────────────────────────────────────────────────────────────────────

/** Rule 1/2/6 — Lock an approved SFX cue. */
export async function lockSfxCue(
  storyId: string,
  cueId: string,
  cueText: string,
  activeStoragePath: string,
  revision: string,
  durationSecs: number,
  manifest: SfxManifest,
  isSeriesSignature = false,
): Promise<SfxManifest> {
  const lockedPath = `asc3/${storyId}/sfx-locked/${cueId}-${revision}.mp3`
  const buf = await storageDownload(`${BASE_STORAGE}/${activeStoragePath}`)
  const hash = sha256hex(buf)
  await storageUpload(lockedPath, buf)

  const entry: SfxLockEntry = {
    locked: true,
    cue_text: cueText,
    storage_path: lockedPath,
    public_url: `${BASE_STORAGE}/${lockedPath}`,
    sha256: hash,
    size_bytes: buf.length,
    locked_at: new Date().toISOString(),
    locked_revision: revision,
    duration_secs: durationSecs,
    series_signature: isSeriesSignature,
  }

  const updated: SfxManifest = { ...manifest, locked_sfx: { ...manifest.locked_sfx, [cueId]: entry } }
  await saveManifest(updated)
  return updated
}

/** Rule 3 — Restore locked SFX. Hard-stop if missing or hash-mismatch. */
export async function restoreLockedSfxCue(
  cueId: string, entry: SfxLockEntry, activeStoragePath: string,
): Promise<Buffer> {
  let buf: Buffer
  try {
    buf = await storageDownload(entry.public_url)
  } catch (e) {
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 3 HARD STOP — locked SFX file missing\n` +
      `Cue: "${cueId}" | Expected: ${entry.public_url}\n${(e as Error).message}\n` +
      `Render aborted. Do NOT generate a replacement. Report to Marc.`
    )
  }
  const actualHash = sha256hex(buf)
  if (actualHash !== entry.sha256) {
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 3 HARD STOP — hash mismatch\n` +
      `Cue: "${cueId}" | Expected: ${entry.sha256} | Actual: ${actualHash}\n` +
      `Render aborted. Do NOT generate a replacement. Report to Marc.`
    )
  }
  await storageUpload(activeStoragePath, buf)
  return buf
}

/** Rule 1/2 — Resolve all SFX before render. Returns cues needing generation. */
export async function resolveLockedSfx(
  storyId: string,
  sfxCues: Array<{ cueId: string; cueText: string; activeStoragePath: string }>,
  unlockedKeys: Set<string>,
): Promise<{ manifest: SfxManifest; needsGeneration: string[] }> {
  const manifest = (await loadManifest(storyId)) ?? emptyManifest(storyId)
  const needsGeneration: string[] = []

  for (const { cueId, activeStoragePath } of sfxCues) {
    if (unlockedKeys.has(cueId)) {
      console.log(`[sfxAssetLock] SFX "${cueId}": UNLOCKED for this revision — will generate`)
      needsGeneration.push(cueId)
    } else if (manifest.locked_sfx[cueId]) {
      const entry = manifest.locked_sfx[cueId]
      console.log(`[sfxAssetLock] SFX "${cueId}": LOCKED — restoring (${entry.size_bytes}b)`)
      await restoreLockedSfxCue(cueId, entry, activeStoragePath)
      console.log(`[sfxAssetLock] SFX "${cueId}": restored ✓`)
    } else {
      console.log(`[sfxAssetLock] SFX "${cueId}": no lock — will generate`)
      needsGeneration.push(cueId)
    }
  }

  return { manifest, needsGeneration }
}

/**
 * Rule 4 — Clear story audio SKIPPING locked assets.
 * Deletes non-locked segment/sfx files; never touches sfx-locked/, voice-archive/, archives/.
 * Locked SFX files (in manifest.locked_sfx) are also preserved at their active positions.
 */
export async function clearSkippingLocked(storyId: string, manifest: SfxManifest): Promise<{ deleted: string[]; skipped: string[] }> {
  const files = await storageList(`asc3/${storyId}/`)
  const deleted: string[] = []
  const skipped: string[] = []

  // Build set of locked file names (active positions)
  const lockedPaths = new Set<string>()
  for (const entry of Object.values(manifest.locked_sfx)) {
    // Mark the locked file path itself as immutable
    lockedPaths.add(entry.storage_path)
  }
  // Voice-archive and sfx-locked dirs are always immutable (Rule 4)
  const immutablePrefixes = ['sfx-locked/', 'voice-archive/', 'archives/', 'sfx-candidates/', MANIFEST_FILENAME]

  for (const f of files) {
    if (!f.name) continue
    const isImmutableDir = immutablePrefixes.some(p => f.name!.startsWith(p))
    const isLockedPath = lockedPaths.has(`asc3/${storyId}/${f.name}`)
    if (isImmutableDir || isLockedPath) {
      skipped.push(f.name)
      continue
    }
    if (f.name.endsWith('.mp3') || f.name.endsWith('.wav')) {
      await storageDelete(`asc3/${storyId}/${f.name}`)
      deleted.push(f.name)
    }
  }

  console.log(`[sfxAssetLock] clearSkippingLocked: ${deleted.length} deleted, ${skipped.length} preserved`)
  return { deleted, skipped }
}

/**
 * Rule 7 — Designate an SFX cue as a series-signature sound.
 * Copies to series-level path; every episode should reference this file.
 */
export async function designateSeriesSignature(
  storyId: string,
  cueId: string,
  seriesSlug: string,
  manifest: SfxManifest,
): Promise<SfxManifest> {
  const entry = manifest.locked_sfx[cueId]
  if (!entry) throw new Error(`sfxAssetLock: cue "${cueId}" not in manifest — lock it first`)

  const seriesPath = `asc3/series/${seriesSlug}/sfx/${cueId}.mp3`
  const buf = await storageDownload(entry.public_url)
  await storageUpload(seriesPath, buf)

  const sigEntry: SeriesSignatureEntry = {
    series_path: seriesPath,
    public_url: `${BASE_STORAGE}/${seriesPath}`,
    sha256: entry.sha256,
    size_bytes: entry.size_bytes,
    promoted_at: new Date().toISOString(),
    promoted_from_story: storyId,
  }

  const updatedEntry: SfxLockEntry = { ...entry, series_signature: true }
  const updated: SfxManifest = {
    ...manifest,
    locked_sfx: { ...manifest.locked_sfx, [cueId]: updatedEntry },
    series_signature_sfx: { ...manifest.series_signature_sfx, [cueId]: sigEntry },
  }
  await saveManifest(updated)
  console.log(`[sfxAssetLock] "${cueId}" promoted to series-signature: ${seriesPath}`)
  return updated
}

/**
 * Rule 8 — Manifest gate: validate all locked assets before render-final-mix.
 * Throws on first mismatch/missing file. Caller must invoke before mixing.
 */
export async function validateManifestGate(manifest: SfxManifest): Promise<void> {
  console.log(`[sfxAssetLock] Manifest gate: validating ${Object.keys(manifest.locked_sfx).length} locked SFX...`)

  for (const [cueId, entry] of Object.entries(manifest.locked_sfx)) {
    let buf: Buffer
    try {
      buf = await storageDownload(entry.public_url)
    } catch (e) {
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 8 GATE ABORT\n` +
        `Locked SFX missing at mix time: "${cueId}"\n` +
        `Expected: ${entry.public_url}\nRender aborted.`
      )
    }
    const actualHash = sha256hex(buf)
    if (actualHash !== entry.sha256) {
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 8 GATE ABORT\n` +
        `Hash mismatch at mix time: "${cueId}"\n` +
        `Expected: ${entry.sha256} | Actual: ${actualHash}\nRender aborted.`
      )
    }
  }

  console.log(`[sfxAssetLock] Manifest gate: all locked SFX verified ✓`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 13 — Archive before any clear
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule 13 — Archive current approved segments + final_mix before any clear.
 * Returns archive prefix on success. Hard-stops if any file fails to copy.
 */
export async function archiveBeforeClear(storyId: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const archivePrefix = `asc3/${storyId}/archives/${timestamp}`

  const files = await storageList(`asc3/${storyId}/`)
  const audioFiles = files.filter(f =>
    f.name && (f.name.endsWith('.mp3') || f.name.endsWith('.wav')) &&
    !f.name.startsWith('archives/') && !f.name.startsWith('sfx-locked/') &&
    !f.name.startsWith('voice-archive/') && !f.name.startsWith('sfx-candidates/')
  )

  console.log(`[sfxAssetLock] Rule 13: archiving ${audioFiles.length} file(s) → ${archivePrefix}/`)

  const failed: string[] = []
  for (const f of audioFiles) {
    const srcUrl = `${BASE_STORAGE}/asc3/${storyId}/${f.name}`
    const dstPath = `${archivePrefix}/${f.name}`
    try {
      const buf = await storageDownload(srcUrl)
      await storageUpload(dstPath, buf)
      if (!await storageHead(`${BASE_STORAGE}/${dstPath}`)) throw new Error('HEAD verify failed')
    } catch (e) { failed.push(`${f.name}: ${(e as Error).message}`) }
  }

  if (failed.length > 0) {
    throw new Error(
      `SFX-ASSET-LOCK-001 RULE 13 HARD STOP — archive failed\n` +
      `${failed.length} file(s) failed. Clear ABORTED.\n${failed.map(x => '  ' + x).join('\n')}`
    )
  }

  console.log(`[sfxAssetLock] Rule 13: archive complete (${audioFiles.length} files) ✓`)
  return archivePrefix
}

// ─────────────────────────────────────────────────────────────────────────────
// PART B — Voice segments (Rules 9–15)
// ─────────────────────────────────────────────────────────────────────────────

function voiceArchivePath(storyId: string, contentKey: string): string {
  return `asc3/${storyId}/voice-archive/${contentKey}.mp3`
}

/**
 * Rule 11/14 — Resolve a voice segment before EL call.
 * Returns existing buffer if approved; null if generation needed.
 * Hard-stops if locked but missing/hash-mismatch (Rule 14).
 */
export async function resolveVoiceSegment(
  storyId: string,
  character: string, lineText: string, voiceId: string, settings: VoiceSettings, model: string,
  activeStoragePath: string,
  manifest: SfxManifest,
  unlockedKeys?: Set<string>,
): Promise<{ buf: Buffer | null; contentKey: string; isReused: boolean }> {
  const contentKey = makeVoiceContentKey(character, lineText, voiceId, settings, model)
  const entry = manifest.voice_segments[contentKey]

  if (entry?.approved) {
    if (unlockedKeys?.has(contentKey)) {
      console.log(`[sfxAssetLock] voice "${character}": UNLOCKED for re-roll (Rule 12)`)
      return { buf: null, contentKey, isReused: false }
    }
    const archiveUrl = `${BASE_STORAGE}/${entry.storage_path}`
    let buf: Buffer
    try {
      buf = await storageDownload(archiveUrl)
    } catch (e) {
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 14 HARD STOP — locked segment missing\n` +
        `Character: ${character} | Key: ${contentKey}\nExpected: ${archiveUrl}\n` +
        `${(e as Error).message}\nRender aborted. Do NOT generate a replacement. Report to Marc.`
      )
    }
    const actualHash = sha256hex(buf)
    if (actualHash !== entry.file_sha256) {
      throw new Error(
        `SFX-ASSET-LOCK-001 RULE 14 HARD STOP — hash mismatch\n` +
        `Character: ${character} | Key: ${contentKey}\n` +
        `Expected: ${entry.file_sha256} | Actual: ${actualHash}\nRender aborted.`
      )
    }
    await storageUpload(activeStoragePath, buf)
    return { buf, contentKey, isReused: true }
  }

  return { buf: null, contentKey, isReused: false }
}

/**
 * Rule 11/15 — Lock a newly-generated voice segment.
 * Archives under content key; writes manifest entry.
 */
export async function lockVoiceSegment(
  storyId: string,
  contentKey: string,
  character: string, lineText: string, voiceId: string, settings: VoiceSettings, model: string,
  buf: Buffer,
  revision: string,
  manifest: SfxManifest,
): Promise<SfxManifest> {
  const ap = voiceArchivePath(storyId, contentKey)
  await storageUpload(ap, buf)

  const updated: SfxManifest = {
    ...manifest,
    schema: 'sfx-asset-lock.v1.1',
    voice_segments: {
      ...manifest.voice_segments,
      [contentKey]: {
        character, line_text: lineText, voice_id: voiceId, voice_settings: settings, model,
        storage_path: ap,
        file_sha256: sha256hex(buf),
        size_bytes: buf.length,
        approved: true,
        locked_revision: revision,
        locked_at: new Date().toISOString(),
      },
    },
  }
  await saveManifest(updated)
  return updated
}
