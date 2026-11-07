/**
 * SAFE-RERECORD-001 (Marc 2026-11-07): the one way to re-record lines of a finished story.
 * Replaces hand-written shell steps, which on Nov 7 re-recorded Sunset Ep 8 after the backup
 * had failed. Order is fixed and every step is checked:
 *
 *   1. backup the listed segments + final_mix/story_body/story_body_with_outro/outro_with_music
 *   2. VERIFY every backup file exists with the same size — if not, exit 1 having changed NOTHING
 *   3. re-record each segment (same voice; text from the current script) — stop on the first error
 *   4. remix (render-final-mix) — no client timeout, so a 10-minute render is never cut off
 *   5. print the new audio_url and sizes
 *
 *   npx tsx scripts/rerecord-lines.ts <storyId> <seg,seg,...> [--origin http://localhost:3001] [--dry-run]
 *
 * Run on the server. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ADMIN_INTERNAL_TOKEN (never printed). --origin defaults to http://localhost:$PORT (3001).
 */
import http from 'http'
import https from 'https'
import { createClient } from '@supabase/supabase-js'

const MIX_FILES = ['final_mix.mp3', 'story_body.mp3', 'story_body_with_outro.mp3', 'outro_with_music.mp3']

export function parseSegments(arg: string): number[] {
  const nums = String(arg || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number)
  if (!nums.length || nums.some((n) => !Number.isInteger(n) || n < 0)) throw new Error(`bad segment list: "${arg}"`)
  return [...new Set(nums)]
}

export const segName = (n: number) => `segment_${String(n).padStart(4, '0')}.mp3`

/** Every planned backup present with the same size, or the list of what is wrong. */
export function backupProblems(planned: Array<{ name: string; size: number }>, inBackup: Map<string, number>): string[] {
  return planned.filter((p) => inBackup.get(p.name) !== p.size).map((p) => `${p.name}: expected ${p.size} bytes, backup has ${inBackup.get(p.name) ?? 'nothing'}`)
}

/** POST JSON with no client-side timeout (a remix can take 10+ minutes). */
function postJson(url: string, body: unknown, token: string): Promise<{ status: number; json: any }> {
  const u = new URL(url)
  const mod = u.protocol === 'https:' ? https : http
  const data = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-et-internal-key': token } }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        let json: any = null
        try { json = JSON.parse(raw) } catch { json = { error: raw.slice(0, 300) } }
        resolve({ status: res.statusCode || 0, json })
      })
    })
    req.setTimeout(0)
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  const [storyId, segArg] = process.argv.slice(2)
  const dryRun = process.argv.includes('--dry-run')
  const originIdx = process.argv.indexOf('--origin')
  const origin = originIdx > 0 ? process.argv[originIdx + 1] : `http://localhost:${process.env.PORT || 3001}`
  if (!storyId || !/^[0-9a-f-]{36}$/i.test(storyId)) throw new Error('usage: rerecord-lines.ts <storyId> <seg,seg,...> [--origin URL] [--dry-run]')
  const segments = parseSegments(segArg)
  const token = process.env.ADMIN_INTERNAL_TOKEN || ''
  if (token.length < 32) throw new Error('ADMIN_INTERNAL_TOKEN is not set')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: story, error: storyErr } = await db.from('stories').select('id,title,episode_number,audio_url').eq('id', storyId).single()
  if (storyErr || !story) throw new Error(`story ${storyId} not found: ${storyErr?.message || ''}`)
  console.log(`Story: ${story.title} (Ep ${story.episode_number}) — segments ${segments.join(', ')}`)

  const folder = `asc3/${storyId}`
  const { data: files, error: listErr } = await db.storage.from('audio').list(folder, { limit: 1000 })
  if (listErr) throw new Error(`list ${folder}: ${listErr.message}`)
  const sizeOf = new Map((files || []).map((f: any) => [f.name, Number(f.metadata?.size || 0)]))
  const missing = segments.map(segName).filter((n) => !sizeOf.has(n))
  if (missing.length) throw new Error(`not in storage, nothing changed: ${missing.join(', ')}`)
  const planned = [...segments.map(segName), ...MIX_FILES.filter((n) => sizeOf.has(n))].map((name) => ({ name, size: sizeOf.get(name)! }))

  // 1–2. Backup and verify. Nothing is changed unless this fully succeeds.
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const backupDir = `${folder}/backup-${stamp}-rerecord`
  if (dryRun) { console.log(`DRY RUN: would back up ${planned.length} files to ${backupDir}, re-record ${segments.length}, then remix.`); return }
  for (const p of planned) {
    const { error } = await db.storage.from('audio').copy(`${folder}/${p.name}`, `${backupDir}/${p.name}`)
    if (error) { console.error(`BACKUP FAILED for ${p.name}: ${error.message}. Nothing was changed.`); process.exit(1) }
  }
  const { data: bfiles, error: bErr } = await db.storage.from('audio').list(backupDir, { limit: 1000 })
  if (bErr) { console.error(`BACKUP VERIFY FAILED: ${bErr.message}. Nothing was changed.`); process.exit(1) }
  const problems = backupProblems(planned, new Map((bfiles || []).map((f: any) => [f.name, Number(f.metadata?.size || 0)])))
  if (problems.length) { console.error(`BACKUP VERIFY FAILED. Nothing was changed.\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`Backup verified: ${planned.length} files in ${backupDir}`)

  // 3. Re-record, stop on the first error.
  for (const n of segments) {
    const r = await postJson(`${origin}/api/admin/generate-voices`, { storyId, retryMissingOnly: true, segmentNumber: n, rerecordSegment: true }, token)
    const failures = Array.isArray(r.json?.failures) ? r.json.failures : []
    if (r.status >= 400 || r.json?.success === false || failures.length) {
      console.error(`STOPPED at ${segName(n)}: HTTP ${r.status} ${String(r.json?.error || failures[0]?.error || '').slice(0, 300)}`)
      console.error(`Already re-recorded before the stop: ${segments.slice(0, segments.indexOf(n)).map(segName).join(', ') || 'none'}. Originals: ${backupDir}`)
      process.exit(2)
    }
    console.log(`Re-recorded ${segName(n)}`)
  }

  // 4. Remix.
  const mix = await postJson(`${origin}/api/asc3/render-final-mix`, { storyId }, token)
  if (mix.status >= 400 || mix.json?.success === false) {
    console.error(`REMIX FAILED: HTTP ${mix.status} ${String(mix.json?.error || '').slice(0, 300)}. Segments are re-recorded; originals in ${backupDir}`)
    process.exit(3)
  }
  const { data: after } = await db.from('stories').select('audio_url,duration_mins').eq('id', storyId).single()
  console.log(`DONE. audio_url: ${after?.audio_url} (${after?.duration_mins} min). Originals: ${backupDir}`)
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
