/**
 * RERECORD-RUNNER-002 (Marc GO 2026-09-29) — no-cost check before spending
 * ElevenLabs credits on a re-record batch.
 *
 * Calls NO generate-voices endpoint and voices NOTHING. For each story id it
 * loads the script, checks it with lib/preflightCheck.ts (Belle lines present,
 * at least one expected segment, background_music.mp3 present, informational
 * long-line flag), and — when background_music.mp3 exists — downloads it once
 * and checks its duration is long enough for the mix step's own offset picker.
 *
 * The outro-music loop-wrap bug (Origin 2.0 EP06, fixed in
 * lib/outroMusicClip.ts) is NOT checked here: that fix cuts the clip inside
 * the filter graph regardless of the chosen offset, so it can no longer
 * happen for any episode, at any music length or offset.
 *
 * Exit code 0 if every episode has zero 'error' issues, 1 otherwise. Prints a
 * per-episode report either way — a 'warn' does not fail the run.
 *
 * USE (on the Mac, in ~/Projects/drivetimetales):
 *   npx tsx scripts/preflight-remaining.ts <id> [<id> ...]
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { preflightScript, musicDurationIssue, type PreflightIssue } from '../lib/preflightCheck'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const BUCKET = 'audio'
const BASE_STORAGE =
  process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}` : ''

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('@ffmpeg-installer/ffmpeg').path } catch { /* system ffmpeg */ }

const FFMPEG_PROBE_TIMEOUT_MS = 20_000
const MUSIC_FETCH_TIMEOUT_MS = 30_000

function ffmpegDurationSecs(file: string): number {
  try {
    execFileSync(FFMPEG_PATH, ['-hide_banner', '-i', file], { stdio: 'pipe', timeout: FFMPEG_PROBE_TIMEOUT_MS })
    return NaN
  } catch (e: any) {
    const m = String(e.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/)
    if (!m) return NaN
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
}

async function main() {
  const ids = process.argv.slice(2)
  if (ids.length === 0) throw new Error('Pass at least one story id')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'))

  let anyErrors = false
  for (const id of ids) {
    const { data: story, error } = await sb.from('stories').select('id,title,episode_number,script').eq('id', id).single()
    if (error || !story?.script) {
      console.log(`${id} | ERROR | could not load story/script: ${error?.message || 'no script'}`)
      anyErrors = true
      continue
    }
    const ep = `EP${String(story.episode_number ?? '?').padStart(2, '0')}`
    const { data: files } = await sb.storage.from(BUCKET).list(`asc3/${id}`, { limit: 1000 })
    const names = (files || []).filter((f: any) => f.id !== null).map((f: any) => f.name)

    const issues: PreflightIssue[] = preflightScript(story.script, names)

    if (names.includes('background_music.mp3') && BASE_STORAGE) {
      const dest = path.join(tmpDir, `${id}.mp3`)
      try {
        const res = await fetch(`${BASE_STORAGE}/asc3/${id}/background_music.mp3`, { signal: AbortSignal.timeout(MUSIC_FETCH_TIMEOUT_MS) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        const dur = ffmpegDurationSecs(dest)
        const issue = musicDurationIssue(dur)
        if (issue) issues.push(issue)
        fs.unlinkSync(dest)
      } catch (e) {
        issues.push({ severity: 'warn', message: `Could not download/measure background_music.mp3: ${String(e)}` })
      }
    }

    const errors = issues.filter((i) => i.severity === 'error')
    const warns = issues.filter((i) => i.severity === 'warn')
    if (errors.length > 0) anyErrors = true
    const status = errors.length > 0 ? 'ERROR' : warns.length > 0 ? 'WARN' : 'OK'
    console.log(`${ep} "${story.title}" | ${status}`)
    for (const i of issues) console.log(`  [${i.severity}] ${i.message}`)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log(anyErrors ? '\nRESULT: at least one episode has an error — fix before spending credits on it' : '\nRESULT: no errors found in any episode')
  process.exit(anyErrors ? 1 : 0)
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e)
  process.exit(1)
})
