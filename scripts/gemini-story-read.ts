/**
 * GEMINI-STORY-READ-001 — READ-ONLY. Gemini reads a whole series (as written in the DB) and
 * answers the spec §6.3 questions. Changes nothing; prints the report and writes JSON.
 *
 *   npx tsx scripts/gemini-story-read.ts "<series name>" [--stage final] [--episodes 1-3]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (never printed).
 * Model: GEMINI_STORY_MODEL or GEMINI_MODEL, default gemini-flash-latest.
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { checkSeriesFacts, formatFactSheet, castListsText } from '../lib/seriesFacts'
import { storyBodyText } from '../lib/seriesContinuity'
import { runGeminiStoryRead, summarizeStoryRead, type StoryReadStage } from '../lib/geminiStoryRead'

export function parseEpisodeRange(arg: string | undefined): [number, number] | null {
  if (!arg) return null
  const m = String(arg).match(/^(\d+)(?:-(\d+))?$/)
  if (!m) throw new Error(`bad --episodes "${arg}" (use 3 or 1-3)`)
  return [Number(m[1]), Number(m[2] || m[1])]
}

async function main() {
  const series = process.argv[2]
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
  const stage = (arg('--stage') === 'final' ? 'final' : 'script') as StoryReadStage
  const range = parseEpisodeRange(arg('--episodes'))
  if (!series) throw new Error('usage: gemini-story-read.ts "<series name>" [--stage final] [--episodes 1-3]')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('stories').select('id,title,episode_number,script').eq('series_name', series).order('episode_number', { ascending: true })
  if (error) throw new Error(error.message)
  const eps = (data || []).filter((e: any) => !range || (e.episode_number >= range[0] && e.episode_number <= range[1]))
  if (!eps.length) throw new Error(`no episodes found for "${series}"`)
  const factEpisodes = eps.map((e: any) => ({ episodeNumber: Number(e.episode_number), script: String(e.script || '') }))
  const facts = checkSeriesFacts(factEpisodes)
  const result = await runGeminiStoryRead({
    stage,
    seriesTitle: series,
    factSheet: formatFactSheet(facts.facts),
    castLists: castListsText(factEpisodes),
    episodes: eps.map((e: any) => ({ episodeNumber: Number(e.episode_number), title: String(e.title || ''), body: storyBodyText(String(e.script || '')) })),
  }, 'cli')
  const out = `/tmp/gemini-story-read-${series.replace(/[^A-Za-z0-9]+/g, '-')}.json`
  fs.writeFileSync(out, JSON.stringify(result, null, 2))
  console.log(`Series: ${series} — episodes ${eps.map((e: any) => e.episode_number).join(', ')} — model ${result.model}`)
  if (result.skipped || result.error) { console.log(`NOT READ: ${result.skipped || result.error}`); process.exit(1) }
  console.log(summarizeStoryRead({ verdict: result.verdict!, questions: result.questions! }))
  console.log(`JSON: ${out}`)
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
