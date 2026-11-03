/**
 * SFX-GEMINI-CHECK-001 (Marc 2026-11-03): Gemini LISTENS to sounds so bad ones
 * (like the "walking in water" footsteps) are caught before Marc hears them.
 * Read-only for the library and the stories: it only writes its own report.
 *
 *   # 1. Screen downloaded candidates BEFORE ingest (folder per catalog ID, e.g. ~/ss/CR-02/*.wav).
 *   #    Ranks each folder's files and names the best 3 to keep.
 *   npx tsx scripts/sfx-gemini-check.ts candidates <folder>
 *
 *   # 2. Screen every Soundsnap take already in the catalog.
 *   npx tsx scripts/sfx-gemini-check.ts library
 *
 *   # 3. Review a finished test mix (time-stamped problems).
 *   npx tsx scripts/sfx-gemini-check.ts mix story:<storyId> --tag v4soundsnap3
 *
 * Needs GEMINI_API_KEY (never printed). Optional GEMINI_MODEL (default gemini-3.8-flash).
 * Library / mix modes also need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Reports: printed, and saved next to the input (candidates: <folder>/gemini-report.json;
 * library: audio/sfx-library/gemini-check.json; mix: audio/asc3/<id>/preview/<tag>/gemini-review.txt).
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const API = 'https://generativelanguage.googleapis.com'
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const KEY = process.env.GEMINI_API_KEY || ''
const AUDIO_EXT: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac', '.ogg': 'audio/ogg' }
const INLINE_MAX = 15 * 1024 * 1024

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function uploadFile(buf: Buffer, mime: string, name: string): Promise<{ uri: string; mimeType: string }> {
  const start = await fetch(`${API}/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length), 'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, 120) } }),
  })
  const url = start.headers.get('x-goog-upload-url')
  if (!start.ok || !url) throw new Error(`Gemini upload start failed (${start.status})`)
  const done = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(buf.length) }, body: buf })
  const j: any = await done.json()
  let file = j?.file
  if (!file?.uri) throw new Error('Gemini upload returned no file')
  for (let i = 0; i < 60 && file.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    file = await (await fetch(`${API}/v1beta/${file.name}?key=${KEY}`)).json()
  }
  if (file.state && file.state !== 'ACTIVE') throw new Error(`Gemini file state ${file.state}`)
  return { uri: file.uri, mimeType: file.mimeType || mime }
}

/** Ask Gemini about one or more audio clips; returns parsed JSON. */
async function ask(prompt: string, clips: Array<{ buf: Buffer; mime: string; label: string }>): Promise<any> {
  const parts: any[] = []
  for (const c of clips) {
    parts.push({ text: `AUDIO: ${c.label}` })
    if (c.buf.length <= INLINE_MAX && clips.reduce((a, x) => a + x.buf.length, 0) <= INLINE_MAX) parts.push({ inline_data: { mime_type: c.mime, data: c.buf.toString('base64') } })
    else { const f = await uploadFile(c.buf, c.mime, c.label); parts.push({ file_data: { mime_type: f.mimeType, file_uri: f.uri } }) }
  }
  parts.push({ text: prompt })
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
    })
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 5000 * attempt)); continue }
    const j: any = await res.json()
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(j?.error?.message || '').slice(0, 200)}`)
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('')
    try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { return { raw: text } }
  }
  throw new Error('Gemini busy after 3 tries')
}

const SOUND_RULES = [
  'You are a professional sound editor for audio dramas played in cars.',
  'Listen carefully. Judge ONLY what you actually hear, not the file name.',
  'A good take is clean (no hiss, no clicks, no music, no talking unless the name asks for voices), sounds like the named thing to an ordinary listener, and would be clear on car speakers.',
].join('\n')

async function candidates(folder: string) {
  const out: any = { model: MODEL, checkedAt: new Date().toISOString(), names: {} }
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  for (const dir of readdirSync(folder).sort()) {
    const full = join(folder, dir)
    if (!statSync(full).isDirectory()) continue
    const name = SFX_CATALOG_NAMES.find((n) => n.id === dir.toUpperCase())
    if (!name) { console.log(`skip ${dir}: not a catalog ID`); continue }
    const files = readdirSync(full).filter((f) => AUDIO_EXT[extname(f).toLowerCase()]).sort()
    if (!files.length) continue
    const clips = files.map((f, i) => ({ buf: readFileSync(join(full, f)), mime: AUDIO_EXT[extname(f).toLowerCase()], label: `#${i + 1}` }))
    const prompt = `${SOUND_RULES}\n\nAll clips are candidates for the sound "${name.name}" (${name.kind === 'background' ? 'a steady background, about 10 seconds will be used' : 'a short spot effect'}).\n` +
      `For EACH clip (#1..#${files.length}) return: n, matches ("yes"|"partly"|"no"), score 1-10, heard (what it actually sounds like, 12 words max), problems (list).\n` +
      `Then "keep": the numbers of the best clips to keep (at most 3, only ones scoring 7+ that match "yes").\n` +
      `Return JSON: {"clips":[{"n":1,"matches":"yes","score":8,"heard":"...","problems":[]}],"keep":[1,3]}`
    const r = await ask(prompt, clips)
    const rows = (r.clips || []).map((c: any) => ({ ...c, file: files[Number(c.n) - 1] }))
    const keep = (r.keep || []).map((n: number) => files[n - 1]).filter(Boolean)
    out.names[name.id] = { name: name.name, clips: rows, keep }
    console.log(`\n${name.id} ${name.name}`)
    for (const c of rows) console.log(`  ${c.matches === 'yes' && c.score >= 7 ? 'OK ' : 'BAD'} ${c.score}/10 ${c.file} — ${c.heard}${c.problems?.length ? ` (problems: ${c.problems.join('; ')})` : ''}`)
    console.log(`  KEEP: ${keep.length ? keep.join(' | ') : '(none good — download more)'}`)
  }
  writeFileSync(join(folder, 'gemini-report.json'), JSON.stringify(out, null, 2))
  console.log(`\nsaved ${join(folder, 'gemini-report.json')}`)
}

