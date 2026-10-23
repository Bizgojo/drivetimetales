/**
 * SUPPRESSED-EVIDENCE-001 tests — hidden_evidence false-negative fix
 * (Marc 2026-10-23 16:37 item 2: fix the demonstrated false negative via
 * review/test/deploy — never more Hal keyword passes).
 *
 * Orion-verified against the written rule: EP3 v2.4's intro
 * ("footage is gone... formatted clean... does not want to be documented")
 * states deliberately suppressed evidence yet tripped NO category, though
 * hidden_evidence per the rule's own semantics is "something concealed or
 * suppressed". The v2.5 "vanished" pass fired missing_person for FOOTAGE
 * (not a person) — keyword-satisfying in exactly the way the ATL-PIPE-020
 * header calls a validator defect.
 *
 * The fix extends hidden_evidence ONLY (missing_person untouched):
 * wiped-evidence verbs on evidence nouns, the "formatted clean" wipe
 * phrase, and suppressor intent ("does not want ... documented / a case
 * number"). With the correct earlier category present, v2.5 resolves to
 * hidden_evidence instead of the mismatched missing_person.
 *
 * Fixtures below are faithful reconstructions from the verified fragments
 * (full Hal texts were not re-pulled — contacting Hal is prohibited);
 * they pin the detector behavior on the demonstrated forms, plus EP2
 * regression (already-passing intros still pass) and tightness negatives.
 */

import { detectNarrativeHookCategory } from '@/lib/narrativeHook'
import { evaluateBelleCopyForPublish } from '@/lib/publicationBelleGate'

// Lake Marion EP3 "The Drowned Dock" intros (series naming + hook only;
// full gate scripts are built below for the publication-path test).
const EP3_V24_INTRO =
  'Lake Marion, Episode 3: The Drowned Dock. ' +
  'The footage is gone — three weeks of dock cameras, formatted clean. ' +
  'Somebody at the marina office does not want it documented.'

const EP3_V25_INTRO =
  'Lake Marion, Episode 3: The Drowned Dock. ' +
  'The footage vanished — three weeks of dock cameras, formatted clean. ' +
  'Somebody at the marina office does not want it documented.'

const HAL_V26_INTRO =
  'Lake Marion, Episode 3: The Drowned Dock. ' +
  'Three weeks of dock footage is gone — formatted clean overnight — ' +
  'and the county does not want a case number.'

// EP2 regression intros (passed before the fix via suspicious_discrepancy).
const EP2_V24_INTRO =
  'Lake Marion, Episode 2: The Ledger. ' +
  'The dock ledger tells a story it was never meant to tell.'

const EP2_V26_INTRO =
  'Lake Marion, Episode 2: The Ledger. ' +
  'Four payments to a vendor that may not exist.'

describe('SUPPRESSED-EVIDENCE-001: the demonstrated false negative is corrected', () => {
  test('EP3 v2.4 (suppressed footage) fires hidden_evidence', () => {
    expect(detectNarrativeHookCategory(EP3_V24_INTRO)).toBe('hidden_evidence')
  })

  test('EP3 v2.5 ("vanished") fires hidden_evidence — NOT the mismatched missing_person', () => {
    expect(detectNarrativeHookCategory(EP3_V25_INTRO)).toBe('hidden_evidence')
  })

  test('Hal v2.6 (wipe + no case number) fires hidden_evidence', () => {
    expect(detectNarrativeHookCategory(HAL_V26_INTRO)).toBe('hidden_evidence')
  })
})

describe('SUPPRESSED-EVIDENCE-001: EP2 regressions (already-passing intros still pass)', () => {
  test('EP2 v2.4 still passes', () => {
    expect(detectNarrativeHookCategory(EP2_V24_INTRO)).toBe('suspicious_discrepancy')
  })

  test('EP2 v2.6 still passes', () => {
    expect(detectNarrativeHookCategory(EP2_V26_INTRO)).toBe('suspicious_discrepancy')
  })
})

describe('SUPPRESSED-EVIDENCE-001: suppressed-evidence forms', () => {
  test.each([
    'The tapes were erased before anyone could watch them.',
    'Somebody wiped the footage from every drive in the office.',
    'The security video was scrubbed clean that same night.',
    'The marina log was deleted by morning.',
    'Three weeks of it, formatted clean overnight.',
  ])('wiped-evidence form fires hidden_evidence: %s', (line) => {
    expect(detectNarrativeHookCategory(line)).toBe('hidden_evidence')
  })

  test.each([
    'The harbormaster does not want it documented.',
    'Nobody wants this reported, not on his watch.',
    'The county does not want a case number.',
    'There is no case number for the fire.',
  ])('suppressor intent fires hidden_evidence: %s', (line) => {
    expect(detectNarrativeHookCategory(line)).toBe('hidden_evidence')
  })
})

describe('SUPPRESSED-EVIDENCE-001: tightness (no new false positives)', () => {
  test('domestic "wiped" with no evidence object fires nothing', () => {
    expect(
      detectNarrativeHookCategory(
        'She wiped the kitchen counter clean before the guests arrived.'
      )
    ).toBeNull()
  })

  test('calm hookless Belle line still fires nothing', () => {
    expect(
      detectNarrativeHookCategory(
        'Welcome back to the show, I am Belle and tonight is calm and pleasant.'
      )
    ).toBeNull()
  })
})

describe('SUPPRESSED-EVIDENCE-001: the fix flows through the publication gate', () => {
  function seriesScript(intro: string): string {
    return [
      'TITLE: The Drowned Dock',
      'NARRATOR: Jane Doe',
      `BELLE B: ${intro}`,
      'Once upon a dock, the water kept what the town would not.',
      'BELLE B: Sit with that unease — I am Belle, and what you uncovered leads into Episode 4, where the water gives back what it took.',
    ].join('\n')
  }

  test.each([
    ['EP3 v2.4', EP3_V24_INTRO],
    ['EP3 v2.5', EP3_V25_INTRO],
    ['Hal v2.6', HAL_V26_INTRO],
  ])('%s passes the publication hook requirement (fail-closed gate, no LLM rescue)', (_label, intro) => {
    const verdict = evaluateBelleCopyForPublish({
      id: 'ep-3',
      title: 'The Drowned Dock',
      script: seriesScript(intro),
      series_id: 'lake-marion',
      series_name: 'Lake Marion',
      episode_number: 3,
    })
    const hookBlockers = verdict.ok
      ? []
      : (verdict as { blockers: string[] }).blockers.filter((b) =>
          b.includes('narrative hook')
        )
    expect(hookBlockers).toEqual([])
  })
})
