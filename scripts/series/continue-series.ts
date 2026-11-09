// SERIES-CONTINUE-001 — add the missing episodes to an existing series, safely.
// Usage (EC2):
//   npx tsx scripts/series/continue-series.ts --series <uuid> --total 7 --dry-run   (plan only, writes nothing)
//   npx tsx scripts/series/continue-series.ts --series <uuid> --total 7             (plan + save)
// Needs ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already on the server).
//
// What it writes (never with --dry-run):
//   - NEW hidden episode rows N+1..total (status brief_complete) with full briefs.
//   - series.description = the new series bible (the script writer reads it); series.total_episodes = total.
//   - Existing episodes: ONLY series_total_episodes and series_is_finale=false. Nothing else is touched.
// After it saves, a normal series production job ({"mode":"series","seriesId":...}) writes and voices
// only the new episodes: the script writer skips episodes that already have a script.
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildContinuePrompt, buildNewEpisodeRows, checkContinuable, existingEpisodePatch, parseContinuePlan,
  type EpisodeDefaults, type ExistingEpisode,
} from '../../lib/series/continue-plan'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const seriesId = String(arg('--series') || '').trim()
  const total = Number(arg('--total') || 0)
  const model = arg('--model') || 'claude-opus-4-6'
  const dryRun = process.argv.includes('--dry-run')
  if (!/^[0-9a-f-]{36}$/i.test(seriesId)) throw new Error('--series <uuid> is required')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ak = process.env.ANTHROPIC_API_KEY
  if (!url || !sk || !ak) throw new Error('ANTHROPIC_API_KEY, SUPABASE URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, sk, { auth: { persistSession: false } })

  const { data: series, error: se } = await db.from('series').select('id,title,description,author').eq('id', seriesId).single()
  if (se || !series) throw new Error(se?.message || 'series not found')

  const { data: rows, error: re } = await db.from('stories')
    .select('id,title,description,script,status,is_hidden,brief_json,episode_number,series_episode_number,author,author_style,genre,narrative_voice,narrator_voice_name,duration_label,duration_mins')
    .eq('series_id', seriesId)
  if (re) throw new Error(re.message)
  const existing: ExistingEpisode[] = (rows || []).map((r: any) => ({
    id: r.id, number: Number(r.series_episode_number || r.episode_number || 0), title: r.title,
    description: r.description, script: r.script, status: r.status, is_hidden: r.is_hidden, brief_json: r.brief_json,
  }))
  const have = checkContinuable(existing, total)
  const ep1: any = (rows || []).find((r: any) => Number(r.series_episode_number || r.episode_number) === 1)
  const defaults: EpisodeDefaults = {
    author: ep1.author || series.author, author_style: ep1.author_style || null, genre: ep1.genre,
    narrative_voice: ep1.narrative_voice || null, narrator_voice_name: ep1.narrator_voice_name || null,
    duration_label: ep1.duration_label || null, duration_mins: ep1.duration_mins || null,
  }
  if (!defaults.author || !defaults.genre) throw new Error('episode 1 has no author or genre')

  console.log(`[continue-series] ${series.title}: has ${have} episodes, planning ${have + 1}..${total} with ${model}`)
  const anthropic = new Anthropic({ apiKey: ak })
  const res = await anthropic.messages.create({
    model, max_tokens: 12000, temperature: 0.6,
    messages: [{ role: 'user', content: buildContinuePrompt(series, defaults, existing, total) }],
  })
  const raw = res.content.map((c: any) => ('text' in c ? c.text : '')).join('')
  const plan = parseContinuePlan(raw, have, total)

  console.log(`\nSERIES BIBLE (${plan.series_bible.length} chars):\n${plan.series_bible}\n`)
  for (const e of plan.episodes) {
    console.log(`EP${e.episode_number} "${e.title}"${e.episode_number === total ? ' (FINALE)' : ''}\n  ${e.description}\n  Ends: ${e.cliffhanger_or_resolution}\n`)
  }
  if (dryRun) { console.log('[continue-series] DRY RUN: nothing written'); return }

  const newRows = buildNewEpisodeRows(series, defaults, plan, total)
  const { error: ie } = await db.from('stories').insert(newRows)
  if (ie) throw new Error('insert failed, nothing else written: ' + ie.message)
  for (const ep of existing) {
    const { error } = await db.from('stories').update(existingEpisodePatch(ep, total)).eq('id', ep.id)
    if (error) throw new Error(`episode ${ep.number} count update failed: ${error.message}`)
  }
  const { error: ue } = await db.from('series').update({ description: plan.series_bible, total_episodes: total }).eq('id', seriesId)
  if (ue) throw new Error('series bible update failed: ' + ue.message)
  console.log(`[continue-series] saved ${newRows.length} hidden episodes (${have + 1}..${total}); existing episodes now say ${total} total`)
  console.log(`[continue-series] next: queue a series production job {"mode":"series","seriesId":"${seriesId}"}`)
}
main().catch(e => { console.error('[continue-series] FAILED: ' + (e instanceof Error ? e.message : String(e))); process.exit(1) })
