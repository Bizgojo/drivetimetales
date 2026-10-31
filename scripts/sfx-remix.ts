/**
 * SFX-REMIX-001 (Marc 2026-10-30 21:05 EDT: "You have my permission") — give a
 * finished series new sound effects from Marc's KEPT library sounds, without
 * touching any recorded voice, then re-mix and print the sound report.
 *
 *   npx tsx scripts/sfx-remix.ts series:<seriesId>            # do it
 *   npx tsx scripts/sfx-remix.ts series:<seriesId> --report   # report only, change nothing
 *
 * Per episode: archive the old effect files (asc3/<id>/archives/sfx-remix-<ts>/),
 * remake every script [SFX] cue, re-plan the action effects, re-render the final
 * mix (voices reused byte-for-byte), and write asc3/<id>/sfx-report.txt.
 * Published state is not changed. Needs .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY (never printed),
 * and SFX_OVERLAY=on, SFX_LAYERED_MIX=on.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const target = process.argv[2] || ''
  const reportOnly = process.argv.includes('--report')
  if (!target.startsWith('series:')) throw new Error('usage: sfx-remix.ts series:<seriesId> [--report]')
  const seriesId = target.slice(7)
  // This tool exists to use the library: on for this process even if the service default differs.
  process.env.SFX_LIBRARY = 'on'
  for (const flag of ['SFX_OVERLAY', 'SFX_LAYERED_MIX']) {
    if (String(process.env[flag] || '').toLowerCase() !== 'on') throw new Error(`${flag} must be on (the re-mix would drop the effects otherwise)`)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { parseScriptPositions } = await import('../lib/scriptLineIndex')
  const { generateScriptSfx, sfxFileName } = await import('../lib/sfxGenerate')
  const { ensureOverlayPlan, loadOverlayPlan } = await import('../lib/sfxOverlayRunner')
  const { buildSfxReport } = await import('../lib/sfxReport')
  const { SFX_LIBRARY_MANIFEST } = await import('../lib/sfxLibrary')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`

  const { data: man } = await db.storage.from('audio').download(SFX_LIBRARY_MANIFEST)
  const manifest = man ? JSON.parse(await man.text()) : { entries: [] }
  const approved = (manifest.entries || []).filter((e: any) => e.status === 'approved').length
  console.log(`library: ${approved} kept sounds`)
  if (!approved && !reportOnly) throw new Error('no kept sounds in the library — nothing to re-mix with')

  const { data: stories, error } = await db
    .from('stories')
    .select('id,title,series_name,series_episode_number,episode_number,script,genre,primary_genre,brief_json')
    .eq('series_id', seriesId)
    .order('episode_number')
  if (error || !stories?.length) throw new Error(`no episodes for series ${seriesId}: ${error?.message || ''}`)

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const episodes: any[] = []
  for (const story of stories) {
    const num = Number(story.episode_number || story.series_episode_number || 0)
    const script = String(story.script || '')
    const positions = parseScriptPositions(script)
    const prefix = `asc3/${story.id}`
    console.log(`\nEP${num} ${story.title}`)

    if (!reportOnly) {
      // 1. Archive the old effect files (voices untouched).
      const { data: files } = await db.storage.from('audio').list(prefix, { limit: 1000 })
      const fx = (files || []).map((f: any) => f.name).filter((n: string) => /^sfx_\d{4}\.(mp3|source\.json)$|^sfx_overlay_\d{4}\.mp3$|^sfx-overlay\.json$/.test(n))
      for (const name of fx) {
        const { error: cpErr } = await db.storage.from('audio').copy(`${prefix}/${name}`, `${prefix}/archives/sfx-remix-${ts}/${name}`)
        if (cpErr) throw new Error(`archive failed for ${name}: ${cpErr.message} — stopping before any change`)
      }
      const overlayOld = fx.filter((n: string) => n.startsWith('sfx_overlay_') || n === 'sfx-overlay.json')
      if (overlayOld.length) await db.storage.from('audio').remove(overlayOld.map((n: string) => `${prefix}/${n}`))
      console.log(`  archived ${fx.length} old effect files`)

      // 2. Remake every script [SFX] cue (library first, AI fallback).
      for (const p of positions.filter((x) => x.kind === 'sfx')) {
        const made = await generateScriptSfx({ db: db as any, storyId: story.id, lineIndex: p.index, description: String(p.text || ''), elevenLabsKey: process.env.ELEVENLABS_API_KEY!, baseStorage: base, force: true })
        console.log(`  ${sfxFileName(p.index)} "${p.text}" → ${made ? (made.source.kind === 'library' ? `kept sound: ${made.source.libraryName}` : 'AI-made') : 'FAILED'}`)
      }

      // 3. Re-plan the action effects.
      const genre = String(story.primary_genre || story.genre || (story.brief_json as any)?.genre || '')
      await ensureOverlayPlan({ db: db as any, storyId: story.id, script, genre, style: (story.brief_json as any)?.style_profile || null, force: true, log: (l) => console.log(l) })

      // 4. Re-render the final mix (voices reused as recorded).
      const { runRenderFinalMix } = await import('../app/api/asc3/render-final-mix/core')
      const res: any = await runRenderFinalMix(story.id)
      if (!res?.success) throw new Error(`re-mix failed for EP${num}: ${res?.error || 'unknown'}`)
      console.log(`  re-mixed: ${res.finalAudioUrl || ''}`)
    }

    // 5. Collect what each effect actually is, for the report.
    const scriptSources: Record<number, any> = {}
    for (const p of positions.filter((x) => x.kind === 'sfx')) {
      const { data } = await db.storage.from('audio').download(`${prefix}/${sfxFileName(p.index).replace('.mp3', '.source.json')}`)
      scriptSources[p.index] = data ? JSON.parse(await data.text()) : null
    }
    episodes.push({ episodeNumber: num, title: String(story.title || ''), positions, scriptSources, overlay: await loadOverlayPlan(db as any, story.id) })
  }

  const report = buildSfxReport(String(stories[0].series_name || ''), episodes)
  await db.storage.from('audio').upload(`asc3/series/${seriesId}/sfx-report.txt`, Buffer.from(report), { contentType: 'text/plain; charset=utf-8', upsert: true })
  console.log(`\n${report}\n\nsaved: audio/asc3/series/${seriesId}/sfx-report.txt`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
