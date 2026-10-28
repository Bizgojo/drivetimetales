/**
 * VOICE-SAMPLES-001 — READ-ONLY. For every character in a series roster (plus
 * the narrator), copies one real recorded line from the episodes into a local
 * folder so Marc can hear each voice, and writes an index with the character
 * descriptions. No database or storage writes, no paid generation.
 *
 *   npx tsx scripts/character-voice-samples.ts <seriesId> [outDir]
 *
 * Picks each character's longest recorded line (up to ~25 words) from the
 * first episode they speak in. Files are numbered in roster order:
 *   01-NARRATOR.mp3, 02-NICK-BRENNAN.mp3, ...
 * plus all-voices.mp3 (every sample in order with a short gap) and index.txt.
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { parseScriptPositions } from '../lib/scriptLineIndex'

const exec = promisify(execFile)
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

function matches(speaker: string, canonical: string) {
  const sp = speaker.trim().toUpperCase().replace(/\s+/g, ' ')
  const c = canonical.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!sp || !c) return false
  return sp === c || sp === c.split(' ')[0] || c.startsWith(sp + ' ') || c.endsWith(' ' + sp)
}

async function main() {
  const seriesId = process.argv[2]
  if (!seriesId) throw new Error('usage: character-voice-samples.ts <seriesId> [outDir]')
  const outDir = process.argv[3] || `/tmp/voice-samples-${seriesId.slice(0, 8)}`
  await mkdir(outDir, { recursive: true })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: roster } = await db.from('series_character_roster')
    .select('canonical_name,voice_name,description,first_appeared_episode').eq('series_id', seriesId)
    .order('first_appeared_episode').order('canonical_name')
  const { data: episodes } = await db.from('stories')
    .select('id,series_episode_number,script,narrator_voice_name').eq('series_id', seriesId).order('series_episode_number')
  const eps = (episodes || []).map((e) => ({ ...e, positions: parseScriptPositions(String(e.script || '')) }))

  const people = [
    { canonical_name: 'NARRATOR', voice_name: eps[0]?.narrator_voice_name || 'narrator', description: 'Narrator' },
    ...(roster || []),
  ]
  const index: string[] = []
  const made: string[] = []
  let n = 0
  for (const person of people) {
    let pick: { epId: string; ep: number; idx: number; text: string } | null = null
    for (const ep of eps) {
      const lines = ep.positions.filter((p) => p.kind === 'voice' && p.isExpected && matches(String(p.speaker || ''), person.canonical_name))
      if (!lines.length) continue
      const words = (t: string) => t.split(/\s+/).filter(Boolean).length
      const best = [...lines].sort((a, b) => {
        const wa = words(String(a.text || '')), wb = words(String(b.text || ''))
        const sa = wa <= 25 ? wa : 25 - (wa - 25), sb = wb <= 25 ? wb : 25 - (wb - 25)
        return sb - sa
      })[0]
      pick = { epId: ep.id, ep: ep.series_episode_number, idx: best.index, text: String(best.text || '') }
      break
    }
    n += 1
    const label = `${String(n).padStart(2, '0')}-${person.canonical_name.replace(/[^A-Z0-9]+/gi, '-')}`
    if (!pick) { index.push(`${label}: no recorded line found | ${person.voice_name} | ${person.description}`); continue }
    const res = await fetch(`${url}/storage/v1/object/public/audio/asc3/${pick.epId}/segment_${String(pick.idx).padStart(4, '0')}.mp3`)
    if (!res.ok) { index.push(`${label}: clip missing (EP${pick.ep}) | ${person.voice_name} | ${person.description}`); continue }
    const raw = path.join(outDir, `raw-${label}.mp3`)
    const file = path.join(outDir, `${label}.mp3`)
    await writeFile(raw, Buffer.from(await res.arrayBuffer()))
    await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', raw, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', file])
    made.push(file)
    index.push(`${label}: EP${pick.ep} | voice "${person.voice_name}" | ${person.description}\n    line: "${pick.text}"`)
  }

  const gap = path.join(outDir, 'gap.mp3')
  await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1.2', '-b:a', '192k', '-y', gap])
  const list = path.join(outDir, 'all.txt')
  await writeFile(list, made.flatMap((f) => [`file '${f}'`, `file '${gap}'`]).join('\n'))
  await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', path.join(outDir, 'all-voices.mp3')])
  await writeFile(path.join(outDir, 'index.txt'), index.join('\n'))
  console.log(index.join('\n'))
  console.log(`\nFiles in ${outDir}: ${made.length} samples + all-voices.mp3 + index.txt`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