async function library() {
  const { createClient } = await import('@supabase/supabase-js')
  const { loadCatalog } = await import('../lib/sfxCatalog')
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const catalog = await loadCatalog(db as any)
  const out: any = { model: MODEL, checkedAt: new Date().toISOString(), takes: [] }
  for (const n of SFX_CATALOG_NAMES) {
    for (const t of catalog.entries[n.id]?.takes || []) {
      if (t.source !== 'licensed' || t.status === 'discarded') continue
      const { data } = await db.storage.from('audio').download(t.path)
      if (!data) { console.log(`  ${n.id} ${t.libraryId}: download failed`); continue }
      const buf = Buffer.from(await data.arrayBuffer())
      const r = await ask(`${SOUND_RULES}\n\nThis clip is filed as "${n.name}" (${n.kind}). Return JSON: {"matches":"yes|partly|no","score":1-10,"heard":"12 words max","problems":[]}`, [{ buf, mime: 'audio/mpeg', label: t.name }])
      const ok = r.matches === 'yes' && Number(r.score) >= 7
      out.takes.push({ id: n.id, name: n.name, libraryId: t.libraryId, ok, ...r })
      console.log(`${ok ? 'OK ' : 'BAD'} ${n.id} ${n.name} ${r.score}/10 — ${t.libraryId} — heard: ${r.heard}`)
    }
  }
  const bad = out.takes.filter((t: any) => !t.ok)
  console.log(`\n${out.takes.length} takes checked, ${bad.length} flagged. To remove flagged takes: npx tsx scripts/sfx-catalog-build.ts --discard ${bad.map((t: any) => t.libraryId.split('/').pop()).join(',') || '<none>'} --dry-run`)
  await db.storage.from('audio').upload('sfx-library/gemini-check.json', Buffer.from(JSON.stringify(out, null, 2)), { contentType: 'application/json', upsert: true })
  console.log('saved audio/sfx-library/gemini-check.json')
}

async function mix(target: string, tag: string) {
  const storyId = target.replace(/^story:/, '')
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const base = `asc3/${storyId}/preview/${tag}`
  const { data: audio } = await db.storage.from('audio').download(`${base}/final_mix.mp3`)
  if (!audio) throw new Error(`no ${base}/final_mix.mp3`)
  const { data: rep } = await db.storage.from('audio').download(`${base}/sfx-report.txt`)
  const report = rep ? (await rep.text()).slice(0, 20000) : '(no sound report)'
  const prompt = `${SOUND_RULES}\n\nThis is a full test mix of an audio drama episode (voices, music, sound effects). The planned effects are in this report:\n---\n${report}\n---\n` +
    'Listen to the whole mix. Find every problem with the SOUND EFFECTS and BACKGROUNDS: a sound that does not sound like what it should, too loud or too quiet against the voices, covering words, at the wrong moment, a background that lasts too long or fights the music, an effect that is missing where the story clearly needs one.\n' +
    'Return JSON: {"problems":[{"time":"m:ss","what":"...","severity":"high|medium|low","fix":"..."}],"good":["..."],"overall":"2 sentences"}'
  const r = await ask(prompt, [{ buf: Buffer.from(await audio.arrayBuffer()), mime: 'audio/mpeg', label: 'final_mix' }])
  const lines = [`GEMINI REVIEW (${MODEL}) — ${base}`, '', `OVERALL: ${r.overall || ''}`, '', 'PROBLEMS:',
    ...((r.problems || []) as any[]).map((p) => `  ${p.time}  [${p.severity}] ${p.what} → ${p.fix}`), '', 'GOOD:', ...((r.good || []) as any[]).map((g) => `  ${g}`)]
  const text = lines.join('\n')
  console.log(text)
  await db.storage.from('audio').upload(`${base}/gemini-review.txt`, Buffer.from(text), { contentType: 'text/plain; charset=utf-8', upsert: true })
  console.log(`\nsaved audio/${base}/gemini-review.txt`)
}

async function main() {
  if (!KEY) throw new Error('GEMINI_API_KEY missing')
  const mode = process.argv[2]
  if (mode === 'candidates') return candidates(process.argv[3] || '')
  if (mode === 'library') return library()
  if (mode === 'mix') return mix(process.argv[3] || '', arg('tag') || 'v4soundsnap3')
  throw new Error('usage: sfx-gemini-check.ts candidates <folder> | library | mix story:<id> --tag <tag>')
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
