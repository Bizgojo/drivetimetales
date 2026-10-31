/**
 * Script sound effects ([SFX: …] cues written into the script).
 * Moved out of generate-voices so the SFX re-mix tool can make them too
 * (SFX-REMIX-001). Library first (Marc-approved sounds only), ElevenLabs
 * fallback. Each effect gets a small sidecar (sfx_NNNN.source.json) saying
 * where it came from, for the per-episode sound report (SFX-REPORT-001).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { librarySfxForCue } from '@/lib/sfxLibrary'

// ATL-SFX-001: configurable duration — explicit hint in cue text, or type-based default.
export function parseSFXDuration(description: string): number {
  const hintMatch = description.match(/,?\s*(\d+(?:\.\d+)?)\s*(?:seconds?|s)\s*$/i)
  if (hintMatch) {
    const parsed = parseFloat(hintMatch[1])
    if (parsed >= 0.5 && parsed <= 22.0) return parsed // EL max is 22s
  }
  const desc = description.toLowerCase()
  if (/bell|gong|chime|toll|clang/.test(desc)) return 6.0
  if (/roar|rumble|thunder|wind|rain|storm|river|ocean|wave|crowd|ambient/.test(desc)) return 7.0
  if (/siren|alarm|horn|whistle/.test(desc)) return 4.0
  if (/slam|bang|crash|smash|shatter|break/.test(desc)) return 1.5
  if (/click|snap|tap|knock|latch|pop/.test(desc)) return 1.0
  if (/gunshot|shot|blast|explosion/.test(desc)) return 2.0
  if (/groan|creak|squeak|scrape/.test(desc)) return 2.5
  if (/footstep|step|walk|tread/.test(desc)) return 3.0
  return 3.0
}

// ATL-SFX-001: strip the trailing duration hint before sending to EL.
export function cleanSFXDescription(description: string): string {
  return description.replace(/,?\s*\d+(?:\.\d+)?\s*(?:seconds?|s)\s*$/i, '').trim()
}

const SFX_MIN_BYTES = 1024
const SFX_MAX_ATTEMPTS = 3

export type SfxSource = { cue: string; kind: 'library' | 'ai'; libraryId?: string; libraryName?: string; at: string }

export function sfxFileName(lineIndex: number): string {
  return `sfx_${lineIndex.toString().padStart(4, '0')}.mp3`
}

export async function generateScriptSfx(params: {
  db: SupabaseClient
  storyId: string
  lineIndex: number
  description: string
  elevenLabsKey: string
  baseStorage: string
  /** Skip the "already exists" shortcut (re-mix). */
  force?: boolean
  log?: (m: string) => void
}): Promise<{ url: string; source: SfxSource } | null> {
  const log = params.log || ((m: string) => console.log(m))
  const fileName = sfxFileName(params.lineIndex)
  const cachePath = `asc3/${params.storyId}/${fileName}`
  const cacheUrl = `${params.baseStorage}/${cachePath}`
  if (!params.force) {
    try { const r = await fetch(cacheUrl, { method: 'HEAD' }); if (r.ok) return { url: cacheUrl, source: { cue: params.description, kind: 'ai', at: '' } } } catch {}
  }
  const durationSeconds = parseSFXDuration(params.description)
  const elDescription = cleanSFXDescription(params.description)
  const writeSidecar = async (source: SfxSource) => {
    await params.db.storage.from('audio').upload(`asc3/${params.storyId}/${fileName.replace('.mp3', '.source.json')}`, Buffer.from(JSON.stringify(source)), { contentType: 'application/json', upsert: true })
  }

  const lib = await librarySfxForCue(elDescription, params.baseStorage, log, `${params.storyId}:${params.lineIndex}`)
  if (lib) {
    const { error } = await params.db.storage.from('audio').upload(cachePath, lib.audio, { contentType: 'audio/mpeg', upsert: true })
    if (!error) {
      const source: SfxSource = { cue: elDescription, kind: 'library', libraryId: lib.match.entry.id, libraryName: lib.match.entry.name, at: new Date().toISOString() }
      await writeSidecar(source).catch(() => {})
      return { url: cacheUrl, source }
    }
    log(`[SFX-LIBRARY-001] upload failed for ${fileName}: ${error.message} — falling back to ElevenLabs`)
  }

  for (let attempt = 1; attempt <= SFX_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'xi-api-key': params.elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: elDescription, duration_seconds: durationSeconds, prompt_influence: 0.3 }),
      })
      if (!res.ok) {
        log(`[ATL-SFX-001] attempt ${attempt}/${SFX_MAX_ATTEMPTS} HTTP ${res.status} for: "${elDescription}"`)
        if (attempt < SFX_MAX_ATTEMPTS) continue
        return null
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < SFX_MIN_BYTES) {
        log(`[ATL-SFX-001] attempt ${attempt}/${SFX_MAX_ATTEMPTS} QC fail: ${buf.length}B < ${SFX_MIN_BYTES}B min for: "${elDescription}"`)
        if (attempt < SFX_MAX_ATTEMPTS) continue
        return null
      }
      await params.db.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
      log(`[ATL-SFX-001] generated ${fileName}: ${buf.length}B, ${durationSeconds}s, attempt ${attempt}`)
      const source: SfxSource = { cue: elDescription, kind: 'ai', at: new Date().toISOString() }
      await writeSidecar(source).catch(() => {})
      return { url: cacheUrl, source }
    } catch (e) {
      log(`[ATL-SFX-001] attempt ${attempt}/${SFX_MAX_ATTEMPTS} error: ${e instanceof Error ? e.message : String(e)}`)
      if (attempt >= SFX_MAX_ATTEMPTS) return null
    }
  }
  return null
}
