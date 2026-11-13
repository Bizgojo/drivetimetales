/**
 * SERIES-OUTLINE-001 (Chicago "Wrong Side of the River", Oct 2026): episodes
 * were written one at a time with only the previous episodes' last lines as
 * memory, so the kidnapped girl was rescued in a middle episode and then
 * rescued AGAIN in the finale, and characters drifted between names.
 *
 * Now (always on; SERIES_OUTLINE=off disables): before Episode 1 is written, one plan for the
 * whole series is made — fixed character names, the story threads, and the
 * ONE episode where each thread is resolved. Every episode writer gets the
 * plan plus its own slice of it. Pure rules here; the call lives in run-next.
 */

export type OutlineCharacter = { name: string; label: string; role: string; gender?: string; aliases?: string[] }
export type OutlineThread = { id: string; question: string; resolved_in: number }
export type OutlineEpisode = { episode: number; goal: string; beats: string[]; resolves: string[]; ends_on: string }
import { nemesisOpenThreadLimit } from './seriesSequel'

/**
 * SERIES-FACTS-002 (Weekend Wife in Miami, Nov 12, 2026): episodes are written one at a time,
 * so concrete facts drifted between them ("eight months" vs "two years", October vs November,
 * weekly pay vs monthly salary) and every repair risked new drift. The plan now fixes these
 * facts once; every episode writer gets them and the series checks read them.
 */
export type OutlineFact = { fact: string; from_episode: number }
export type SeriesOutline = { characters: OutlineCharacter[]; threads: OutlineThread[]; episodes: OutlineEpisode[]; facts?: OutlineFact[] }
export const MIN_OUTLINE_FACTS = 5

export function seriesOutlineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  // Marc 2026-10-29 23:44 EDT: permanent for all future stories. Default ON; only an explicit SERIES_OUTLINE=off disables it.
  return String(env.SERIES_OUTLINE || '').trim().toLowerCase() !== 'off'
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
  /** SERIES-NEMESIS-001: one villain escapes for a future series. */
  sequelHook?: string
  /** ATLAS NEMESIS-001 3-THREAD EXCEPTION: series title selects the open-thread limit (default 1). */
  seriesTitle?: string
  /** SERIES-REPLAN-001: episodes already published; the plan must match them exactly. */
  publishedEpisodes?: Array<{ episodeNumber: number; title: string; body: string }>
}): string {
  const threeOpenThreads = Boolean(input.sequelHook) && nemesisOpenThreadLimit(input.seriesTitle) === 3
  const nemesisBlock = !input.sequelHook ? ''
    : threeOpenThreads
      ? '- THE NEMESIS (producer request): ' + input.sequelHook + ' Include ONE nemesis among the main characters (role starts with "nemesis"). ATLAS NEMESIS-001 3-THREAD EXCEPTION for this series: leave exactly THREE threads with "resolved_in": 0 — the switched DNA result, Vivian, and Danny — carried into a future series. Every other thread is resolved.\n'
      : '- THE NEMESIS (producer request): ' + input.sequelHook + ' Include ONE nemesis among the main characters (role starts with "nemesis"). Add their thread (e.g. "Will Nick catch the nemesis?") with "resolved_in": 0 — it is the ONLY thread left open, carried into a future series. The nemesis escapes in the finale; every other thread is resolved.\n'
  const published = (input.publishedEpisodes || []).slice().sort((a, b) => a.episodeNumber - b.episodeNumber)
  const lastPublished = published.length ? published[published.length - 1].episodeNumber : 0
  const publishedBlock = published.length ? `

ALREADY PUBLISHED (SERIES-REPLAN-001): Episode${published.length > 1 ? 's' : ''} 1${lastPublished > 1 ? `-${lastPublished}` : ''} ${published.length > 1 ? 'are' : 'is'} already out and CANNOT change. Your plan must match ${published.length > 1 ? 'them' : 'it'} exactly:
- Use the same characters, full names and upper-case speaker labels as in the published script${published.length > 1 ? 's' : ''}.
- The plan entries for episode${published.length > 1 ? 's' : ''} 1${lastPublished > 1 ? `-${lastPublished}` : ''} describe what actually happens there, including how ${published.length > 1 ? 'each' : 'it'} ends.
- FIXED FACTS must include every concrete fact the published episode${published.length > 1 ? 's' : ''} state${published.length > 1 ? '' : 's'} (ages, dates, how long ago, money, places), with those exact values.
- Episodes ${lastPublished + 1} to ${input.totalEpisodes} continue directly from the end of episode ${lastPublished}, answer its cliffhanger first, and never contradict it.

${published.map((e) => `===== PUBLISHED EPISODE ${e.episodeNumber}: ${e.title} =====\n${e.body}`).join('\n\n')}
` : ''
  return `You are planning a ${input.totalEpisodes}-episode ${input.genre} audio drama series for drive-time listeners. Plan it BEFORE any episode is written, so the episodes fit together.${publishedBlock}

SERIES TITLE: ${input.title}
PREMISE: ${input.premise}
SETTING: ${input.setting}
NOTES FROM THE PRODUCER: ${input.requirements || 'None'}
${input.styleBlock || ''}
${input.namePaletteBlock || ''}

Rules for the plan:
- At most ${input.maxMainCharacters} main characters. Give each ONE full name and ONE upper-case speaker label used in every episode (e.g. "NICK"). Keep any names the producer notes fix exactly.
- For each character also list "aliases": every other way people in the story will call them (first name, last name, title + last name, nickname), e.g. ["Nick", "Brennan", "Detective Brennan"]. No two characters may share a full name, and no alias may belong to two characters. Give "gender" (male/female).
- List the story threads (questions the listener wants answered). The main thread is resolved ONLY in the finale (episode ${input.totalEpisodes}). Every thread is resolved in exactly ONE episode. Once resolved, it stays resolved: nobody is rescued, caught, killed, found or unmasked twice.
${nemesisBlock}- Each episode has ONE clear goal, written as a single sentence a listener could repeat.
- Each non-finale episode ends on a specific cliffhanger; the finale closes the series.
- Beats are 3 to 6 short, concrete events per episode, in order. No two episodes use the same kind of climax.
- FIXED FACTS: list 8 to 15 concrete facts every episode must agree on: days and dates of key events, times of day, ages, how long ago past events happened, money amounts and pay terms, where people live and work, and which character learns which secret in which episode. Each fact is one short sentence with the exact value, plus "from_episode" = the first episode where the listener hears it.

Return JSON only, no markdown:
{"characters":[{"name":"...","label":"...","role":"...","gender":"male|female","aliases":["..."]}],
 "threads":[{"id":"T1","question":"...","resolved_in":<episode number>}],
 "episodes":[{"episode":1,"goal":"...","beats":["..."],"resolves":["T2"],"ends_on":"..."}],
 "facts":[{"fact":"...","from_episode":1}]}`
}

