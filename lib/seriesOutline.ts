/**
 * SERIES-OUTLINE-001 (Chicago "Wrong Side of the River", Oct 2026): episodes
 * were written one at a time with only the previous episodes' last lines as
 * memory, so the kidnapped girl was rescued in a middle episode and then
 * rescued AGAIN in the finale, and characters drifted between names.
 *
 * Now (SERIES_OUTLINE=on): before Episode 1 is written, one plan for the
 * whole series is made — fixed character names, the story threads, and the
 * ONE episode where each thread is resolved. Every episode writer gets the
 * plan plus its own slice of it. Pure rules here; the call lives in run-next.
 */

export type OutlineCharacter = { name: string; label: string; role: string }
export type OutlineThread = { id: string; question: string; resolved_in: number }
export type OutlineEpisode = { episode: number; goal: string; beats: string[]; resolves: string[]; ends_on: string }
export type SeriesOutline = { characters: OutlineCharacter[]; threads: OutlineThread[]; episodes: OutlineEpisode[] }

export function seriesOutlineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SERIES_OUTLINE || '').trim().toLowerCase() === 'on'
}

export function buildSeriesOutlinePrompt(input: {
  title: string
  premise: string
  setting: string
  genre: string
  totalEpisodes: number
  requirements: string
  maxMainCharacters: number
  namePaletteBlock?: string
  styleBlock?: string
}): string {
  return `You are planning a ${input.totalEpisodes}-episode ${input.genre} audio drama series for drive-time listeners. Plan it BEFORE any episode is written, so the episodes fit together.

SERIES TITLE: ${input.title}
PREMISE: ${input.premise}
SETTING: ${input.setting}
NOTES FROM THE PRODUCER: ${input.requirements || 'None'}
${input.styleBlock || ''}
${input.namePaletteBlock || ''}

Rules for the plan:
- At most ${input.maxMainCharacters} main characters. Give each ONE full name and ONE upper-case speaker label used in every episode (e.g. "NICK"). Keep any names the producer notes fix exactly.
- List the story threads (questions the listener wants answered). The main thread is resolved ONLY in the finale (episode ${input.totalEpisodes}). Every thread is resolved in exactly ONE episode. Once resolved, it stays resolved: nobody is rescued, caught, killed, found or unmasked twice.
- Each episode has ONE clear goal, written as a single sentence a listener could repeat.
- Each non-finale episode ends on a specific cliffhanger; the finale closes the series.
- Beats are 3 to 6 short, concrete events per episode, in order. No two episodes use the same kind of climax.

Return JSON only, no markdown:
{"characters":[{"name":"...","label":"...","role":"..."}],
 "threads":[{"id":"T1","question":"...","resolved_in":<episode number>}],
 "episodes":[{"episode":1,"goal":"...","beats":["..."],"resolves":["T2"],"ends_on":"..."}]}`
}

