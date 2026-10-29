import { autofixDescriptionBlockedWords, checkScriptReadiness } from '@/lib/scriptReadiness'
import { validateBelleLine } from '@/lib/voiceBelleRules'

describe('DESC-WORD-AUTOFIX-001', () => {
  const script = 'TITLE: The Second Tape\nDESCRIPTION: Eliza finds hidden footage of a lost woman who looks like her.\nNARRATOR: Someone\n\nNARRATOR: The hidden camera blinked.'

  test('swaps hidden/lost in the DESCRIPTION line only', () => {
    const r = autofixDescriptionBlockedWords(script)
    expect(r.changed).toBe(true)
    expect(r.script).toContain('DESCRIPTION: Eliza finds secret footage of a missing woman who looks like her.')
    expect(r.script).toContain('NARRATOR: The hidden camera blinked.')
  })

  test('fixed description no longer trips the blocked-word gate', () => {
    const fixed = autofixDescriptionBlockedWords(script).script
    const blockers = checkScriptReadiness({ script: fixed, storyType: 'series_episode' } as never).blockers
    expect(blockers.some((b) => /blocked word/.test(b.detail))).toBe(false)
  })

  test('leaves words with no safe swap alone', () => {
    const r = autofixDescriptionBlockedWords('DESCRIPTION: She was there.')
    expect(r.changed).toBe(false)
  })

  test('Belle length errors state the count and how much to cut', () => {
    const long = Array.from({ length: 63 }, (_, i) => `w${i}`).join(' ')
    const errs = validateBelleLine('outro', long, { episodeState: 'standalone' } as never)
    expect(errs.some((e) => e === 'outro is too long for Belle (63 words; max 55 — cut at least 8)')).toBe(true)
  })
})
