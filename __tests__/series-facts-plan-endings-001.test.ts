import { validateSeriesOutline, buildOutlinePromptBlock, buildSeriesOutlinePrompt, buildOutlineEndingReviewPrompt, parseOutlineEndingReview, factsReferenceLines, MIN_OUTLINE_FACTS } from '@/lib/seriesOutline'
import { readFileSync } from 'fs'
import { join } from 'path'

const plan = (facts: any[]) => ({
  characters: [{ name: 'Jess Marlowe', label: 'JESS', role: 'hero' }, { name: 'Connor Reed', label: 'CONNOR', role: 'boss' }],
  threads: [{ id: 'T1', question: 'Will the deal close?', resolved_in: 3 }, { id: 'T2', question: 'Will Marcus expose them?', resolved_in: 2 }],
  episodes: [
    { episode: 1, goal: 'g1', beats: ['a', 'b'], resolves: [], ends_on: 'Marcus arrives' },
    { episode: 2, goal: 'g2', beats: ['a', 'b'], resolves: ['T2'], ends_on: 'Robert walks away undecided' },
    { episode: 3, goal: 'g3', beats: ['a', 'b'], resolves: ['T1'], ends_on: 'signed' },
  ],
  // SERIES-TIMELINE-001: every plan has one timeline fact per episode.
  facts: [...facts, { fact: 'Episode 1 takes place on Friday, night, at the start.', from_episode: 1 }, { fact: 'Episode 2 takes place on Saturday, morning, one day after episode 1.', from_episode: 2 }, { fact: 'Episode 3 takes place on Sunday, evening, two days after episode 1.', from_episode: 3 }],
})
const facts = [
  { fact: "Connor's father died eight months ago.", from_episode: 1 },
  { fact: 'The trip is Friday to Sunday in November.', from_episode: 1 },
  { fact: 'Connor offers triple her weekly pay, in cash.', from_episode: 1 },
  { fact: 'Connor became her boss nine days before the trip.', from_episode: 1 },
  { fact: 'Marcus learns the marriage is fake in Episode 2.', from_episode: 2 },
]

describe('SERIES-FACTS-002', () => {
  test('the planner is asked for fixed facts', () => {
    const p = buildSeriesOutlinePrompt({ title: 'T', premise: 'p', setting: 's', genre: 'romance', totalEpisodes: 3, requirements: '', maxMainCharacters: 4 })
    expect(p).toContain('FIXED FACTS')
    expect(p).toContain('"facts":[{"fact":"...","from_episode":1}]')
  })
  test('a plan without enough facts is rejected; with them it passes and keeps them', () => {
    expect(validateSeriesOutline(plan(facts.slice(0, MIN_OUTLINE_FACTS - 1)), 3, 4).problems.join()).toMatch(/fixed facts/)
    const ok = validateSeriesOutline(plan(facts), 3, 4)
    expect(ok.problems).toEqual([])
    expect(ok.outline!.facts!.length).toBe(8)
  })
  test('the writer sees known facts, and later facts only as do-not-reveal', () => {
    const outline = validateSeriesOutline(plan(facts), 3, 4).outline!
    const ep1 = buildOutlinePromptBlock(outline, 1)
    expect(ep1).toContain("Connor's father died eight months ago.")
    expect(ep1).toMatch(/Not yet known to the listener[\s\S]*\(episode 2\) Marcus learns/)
    const ep2 = buildOutlinePromptBlock(outline, 2)
    expect(ep2).not.toContain('Not yet known')
  })
  test('the series checks read the facts too', () => {
    const outline = validateSeriesOutline(plan(facts), 3, 4).outline!
    expect(factsReferenceLines(outline)[0]).toBe("Fact (from episode 1): Connor's father died eight months ago.")
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('...factsLines(seriesFacts),')
  })
  test('an old plan with no facts still works for the writer', () => {
    const old: any = plan([]); delete old.facts
    expect(buildOutlinePromptBlock(old, 1)).not.toContain('FIXED FACTS')
  })
})

describe('PLAN-ENDINGS-001', () => {
  const outline = validateSeriesOutline(plan(facts), 3, 4).outline!
  test('the review states both ending rules and lists every planned ending', () => {
    const p = buildOutlineEndingReviewPrompt(outline, 'Weekend Wife in Miami')
    expect(p).toMatch(/Every episode except the last must END on a specific cliffhanger/)
    expect(p).toMatch(/biggest confrontation .* ONLY in the last episode/)
    expect(p).toContain('ends on: Robert walks away undecided')
  })
  test('issues are parsed; unreadable replies return null', () => {
    expect(parseOutlineEndingReview('{"issues":[{"episode":2,"problem":"ends settled","fix":"end on a threat"}]}', 3)!.issues).toEqual([{ episode: 2, problem: 'ends settled', fix: 'end on a threat' }])
    expect(parseOutlineEndingReview('{"issues":[]}', 3)!.issues).toEqual([])
    expect(parseOutlineEndingReview('no json', 3)).toBeNull()
  })
  test('run-next re-plans on rejected endings and keeps the plan on the last try', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('const OUTLINE_ATTEMPTS = 3')
    expect(src).toContain('if (result.outline && attempt < OUTLINE_ATTEMPTS)')
    expect(src).toContain("purpose: 'series-outline-ending-review'")
  })
})
