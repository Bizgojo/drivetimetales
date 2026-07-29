/**
 * sfxAssetLock.ts — SFX-ASSET-LOCK-001 enforcement
 *
 * ElevenLabs SFX is non-deterministic. Approved sounds are preserved
 * artifacts, not reproducible steps. This module enforces lock-by-default
 * from the second render of any story onward.
 *
 * RULE 1: Every SFX cue is LOCKED except those Marc names for change.
 * RULE 2: Locked cues are reused byte-for-byte — never re-prompted.
 * RULE 3: Missing locked file = hard stop (no silent re-roll).
 *
 * Per governance/drafts/SFX-ASSET-LOCK-001.md (draft, not yet canon).
 */

import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BASE_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/audio`
const MANIFEST_KEY = 'sfx-manifest.json'

export interface SfxLockEntry {
  storage_path: string       // e.g. asc3/<story_id>/sfx-locked/bell-strike-r4.mp3
  public_url: string
  sha256: string
  size_bytes: number
  locked_at: string          // ISO-8601
  approved_revision: string  // e.g. "rev4"
  prompt: string
  duration_secs: number
}

export interface SfxManifest {
  story_id: string
  schema: 'sfx-asset-lock.v1'
  locked: Record<string, SfxLockEntry>  // keyed by cue name e.g. "bell-strike"
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function sbFetch(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': body ? 'application/json' : 'text/plain',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function uploadToStorage(storagePath: string, buf: Buffer): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audio/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`sfxAssetLock upload ${storagePath}: ${res.status} ${txt.slice(0, 150)}`)
  }
}

async function downloadFromStorage(publicUrl: string): Promise<Buffer> {
  const res = await fetch(publicUrl)
  if (!res.ok) throw new Error(`sfxAssetLock download ${publicUrl}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

// ── Manifest I/O ──────────────────────────────────────────────────────────────

async function manifestPath(storyId: string): Promise<string> {
  return `asc3/${storyId}/${MANIFEST_KEY}`
}

export async function loadManifest(storyId: string): Promise<SfxManifest | null> {
  const url = `${BASE_STORAGE}/asc3/${storyId}/${MANIFEST_KEY}`
  const res = await fetch(url + '?t=' + Date.now())
  if (!res.ok) return null
  try {
    return await res.json() as SfxManifest
  } catch {
    return null
  }
}

export async function saveManifest(manifest: SfxManifest): Promise<void> {
  const sp = await manifestPath(manifest.story_id)
  const buf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  await uploadToStorage(sp, buf)
}

export function emptyManifest(storyId: string): SfxManifest {
  return { story_id: storyId, schema: 'sfx-asset-lock.v1', locked: {} }
}

// ── Core lock/unlock API ──────────────────────────────────────────────────────

/**
 * Lock a generated SFX file.
 * Call this after a cue is generated and approved.
 * Copies the active file to sfx-locked/ and records the manifest entry.
 */
export async function lockSfxCue(
  storyId: string,
  cueKey: string,
  activeStoragePath: string,   // e.g. asc3/<id>/sfx_0021.mp3
  revision: string,            // e.g. "rev4"
  prompt: string,
  durationSecs: number,
  manifest: SfxManifest,
): Promise<SfxManifest> {
  const lockedPath = `asc3/${storyId}/sfx-locked/${cueKey}-${revision}.mp3`
  const publicUrl  = `${BASE_STORAGE}/${activeStoragePath}`

  // Download the active file
  const buf = await downloadFromStorage(publicUrl)
  const hash = sha256hex(buf)

  // Copy to locked path
  await uploadToStorage(lockedPath, buf)

  const entry: SfxLockEntry = {
    storage_path: lockedPath,
    public_url: `${BASE_STORAGE}/${lockedPath}`,
    sha256: hash,
    size_bytes: buf.length,
    locked_at: new Date().toISOString(),
    approved_revision: revision,
    prompt,
    duration_secs: durationSecs,
  }

  const updated: SfxManifest = {
    ...manifest,
    locked: { ...manifest.locked, [cueKey]: entry },
  }
  await saveManifest(updated)
  return updated
}

/**
 * Restore a locked SFX cue to the active render position.
 * HARD STOP if the locked file is missing or hash-mismatches.
 *
 * Returns the buffer (for optional further use).
 */
export async function restoreLockedCue(
  cueKey: string,
  entry: SfxLockEntry,
  activeStoragePath: string,  // e.g. asc3/<id>/sfx_0021.mp3
): Promise<Buffer> {
  // Download the locked file
  let buf: Buffer
  try {
    buf = await downloadFromStorage(entry.public_url)
  } catch (e) {
    // RULE 3: Missing locked file = hard stop
    throw new Error(
      `SFX-ASSET-LOCK-001 HARD STOP: locked file missing for cue "${cueKey}".\n` +
      `Expected: ${entry.public_url}\n` +
      `Error: ${(e as Error).message}\n` +
      `Do NOT re-roll. Report to Marc before proceeding.`
    )
  }

  // Verify hash (Rule 3 partial — full text from Marc pending)
  const actualHash = sha256hex(buf)
  if (actualHash !== entry.sha256) {
    throw new Error(
      `SFX-ASSET-LOCK-001 HARD STOP: hash mismatch for cue "${cueKey}".\n` +
      `Expected SHA256: ${entry.sha256}\n` +
      `Actual SHA256:   ${actualHash}\n` +
      `File at: ${entry.public_url}\n` +
      `Do NOT re-roll. Report to Marc before proceeding.`
    )
  }

  // Copy to active position
  await uploadToStorage(activeStoragePath, buf)
  return buf
}

/**
 * Main entry point for render-time SFX resolution.
 *
 * For each SFX cue in the render:
 *   - If locked in manifest → restoreLockedCue (hard-stop if missing)
 *   - If NOT in manifest (unlocked/new) → caller generates it, then call lockSfxCue afterward
 *
 * @param storyId  Story UUID
 * @param sfxCues  Array of cues with { cueKey, activeStoragePath }
 * @param unlockedKeys  Set of cue keys Marc named for change this revision
 * @returns manifest after restoration; caller locks newly-generated cues
 */
export async function resolveLockedSfx(
  storyId: string,
  sfxCues: Array<{ cueKey: string; activeStoragePath: string }>,
  unlockedKeys: Set<string>,
): Promise<{ manifest: SfxManifest; needsGeneration: string[] }> {
  const manifest = await loadManifest(storyId) ?? emptyManifest(storyId)
  const needsGeneration: string[] = []

  for (const { cueKey, activeStoragePath } of sfxCues) {
    if (unlockedKeys.has(cueKey)) {
      // Marc named this cue for change — generate fresh this revision
      console.log(`[sfxAssetLock] ${cueKey}: UNLOCKED for this revision — will generate`)
      needsGeneration.push(cueKey)
    } else if (manifest.locked[cueKey]) {
      // Locked — restore byte-for-byte (hard-stop if missing)
      const entry = manifest.locked[cueKey]
      console.log(`[sfxAssetLock] ${cueKey}: LOCKED — restoring from ${entry.storage_path}`)
      await restoreLockedCue(cueKey, entry, activeStoragePath)
      console.log(`[sfxAssetLock] ${cueKey}: restored ✓ (${entry.size_bytes} bytes, sha256 verified)`)
    } else {
      // No manifest entry — first render or new cue; generate and then lock
      console.log(`[sfxAssetLock] ${cueKey}: no lock entry — will generate (will lock after)`)
      needsGeneration.push(cueKey)
    }
  }

  return { manifest, needsGeneration }
}
