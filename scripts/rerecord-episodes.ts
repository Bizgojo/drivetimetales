/**
 * RERECORD-RUNNER-001 (Marc GO 2026-09-28)
 *
 * Re-records whole episodes from their CURRENT script, unattended, using the
 * exact recipe that produced clean Origin 2.0 EP05 and EP01 on Sep 28:
 *
 *   A  back up every segment_/intro_/outro_/announcement_ file (moved, never
 *      deleted) into asc3/<id>/_backup_rr_<stamp>/ and remove *.qcskip.json
 *   B  POST generate-voices {generateBelleOnly:true} — both Belle statuses
 *      must be "generated" (hard gate)
 *   C  for every expected script position (parseScriptPositions), POST
 *      generate-voices {retryMissingOnly:true, segmentNumber:N}; then verify
 *      every expected segment file exists and NO *.qcskip.json was written
 *      (a sidecar means OpenAI Whisper was unavailable → unchecked audio)
 *   D  render the final mix locally (scripts/run-render-final-mix-local.ts)
 *   E  garble check (garble-detection-gate.js)
 *   F  one touch-up: re-voice every "fail" row once, then D + E again
 *
 * Runs as a plain process (nohup-able), so no agent has to stay awake.
 * Writes one line per episode to stdout and a JSON state file; re-running the
 * same command skips episodes already marked done.
 *
 * STOPS THE WHOLE BATCH (exit 1) on: Belle not generated, a qcskip sidecar,
 * a missing segment after C, two consecutive failed API calls, a render that
 * fails/times out, or ElevenLabs credits used beyond --max-credits.
 *
 * Never publishes, never changes workflow_state, never deletes backups.
 *
 * USE (on the Mac, in ~/Projects/drivetimetales):
 *   npx tsx scripts/rerecord-episodes.ts --dry-run <id> [<id> ...]
 *   npx tsx scripts/rerecord-episodes.ts [--max-credits 400000] <id> [<id> ...]
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local);
 *      ELEVENLABS_API_KEY (production key) optional, enables the credit stop.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '../lib/scriptLineIndex'
import {
  BACKUP_PREFIXES,
  expectedSegmentNames,
  failedSegmentNumbers,
  filesToBackUp,
  parseGarbleReportPath,
  summarizeGarble,
} from '../lib/rerecordPlan'

dotenv.config({ path: path.join(__dirname, '../.env.local') }) // never overrides already-set env

const BASE_URL = process.env.RERECORD_BASE_URL || 'https://app.endless-tales.com'
const REPO_ROOT = path.join(__dirname, '..')
const BUCKET = 'audio'
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const RENDER_TIMEOUT_MS = 15 * 60 * 1000
const GARBLE_TIMEOUT_MS = 40 * 60 * 1000
const STATE_PATH = '/tmp/rerecord-episodes-state.json'

class BatchStop extends Error {}

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${msg}`
  console.log(line)
}

function parseArgs(argv: string[]) {
  const ids: string[] = []
  let dryRun = false
  let maxCredits = 400_000
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--max-credits') maxCredits = Number(argv[++i])
    else if (/^[0-9a-f-]{36}$/i.test(a)) ids.push(a)
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (ids.length === 0) throw new Error('Pass at least one story id')
  if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('--max-credits must be a positive number')
  return { ids, dryRun, maxCredits }
}

function loadState(): Record<string, { done: boolean; summary?: string }> {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}
function saveState(state: Record<string, unknown>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

async function listFolder(sb: SupabaseClient, folder: string): Promise<string[]> {
  const { data, error } = await sb.storage.from(BUCKET).list(folder, { limit: 1000 })
  if (error) throw new BatchStop(`Storage list failed for ${folder}: ${error.message}`)
  // Sub-folders come back with id === null; keep files only.
  return (data || []).filter((f: any) => f.id !== null).map((f) => f.name)
}

async function moveFile(sb: SupabaseClient, from: string, to: string) {
  const { error } = await sb.storage.from(BUCKET).move(from, to)
  if (error) throw new BatchStop(`Storage move failed ${from} -> ${to}: ${error.message}`)
}

async function removeFiles(sb: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return
  const { error } = await sb.storage.from(BUCKET).remove(paths)
  if (error) throw new BatchStop(`Storage remove failed: ${error.message}`)
}

let consecutiveApiFailures = 0
async function postGenerateVoices(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/generate-voices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch { /* non-JSON */ }
      if (res.ok) { consecutiveApiFailures = 0; return json ?? {} }
      consecutiveApiFailures++
      log(`  ! generate-voices HTTP ${res.status} (attempt ${attempt}): ${text.slice(0, 300)}`)
    } catch (e) {
      consecutiveApiFailures++
      log(`  ! generate-voices request error (attempt ${attempt}): ${String(e).slice(0, 300)}`)
    }
    if (consecutiveApiFailures >= 2) throw new BatchStop(`Two consecutive generate-voices failures (body ${JSON.stringify(body)})`)
    await new Promise((r) => setTimeout(r, 10_000))
  }
  throw new BatchStop('generate-voices failed')
}

