/**
 * SFX-PREVIEW-001 (Marc 2026-10-31) — build a TEST version of one episode with
 * the new sound system (sounds on the exact word, a background under each
 * scene, no fixed count) and leave the published episode untouched.
 *
 *   npx tsx scripts/sfx-preview.ts story:<storyId> [--tag v2]
 *
 * Writes only:
 *   asc3/<id>/sfx-overlay-<tag>.json, asc3/<id>/sfx_overlay_<tag>_*.mp3,
 *   asc3/<id>/align/*.json (word timing cache),
 *   asc3/<id>/preview/<tag>/final_mix.mp3, asc3/<id>/preview/<tag>/sfx-report.txt
 * Needs .env.local (never printed) and SFX_OVERLAY=on, SFX_LAYERED_MIX=on.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const target = process.argv[2] || ''
  if (!target.startsWith('story:')) throw new Error('usage: sfx-preview.ts story:<storyId> [--tag v2]')
  const storyId = target.slice(6)
  const tagArg = process.argv.indexOf('--tag')
  const tag = (tagArg > 0 ? process.argv[tagArg + 1] : 'v2').replace(/[^a-z0-9]/gi, '') || 'v2'
  process.env.SFX_LIBRARY = 'on'
  for (const flag of ['SFX_OVERLAY', 'SFX_LAYERED_MIX']) {
    if (String(process.env[flag] || '').toLowerCase() !== 'on') throw new Error(`${flag} must be on`)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { parseScriptPositions } = await import('../lib/scriptLineIndex')
  const { sfxFileName } = await import('../lib/sfxGenerate')
  const { ensureOverlayPlan, loadOverlayPlan } = await import('../lib/sfxOverlayRunner')
  const { buildSfxReport } = await import('../lib/sfxReport')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: story, error } = await db.from('stories').select('id,title,series_name,episode_number,series_episode_number,script,genre,primary_genre,brief_json,audio_url').eq('id', storyId).single()
  if (error || !story) throw new Error(`story not found: ${error?.message || storyId}`)
  const script = String(story.script || '')
  const genre = String(story.primary_genre || story.genre || (story.brief_json as any)?.genre || '')

  console.log(`TEST mix "${story.title}" (tag ${tag}) — published episode is not changed`)
  await ensureOverlayPlan({ db: db as any, storyId, script, genre, style: (story.brief_json as any)?.style_profile || null, tag, force: true, log: (l) => console.log(l) })

  const { runRenderFinalMix } = await import('../app/api/asc3/render-final-mix/core')
  const res: any = await runRenderFinalMix(storyId, { previewTag: tag })
  if (!res?.success || !res?.preview) throw new Error(`test mix failed: ${res?.error || 'unknown'}`)

  const positions = parseScriptPositions(script)
  const scriptSources: Record<number, any> = {}
  for (const p of positions.filter((x) => x.kind === 'sfx')) {
    const { data } = await db.storage.from('audio').download(`asc3/${storyId}/${sfxFileName(p.index).replace('.mp3', '.source.json')}`)
    scriptSources[p.index] = data ? JSON.parse(await data.text()) : null
  }
  const num = Number(story.episode_number || story.series_episode_number || 1)
  const report = buildSfxReport(`${story.series_name || story.title} — TEST ${tag}`, [{ episodeNumber: num, title: String(story.title || ''), positions, scriptSources, overlay: await loadOverlayPlan(db as any, storyId, tag) }])
  await db.storage.from('audio').upload(`asc3/${storyId}/preview/${tag}/sfx-report.txt`, Buffer.from(report), { contentType: 'text/plain; charset=utf-8', upsert: true })
  console.log(`\n${report}\n`)
  console.log(`PUBLISHED (unchanged): ${story.audio_url}`)
  console.log(`TEST: ${res.finalAudioUrl}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
