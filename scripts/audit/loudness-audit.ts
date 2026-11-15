/**
 * LOUDNESS-AUDIT-001 (Marc, Nov 15, 2026: "check all episodes to make sure all voices are level
 * in volume across all episodes"). READ-ONLY: measures, never changes audio or stories.
 *
 * Run on EC2 (needs ffmpeg + storage access):
 *   npx tsx scripts/audit/loudness-audit.ts                 # every live series episode
 *   npx tsx scripts/audit/loudness-audit.ts --series "Weekend Wife in Miami"
 *
 * Per episode it measures (EBU R128 integrated loudness, LUFS):
 *   - the whole final mix (the pipeline targets -16 LUFS)
 *   - Belle's intro and outro recordings (the final mix does NOT re-level them)
 *   - every voice line (segment_NNNN.mp3), grouped by speaker, then the per-speaker gain the
 *     mix applies (VOICE-LEVEL-001) to estimate each character's level as heard.
 * Flags: final mix more than 1.5 dB off -16; Belle more than 3 dB from the story; characters
 * more than 3 dB apart after leveling; episodes more than 2 dB apart within a series.
 * Writes the full result to atlas_settings key "loudness_audit" (JSON) and prints a summary.
 */
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { parseScriptPositions } from '../../lib/scriptLineIndex'
import { planSpeakerGains, combinedLufs, type MeasuredLine } from '../../lib/voiceLevel'

const exec = promisify(execFile)
let FFMPEG = 'ffmpeg'
try { FFMPEG = eval('require')('@ffmpeg-installer/ffmpeg').path } catch {}

const TARGET = -16
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const PUBLIC = `${url}/storage/v1/object/public/audio`

async function measure(fileUrl: string): Promise<{ lufs: number; tp: number; dur: number } | null> {
  const tmp = path.join(os.tmpdir(), `la_${Date.now()}_${Math.random().toString(16).slice(2)}.mp3`)
  try {
    const r = await fetch(fileUrl)
    if (!r.ok) return null
    await fs.writeFile(tmp, Buffer.from(await r.arrayBuffer()))
    const { stderr } = await exec(FFMPEG, ['-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { maxBuffer: 1 << 24 })
    const j = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1))
    const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr)
    const dur = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0
    return { lufs: Number(j.input_i), tp: Number(j.input_tp), dur }
  } catch { return null } finally { await fs.unlink(tmp).catch(() => {}) }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

const r1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null)