async function elevenLabsCharacterCount(): Promise<number | null> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key || !key.startsWith('sk_')) return null
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    return typeof j.character_count === 'number' ? j.character_count : null
  } catch { return null }
}

function runChild(label: string, cmd: string, args: string[], timeoutMs: number): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: process.env })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  if (r.error) log(`  ! ${label} error: ${String(r.error).slice(0, 300)}`)
  return { ok: r.status === 0 && !r.error, out }
}

function render(id: string) {
  const r = runChild('render', 'npx', ['tsx', 'scripts/run-render-final-mix-local.ts', id], RENDER_TIMEOUT_MS)
  if (!r.ok) {
    log(r.out.split('\n').slice(-40).join('\n'))
    throw new BatchStop(`Render failed or timed out for ${id}`)
  }
}

function garble(id: string) {
  // Exit code 1 just means "has fails"; only a missing report is fatal.
  const r = runChild('garble', 'node', ['garble-detection-gate.js', id], GARBLE_TIMEOUT_MS)
  const reportPath = parseGarbleReportPath(r.out)
  if (!reportPath || !fs.existsSync(reportPath)) {
    log(r.out.split('\n').slice(-40).join('\n'))
    throw new BatchStop(`Garble check produced no report for ${id}`)
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'))
}

async function voiceSegments(sb: SupabaseClient, id: string, indices: number[]) {
  for (let i = 0; i < indices.length; i++) {
    await postGenerateVoices({ storyId: id, retryMissingOnly: true, segmentNumber: indices[i] })
    if ((i + 1) % 25 === 0) log(`  voices ${i + 1}/${indices.length}`)
  }
  const files = await listFolder(sb, `asc3/${id}`)
  const qcskips = files.filter((f) => f.endsWith('.qcskip.json'))
  if (qcskips.length > 0) {
    throw new BatchStop(`Speech check (OpenAI Whisper) was skipped for ${qcskips.length} segment(s) in ${id} — audio unchecked. Fix OpenAI, then re-run.`)
  }
  const missing = expectedSegmentNames(indices).filter((n) => !files.includes(n))
  if (missing.length > 0) throw new BatchStop(`Missing ${missing.length} segment(s) in ${id} after voicing: ${missing.slice(0, 10).join(', ')}`)
}

async function processEpisode(sb: SupabaseClient, id: string, stamp: string, dryRun: boolean): Promise<string> {
  const folder = `asc3/${id}`
  const { data: story, error } = await sb.from('stories').select('id,title,episode_number,script').eq('id', id).single()
  if (error || !story?.script) throw new BatchStop(`Could not load story/script for ${id}: ${error?.message || 'no script'}`)
  const indices = parseScriptPositions(story.script).filter((p) => p.isExpected).map((p) => p.index)
  const files = await listFolder(sb, folder)
  const { backup, qcskips } = filesToBackUp(files)
  const ep = `EP${String(story.episode_number ?? '?').padStart(2, '0')}`
  log(`${ep} "${story.title}" — ${indices.length} expected segments; backing up ${backup.length} files, removing ${qcskips.length} qcskip files`)
  if (dryRun) return `${ep} | DRY RUN | would voice ${indices.length} segments, back up ${backup.length} files`

  // A — backup (move, never delete) + clear stale qcskip markers
  const backupDir = `${folder}/_backup_rr_${stamp}`
  for (const name of backup) await moveFile(sb, `${folder}/${name}`, `${backupDir}/${name}`)
  await removeFiles(sb, qcskips.map((n) => `${folder}/${n}`))

  // B — Belle intro/outro (hard gate)
  const belle = await postGenerateVoices({ storyId: id, generateBelleOnly: true })
  if (belle?.introStatus !== 'generated' || belle?.outroStatus !== 'generated') {
    throw new BatchStop(`Belle not generated for ${ep}: ${JSON.stringify(belle).slice(0, 400)}`)
  }

  // C — every expected segment, then verify
  await voiceSegments(sb, id, indices)

  // D + E
  render(id)
  let report = garble(id)

  // F — one touch-up of failing segments
  const fails = failedSegmentNumbers(report)
  if (fails.length > 0) {
    log(`  touch-up ${fails.length} failing segment(s): ${fails.join(', ')}`)
    const touchDir = `${folder}/_backup_rr_${stamp}_t`
    for (const n of fails) {
      const name = expectedSegmentNames([n])[0]
      await moveFile(sb, `${folder}/${name}`, `${touchDir}/${name}`)
    }
    await voiceSegments(sb, id, fails)
    render(id)
    report = garble(id)
  }

  const s = summarizeGarble(report)
  const remaining = s.failRows.map((r) => `${r.segName}(${r.wer})`).join(' ')
  return `${ep} | ok ${s.ok} | warn ${s.warn} | fail ${s.fail}${remaining ? ` | still failing: ${remaining}` : ''}`
}

async function main() {
  const { ids, dryRun, maxCredits } = parseArgs(process.argv.slice(2))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13) // e.g. 20260929T0112
  const state = dryRun ? {} as Record<string, any> : loadState()
  const baseline = await elevenLabsCharacterCount()
  log(`Start: ${ids.length} episode(s)${dryRun ? ' (DRY RUN — no changes)' : ''}; ElevenLabs baseline ${baseline ?? 'unavailable (credit stop disabled)'}; max credits ${maxCredits}`)
  log(`Backup prefixes: ${BACKUP_PREFIXES.join(', ')}`)

  const lines: string[] = []
  for (const id of ids) {
    if (state[id]?.done) { log(`skip ${id} (already done: ${state[id].summary})`); continue }
    if (baseline !== null && !dryRun) {
      const now = await elevenLabsCharacterCount()
      if (now !== null && now - baseline > maxCredits) throw new BatchStop(`Credit budget reached: ${now - baseline} > ${maxCredits}`)
    }
    const line = await processEpisode(sb, id, stamp, dryRun)
    const now = baseline !== null ? await elevenLabsCharacterCount() : null
    const withCredits = now !== null && baseline !== null ? `${line} | credits used ${now - baseline}` : line
    log(`RESULT ${withCredits}`)
    lines.push(withCredits)
    if (!dryRun) { state[id] = { done: true, summary: withCredits }; saveState(state) }
  }
  log('ALL DONE')
  for (const l of lines) console.log(l)
}

main().catch((e) => {
  log(`BATCH STOPPED: ${e instanceof BatchStop ? e.message : String(e)}`)
  process.exit(1)
})
