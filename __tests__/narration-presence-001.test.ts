import { checkNarrationPresence, MISLABELED_NARRATION_THRESHOLD } from '@/lib/narrationPresence'
import {
  isSeriesMemberTypedStandalone,
  mistypedSeriesRows,
  seriesTypeMismatchReason,
} from '@/lib/seriesTypeConsistency'
import { readFileSync } from 'fs'
import { join } from 'path'

const HEADER = (narrator: string, extra = '') =>
  `TITLE: Test\nDESCRIPTION: d\nNARRATIVE_VOICE: third_limited\nNARRATOR: ${narrator}\n${extra}\nCHARACTER GUIDE\n---\nNORA CALLOWAY — Female\nWADE HARLAN — Male\n---\n\nBELLE B: A blind ditch has stolen the water. This is episode two.\n\n`

// Shape of the real Creek scripts (story 52cc4ee0): no NARRATOR body lines,
// narration prose attributed to characters.
const CREEK_SHAPE =
  HEADER('Cecily Greer') +
  [
    'NORA CALLOWAY: The Sunday before she meant to speak to Wade Harlan, he came to her.',
    'NORA CALLOWAY: She was at the headgate when she heard a horse on the north trail.',
    'WADE HARLAN: The order from the recorder reached the field man last night.',
    'NORA CALLOWAY: Let them contest it. The filing is clean.',
    'WADE HARLAN: She said it without heat, and he looked at her a long moment.',
  ].join('\n\n')

describe('NARRATION-PRESENCE-001', () => {
  test('Rule A: Creek shape (declared narrator, zero NARRATOR lines) fails', () => {
    const r = checkNarrationPresence(CREEK_SHAPE)
    expect(r.passed).toBe(false)
    expect(r.narratorBodyLines).toBe(0)
    expect(r.issues.join(' ')).toMatch(/zero NARRATOR lines/)
  })

  test('header line alone is not counted as narration', () => {
    const r = checkNarrationPresence(HEADER('Cecily Greer') + 'NORA CALLOWAY: Hello.')
    expect(r.narratorBodyLines).toBe(0)
    expect(r.passed).toBe(false)
  })

  test('normal script with NARRATOR body lines passes', () => {
    const script =
      HEADER('Cecily Greer') +
      'NARRATOR: She was at the headgate when she heard a horse.\n\nNORA CALLOWAY: Let them contest it.\n\nNARRATOR: He looked at her a long moment.'
    const r = checkNarrationPresence(script)
    expect(r.passed).toBe(true)
    expect(r.narratorBodyLines).toBe(2)
  })

  test('narration labeled with the narrator name counts (What the Shallows Keep: "COLE:")', () => {
    const script = HEADER('Cole') + 'COLE: The lake was still.\n\nHENRY: She said the creek remembered things.'
    const r = checkNarrationPresence(script)
    expect(r.passed).toBe(true)
    expect(r.narratorBodyLines).toBe(1)
  })

  test('reported speech in dialogue does not trip Rule B (real Shallows EP2 lines)', () => {
    const reported = [
      'HENRY: She used the word patient. She said the water waited.',
      'HENRY: She described it as patient.',
      'REMY: He said it wrong the way a beautiful thing can be wrong.',
      'REMY: He drowned. In this lake.',
      'REMY: He had found something. He told me three days before.',
    ]
    const script = HEADER('Cole') + 'COLE: The lake was still.\n\n' + reported.join('\n\n')
    const r = checkNarrationPresence(script)
    expect(r.suspectCharacterLines).toBeLessThan(MISLABELED_NARRATION_THRESHOLD)
    expect(r.passed).toBe(true)
  })

  test('Rule B: many third-person narration lines fail even with a stray NARRATOR line', () => {
    const lines = Array.from({ length: MISLABELED_NARRATION_THRESHOLD }, (_, i) =>
      `NORA CALLOWAY: She looked at the ridge for the ${i}th time.`,
    )
    const script = HEADER('Cecily Greer') + 'NARRATOR: Morning came.\n\n' + lines.join('\n\n')
    const r = checkNarrationPresence(script)
    expect(r.passed).toBe(false)
    expect(r.suspectCharacterLines).toBeGreaterThanOrEqual(MISLABELED_NARRATION_THRESHOLD)
  })

  test('NARRATOR_IS_CHARACTER: true is exempt (first-person character narration)', () => {
    const script = HEADER('Wade Briley', 'NARRATOR_IS_CHARACTER: true') + 'WADE BRILEY: I drove all night.'
    expect(checkNarrationPresence(script).passed).toBe(true)
  })

  test('empty script / no narrator header is left to the existing header rule', () => {
    expect(checkNarrationPresence('').passed).toBe(true)
    expect(checkNarrationPresence(null).passed).toBe(true)
  })

  test('wired into run-next narrator validation (runs before voice spend)', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const fnStart = src.indexOf('function validateNarratorAssignmentSync(')
    const guard = src.indexOf('checkNarrationPresence(script)', fnStart)
    const rule2 = src.indexOf('// Rule 2:', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(fnStart)
    expect(guard).toBeLessThan(rule2)
  })
})

describe('SERIES-TYPE-CONSISTENCY-001', () => {
  // Real Creek state at investigation time (series 79ffa422).
  const creek = [
    { id: '280aaac8-27f0', story_type: 'series_episode', workflow_state: 'stories_in_queue', series_id: '79ffa422', series_total_episodes: 3 },
    { id: '52cc4ee0-5d45', story_type: 'single', workflow_state: 'ready_for_review', series_id: '79ffa422', series_total_episodes: 3 },
    { id: '976c34ef-41f2', story_type: 'single', workflow_state: 'repair_queue', series_id: '79ffa422', series_total_episodes: 3 },
  ]

  test('detects mixed typing in the Creek series', () => {
    const bad = mistypedSeriesRows(creek)
    expect(bad.map((r) => r.id)).toEqual(['52cc4ee0-5d45', '976c34ef-41f2'])
    expect(seriesTypeMismatchReason('79ffa422', bad)).toMatch(/52cc4ee0=single/)
  })

  test('cold_storage rows are ignored', () => {
    expect(mistypedSeriesRows([{ id: 'x', story_type: 'single', workflow_state: 'cold_storage' }])).toEqual([])
  })

  test('consistent series passes', () => {
    expect(mistypedSeriesRows(creek.map((r) => ({ ...r, story_type: 'series_episode' })))).toEqual([])
  })

  test('series member typed single must not dispatch as standalone', () => {
    expect(isSeriesMemberTypedStandalone(creek[1])).toBe(true)
    expect(isSeriesMemberTypedStandalone({ id: 's', story_type: 'single', workflow_state: 'stories_in_queue', series_id: null })).toBe(false)
    expect(isSeriesMemberTypedStandalone({ id: 's', story_type: 'single', workflow_state: 'x', series_id: 'a', series_total_episodes: 1 })).toBe(false)
  })

  test('wired into dispatch-queue on both paths', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/cron/dispatch-queue/route.ts'), 'utf8')
    expect(src).toMatch(/mistypedSeriesRows\(/)
    expect(src).toMatch(/isSeriesMemberTypedStandalone\(/)
    // the series loader must no longer pre-filter to series_episode (that hid the mismatch)
    const loader = src.slice(src.indexOf('const { data: seriesStories'), src.indexOf('if (seriesStoriesError)'))
    expect(loader).not.toMatch(/story_type', 'series_episode'/)
  })
})
