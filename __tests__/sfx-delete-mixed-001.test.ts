import fs from 'fs'
import path from 'path'
import { planSfxDeletions, sfxIssuesOnly, deleteSfxLines, validatorIssuesForPatch } from '@/lib/seriesPatch'

const script = [
  'NARRATOR: Greer looked up from the folder.',
  '[SFX: Chair, scrapes on floor]',
  'GREER: Sit down.',
  'NARRATOR: Greer closed the folder.',
  '[SFX: Chair, scrapes on floor]',
  'NARRATOR: The front door stood open.',
  '[SFX: Wind, gusting outdoors]',
  'ELIZA: Opal?',
  '[SFX: Night, crickets]',
  '[SFX: Door, wood, opens]',
].join('\n')

const issues = [
  { episode: 6, problem: '[SPOILER] The DESCRIPTION reveals the final discovery.', fix: 'Rewrite the DESCRIPTION.' },
  { episode: 6, problem: '[SFX] The first `[SFX: Chair, scrapes on floor]` cue — no chair movement.', fix: 'Remove' },
  { episode: 6, problem: '[SFX] The second `[SFX: Chair, scrapes on floor]` cue — no chair movement.', fix: 'Remove' },
  { episode: 6, problem: '[SFX] `[SFX: Wind, gusting outdoors]` — no wind described.', fix: 'Remove' },
  { episode: 6, problem: '[SFX] `[SFX: Night, crickets]` — contradicts afternoon.', fix: 'Remove' },
]

describe('SFX-DELETE-MIXED-001 (Nanny\'s Rule EP6, Nov 14)', () => {
  const scripts = new Map([[6, script]])
  test('a mixed list is refused as a whole, but its sound-cue part is planned', () => {
    expect(planSfxDeletions(issues, scripts)).toBeNull()
    const sub = sfxIssuesOnly(issues)
    expect(sub).toHaveLength(4)
    const plan = planSfxDeletions(sub, scripts)!
    expect(plan.get(6)).toEqual(['[SFX: Chair, scrapes on floor]', '[SFX: Wind, gusting outdoors]', '[SFX: Night, crickets]'])
    const out = deleteSfxLines(script, plan.get(6)!)
    expect(out).not.toContain('Chair, scrapes')
    expect(out).not.toContain('Wind, gusting')
    expect(out).not.toContain('Night, crickets')
    expect(out).toContain('[SFX: Door, wood, opens]')
    expect(out).toContain('GREER: Sit down.')
  })
  test('a duplicated cue is only deleted when every copy was flagged', () => {
    const one = [{ episode: 6, problem: '[SFX] `[SFX: Chair, scrapes on floor]` — no chair movement.', fix: '' }]
    expect(planSfxDeletions(one, scripts)).toBeNull()
  })
  test('run-next falls back to the sound-cue subset', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('const sfxSubset = sfxIssuesOnly(readIssues)')
    expect(src).toContain('planSfxDeletions(sfxSubset, sfxScripts, sfxFrozen)')
  })
  test('the real EP6 validator report yields the same split', () => {
    const report = `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:

- [SPOILER] The DESCRIPTION reads: "Eliza brings hidden evidence to the sheriff, but a forged signature exposes a conspiracy." Rewrite the DESCRIPTION to raise a question.

- [SFX] The first \`[SFX: Chair, scrapes on floor]\` cue appears after Greer looks up from his folder. Remove or relocate this cue.

- [SFX] The second \`[SFX: Chair, scrapes on floor]\` cue appears after "Greer closed the folder". Remove or relocate this cue.

- [SFX] \`[SFX: Wind, gusting outdoors]\` appears when Eliza looks at the open front door. Remove this cue.

- [SFX] \`[SFX: Night, crickets]\` appears at the end of the scene. Replace or remove it.`
    const parsed = validatorIssuesForPatch(report, 6)
    expect(parsed.length).toBe(5)
    expect(sfxIssuesOnly(parsed)).toHaveLength(4)
    expect(planSfxDeletions(sfxIssuesOnly(parsed), scripts)).not.toBeNull()
  })
})
