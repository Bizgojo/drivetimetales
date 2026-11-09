// SERIES-CONTINUE-001 — plan ONLY the missing episodes of an existing series.
//
// Why: /api/v2/series-package re-plans a whole series and overwrites every
// existing episode row (title, brief, status, is_hidden). For the hook
// series (EP1 already live, sometimes EP2-3 voiced) that would wipe and hide
// published work. This module plans episodes N+1..total from the scripts that
// already exist, writes a real series bible, and returns rows to INSERT. It
// never returns a change to an existing episode except its episode count and
// finale flag.
//
// Pure: no I/O. scripts/series/continue-series.ts does the reads and writes.

export const SERIES_EPISODE_COUNTS = [3, 5, 7, 13]

export type ExistingEpisode = {
  id: string
  number: number
  title: string
  description: string | null
  script: string | null
  status: string | null
  is_hidden: boolean | null
  brief_json: Record<string, any> | null
}

export type SeriesRow = {
  id: string
  title: string
  description: string | null
  author: string | null
}

export type EpisodeDefaults = {
  author: string
  /** SERIES-CONTINUE-AUTHOR-001: the voice step refuses an episode with no author_id. */
  author_id?: string | null
  author_style: string | null
  genre: string
  narrative_voice: string | null
  narrator_voice_name: string | null
  narrator_voice_id?: string | null
  duration_label: string | null
  duration_mins: number | null
}

export type PlannedEpisode = {
  episode_number: number
  title: string
  premise: string
  setting: string
  description: string
  continuity_notes: string
  cliffhanger_or_resolution: string
}

export type ContinuePlan = { series_bible: string; episodes: PlannedEpisode[] }

/** Throws with a plain reason when the series cannot be continued safely. */
export function checkContinuable(existing: ExistingEpisode[], total: number): number {
  if (!SERIES_EPISODE_COUNTS.includes(total)) throw new Error(`total must be one of ${SERIES_EPISODE_COUNTS.join(', ')}`)
  if (existing.length === 0) throw new Error('series has no episodes yet; use the normal series planner')
  const numbers = existing.map(e => e.number).sort((a, b) => a - b)
  numbers.forEach((n, i) => {
    if (n !== i + 1) throw new Error(`existing episodes are not numbered 1..${numbers.length} without gaps (found ${numbers.join(', ')})`)
  })
  const have = numbers.length
  if (have >= total) throw new Error(`series already has ${have} episodes; nothing to plan for a total of ${total}`)
  const noScript = existing.filter(e => !String(e.script || '').trim()).map(e => e.number)
  if (noScript.length) throw new Error(`episodes ${noScript.join(', ')} have no script; continuity needs every existing script`)
  return have
}

export function buildContinuePrompt(series: SeriesRow, defaults: EpisodeDefaults, existing: ExistingEpisode[], total: number): string {
  const have = existing.length
  const first = have + 1
  const sorted = [...existing].sort((a, b) => a.number - b.number)
  const scripts = sorted.map(e => `=== EPISODE ${e.number}: ${e.title} ===\n${String(e.script || '').trim()}`).join('\n\n')
  const remaining = total - have
  return `You are planning the rest of an Endless Tales audio drama series. Episodes 1 to ${have} are already written and voiced; some are live. They are canon and cannot change.

Series: ${series.title}
Logline: ${series.description || '(none)'}
Author: ${defaults.author}. Genre: ${defaults.genre}. Runtime per episode: ${defaults.duration_label || '12-15 minutes'}.
Total episodes: ${total}. You plan episodes ${first} to ${total} (${remaining} episodes). Episode ${total} is the finale.

Rules:
- Episode ${first} picks up directly from the last scene of episode ${have}. If Belle's outro at the end of episode ${have} names or describes the next episode (a title, a question, a promise), episode ${first} must deliver exactly that, and use that title if one is named.
- Keep every existing character name, relationship, place and fact exactly as written. Do not rename anyone. Do not contradict anything already heard.
- Clarity (listeners hear this while driving):
  - Each episode can be told in three plain sentences: who wants what, what stands in the way, what changes by the end.
  - The protagonist's goal in each episode is clear within the first three minutes.
  - At most 6 named speaking characters across the whole series, counting the existing ones. Add a new one only if the story truly needs it.
  - No insider words or jargon a listener would not know.
  - Every scene moves the main problem forward.
- Each non-final episode ends on a specific forward hook that leads into the next one.
- The finale resolves the central mystery or conflict and the main character's arc. It does not tease more episodes.
- Do not write scripts.

Return JSON only, no markdown, in exactly this shape:
{
  "series_bible": "A full series bible: every character with exact name, role and arc; the timeline of what happened in episodes 1-${have}; the central mystery or conflict and its true answer; recurring places; tone rules; how the finale resolves it.",
  "episodes": [
    { "episode_number": ${first}, "title": "", "premise": "", "setting": "", "description": "present-tense story-card description, 1-2 sentences", "continuity_notes": "", "cliffhanger_or_resolution": "" }
  ]
}
The episodes array must contain exactly ${remaining} items, numbered ${first} to ${total}.

The existing scripts follow.

${scripts}`
}