async function auditEpisode(ep: any) {
  const dir = `asc3/${ep.id}`
  const { data: files } = await db.storage.from('audio').list(dir, { limit: 1000 })
  const names = (files || []).map((f) => f.name)
  const final = ep.audio_url ? await measure(String(ep.audio_url).split('?')[0]) : null
  const intro = names.filter((n) => /^announcement(_\d+)?\.mp3$/.test(n)).sort().pop()
  const outro = names.includes('outro_corrected.mp3') ? 'outro_corrected.mp3' : names.filter((n) => /^outro_\d+\.mp3$/.test(n)).sort().pop()
  const belleIntro = intro ? await measure(`${PUBLIC}/${dir}/${intro}`) : null
  const belleOutro = outro ? await measure(`${PUBLIC}/${dir}/${outro}`) : null
  const speakerByIdx = new Map(parseScriptPositions(ep.script || '').filter((p: any) => p.kind === 'voice').map((p: any) => [p.index, String(p.speaker || '')]))
  const segs = names.map((n) => /^segment_(\d{4})\.mp3$/.exec(n)).filter(Boolean).map((m) => ({ name: m![0], idx: Number(m![1]) })).filter((s) => speakerByIdx.has(s.idx))
  const measured = await pool(segs, 6, async (s) => ({ s, m: await measure(`${PUBLIC}/${dir}/${s.name}`) }))
  const lines: MeasuredLine[] = measured.filter((x) => x.m && Number.isFinite(x.m.lufs)).map((x) => ({ idx: x.s.idx, speaker: speakerByIdx.get(x.s.idx) || '', lufs: x.m!.lufs, truePeak: x.m!.tp, dur: x.m!.dur }))
  const { targetLufs, gains } = planSpeakerGains(lines)
  const gainBy = new Map(gains.map((g) => [g.speaker, g.gainDb]))
  const speakers = Array.from(new Set(lines.map((l) => l.speaker.trim().toUpperCase()))).map((sp) => {
    const mine = lines.filter((l) => l.speaker.trim().toUpperCase() === sp && l.dur >= 1)
    const raw = combinedLufs(mine)
    return { speaker: sp, lines: mine.length, rawLufs: r1(raw), heardLufs: r1(raw + (gainBy.get(sp) || 0)) }
  }).filter((s) => s.lines >= 3 && s.heardLufs !== null)
  const heard = speakers.map((s) => s.heardLufs as number)
  const spread = heard.length > 1 ? Math.max(...heard) - Math.min(...heard) : 0
  const flags: string[] = []
  if (final && Math.abs(final.lufs - TARGET) > 1.5) flags.push(`final mix ${r1(final.lufs)} LUFS (target ${TARGET})`)
  if (final && belleIntro && Math.abs(belleIntro.lufs - final.lufs) > 3) flags.push(`Belle intro ${r1(belleIntro.lufs - final.lufs)} dB vs story`)
  if (final && belleOutro && Math.abs(belleOutro.lufs - final.lufs) > 3) flags.push(`Belle outro ${r1(belleOutro.lufs - final.lufs)} dB vs story`)
  if (spread > 3) {
    const lo = speakers.reduce((a, b) => ((a.heardLufs as number) < (b.heardLufs as number) ? a : b))
    const hi = speakers.reduce((a, b) => ((a.heardLufs as number) > (b.heardLufs as number) ? a : b))
    flags.push(`characters ${r1(spread)} dB apart (${lo.speaker} quietest, ${hi.speaker} loudest)`)
  }
  return { storyId: ep.id, episode: ep.episode_number, title: ep.title, finalLufs: final ? r1(final.lufs) : null, finalTruePeak: final ? r1(final.tp) : null, belleIntroLufs: belleIntro ? r1(belleIntro.lufs) : null, belleOutroLufs: belleOutro ? r1(belleOutro.lufs) : null, speakerTargetLufs: r1(targetLufs), speakers, speakerSpreadDb: r1(spread), linesMeasured: lines.length, flags }
}

async function main() {
  const i = process.argv.indexOf('--series')
  const only = i > 0 ? process.argv[i + 1] : null
  let q = db.from('series').select('id,title')
  if (only) q = q.eq('title', only)
  const { data: seriesRows } = await q
  const report: any[] = []
  for (const s of seriesRows || []) {
    const { data: eps } = await db.from('stories').select('id,title,episode_number,audio_url,script,status,is_hidden').eq('series_id', s.id).not('audio_url', 'is', null).order('episode_number')
    const live = (eps || []).filter((e: any) => only || (e.status === 'published' && e.is_hidden === false))
    if (!live.length) continue
    const episodes = []
    for (const ep of live) { const a = await auditEpisode(ep); episodes.push(a); console.log(`${s.title} EP${a.episode}: final ${a.finalLufs} | intro ${a.belleIntroLufs} | outro ${a.belleOutroLufs} | spread ${a.speakerSpreadDb} dB${a.flags.length ? ' | FLAGS: ' + a.flags.join('; ') : ''}`) }
    const finals = episodes.map((e) => e.finalLufs).filter((v): v is number => typeof v === 'number')
    const seriesSpread = finals.length > 1 ? r1(Math.max(...finals) - Math.min(...finals)) : 0
    const seriesFlags = (seriesSpread as number) > 2 ? [`episodes ${seriesSpread} dB apart`] : []
    report.push({ seriesId: s.id, title: s.title, episodeSpreadDb: seriesSpread, seriesFlags, episodes })
  }
  const flagged = report.reduce((n, s) => n + s.episodes.filter((e: any) => e.flags.length).length + (s.seriesFlags.length ? 1 : 0), 0)
  const result = { checkedAt: new Date().toISOString(), targetLufs: TARGET, seriesCount: report.length, flagged, report }
  await db.from('atlas_settings').upsert({ key: 'loudness_audit', value: JSON.stringify(result), updated_at: result.checkedAt, updated_by: 'loudness-audit' }, { onConflict: 'key' })
  console.log(`\nLOUDNESS-AUDIT-001: ${report.length} series, ${flagged} flagged item(s). Saved to atlas_settings.loudness_audit`)
}
main().catch((e) => { console.error(e); process.exit(1) })
