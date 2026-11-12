import { validatorIssuesForPatch, buildPatchPrompt } from '@/lib/seriesPatch'
import { parseFactsBackfill, buildFactsBackfillPrompt } from '@/lib/seriesFactsBackfill'
import { readFileSync } from 'fs'
import { join } from 'path'

const report = `**SFX CHECK** ...

---

❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:

- **[SFX: Door, wood, closes]** does not correspond to any action in the surrounding story.
  Replace with a cue tied to an actual story action at that moment, or remove it.

- **[SFX: Keys, jingle and pick up]** does not match the action described. Replace or remove it.`

describe('EPISODE-PATCH-001 validator issues', () => {
  test('each fix-list bullet becomes one issue for that episode, continuation lines kept', () => {
    const issues = validatorIssuesForPatch(report, 7)
    expect(issues).toHaveLength(2)
    expect(issues[0].episode).toBe(7)
    expect(issues[0].problem).toBe('[SFX: Door, wood, closes] does not correspond to any action in the surrounding story. Replace with a cue tied to an actual story action at that moment, or remove it.')
    expect(issues[1].problem).toContain('[SFX: Keys, jingle and pick up]')
  })
  test('no issues for a pass, an unreadable report or an unknown episode', () => {
    expect(validatorIssuesForPatch('✅ VALIDATOR RESULT: PASS', 3)).toEqual([])
    expect(validatorIssuesForPatch('', 3)).toEqual([])
    expect(validatorIssuesForPatch(report, 0)).toEqual([])
  })
  test('a FAIL with no bullets becomes one issue with the text', () => {
    const issues = validatorIssuesForPatch('❌ VALIDATOR RESULT: FAIL\nThe ending is settled, not a cliffhanger.', 4)
    expect(issues).toEqual([{ episode: 4, problem: 'The ending is settled, not a cliffhanger.', fix: '' }])
  })
  test('patch prompt deletes a wrong cue and never invents a sound name', () => {
    const p = buildPatchPrompt({ seriesTitle: 'S', episodeNumber: 7, title: 'T', script: 'A: hi', issues: validatorIssuesForPatch(report, 7) })
    expect(p).toMatch(/delete that \[SFX: \.\.\.\] line\. Never invent a new sound name/)
  })
})

describe('EPISODE-PATCH-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('episode-check issues feed the patcher only when there are no series-read issues, before the rewrite', () => {
    const at = src.indexOf('validatorIssuesForPatch(result.episodeResult?.report')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(src.indexOf('SERIES-REWRITE-001: a story-content failure'))
    expect(src).toContain('const readIssues: SeriesReadIssue[] = seriesIssues.length ? seriesIssues : episodeIssues')
    expect(src).toContain('${readIssues.length} ${patchSourceLabel} issue(s) fixed in place')
  })
})

describe('SERIES-FACTS-BACKFILL-002 quotes', () => {
  const texts = new Map<number, string>([
    [1, 'SADIE: My mama left it to me eight years ago.'],
    [4, 'CALEB: I slipped on the ice outside the bakery and caught the door latch.'],
    [6, 'CALEB: A broken hinge on the filing cabinet. And I slipped on the ice outside the bakery.'],
  ])
  const row = (fact: string, from: number, quote: string) => ({ fact, from_episode: from, quote })
  const filler = [1, 2, 3, 4].map((i) => row(`Filler ${i}.`, 1, 'My mama left it to me'))
  test('drops a fact whose quote is not in its episode, and moves a fact back to the earliest episode quoting it', () => {
    const raw = JSON.stringify({ facts: [...filler, row('Caleb cut his hand on the door latch.', 6, 'slipped on the ice outside the bakery'), row('Invented.', 4, 'never said anywhere')] })
    const facts = parseFactsBackfill(raw, 7, texts)!
    expect(facts.find((f) => f.fact.startsWith('Caleb'))?.from_episode).toBe(4)
    expect(facts.some((f) => f.fact === 'Invented.')).toBe(false)
  })
  test('without episode texts the old behaviour holds', () => {
    expect(parseFactsBackfill(JSON.stringify({ facts: [...filler, row('x', 2, '')] }), 7)?.length).toBe(5)
  })
  test('prompt asks for the earlier version and a quote', () => {
    const p = buildFactsBackfillPrompt({ seriesTitle: 'S', episodes: [] })
    expect(p).toMatch(/check every earlier episode for the same subject/)
    expect(p).toContain('"quote"')
  })
})
