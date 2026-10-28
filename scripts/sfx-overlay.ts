/**
 * SFX-OVERLAY-001 — plan and make the extra action sound effects for one
 * episode (or every episode of a series). Never edits scripts or voice clips.
 *
 *   npx tsx scripts/sfx-overlay.ts <storyId|series:<seriesId>> [--dry-run] [--force]
 *
 * --dry-run  print the planned effects only (one Claude call per episode, no
 *            ElevenLabs spend, nothing saved)
 * --force    re-plan and re-make even if an overlay already exists
 * Saves asc3/<storyId>/sfx-overlay.json + sfx_overlay_NNNN.mp3 files. The
 * effects are heard after the episode is re-mixed with SFX_LAYERED_MIX=on and
 * SFX_OVERLAY=on.
 */
import { createClient } from '@supabase/supabase-js'
import { ensureOverlayPlan } from '../lib/sfxOverlayRunner'

async function main() {
  const target = process.argv[2]
  if (!target) throw new Error('usage: sfx-overlay.ts <storyId|series:<seriesId>> [--dry-run] [--force]')
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const query = db.from('stories').select('id,title,series_episode_number,script,genre,primary_genre,brief_json')
  const { data: stories, error } = target.startsWith('series:')
    ? await query.eq('series_id', target.slice(7)).order('series_episode_number')
    : await query.eq('id', target)
  if (error || !stories?.length) throw new Error('no stories found: ' + (error?.message || target))
  for (const story of stories) {
    const genre = String(story.primary_genre || story.genre || (story.brief_json as any)?.genre || '')
    console.log(`\nEP${story.series_episode_number ?? '-'} ${story.title} (${genre})`)
    const plan = await ensureOverlayPlan({ db: db as any, storyId: story.id, script: String(story.script || ''), genre, force, dryRun, log: (l) => console.log(l) })
    if (!plan) console.log('  no overlay for this genre')
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
