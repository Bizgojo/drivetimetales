// NUMERAL EXEMPTION — feat/numeral-episode-exemption-001
// Marc decision alderton-optionA-oct8-2323 (2026-10-08, Option A):
// exempt episode-number tokens from the voice-preflight numeral scan via code,
// NOT content rewrite (precedent: ceo-dispatch-oct8-1511).
//
// The core exemption (isEpisodeNumberPassThrough + episodeNumberPassThrough,
// ALDERTON-CONTRADICTION-001) landed in PR #303; this suite pins the Alderton
// EP1 case that motivated the decision plus multi-digit and non-exempt guards.
//
// Scope contract:
//   - TTS numeral scan ONLY: "Episode N" digit tokens pass when the caller
//     passes episodeNumberPassThrough: N.
//   - Package title validator UNTOUCHED: introSatisfiesPackageCheck still
//     REQUIRES the canonical digit intro.
//   - Genuine spoken digits elsewhere (dialogue numbers) still trip the gate.

import {
  introSatisfiesPackageCheck,
  canonicalizeSeriesIntro,
  isEpisodeNumberPassThrough,
} from '@/lib/unifiedGateEngine'
import { numeralPreTtsScan, scanTextForDigitNumerals } from '@/lib/numeralPreTtsScan'

// EP1's exact failing intro (Alderton b461c04a, BELLE B voice line).
const EP1_INTRO =
  '[LISTENER_NAME], The Alderton Inheritance — Episode 1: The Reading. Welcome back, listener.'

function epScript(introLine: string): string {
  return [
    'TITLE: The Reading',
    '[START AUDIO DRAMA SCRIPT]',
    `BELLE B: ${introLine}`,
    'NARRATOR: The house had kept its secrets for a hundred years.',
  ].join('\n')
}

describe('alderton-optionA-oct8-2323: EP1 exact intro', () => {
  test('EP1 intro digit flags WITHOUT pass-through (the observed failure)', () => {
    const r = numeralPreTtsScan(epScript(EP1_INTRO))
    expect(r.passed).toBe(false)
    expect(r.failures.some((f) => f.offendingText === '1')).toBe(true)
  })

  test('EP1 intro digit passes WITH episodeNumberPassThrough: 1', () => {
    const r = numeralPreTtsScan(epScript(EP1_INTRO), { episodeNumberPassThrough: 1 })
    expect(r.failures.filter((f) => f.offendingText === '1')).toHaveLength(0)
    expect(r.passed).toBe(true)
  })

  test('EP1 intro digit still flags for the WRONG episode number', () => {
    const r = numeralPreTtsScan(epScript(EP1_INTRO), { episodeNumberPassThrough: 2 })
    expect(r.failures.some((f) => f.offendingText === '1')).toBe(true)
  })
})

describe('alderton-optionA-oct8-2323: multi-digit episode numbers', () => {
  test.each([7, 10, 12])('Episode %i intro passes with matching pass-through', (n) => {
    const line = `[LISTENER_NAME], The Alderton Inheritance — Episode ${n}: The Reading. Welcome back.`
    const r = numeralPreTtsScan(epScript(line), { episodeNumberPassThrough: n })
    expect(r.failures.filter((f) => f.offendingText === String(n))).toHaveLength(0)
  })

  test('Episode 1 intro does NOT pass under episode 10 (prefix guard)', () => {
    expect(isEpisodeNumberPassThrough('1', 'Episode 10', 10)).toBe(false)
    expect(isEpisodeNumberPassThrough('10', 'Episode 1', 1)).toBe(false)
    expect(isEpisodeNumberPassThrough('10', 'Episode 10', 10)).toBe(true)
    expect(isEpisodeNumberPassThrough('12', 'Episode 12', 12)).toBe(true)
  })

  test('scanTextForDigitNumerals passes multi-digit Episode tokens', () => {
    expect(scanTextForDigitNumerals('The Alderton Inheritance — Episode 10: The Reading.', { episodeNumberPassThrough: 10 })).toEqual([])
    expect(scanTextForDigitNumerals('The Alderton Inheritance — Episode 12: The Reading.', { episodeNumberPassThrough: 12 })).toEqual([])
  })
})

describe('alderton-optionA-oct8-2323: non-exempt dialogue digits still fail', () => {
  test.each([
    ['Call 911 now, please hurry.', ['911']],
    ['She bought 7 apples at the market.', ['7']],
    ['He owed 42 dollars and 50 cents.', ['42', '50']],
    ['The rating was 4.6 out of five.', ['4.6']],
  ])('"%s" still flags with pass-through active', (line, expected) => {
    expect(scanTextForDigitNumerals(line, { episodeNumberPassThrough: 1 })).toEqual(expected)
  })

  test('full-script scan: dialogue digits fail even when intro digit passes', () => {
    const script = [
      'TITLE: The Reading',
      '[START AUDIO DRAMA SCRIPT]',
      `BELLE B: ${EP1_INTRO}`,
      'NARRATOR: Call 911 now, please hurry. She bought 7 apples.',
    ].join('\n')
    const r = numeralPreTtsScan(script, { episodeNumberPassThrough: 1 })
    expect(r.passed).toBe(false)
    expect(r.failures.some((f) => f.offendingText === '911')).toBe(true)
    expect(r.failures.some((f) => f.offendingText === '7')).toBe(true)
    expect(r.failures.some((f) => f.offendingText === '1')).toBe(false)
  })
})

describe('alderton-optionA-oct8-2323: package-check behavior unchanged', () => {
  test('canonical digit intro still satisfies the package check', () => {
    const built = canonicalizeSeriesIntro({
      seriesName: 'Alderton',
      episodeNumber: 1,
      episodeTitle: 'The Reading',
      hook: 'Welcome back.',
    })
    const pkg = introSatisfiesPackageCheck(built, {
      seriesName: 'Alderton',
      episodeNumber: 1,
      episodeTitle: 'The Reading',
    })
    expect(pkg.passed).toBe(true)
  })

  test('spelled-out episode intro still FAILS the package check (digit required)', () => {
    const pkg = introSatisfiesPackageCheck(
      '[LISTENER_NAME], "Alderton," Episode One: "The Reading." Welcome back.',
      { seriesName: 'Alderton', episodeNumber: 1, episodeTitle: 'The Reading' },
    )
    expect(pkg.passed).toBe(false)
  })
})