/** Parse and check the plan. Returns problems (empty = usable). */
export function validateSeriesOutline(raw: unknown, totalEpisodes: number, maxMain: number): { outline: SeriesOutline | null; problems: string[] } {
  const problems: string[] = []
  const o = raw && typeof raw === 'object' ? (raw as any) : null
  if (!o) return { outline: null, problems: ['not a JSON object'] }
  const characters: OutlineCharacter[] = (Array.isArray(o.characters) ? o.characters : [])
    .map((c: any) => ({ name: String(c?.name || '').trim(), label: String(c?.label || '').trim().toUpperCase(), role: String(c?.role || '').trim() }))
    .filter((c: OutlineCharacter) => c.name && c.label)
  const threads: OutlineThread[] = (Array.isArray(o.threads) ? o.threads : [])
    .map((t: any) => ({ id: String(t?.id || '').trim(), question: String(t?.question || '').trim(), resolved_in: Number(t?.resolved_in) }))
    .filter((t: OutlineThread) => t.id && t.question)
  const episodes: OutlineEpisode[] = (Array.isArray(o.episodes) ? o.episodes : [])
    .map((e: any) => ({
      episode: Number(e?.episode),
      goal: String(e?.goal || '').trim(),
      beats: (Array.isArray(e?.beats) ? e.beats : []).map((b: any) => String(b).trim()).filter(Boolean),
      resolves: (Array.isArray(e?.resolves) ? e.resolves : []).map((r: any) => String(r).trim()).filter(Boolean),
      ends_on: String(e?.ends_on || '').trim(),
    }))
    .sort((a: OutlineEpisode, b: OutlineEpisode) => a.episode - b.episode)

  if (!characters.length) problems.push('no characters')
  if (characters.length > maxMain) problems.push(`${characters.length} main characters (max ${maxMain})`)
  const labels = characters.map((c) => c.label)
  if (new Set(labels).size !== labels.length) problems.push('two characters share a speaker label')
  for (let n = 1; n <= totalEpisodes; n += 1) {
    const ep = episodes.find((e) => e.episode === n)
    if (!ep) { problems.push(`episode ${n} missing`); continue }
    if (!ep.goal) problems.push(`episode ${n} has no goal`)
    if (ep.beats.length < 2) problems.push(`episode ${n} has fewer than 2 beats`)
  }
  if (episodes.length !== totalEpisodes) problems.push(`${episodes.length} episodes planned (need ${totalEpisodes})`)
  if (!threads.length) problems.push('no story threads')
  for (const t of threads) {
    const resolvers = episodes.filter((e) => e.resolves.includes(t.id)).map((e) => e.episode)
    if (resolvers.length > 1) problems.push(`thread ${t.id} ("${t.question}") is resolved in more than one episode (${resolvers.join(', ')})`)
    if (!(t.resolved_in >= 1 && t.resolved_in <= totalEpisodes)) problems.push(`thread ${t.id} has no valid resolving episode`)
    else if (resolvers.length === 1 && resolvers[0] !== t.resolved_in) problems.push(`thread ${t.id} says episode ${t.resolved_in} but episode ${resolvers[0]} resolves it`)
  }
  if (threads.length && !threads.some((t) => t.resolved_in === totalEpisodes)) problems.push('the finale resolves no thread')
  return { outline: problems.length ? null : { characters, threads, episodes }, problems }
}

/** The plan as the episode writer sees it. */
export function buildOutlinePromptBlock(outline: SeriesOutline | null | undefined, episodeNumber: number): string {
  if (!outline || !Array.isArray(outline.episodes) || !outline.episodes.length) return ''
  const ep = outline.episodes.find((e) => e.episode === episodeNumber)
  const threadText = (id: string) => outline.threads.find((t) => t.id === id)?.question || id
  const resolvedEarlier = outline.threads.filter((t) => t.resolved_in < episodeNumber)
  const resolvedLater = outline.threads.filter((t) => t.resolved_in > episodeNumber)
  const lines = [
    '',
    '🧭 SERIES OUTLINE — FIXED PLAN (follow it exactly)',
    'Characters (use these exact names and speaker labels in every episode; never rename anyone):',
    ...outline.characters.map((c) => `- ${c.label}: ${c.name} — ${c.role}`),
    '',
    `THIS EPISODE (${episodeNumber}) — goal: ${ep?.goal || '(see series plan)'}`,
    ...(ep?.beats || []).map((b, i) => `  ${i + 1}. ${b}`),
    ep?.ends_on ? `  Ends on: ${ep.ends_on}` : '',
    ep?.resolves?.length ? `Resolve in THIS episode: ${ep.resolves.map(threadText).join('; ')}` : 'This episode resolves no main thread.',
    resolvedEarlier.length ? `ALREADY RESOLVED in earlier episodes — keep them resolved, never undo or repeat them: ${resolvedEarlier.map((t) => `${t.question} (episode ${t.resolved_in})`).join('; ')}` : '',
    resolvedLater.length ? `NOT YET — must stay open in this episode (resolved later): ${resolvedLater.map((t) => `${t.question} (episode ${t.resolved_in})`).join('; ')}` : '',
    'Whole-series plan, for reference:',
    ...outline.episodes.map((e) => `  Episode ${e.episode}: ${e.goal}`),
    '',
  ]
  return lines.filter((l) => l !== '').join('\n') + '\n'
}
