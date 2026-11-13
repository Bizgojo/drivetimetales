import { buildSeriesOutlinePrompt } from '@/lib/seriesOutline'
import { readFileSync } from 'fs'
import { join } from 'path'

const base = { title: 'Second Rise', premise: 'p', setting: 's', genre: 'romance', totalEpisodes: 7, requirements: '', maxMainCharacters: 5 }

describe('SERIES-REPLAN-001 plan prompt', () => {
  test('published episode is fixed canon: same labels, real ending, its facts, next episode continues from it', () => {
    const p = buildSeriesOutlinePrompt({ ...base, publishedEpisodes: [{ episodeNumber: 1, title: 'The Order', body: 'SADIE LANE: My mama left it to me eight years ago.' }] })
    expect(p).toContain('ALREADY PUBLISHED (SERIES-REPLAN-001): Episode 1 is already out and CANNOT change.')
    expect(p).toMatch(/same characters, full names and upper-case speaker labels/)
    expect(p).toMatch(/FIXED FACTS must include every concrete fact the published episode states/)
    expect(p).toContain('Episodes 2 to 7 continue directly from the end of episode 1')
    expect(p).toContain('===== PUBLISHED EPISODE 1: The Order =====\nSADIE LANE: My mama left it to me eight years ago.')
  })
  test('without published episodes the prompt is unchanged', () => {
    const p = buildSeriesOutlinePrompt(base)
    expect(p).not.toContain('SERIES-REPLAN-001')
    expect(p.startsWith('You are planning a 7-episode romance audio drama series')).toBe(true)
  })
})

describe('SERIES-REPLAN-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('runs only on an explicit request, only when every earlier episode is published, and fails closed', () => {
    const at = src.indexOf('SERIES-REPLAN-001 (Weekend Wife, Second Rise, Widow')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at - 200, at + 1600)
    expect(block).toContain("(brief as any)?.replan_requested === true")
    expect(block).toContain('earlier.every((ep: any) => isFrozenSeriesEpisode(ep) && Boolean(ep.script))')
    expect(block).toContain('SERIES-REPLAN-001: no usable plan')
    expect(at).toBeLessThan(src.indexOf('const styleProfile = styleProfileOfBrief(brief)'))
  })
  test('ending review never asks to re-plan a published episode', () => {
    expect(src).toContain('verdict.issues = verdict.issues.filter((i) => i.episode > lastPublishedEpisode)')
  })
})

describe('SERIES-OUTLINE-TOKENS-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('plan calls have room for a full plan with facts, and a cut-off reply is named', () => {
    expect(src).toContain('const OUTLINE_MAX_TOKENS = 12000')
    expect(src).toContain('max_tokens: OUTLINE_MAX_TOKENS')
    expect(src).not.toMatch(/max_tokens: 4000, temperature: 0\.4/)
    expect(src).toContain("const cutOff = (response as any).stop_reason === 'max_tokens'")
  })
  test('a failed re-plan says why in the job error', () => {
    expect(src).toContain("(lastOutlineProblems.get(String(seriesId)) || ['unknown']).join('; ')")
  })
})

describe('SERIES-OUTLINE-TOKENS-001 time budget', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('after a re-plan the run stops and the episode is written next run', () => {
    const at = src.indexOf('plan made with episodes 1-')
    const block = src.slice(at, at + 900)
    expect(block).toContain('planned: true')
    expect(block).toContain('nextStep: NEXT_STEP_AFTER_SERIES_CREATE')
    expect(src).toContain("'Series plan made (SERIES-REPLAN-001); episodes are written next'")
  })
})
