import { DESCRIPTION_PAST_TENSE_RE, validateCardCopy } from '@/lib/validateCardCopy'
import { RUNNEXT_DESCRIPTION_PAST_TENSE_RE, checkScriptReadiness } from '@/lib/scriptReadiness'
import { validateBelleLine } from '@/lib/voiceBelleRules'

describe('DESC-TENSE-001: no past-tense sentences, not a banned-word list', () => {
  test.each([
    'Hidden cameras record her room, and last year a woman just like her disappears.',
    'A lost dog leads Nell to a stranger who knows her name.',
    'Eliza finds sealed letters that someone wants buried.',
  ])('allows descriptive words: %s', (d) => {
    expect(DESCRIPTION_PAST_TENSE_RE.test(d)).toBe(false)
    expect(RUNNEXT_DESCRIPTION_PAST_TENSE_RE.test(d)).toBe(false)
  })

  test.each([
    'The money was in the wall all along.',
    'They were never supposed to meet.',
    'She had one night to leave.',
  ])('still blocks was/were/had: %s', (d) => {
    expect(DESCRIPTION_PAST_TENSE_RE.test(d)).toBe(true)
  })

  test('script readiness no longer blocks "hidden"', () => {
    const script = 'TITLE: The Second Tape\nDESCRIPTION: Hidden cameras record Eliza, and the footage shows a woman like her.\nNARRATOR: X\n\nNARRATOR: Go.'
    const blockers = checkScriptReadiness({ script, storyType: 'series_episode' } as never).blockers
    expect(blockers.some((b) => /blocked word/.test(b.detail))).toBe(false)
  })

  test('card copy validator agrees', () => {
    const issues = validateCardCopy('TITLE: The Second Tape\nDESCRIPTION: Hidden cameras record her room.')
    expect(issues.join(' ')).not.toMatch(/past-tense/)
  })

  test('Belle length errors state the count and how much to cut', () => {
    const long = Array.from({ length: 63 }, (_, i) => `w${i}`).join(' ')
    const errs = validateBelleLine('outro', long, { episodeState: 'standalone' } as never)
    expect(errs).toContain('outro is too long for Belle (63 words; max 55 — cut at least 8)')
  })
})
