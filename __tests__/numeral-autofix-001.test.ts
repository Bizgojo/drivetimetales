import { readFileSync } from 'fs'
import { join } from 'path'
import { integerToWords, spellSimpleNumerals, spellOutSpokenNumerals } from '@/lib/spokenNumerals'
import { numeralPreTtsScan } from '@/lib/numeralPreTtsScan'

describe('NUMERAL-AUTOFIX-001', () => {
  test('integer words', () => {
    expect([0, 7, 19, 21, 40, 100, 305, 999].map(integerToWords)).toEqual(['zero', 'seven', 'nineteen', 'twenty-one', 'forty', 'one hundred', 'three hundred five', 'nine hundred ninety-nine'])
  })
  test('the job 707e3808 shapes: 07 and 19', () => {
    expect(spellSimpleNumerals('Locker 07 held a clock stopped at 19 past.')).toBe('Locker oh seven held a clock stopped at nineteen past.')
    expect(spellSimpleNumerals('It was 7:19 and then 10:00, then 9:05 p.m.')).toBe("It was seven nineteen and then ten o'clock, then nine oh five p.m.")
  })
  test('left alone: years, decimals, money, percent, grouped, codes glued to letters', () => {
    const keep = 'In 1987 it cost $40 at 4.6 percent, 50%, 2,000 people, model B12, 3rd street.'
    expect(spellSimpleNumerals(keep)).toBe(keep)
  })
  test('only story-body speaker lines; BELLE and [cues] untouched', () => {
    const script = 'TITLE: X\nDESCRIPTION: 12 things\n[START AUDIO DRAMA SCRIPT]\nBELLE B: Episode 2 of X.\nNARRATOR: He waited 19 minutes.\n[SFX: clock strikes 7]\nWALT: Bring me 3 screws.\n'
    const out = spellOutSpokenNumerals(script)
    expect(out.script).toContain('DESCRIPTION: 12 things')
    expect(out.script).toContain('BELLE B: Episode 2 of X.')
    expect(out.script).toContain('NARRATOR: He waited nineteen minutes.')
    expect(out.script).toContain('[SFX: clock strikes 7]')
    expect(spellOutSpokenNumerals('[START AUDIO DRAMA SCRIPT]\nNARRATOR: At 9 [SFX: bell 7] it rang.').script).toContain('NARRATOR: At nine [SFX: bell 7] it rang.')
    expect(out.script).toContain('WALT: Bring me three screws.')
    expect(out.changes).toBe(2)
    expect(numeralPreTtsScan(out.script, { episodeNumberPassThrough: 2 }).passed).toBe(true)
  })
  test('series writer applies it before the self-check', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/const formatted = spellOutSpokenNumerals\(normalizeScriptFormat\(normalized\.script\)\.script\)/)
  })
})
