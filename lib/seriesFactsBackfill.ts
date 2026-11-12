import { factsPromptLines, factsReferenceLines, type OutlineFact, type SeriesOutline } from '@/lib/seriesOutline'

/**
 * SERIES-FACTS-BACKFILL-001 (Weekend Wife in Miami, Second Rise, Widow Who Watched, Nov 12, 2026):
 * these series were planned before SERIES-FACTS-002, so they have no fixed-facts list. Every
 * rewrite fixed some dates and ages and drifted on others ("three weeks ago" vs "three days",
 * a mother gone "eleven years" vs "eight", three different stories for one scar), and the
 * series read failed again each time.
 *
 * When a series has no fixed facts, one call reads the episodes already written and writes the
 * list down, taking the EARLIEST episode that states each fact as correct (Episode 1 is often
 * already published). The list is saved as brief_json.series_facts on every open episode, and
 * the writer, the in-place patcher and both series reads use it exactly like a plan's facts.
 */

export const MIN_BACKFILL_FACTS = 5
export const MAX_BACKFILL_FACTS = 25

/** The series' fixed facts: the plan's facts first, else the backfilled list on any episode. */
export function seriesFactsOf(briefs: unknown[]): OutlineFact[] {
  for (const b of briefs) {
    const outlineFacts = (b as any)?.series_outline?.facts
    if (Array.isArray(outlineFacts) && outlineFacts.length) return outlineFacts
  }
  for (const b of briefs) {
    const facts = (b as any)?.series_facts
    if (Array.isArray(facts) && facts.length) return facts
  }
  return []
}

/** Writer block for a series with backfilled facts but no plan facts. Empty when there is nothing to add. */
export function backfilledFactsPromptBlock(outline: SeriesOutline | null | undefined, facts: OutlineFact[], episodeNumber: number): string {
  if (Array.isArray(outline?.facts) && outline!.facts!.length) return '' // already in the plan block
  const lines = factsPromptLines({ characters: [], threads: [], episodes: [], facts } as SeriesOutline, episodeNumber)
  return lines.length ? `\n\n${lines.join('\n')}\n` : ''
}

/** Plain reference lines for the series reads and the patcher. */
export function factsLines(facts: OutlineFact[]): string[] {
  return factsReferenceLines({ characters: [], threads: [], episodes: [], facts } as SeriesOutline)
}

export function buildFactsBackfillPrompt(input: { seriesTitle: string; episodes: Array<{ episodeNumber: number; title: string; body: string }> }): string {
  const total = input.episodes.length
  return `You are the continuity editor for the ${total}-episode audio drama series "${input.seriesTitle}". The episodes below were written one at a time and some concrete facts drift between them. Write down the FIXED FACTS every episode must agree on.

Rules:
1. List 8 to 15 concrete facts: days and dates of key events, times of day, ages, how long ago past events happened, money amounts and pay terms, where people live and work, how a character got an injury or object, and which character learns which secret in which episode.
2. Each fact is one short sentence with the exact value, written as words (no digits).
3. When episodes disagree, the EARLIEST episode that states the fact is correct. Use its value, never a later one.
4. "from_episode" = the first episode where the listener hears the fact.
5. Only facts the episodes actually state. Do not invent anything.

Return JSON only, no other text:
{"facts":[{"fact":"...","from_episode":1}]}

${input.episodes.map((e) => `===== EPISODE ${e.episodeNumber}: ${e.title} =====\n${e.body}`).join('\n\n')}`
}

export function parseFactsBackfill(raw: string, totalEpisodes: number): OutlineFact[] | null {
  const text = String(raw || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let obj: any = null
  try { obj = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null } catch { obj = null }
  if (!obj || !Array.isArray(obj.facts)) return null
  const facts: OutlineFact[] = obj.facts
    .map((f: any) => ({ fact: String(f?.fact || '').trim(), from_episode: Math.round(Number(f?.from_episode)) }))
    .filter((f: OutlineFact) => f.fact && f.from_episode >= 1 && f.from_episode <= totalEpisodes)
    .slice(0, MAX_BACKFILL_FACTS)
  return facts.length >= MIN_BACKFILL_FACTS ? facts : null
}
