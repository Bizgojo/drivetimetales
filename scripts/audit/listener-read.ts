/**
 * LISTENER-READ-001 — advisory "how would a listener hear this?" report (see lib/listenerRead.ts).
 * Run on EC2 (needs ANTHROPIC_API_KEY):
 *   npx tsx scripts/audit/listener-read.ts --series "Mercy Island" --episodes 1-3
 * Saves to atlas_settings key "listener_read:<seriesId>" (JSON, one entry per episode).
 * Read-only for stories: changes no script.
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { listenerScenes, predictPrompt, judgePrompt, parseJsonReply, intendedPlanText } from '../../lib/listenerRead'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.LISTENER_READ_MODEL || 'claude-sonnet-4-6'

async function ask(prompt: string, maxTokens = 400): Promise<string> {
  const r = await anthropic.messages.create({ model: MODEL, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
  return r.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('')
}

async function main() {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
  const title = arg('--series')
  if (!title) throw new Error('--series "<title>" is required')
  const [from, to] = String(arg('--episodes') || '1-3').split('-').map(Number)
  const { data: series } = await db.from('series').select('id,title').eq('title', title).maybeSingle()
  if (!series) throw new Error(`series not found: ${title}`)
  const { data: eps } = await db.from('stories').select('id,title,episode_number,script,brief_json').eq('series_id', series.id).order('episode_number')
  const key = `listener_read:${series.id}`
  const { data: prior } = await db.from('atlas_settings').select('value').eq('key', key).maybeSingle()
  const saved: Record<string, any> = prior?.value ? JSON.parse(prior.value) : {}
  const earlierTitles: string[] = []
  for (const ep of eps || []) {
    const n = Number(ep.episode_number)
    if (n < from || n > (to || from)) { earlierTitles.push(`Episode ${n}: ${ep.title}`); continue }
    const scenes = listenerScenes(ep.script || '')
    if (scenes.length < 2) { console.log(`EP${n}: fewer than 2 scenes — skipped`); continue }
    const predictions: any[] = []
    const retells: any[] = []
    // RETELL-TEST-001: after each scene (including the last) the listener retells it; before each
    // next scene it predicts what comes next.
    for (let k = 1; k <= scenes.length; k++) {
      const reply = parseJsonReply<any>(await ask(predictPrompt({ seriesTitle: series.title, episodeNumber: n, episodeTitle: ep.title, earlier: earlierTitles.join('\n'), soFar: scenes.slice(0, k) })))
      retells.push({ scene: k, retell: String(reply?.retell_last_scene || ''), lost_track: String(reply?.lost_track || '') })
      if (k < scenes.length) predictions.push({ beforeScene: k + 1, expect_next: String(reply?.expect_next || ''), confidence: Number(reply?.confidence || 0), want_to_keep_listening: Number(reply?.want_to_keep_listening || 0) })
    }
    const verdict = parseJsonReply<any>(await ask(judgePrompt({ seriesTitle: series.title, episodeNumber: n, episodeTitle: ep.title, scenes, predictions, retells, intendedPlan: intendedPlanText(ep.brief_json, n) }), 4000))
    saved[String(n)] = { storyId: ep.id, title: ep.title, checkedAt: new Date().toISOString(), model: MODEL, scenes: scenes.map((s) => ({ n: s.n, heading: s.heading })), predictions, retells, verdict }
    console.log(`EP${n} "${ep.title}": ${scenes.length} scenes; advancing ${verdict?.scores?.lines_advancing_share ?? '?'}, followable ${verdict?.scores?.lines_followable_share ?? '?'}; want next ${JSON.stringify(verdict?.ending?.want_next || {})}; fixes: ${(verdict?.top_fixes || []).join(' | ')}`)
    earlierTitles.push(`Episode ${n}: ${ep.title}`)
  }
  await db.from('atlas_settings').upsert({ key, value: JSON.stringify(saved), updated_at: new Date().toISOString(), updated_by: 'listener-read' }, { onConflict: 'key' })
  console.log(`LISTENER-READ-001: saved to atlas_settings "${key}"`)
}
main().catch((e) => { console.error(e); process.exit(1) })
