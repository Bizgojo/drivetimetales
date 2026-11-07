/**
 * ARTIFACT-TIMING-001 — READ-ONLY scan of a series for lines whose audio does
 * not fit their words (an extra sound like "aaaaaa", or a cut-off line).
 *
 *   npx tsx scripts/artifact-timing-scan.ts "The Sunset of Competition" [--probe]
 *
 * Default: seconds = file size / 24000 (segments are 192 kbps). --probe
 * downloads each flagged file and measures it with ffprobe to confirm.
 * Writes /tmp/artifact-timing-<series>.csv and prints a summary.
 * Changes nothing. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import fs from 'fs'
import { execFileSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '../lib/scriptLineIndex'
import { findTimingOutliers, type TimedLine } from '../lib/speechTiming'

const BYTES_PER_SECOND = 24000

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

async function main() {
  const seriesName = process.argv[2]
  const probe = process.argv.includes('--probe')
  if (!seriesName) throw new Error('usage: artifact-timing-scan.ts "<series name>" [--probe]')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: eps, error } = await db.from('stories').select('id,episode_number,script')
    .eq('series_name', seriesName).order('episode_number', { ascending: true })
  if (error) throw new Error(error.message)
  const rows: string[] = ['episode,line,speaker,kind,seconds,expected,extra,starts_at,ends_before_end,text']
  let total = 0
  for (const ep of eps || []) {
    const folder = `asc3/${ep.id}`
    const { data: files, error: listErr } = await db.storage.from('audio').list(folder, { limit: 1000 })
    if (listErr) throw new Error(`${folder}: ${listErr.message}`)
    const size = new Map<number, number>()
    for (const f of files || []) {
      const m = f.name.match(/^segment_(\d{4})\.mp3$/)
      if (m) size.set(Number(m[1]), Number((f.metadata as any)?.size || 0))
    }
    const positions = parseScriptPositions(String(ep.script || ''))
    // Timeline of the story body (voice + silence segments, in order).
    let t = 0
    const at = new Map<number, number>()
    for (const p of positions) { if (size.has(p.index)) { at.set(p.index, t); t += size.get(p.index)! / BYTES_PER_SECOND } }
    const bodySeconds = t
    const lines: TimedLine[] = positions
      .filter((p) => p.kind === 'voice' && p.isExpected && size.get(p.index))
      .map((p) => ({ index: p.index, speaker: String(p.speaker), text: String(p.text || ''), seconds: size.get(p.index)! / BYTES_PER_SECOND }))
    const flags = findTimingOutliers(lines)
    for (const f of flags) {
      let seconds = f.seconds
      if (probe) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${folder}/segment_${String(f.index).padStart(4, '0')}.mp3`
        const tmp = `/tmp/artifact-timing-${ep.id}-${f.index}.mp3`
        fs.writeFileSync(tmp, Buffer.from(await (await fetch(url)).arrayBuffer()))
        seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).toString().trim())
        fs.unlinkSync(tmp)
      }
      const start = at.get(f.index) || 0
      const left = bodySeconds - start - f.seconds
      rows.push([ep.episode_number, f.index, f.speaker, f.kind, seconds.toFixed(1), f.expectedSeconds, f.extraSeconds, fmt(start), fmt(left), JSON.stringify(f.text.slice(0, 120))].join(','))
    }
    total += flags.length
    console.log(`Ep ${ep.episode_number}: ${lines.length} lines, ${flags.length} flagged`)
  }
  const out = `/tmp/artifact-timing-${seriesName.replace(/[^A-Za-z0-9]+/g, '-')}.csv`
  fs.writeFileSync(out, rows.join('\n') + '\n')
  console.log(`TOTAL flagged: ${total}. CSV: ${out}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
