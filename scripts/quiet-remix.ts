/**
 * SFX-QUIET-REMIX-001 (Marc 2026-11-01: "Quiet the stories with the bad
 * sounds") — re-mix published episodes that have sound effects, WITHOUT any
 * effects, until the professional library is in. Voices are reused exactly as
 * recorded (no ElevenLabs credits); the music uses the current mix (stage 1/2
 * when MIX_V3/MIX_V4 are on). The effect files stay in storage untouched, so
 * the sounds can be put back later with a re-mix.
 *
 *   npx tsx scripts/quiet-remix.ts --list                 # show what would be re-mixed, change nothing
 *   npx tsx scripts/quiet-remix.ts story:<storyId>        # one episode (listen before doing the rest)
 *   npx tsx scripts/quiet-remix.ts --all                  # every published episode that has effects
 *
 * One episode at a time; a failure is reported and the run moves on (a failed
 * mix never replaces the published audio). Writes a summary to
 * audio/asc3/quiet-remix/<timestamp>.txt. Needs .env.local (never printed).
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SFX_FILE = /^sfx_\d{4}\.mp3$|^sfx_overlay_.*\.mp3$/

async function main() {
  const arg = process.argv[2] || ''
  const list = process.argv.includes('--list')
  const all = process.argv.includes('--all')
  if (!list && !all && !arg.startsWith('story:')) throw new Error('usage: quiet-remix.ts --list | story:<storyId> | --all')
  // This tool exists to remove effects: off for this process whatever the service setting.
  process.env.SFX_OFF = 'on'

  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  let targets: Array<{ id: string; title: string; series_name: string | null; episode_number: number | null; fx: number }> = []
  if (arg.startsWith('story:')) {
    const id = arg.slice(6)
    const { data, error } = await db.from('stories').select('id,title,series_name,episode_number,status').eq('id', id).single()
    if (error || !data) throw new Error(`story not found: ${id}`)
    targets = [{ ...(data as any), fx: -1 }]
  } else {
    const { data: stories, error } = await db
      .from('stories')
      .select('id,title,series_name,episode_number,sfx_disabled')
      .eq('status', 'published')
      .order('series_name')
      .order('episode_number')
    if (error) throw new Error(error.message)
    for (const s of stories || []) {
      if ((s as any).sfx_disabled) continue
      const { data: files } = await db.storage.from('audio').list(`asc3/${s.id}`, { limit: 1000 })
      const fx = (files || []).filter((f: any) => SFX_FILE.test(f.name)).length
      if (fx > 0) targets.push({ ...(s as any), fx })
    }
  }

  console.log(`${targets.length} episode(s) with sound effects${list ? ' (list only — nothing changed)' : ''}:`)
  for (const t of targets) console.log(`  ${t.series_name || '(single)'} EP${t.episode_number ?? '-'} "${t.title}" ${t.fx >= 0 ? `(${t.fx} effect files)` : ''}  ${t.id}`)
  if (list) return

  const { runRenderFinalMix } = await import('../app/api/asc3/render-final-mix/core')
  const results: string[] = []
  let ok = 0
  for (const [i, t] of targets.entries()) {
    console.log(`\n=== ${i + 1}/${targets.length} ${t.series_name || ''} EP${t.episode_number ?? '-'} "${t.title}" — re-mixing with no effects ===`)
    try {
      const res: any = await runRenderFinalMix(t.id)
      if (!res?.success) throw new Error(res?.error || 'unknown')
      ok += 1
      results.push(`OK    ${t.id} ${t.series_name || ''} EP${t.episode_number ?? '-'} "${t.title}" → ${res.finalAudioUrl || ''}`)
    } catch (err) {
      results.push(`FAIL  ${t.id} ${t.series_name || ''} EP${t.episode_number ?? '-'} "${t.title}": ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`)
    }
    console.log(results[results.length - 1])
  }
  const summary = [`SFX-QUIET-REMIX-001 ${new Date().toISOString()}: ${ok}/${targets.length} re-mixed with no effects`, ...results].join('\n')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  await db.storage.from('audio').upload(`asc3/quiet-remix/${stamp}.txt`, Buffer.from(summary), { contentType: 'text/plain; charset=utf-8', upsert: true })
  console.log(`\n${summary}\n\nsaved: audio/asc3/quiet-remix/${stamp}.txt`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