/** Parse and check the plan. Returns problems (empty = usable). */
export function validateSeriesOutline(raw: unknown, totalEpisodes: number, maxMain: number, opts: { openThreadRequired?: boolean; maxOpenThreads?: number; seriesTitle?: unknown } = {}): { outline: SeriesOutline | null; problems: string[] } {
  const problems: string[] = []
  const o = raw && typeof raw === 'object' ? (raw as any) : null
  if (!o) return { outline: null, problems: ['not a JSON object'] }
  const characters: OutlineCharacter[] = (Array.isArray(o.characters) ? o.characters : [])
    .map((c: any) => ({
      name: String(c?.name || '').trim(),
      label: String(c?.label || '').trim().toUpperCase(),
      role: String(c?.role || '').trim(),
      gender: /^(male|female)$/i.test(String(c?.gender || '')) ? String(c.gender).toLowerCase() : undefined,
      aliases: (Array.isArray(c?.aliases) ? c.aliases : []).map((a: any) => String(a || '').trim()).filter(Boolean).slice(0, 8),
    }))
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
  const facts: OutlineFact[] = (Array.isArray(o.facts) ? o.facts : [])
    .map((f: any) => ({ fact: String(f?.fact || '').trim(), from_episode: Math.round(Number(f?.from_episode)) }))
    .filter((f: OutlineFact) => f.fact && f.from_episode >= 1 && f.from_episode <= totalEpisodes)
    .slice(0, 20)

  if (!characters.length) problems.push('no characters')
  if (facts.length < MIN_OUTLINE_FACTS) problems.push(`${facts.length} fixed facts (need at least ${MIN_OUTLINE_FACTS}: dates, times, ages, how long ago, money, who learns what when)`)
  if (characters.length > maxMain) problems.push(`${characters.length} main characters (max ${maxMain})`)
  const labels = characters.map((c) => c.label)
  if (new Set(labels).size !== labels.length) problems.push('two characters share a speaker label')
  const fullNames = characters.map((c) => c.name.toUpperCase())
  if (new Set(fullNames).size !== fullNames.length) problems.push('two characters share a full name')
  for (let n = 1; n <= totalEpisodes; n += 1) {
    const ep = episodes.find((e) => e.episode === n)
    if (!ep) { problems.push(`episode ${n} missing`); continue }
    if (!ep.goal) problems.push(`episode ${n} has no goal`)
    if (ep.beats.length < 2) problems.push(`episode ${n} has fewer than 2 beats`)
  }
  if (episodes.length !== totalEpisodes) problems.push(`${episodes.length} episodes planned (need ${totalEpisodes})`)
  if (!threads.length) problems.push('no story threads')
  const openThreads = threads.filter((t) => t.resolved_in === 0)
  const openThreadLimit = opts.maxOpenThreads ?? (opts.openThreadRequired ? nemesisOpenThreadLimit(opts.seriesTitle) : 0)
  if (opts.openThreadRequired && openThreads.length !== openThreadLimit) problems.push(`the nemesis needs exactly ${openThreadLimit === 3 ? 'three threads' : 'one thread'} left open (resolved_in 0); found ${openThreads.length}`)
  if (!opts.openThreadRequired && openThreads.length) problems.push('a thread is left unresolved (resolved_in 0)')
  for (const t of threads) {
    const resolvers = episodes.filter((e) => e.resolves.includes(t.id)).map((e) => e.episode)
    if (t.resolved_in === 0) {
      if (resolvers.length) problems.push(`open thread ${t.id} is resolved in episode ${resolvers.join(', ')}`)
      continue
    }
    if (resolvers.length > 1) problems.push(`thread ${t.id} ("${t.question}") is resolved in more than one episode (${resolvers.join(', ')})`)
    if (!(t.resolved_in >= 1 && t.resolved_in <= totalEpisodes)) problems.push(`thread ${t.id} has no valid resolving episode`)
    else if (resolvers.length === 1 && resolvers[0] !== t.resolved_in) problems.push(`thread ${t.id} says episode ${t.resolved_in} but episode ${resolvers[0]} resolves it`)
  }
  if (threads.length && !threads.some((t) => t.resolved_in === totalEpisodes)) problems.push('the finale resolves no thread')
  return { outline: problems.length ? null : { characters, threads, episodes, facts }, problems }
}

