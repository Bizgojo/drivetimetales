/**
 * SFX-LAYERED-001 preview — READ-ONLY. Builds the story body (voices + SFX,
 * no music) for one already-produced episode two ways, from its existing
 * clips, so Marc can compare:
 *   current.mp3  — today's mix: each effect alone in its own gap
 *   layered.mp3  — spot effects overlap the next line; background effects
 *                  keep running quietly under the narration
 * Writes only to a local temp folder. No database or storage writes, no
 * paid generation.
 *
 *   npx tsx scripts/sfx-layered-preview.ts <storyId> [outDir]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { parseScriptPositions } from '../lib/scriptLineIndex'
import { buildLayeredStoryBody, type BodyItem } from '../lib/sfxLayeredMix'

const exec = promisify(execFile)
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

async function duration(file: string): Promise<number> {
  const r: any = await exec(FFMPEG, ['-i', file, '-f', 'null', '-'], { maxBuffer: 1 << 26 }).catch((e: any) => ({ stderr: e.stderr || '' }))
  const m = String(r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}

async function main() {
  const storyId = process.argv[2]
  if (!storyId) throw new Error('usage: sfx-layered-preview.ts <storyId> [outDir]')
  const outDir = process.argv[3] || `/tmp/sfx-preview-${storyId.slice(0, 8)}`
  await mkdir(path.join(outDir, 'clips'), { recursive: true })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: story, error } = await db.from('stories').select('id,title,series_name,series_episode_number,script').eq('id', storyId).single()
  if (error || !story) throw new Error('story not found: ' + (error?.message || storyId))
  const positions = parseScriptPositions(String(story.script || ''))
  const voiceNumbers = new Set(positions.filter((p) => (p.kind === 'voice' || p.kind === 'silence') && p.isExpected).map((p) => p.index))
  const sceneBreaks = new Set(positions.filter((p) => p.kind === 'silence').map((p) => p.index))
  const cueByIndex = new Map(positions.filter((p) => p.kind === 'sfx').map((p) => [p.index, String(p.text || '')]))

  const { data: files, error: listErr } = await db.storage.from('audio').list(`asc3/${storyId}`, { limit: 2000 })
  if (listErr) throw new Error('storage list failed: ' + listErr.message)
  const wanted = (files || [])
    .map((f) => {
      const seg = f.name.match(/^segment_(\d{4})\.mp3$/)
      const fx = f.name.match(/^sfx_(\d{4})\.mp3$/)
      if (seg && voiceNumbers.has(Number(seg[1]))) return { name: f.name, kind: 'voice' as const, idx: Number(seg[1]) }
      if (fx) return { name: f.name, kind: 'sfx' as const, idx: Number(fx[1]) }
      return null
    })
    .filter(Boolean) as Array<{ name: string; kind: 'voice' | 'sfx'; idx: number }>

  const items: BodyItem[] = []
  for (const f of wanted) {
    const raw = path.join(outDir, 'clips', 'raw_' + f.name)
    const ready = path.join(outDir, 'clips', f.name)
    const res = await fetch(`${url}/storage/v1/object/public/audio/asc3/${storyId}/${f.name}`)
    if (!res.ok) throw new Error(`download ${f.name}: HTTP ${res.status}`)
    await writeFile(raw, Buffer.from(await res.arrayBuffer()))
    await exec(FFMPEG, ['-i', raw, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', ready])
    const dur = await duration(ready)
    items.push(f.kind === 'voice'
      ? { kind: 'voice', idx: f.idx, path: ready, dur, sceneBreak: sceneBreaks.has(f.idx) }
      : { kind: 'sfx', idx: f.idx, path: ready, dur, cue: cueByIndex.get(f.idx) || '' })
  }
  items.sort((a, b) => a.idx - b.idx)
  console.log(`${story.series_name || story.title} EP${story.series_episode_number}: ${items.filter((i) => i.kind === 'voice').length} voice clips, ${items.filter((i) => i.kind === 'sfx').length} effects`)

  // Current mix: exactly today's default (concat by index + loudnorm).
  const listPath = path.join(outDir, 'current_concat.txt')
  await writeFile(listPath, items.map((i) => `file '${i.path}'`).join('\n'))
  const currentPath = path.join(outDir, 'current.mp3')
  await exec(FFMPEG, ['-f', 'concat', '-safe', '0', '-i', listPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', currentPath], { maxBuffer: 1 << 26 })

  const layeredPath = path.join(outDir, 'layered.mp3')
  const plan = await buildLayeredStoryBody({
    items,
    tmpDir: path.join(outDir, 'clips'),
    outPath: layeredPath,
    ffmpeg: FFMPEG,
    exec: (cmd, args) => exec(cmd, args, { maxBuffer: 1 << 26 }),
    log: (line) => console.log(line),
  })
  await writeFile(path.join(outDir, 'plan.json'), JSON.stringify(plan.sfx, null, 2))

  // Short listening clips: 30 s around each effect, BEFORE (today) and AFTER (new).
  const currentStarts = new Map<number, number>()
  let t = 0
  for (const i of items) { if (i.kind === 'sfx') currentStarts.set(i.idx, t); t += i.dur }
  const clipPaths: string[] = []
  let n = 0
  for (const p of plan.sfx) {
    n += 1
    const label = p.cue.split(/[,.]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'effect'
    for (const [tag, file, at] of [['BEFORE', currentPath, currentStarts.get(p.idx) ?? p.start], ['AFTER', layeredPath, p.start]] as Array<[string, string, number]>) {
      const out = path.join(outDir, `${n}-${label}-${tag}.mp3`)
      await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, at - 4).toFixed(2), '-t', '30', '-i', file, '-af', 'afade=t=in:d=0.3,afade=t=out:st=29.3:d=0.7', '-b:a', '192k', '-y', out])
      clipPaths.push(out)
    }
  }
  console.log('Listening clips:')
  for (const c of clipPaths) console.log('  ' + c)
  console.log(`current.mp3 ${(await duration(currentPath)).toFixed(1)}s | layered.mp3 ${(await duration(layeredPath)).toFixed(1)}s`)
  for (const p of plan.sfx) {
    const mm = Math.floor(p.start / 60), ss = Math.round(p.start % 60)
    console.log(`  ${p.role.padEnd(4)} at ${mm}:${String(ss).padStart(2, '0')} (${p.length.toFixed(1)}s${p.loop ? ', looped' : ''}) ${p.cue}`)
  }
  console.log(`Files: ${currentPath}  ${layeredPath}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
