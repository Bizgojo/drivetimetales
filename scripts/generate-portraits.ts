/**
 * PORTRAITS-001 — make a photo for every active author and narrator that has
 * none (gpt-image-1.5, the model the cover router uses; gpt-image-1 is retired), save it to the
 * Covers bucket and set photo_url. Invented people only (lib/portraitPrompt.ts).
 *
 *   npx tsx scripts/generate-portraits.ts --dry-run          # list who, print prompts
 *   npx tsx scripts/generate-portraits.ts                    # make all missing
 *   npx tsx scripts/generate-portraits.ts --only "Elena Marsh"   # redo one (even if it has a photo)
 *   npx tsx scripts/generate-portraits.ts --kind authors|narrators --limit 5
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const only = arg('--only')
  const kind = arg('--kind') || 'all'
  const limit = Number(arg('--limit') || 0) || Infinity
  const { createClient } = await import('@supabase/supabase-js')
  const sharp = (await import('sharp')).default
  const { buildPortraitPrompt, genderFromBio, ageFromBirthYear, slugForPortrait } = await import('../lib/portraitPrompt')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5'

  type Job = { table: 'authors' | 'narrator_voices'; folder: string; id: string; name: string; prompt: string }
  const jobs: Job[] = []
  if (kind === 'all' || kind === 'authors') {
    const { data, error } = await db.from('authors').select('id,name,bio,description,genre,primary_genre,birth_year,photo_url').eq('is_active', true)
    if (error) throw new Error(`authors: ${error.message}`)
    for (const a of data || []) {
      if (only ? a.name !== only : String(a.photo_url || '').trim()) continue
      const bio = a.bio || a.description || ''
      jobs.push({ table: 'authors', folder: 'authors', id: a.id, name: a.name, prompt: buildPortraitPrompt({ kind: 'author', name: a.name, gender: genderFromBio(bio), age: ageFromBirthYear(a.birth_year), genre: a.primary_genre || a.genre, bio }) })
    }
  }
  if (kind === 'all' || kind === 'narrators') {
    const { data, error } = await db.from('narrator_voices').select('id,name,gender,age_bracket,accent,primary_tone,tone,photo_url').eq('is_active', true)
    if (error) throw new Error(`narrator_voices: ${error.message}`)
    for (const n of data || []) {
      if (only ? n.name !== only : String(n.photo_url || '').trim()) continue
      jobs.push({ table: 'narrator_voices', folder: 'narrators', id: n.id, name: n.name, prompt: buildPortraitPrompt({ kind: 'narrator', name: n.name, gender: n.gender, age: n.age_bracket ? `${n.age_bracket}` : null, accent: n.accent, tone: n.primary_tone || n.tone }) })
    }
  }
  const todo = jobs.slice(0, limit)
  console.log(`${todo.length} portrait(s) to make (${jobs.filter((j) => j.table === 'authors').length} authors, ${jobs.filter((j) => j.table === 'narrator_voices').length} narrators)`)
  if (dryRun) { for (const j of todo) console.log(`- ${j.table} ${j.name}\n  ${j.prompt}`); return }

  let made = 0
  for (const j of todo) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: j.prompt, n: 1, size: '1024x1024', quality: 'high' }),
      })
      if (!res.ok) throw new Error(`image HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const body: any = await res.json()
      const b64 = body?.data?.[0]?.b64_json
      const raw = b64 ? Buffer.from(b64, 'base64') : Buffer.from(await (await fetch(body?.data?.[0]?.url)).arrayBuffer())
      const jpg = await sharp(raw).resize(800, 800).jpeg({ quality: 88 }).toBuffer()
      const filePath = `${j.folder}/${slugForPortrait(j.name)}.jpg`
      const { error: upErr } = await db.storage.from('Covers').upload(filePath, jpg, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Covers/${filePath}?v=${Date.now()}`
      const { error: dbErr } = await db.from(j.table).update({ photo_url: url }).eq('id', j.id)
      if (dbErr) throw new Error(`update: ${dbErr.message}`)
      made += 1
      console.log(`✓ ${j.name} → ${url}`)
    } catch (err) {
      console.log(`✗ ${j.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`\n${made} of ${todo.length} portraits made.`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