/** The plan as the episode writer sees it. */
export function buildOutlinePromptBlock(outline: SeriesOutline | null | undefined, episodeNumber: number): string {
  if (!outline || !Array.isArray(outline.episodes) || !outline.episodes.length) return ''
  const ep = outline.episodes.find((e) => e.episode === episodeNumber)
  const threadText = (id: string) => outline.threads.find((t) => t.id === id)?.question || id
  const resolvedEarlier = outline.threads.filter((t) => t.resolved_in < episodeNumber)
  const resolvedLater = outline.threads.filter((t) => t.resolved_in > episodeNumber)
  const leftOpen = outline.threads.filter((t) => t.resolved_in === 0)
  const lines = [
    '',
    '🧭 SERIES OUTLINE — FIXED PLAN (follow it exactly)',
    'Characters (use these exact names and speaker labels in every episode; never rename anyone):',
    ...outline.characters.map((c) => `- ${c.label}: ${c.name} — ${c.role}${c.aliases?.length ? ` (also called: ${c.aliases.join(', ')})` : ''}`),
    'CHARACTER-NAMES-001: however a character is addressed in dialogue, their speaker label is ALWAYS the label above (never "MR. SMITH:" for SMITH), and their CHARACTER GUIDE entry starts with that label ("LOOMIS — Commander Bruce Loomis, …"). A new small part must not share any name with a main character.',
    '',
    `THIS EPISODE (${episodeNumber}) — goal: ${ep?.goal || '(see series plan)'}`,
    ...(ep?.beats || []).map((b, i) => `  ${i + 1}. ${b}`),
    ep?.ends_on ? `  Ends on: ${ep.ends_on}` : '',
    ep?.resolves?.length ? `Resolve in THIS episode: ${ep.resolves.map(threadText).join('; ')}` : 'This episode resolves no main thread.',
    leftOpen.length ? `NEVER RESOLVED in this series (the nemesis escapes; carried into a future series): ${leftOpen.map((t) => t.question).join('; ')}` : '',
    resolvedEarlier.length ? `ALREADY RESOLVED in earlier episodes — keep them resolved, never undo or repeat them: ${resolvedEarlier.map((t) => `${t.question} (episode ${t.resolved_in})`).join('; ')}` : '',
    resolvedLater.length ? `NOT YET — must stay open in this episode (resolved later): ${resolvedLater.map((t) => `${t.question} (episode ${t.resolved_in})`).join('; ')}` : '',
    ...factsPromptLines(outline, episodeNumber),
    'Whole-series plan, for reference:',
    ...outline.episodes.map((e) => `  Episode ${e.episode}: ${e.goal}`),
    '',
  ]
  return lines.filter((l) => l !== '').join('\n') + '\n'
}

