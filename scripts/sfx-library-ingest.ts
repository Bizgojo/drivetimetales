/**
 * SFX-LIBRARY-001 — add real recorded sound effects to our library.
 *
 *   npx tsx scripts/sfx-library-ingest.ts <folder> [--source sonniss|soundly] [--license "..."] [--dry-run] [--max-sec 10]
 *
 * Walks <folder> for .wav/.aif/.aiff/.flac/.mp3/.ogg files. For each one:
 *   - words come from the folder path + file name (UCS names like
 *     "WEAPGun_Pistol Shot Close Indoor_Sonniss.wav" work well) plus any
 *     description in the file's metadata tags
 *   - converted to mp3, mono 44.1 kHz, loudness-normalised (-18 LUFS),
 *     leading silence trimmed, capped at --max-sec seconds with a short fade
 *   - uploaded to audio/sfx-library/<source>/<slug>.mp3
 * Then sfx-library/manifest.json is rewritten (existing entries kept;
 * same id = replaced). Re-running on the same folder is safe.
 *
 * Needs ffmpeg/ffprobe, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative } from 'node:path'
import { SFX_LIBRARY_MANIFEST, SFX_LIBRARY_PREFIX, sfxWords, type SfxLibraryEntry, type SfxLibraryManifest } from '../lib/sfxLibrary'

const AUDIO_EXT = new Set(['.wav', '.aif', '.aiff', '.flac', '.mp3', '.ogg'])

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : def
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (AUDIO_EXT.has(extname(name).toLowerCase())) out.push(p)
  }
  return out
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
}

/** Human name from a (possibly UCS-style) file name. */
export function nameFromFile(file: string): string {
  const stem = basename(file, extname(file))
  const parts = stem.split('_')
  // UCS: CatID_FXName_CreatorID_SourceID → FXName is the description.
  const fx = parts.length >= 3 && /^[A-Z]{3,}[A-Za-z]*$/.test(parts[0]) ? parts[1] : stem
  return fx.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function metadataDescription(file: string): string {
  try {
    const out = execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', file], { encoding: 'utf8' })
    const tags = JSON.parse(out)?.format?.tags || {}
    return [tags.comment, tags.description, tags.title, tags.ICMT, tags.INAM].filter(Boolean).join(' ').slice(0, 300)
  } catch {
    return ''
  }
}

function convert(src: string, dst: string, maxSec: number): number {
  const fadeStart = Math.max(0, maxSec - 0.4)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', src,
    '-af', `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${maxSec},afade=t=out:st=${fadeStart}:d=0.4,loudnorm=I=-18:TP=-1.5:LRA=11`,
    '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', dst,
  ])
  const d = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], { encoding: 'utf8' })
  return Math.round(Number(d) * 100) / 100
}

async function main() {
  const folder = process.argv[2]
  if (!folder || folder.startsWith('--')) throw new Error('usage: sfx-library-ingest.ts <folder> [--source sonniss] [--license "..."] [--dry-run] [--max-sec 10]')
  const source = slugify(arg('source', 'sonniss')!)
  const license = arg('license', source === 'sonniss' ? 'Sonniss GDC bundle — royalty-free, commercial use, no attribution' : '')
  const maxSec = Number(arg('max-sec', '10'))
  const dryRun = process.argv.includes('--dry-run')
  const files = walk(folder)
  console.log(`found ${files.length} audio files in ${folder}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const db = dryRun ? null : createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let manifest: SfxLibraryManifest = { version: 1, updatedAt: '', entries: [] }
  if (db) {
    const { data } = await db.storage.from('audio').download(SFX_LIBRARY_MANIFEST)
    if (data) { try { manifest = JSON.parse(await data.text()) } catch {} }
  }
  const byId = new Map(manifest.entries.map((e) => [e.id, e]))
  const tmp = mkdtempSync(join(tmpdir(), 'sfxlib-'))
  let added = 0
  let failed = 0
  try {
    for (const file of files) {
      const rel = relative(folder, file)
      const name = nameFromFile(file)
      const words = sfxWords(`${rel.replace(extname(rel), '')} ${metadataDescription(file)}`)
      const id = `${source}/${slugify(rel.replace(extname(rel), ''))}`
      const path = `${SFX_LIBRARY_PREFIX}/${id}.mp3`
      if (dryRun) { console.log(`[dry-run] ${id}  ←  "${name}"  tags: ${words.join(' ')}`); continue }
      try {
        const out = join(tmp, 'out.mp3')
        const durationSec = convert(file, out, maxSec)
        const buf = readFileSync(out)
        if (buf.length < 1024) throw new Error('converted file too small (silent?)')
        const { error } = await db!.storage.from('audio').upload(path, buf, { contentType: 'audio/mpeg', upsert: true })
        if (error) throw new Error(error.message)
        byId.set(id, { id, path, name, tags: words, durationSec, source, license })
        added += 1
        if (added % 25 === 0) console.log(`  … ${added} uploaded`)
      } catch (e) {
        failed += 1
        console.warn(`  skipped ${rel}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (dryRun) return
  manifest = { version: 1, updatedAt: new Date().toISOString(), entries: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)) }
  const { error } = await db!.storage.from('audio').upload(SFX_LIBRARY_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 1)), { contentType: 'application/json', upsert: true })
  if (error) throw new Error(`manifest save failed: ${error.message}`)
  console.log(`done: ${added} added/updated, ${failed} skipped; library now has ${manifest.entries.length} sounds`)
}

if (require.main === module) main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
