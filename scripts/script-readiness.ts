/**
 * SCRIPT-READINESS-001 CLI — READ-ONLY. Lists which stories can enter paid
 * production right now, and every deterministic blocker for the rest.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env):
 *   npx tsx scripts/script-readiness.ts                      # queue + repair + cold storage
 *   npx tsx scripts/script-readiness.ts --states stories_in_queue,repair_queue
 *   npx tsx scripts/script-readiness.ts --min-minutes 12 --sfx-max 6   # what-if: canon Spec v1.5 limits
 *   npx tsx scripts/script-readiness.ts --json > readiness.json
 *
 * Never writes to the database.
 */
import { createClient } from '@supabase/supabase-js'
import { checkScriptReadiness } from '../lib/scriptReadiness'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const states = (arg('states') || 'stories_in_queue,repair_queue,cold_storage').split(',')
  const minMinutes = arg('min-minutes') ? Number(arg('min-minutes')) : undefined
  const sfxMax = arg('sfx-max') ? Number(arg('sfx-max')) : undefined

  const { data: voices } = await sb.from('narrator_voices').select('name')
  const narratorVoiceNames = (voices || []).map((v: { name: string }) => v.name)

  const rows: any[] = []
  for (let from = 0; ; from += 200) {
    const { data, error } = await sb
      .from('stories')
      .select('id,title,workflow_state,story_type,series_id,series_total_episodes,episode_number,is_v2,duration_mins,script')
      .in('workflow_state', states)
      .not('script', 'is', null)
      .range(from, from + 199)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < 200) break
  }

  const results = rows.map((r) => ({
    id: r.id,
    title: r.title,
    state: r.workflow_state,
    v2: r.is_v2,
    ...checkScriptReadiness({
      script: r.script,
      storyType: r.story_type,
      seriesId: r.series_id,
      seriesTotalEpisodes: r.series_total_episodes,
      episodeNumber: r.episode_number,
      narratorVoiceNames,
      minMinutes,
      sfxMax,
      briefMinutes: r.duration_mins,
    }),
  }))

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  const ready = results.filter((r) => r.ready)
  const gateCounts: Record<string, number> = {}
  for (const r of results) for (const g of new Set(r.blockers.map((b) => b.gate))) gateCounts[g] = (gateCounts[g] || 0) + 1

  console.log(`Checked ${results.length} scripts in [${states.join(', ')}]`)
  console.log(`READY: ${ready.length}`)
  for (const r of ready) console.log(`  ✅ ${r.id.slice(0, 8)}  ${r.state}  ${r.metrics.estimatedMins} min  ${r.title}`)
  console.log('Stories blocked per gate:')
  for (const [g, n] of Object.entries(gateCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${g}: ${n}`)
  const oneAway = results.filter((r) => r.blockers.length === 1)
  console.log(`ONE BLOCKER AWAY: ${oneAway.length}`)
  for (const r of oneAway.slice(0, 25)) console.log(`  ${r.id.slice(0, 8)}  ${r.blockers[0].gate}: ${r.blockers[0].detail}  — ${r.title}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