/** SERIES-FACTS-002: the fixed facts as the episode writer sees them. */
export function factsPromptLines(outline: SeriesOutline | null | undefined, episodeNumber: number): string[] {
  const facts = Array.isArray(outline?.facts) ? outline!.facts : []
  if (!facts.length) return []
  const known = facts.filter((f) => f.from_episode <= episodeNumber)
  const later = facts.filter((f) => f.from_episode > episodeNumber)
  return [
    'FIXED FACTS (SERIES-FACTS-002): every episode must agree with these exactly. Never change a date, day, time, age, length of time, amount of money or who-knows-what. Speak numbers as words.',
    ...known.map((f) => `- ${f.fact}`),
    later.length ? 'Not yet known to the listener (do not reveal in this episode; never contradict):' : '',
    ...later.map((f) => `- (episode ${f.from_episode}) ${f.fact}`),
  ].filter(Boolean)
}

/** SERIES-FACTS-002: the facts as plain lines for the series continuity check and story read. */
export function factsReferenceLines(outline: SeriesOutline | null | undefined): string[] {
  const facts = Array.isArray(outline?.facts) ? outline!.facts : []
  return facts.map((f) => `Fact (from episode ${f.from_episode}): ${f.fact}`)
}

/**
 * PLAN-ENDINGS-001 (Widow Who Watched EP6, Nov 12, 2026): the approved plan put the
 * series climax in Episode 6 and ended it settled, so the episode checker (non-finale
 * episodes must end on a specific cliffhanger) failed every draft until a person stepped
 * in. The plan's endings are now reviewed against the same rules before any episode is
 * written, so a plan that cannot pass is fixed in one cheap step, not after six drafts.
 */
export function buildOutlineEndingReviewPrompt(outline: SeriesOutline, seriesTitle: string): string {
  const total = outline.episodes.length
  const main = outline.threads.find((t) => t.resolved_in === total)
  return `You review the plan for the ${total}-episode audio drama series "${seriesTitle}" BEFORE any episode is written. Judge ONLY the episode endings.

Rules the finished episodes will be checked against:
1. Every episode except the last must END on a specific cliffhanger: an open danger, a reversal, a new threat or a hard choice that names a character or situation and that the next episode must answer. An ending where the danger is over, the villain is caught, or the narrator sums up what will happen tomorrow is NOT a cliffhanger.
2. The series' biggest confrontation and the main question are resolved ONLY in the last episode (Episode ${total}). An earlier episode may resolve a smaller thread, but it must still end on something open.

THE PLAN:
${outline.episodes.map((e) => `Episode ${e.episode}: goal: ${e.goal}\n  beats: ${e.beats.join(' | ')}\n  ends on: ${e.ends_on || '(not given)'}`).join('\n')}
Main thread (resolved in Episode ${total}): ${main ? main.question : '(none marked)'}

Return JSON only, no other text:
{"issues":[{"episode":<number>,"problem":"...","fix":"..."}]}
Use an empty list when every ending follows the rules. Report only clear breaks of rule 1 or 2.`
}

export function parseOutlineEndingReview(raw: string, totalEpisodes: number): { issues: Array<{ episode: number; problem: string; fix: string }> } | null {
  const text = String(raw || '')
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  let obj: any = null
  try { obj = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null } catch { obj = null }
  if (!obj || !Array.isArray(obj.issues)) return null
  const issues = obj.issues
    .map((i: any) => ({ episode: Math.round(Number(i?.episode)), problem: String(i?.problem || '').trim(), fix: String(i?.fix || '').trim() }))
    .filter((i: { episode: number; problem: string }) => i.problem && i.episode >= 1 && i.episode <= totalEpisodes)
  return { issues }
}
