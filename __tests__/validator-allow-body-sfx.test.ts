/**
 * SFX-IN-BODY-001 (Marc Option B, 2026-10-05)
 *
 * [SFX: ...] cues are ALLOWED in the audio-drama script body (the production
 * pipeline parses them into real sound-effect segments). The only SFX restriction
 * is the reader-facing DESCRIPTION / story-card copy. These tests cover the
 * deterministic validateCardCopy guard; the LLM VALIDATOR_PROMPT change (allow
 * body SFX) is prompt-side and exercised end-to-end, not unit-tested here.
 */
import { validateCardCopy } from '@/lib/validateCardCopy'

function build(opts: { title?: string; description?: string; bodySfx?: boolean }) {
  const title = opts.title ?? 'The Quiet Floor'
  const description = opts.description ?? 'A night nurse finds every ward patient already gone.'
  const body = opts.bodySfx
    ? '[SFX: fluorescent lights buzzing and flickering once]\nNARRATOR: The corridor was empty.'
    : 'NARRATOR: The corridor was empty.'
  return [
    `TITLE: ${title}`,
    `DESCRIPTION: ${description}`,
    '[START AUDIO DRAMA SCRIPT]',
    body,
    '[END EPISODE 1]',
  ].join('\n')
}

describe('SFX-IN-BODY-001 — validateCardCopy', () => {
  test('body [SFX:] cues do NOT cause card-copy issues', () => {
    const issues = validateCardCopy(build({ bodySfx: true }))
    expect(issues).toEqual([])
  })

  test('SFX cue inside DESCRIPTION is rejected', () => {
    const issues = validateCardCopy(
      build({ description: 'A nurse hears [SFX: a call bell] down the hall.' })
    )
    expect(issues.some((i) => i.includes('DESCRIPTION must not contain SFX'))).toBe(true)
  })

  test('clean present-tense description with body SFX passes fully', () => {
    const issues = validateCardCopy(
      build({ description: 'A nurse races to save the last patient alive.', bodySfx: true })
    )
    expect(issues).toEqual([])
  })

  test('other card-copy rules still enforced (past tense)', () => {
    const issues = validateCardCopy(
      build({ description: 'A nurse discovered the ward was empty.' })
    )
    expect(issues.some((i) => i.includes('past-tense'))).toBe(true)
  })

  test('other card-copy rules still enforced (title length)', () => {
    const issues = validateCardCopy(
      build({ title: 'An Extraordinarily Overlong Impossible Title Here' })
    )
    expect(issues.some((i) => i.includes('TITLE'))).toBe(true)
  })
})