function parseJsonObject(raw: string): any {
  const cleaned = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('planner did not return a JSON object')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export function parseContinuePlan(raw: string, have: number, total: number): ContinuePlan {
  const plan = parseJsonObject(raw)
  const bible = String(plan?.series_bible || '').trim()
  if (bible.length < 200) throw new Error('series_bible missing or too short')
  const eps = Array.isArray(plan?.episodes) ? plan.episodes : []
  if (eps.length !== total - have) throw new Error(`planner returned ${eps.length} episodes; expected ${total - have}`)
  const episodes = eps.map((e: any, i: number): PlannedEpisode => {
    const n = have + 1 + i
    const out = {
      episode_number: n,
      title: String(e?.title || '').trim(),
      premise: String(e?.premise || '').trim(),
      setting: String(e?.setting || '').trim(),
      description: String(e?.description || '').trim(),
      continuity_notes: String(e?.continuity_notes || '').trim(),
      cliffhanger_or_resolution: String(e?.cliffhanger_or_resolution || '').trim(),
    }
    if (!out.title || !out.premise || !out.description) throw new Error(`episode ${n} is missing a title, premise or description`)
    return out
  })
  return { series_bible: bible, episodes }
}

/** Rows to INSERT for the new episodes. Hidden, brief_complete, never published. */
export function buildNewEpisodeRows(series: SeriesRow, defaults: EpisodeDefaults, plan: ContinuePlan, total: number) {
  const runtime = defaults.duration_label || '12-15 minutes'
  return plan.episodes.map(ep => {
    const isFinale = ep.episode_number === total
    const brief_json = {
      type: 'series',
      package_phase: 'series_continue',
      series_id: series.id,
      series_name: series.title,
      series_title: series.title,
      series_bible: plan.series_bible,
      previous_series_description: series.description || null,
      full_episode_plan: plan.episodes,
      title: ep.title,
      episode_title: ep.title,
      episode_number: ep.episode_number,
      series_episode_number: ep.episode_number,
      series_total_episodes: total,
      series_is_finale: isFinale,
      author: defaults.author,
      author_style: defaults.author_style,
      genre: defaults.genre,
      narrative_voice: defaults.narrative_voice,
      narrator: defaults.narrator_voice_name,
      premise: ep.premise,
      setting: ep.setting,
      runtime,
      duration_mins: defaults.duration_mins,
      description: ep.description,
      continuity_notes: ep.continuity_notes,
      cliffhanger_or_resolution: ep.cliffhanger_or_resolution,
    }
    return {
      title: ep.title,
      author: defaults.author,
      author_id: defaults.author_id ?? null,
      author_style: defaults.author_style,
      genre: defaults.genre,
      narrative_voice: defaults.narrative_voice,
      narrator_voice_name: defaults.narrator_voice_name,
      narrator_voice_id: defaults.narrator_voice_id ?? null,
      description: ep.description,
      brief_json,
      is_v2: true,
      status: 'brief_complete',
      script_version: 1,
      story_type: 'series_episode',
      series_id: series.id,
      series_name: series.title,
      episode_number: ep.episode_number,
      series_episode_number: ep.episode_number,
      series_total_episodes: total,
      series_is_finale: isFinale,
      duration_label: runtime,
      duration_mins: defaults.duration_mins,
      is_hidden: true,
    }
  })
}

/** The only change allowed on an existing episode: its count and finale flag. */
export function existingEpisodePatch(ep: ExistingEpisode, total: number) {
  const patch: Record<string, any> = { series_total_episodes: total, series_is_finale: false }
  if (ep.brief_json && typeof ep.brief_json === 'object') {
    patch.brief_json = { ...ep.brief_json, series_total_episodes: total, series_is_finale: false }
  }
  return patch
}
