import { seriesFactsOf, backfilledFactsPromptBlock, factsLines, buildFactsBackfillPrompt, parseFactsBackfill } from '@/lib/seriesFactsBackfill'
import { buildPatchPrompt } from '@/lib/seriesPatch'
import { readFileSync } from 'fs'
import { join } from 'path'

const facts = [
  { fact: "Sadie's mother died eight years ago and left her the bakery.", from_episode: 1 },
  { fact: 'Caleb cut his left hand on the bakery door latch two years ago.', from_episode: 4 },
]
const five = Array.from({ length: 5 }, (_, i) => ({ fact: `Fact ${i + 1}.`, from_episode: 1 }))

describe('SERIES-FACTS-BACKFILL-001 facts source', () => {
  test('plan facts win; else the backfilled list on any episode; else none', () => {
    expect(seriesFactsOf([{ series_outline: { facts } }, { series_facts: five }])).toBe(facts)
    expect(seriesFactsOf([null, { series_facts: facts }])).toBe(facts)
    expect(seriesFactsOf([null, {}, { series_facts: [] }])).toEqual([])
  })
  test('writer block shows known facts and holds back later ones; empty when the plan has facts', () => {
    const block = backfilledFactsPromptBlock(null, facts, 2)
    expect(block).toContain('FIXED FACTS')
    expect(block).toContain("- Sadie's mother died eight years ago")
    expect(block).toMatch(/Not yet known to the listener[\s\S]*\(episode 4\) Caleb cut his left hand/)
    expect(backfilledFactsPromptBlock({ characters: [], threads: [], episodes: [], facts } as any, facts, 2)).toBe('')
    expect(backfilledFactsPromptBlock(null, [], 2)).toBe('')
  })
  test('reference lines match the plan format', () => {
    expect(factsLines(facts)[0]).toBe("Fact (from episode 1): Sadie's mother died eight years ago and left her the bakery.")
  })
})

describe('SERIES-FACTS-BACKFILL-001 prompt and reply', () => {
  test('prompt says earliest mention wins and carries every episode', () => {
    const p = buildFactsBackfillPrompt({ seriesTitle: 'Second Rise', episodes: [{ episodeNumber: 1, title: 'The Order', body: 'SADIE: eight years ago' }, { episodeNumber: 7, title: 'Second Rise', body: 'NARRATOR: eleven years' }] })
    expect(p).toMatch(/EARLIEST episode that states the fact is correct/)
    expect(p).toContain('===== EPISODE 1: The Order =====')
    expect(p).toContain('===== EPISODE 7: Second Rise =====')
    expect(p).toMatch(/Do not invent/)
  })
  test('parses JSON, drops bad rows, requires at least five facts', () => {
    const raw = 'Here:\n' + JSON.stringify({ facts: [...five, { fact: '', from_episode: 1 }, { fact: 'x', from_episode: 9 }] })
    expect(parseFactsBackfill(raw, 7)?.length).toBe(5)
    expect(parseFactsBackfill(JSON.stringify({ facts }), 7)).toBeNull()
    expect(parseFactsBackfill('no json', 7)).toBeNull()
  })
})

describe('SERIES-FACTS-BACKFILL-001 patcher', () => {
  test('patch prompt carries the facts and says they beat a conflicting fix', () => {
    const p = buildPatchPrompt({ seriesTitle: 'S', episodeNumber: 7, title: 'T', script: 'A: hi', issues: [{ episode: 7, problem: 'p', fix: 'f' }], facts: factsLines(facts) })
    expect(p).toContain('FIXED FACTS (SERIES-FACTS-BACKFILL-001)')
    expect(p).toContain('Caleb cut his left hand')
    expect(p).toMatch(/follow the fixed fact/)
    expect(buildPatchPrompt({ seriesTitle: 'S', episodeNumber: 7, title: 'T', script: 'A: hi', issues: [] })).not.toContain('FIXED FACTS')
  })
})

describe('SERIES-FACTS-BACKFILL-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('backfill runs before the series reads, even when the continuity read is skipped', () => {
    const backfill = src.indexOf('seriesFacts = await backfillSeriesFacts(')
    const skipGate = src.indexOf('continuityState.passedFingerprint !== continuityFingerprint) {')
    expect(backfill).toBeGreaterThan(0)
    expect(backfill).toBeLessThan(skipGate)
    expect(src.indexOf('...factsLines(seriesFacts),')).toBeGreaterThan(skipGate)
  })
  test('writer and patcher get the facts', () => {
    expect(src).toContain('+ backfilledFactsPromptBlock(seriesOutline, seriesFactsOf([brief]), targetEpisodeNumber)')
    expect(src).toContain('facts: factsLines(seriesFactsOf(patchEpisodes.map((e: any) => e.brief_json)))')
  })
  test('helper skips published episodes, logs the call and never throws', () => {
    const helper = src.slice(src.indexOf('async function backfillSeriesFacts('), src.indexOf('/** WRITER-TRIM-001: one cut-only call'))
    expect(helper).toContain('if (isFrozenSeriesEpisode(ep)) continue')
    expect(helper).toContain("purpose: 'series-facts-backfill'")
    expect(helper).toContain('series_facts: facts')
    expect(helper).toMatch(/catch \(e\)[\s\S]*return \[\]/)
  })
})
