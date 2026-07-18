/**
 * PREMISE-UNIQUENESS-001 — premise uniqueness gate tests.
 *
 * Canon (Marc ruling 2026-07-18): no new brief proceeds to Stage 2 with a
 * premise substantially similar to any story published or in
 * ready_for_review / repair_queue / approved_ready. Cold storage exempt.
 * "Substantially similar" = same core hook + same central situation;
 * shared genre/setting alone does not collide.
 */

import {
  PREMISE_PROTECTED_STATES,
  premiseIndexEligible,
  extractCoreHook,
  contentTokens,
  evaluatePremiseGate,
  parsePremiseOverride,
  formatPremiseCollisionMessage,
  type PremiseIndexEntry,
} from '@/lib/premiseGate'
import { premiseIndexRowForStory, syncPremiseIndexForTransition } from '@/lib/premiseIndex'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backfill = require('../scripts/backfill-premise-index.js')

// ── Fixtures ────────────────────────────────────────────────────────────────

const CONFESSION_PREMISE =
  'A parish priest is found strangled in the confessional of an old South Boston church. ' +
  'Detective Declan Marsh assumes robbery until he learns the dead priest heard a confession minutes before he died — ' +
  'and the penitent left behind a detail about an unsolved murder only the killer could know. ' +
  'Marsh has to find the killer before they realize what they left behind.'

// Same core hook + same central situation, reworded.
const CONFESSION_REWORDED =
  'An aging priest is discovered strangled inside the confessional booth of a South Boston parish church. ' +
  'A detective assumes a robbery gone wrong, until he discovers the priest heard one final confession before he died, ' +
  'and the penitent revealed a detail about an unsolved murder that only the real killer could know. ' +
  'Now the detective must find the killer before they realize the mistake they left behind.'

// Same genre + same setting (South Boston, church, detective, winter) but a
// different hook and different central situation — must stay CLEAR.
const SAME_SETTING_DIFFERENT_HOOK =
  'A church organist in South Boston starts receiving sheet music annotated in her dead sister\'s handwriting. ' +
  'Detective Aoife Brennan thinks it is a cruel prank until the melodies begin predicting neighborhood accidents. ' +
  'To stop the next one, she has to decode the final unfinished score before Sunday mass.'

const LIGHTHOUSE_PREMISE =
  'A retired lighthouse keeper on a remote Maine island discovers the automated light has been switching itself off ' +
  'for exactly nine minutes every night. When a fishing boat wrecks during one of the dark windows, he realizes ' +
  'someone is timing the outages — and he is the only witness who has noticed the pattern.'

function entry(overrides: Partial<PremiseIndexEntry> & { story_id: string }): PremiseIndexEntry {
  return {
    series_id: null,
    title: 'The Confession Booth',
    status: 'published',
    genre: 'Mystery/Crime',
    logline: 'A dying priest\'s last confession hides what a killer left behind.',
    core_hook: extractCoreHook(CONFESSION_PREMISE),
    premise: CONFESSION_PREMISE,
    ...overrides,
  }
}

// ── Core-hook extraction ────────────────────────────────────────────────────

describe('extractCoreHook', () => {
  test('takes the first sentence of a normal premise', () => {
    expect(extractCoreHook(CONFESSION_PREMISE)).toBe(
      'A parish priest is found strangled in the confessional of an old South Boston church.'
    )
  })

  test('extends to the second sentence when the first is too thin', () => {
    const thin = 'It begins. A retired lighthouse keeper discovers the automated light switches itself off every night.'
    expect(extractCoreHook(thin)).toBe(thin)
  })

  test('empty premise yields empty hook', () => {
    expect(extractCoreHook('')).toBe('')
    expect(extractCoreHook('   ')).toBe('')
  })
})

// ── CLEAR case ──────────────────────────────────────────────────────────────

describe('PREMISE gate — CLEAR', () => {
  test('a genuinely different premise clears a populated index', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-1', premise: LIGHTHOUSE_PREMISE },
      [entry({ story_id: 'story-a' })],
    )
    expect(result.verdict).toBe('CLEAR')
    expect(result.collisions).toHaveLength(0)
    expect(result.overrideApplied).toBeNull()
    expect(result.checkedCount).toBe(1)
  })

  test('shared genre/setting alone does not collide', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-2', premise: SAME_SETTING_DIFFERENT_HOOK },
      [entry({ story_id: 'story-a' })],
    )
    expect(result.verdict).toBe('CLEAR')
    expect(result.collisions).toHaveLength(0)
  })

  test('candidate never collides with its own story row or series siblings', () => {
    const result = evaluatePremiseGate(
      { storyId: 'story-a', seriesId: 'series-x', premise: CONFESSION_PREMISE },
      [
        entry({ story_id: 'story-a' }),                          // self
        entry({ story_id: 'story-b', series_id: 'series-x' }),   // sibling episode
      ],
    )
    expect(result.verdict).toBe('CLEAR')
    expect(result.checkedCount).toBe(0)
  })
})

// ── COLLISION case ──────────────────────────────────────────────────────────

describe('PREMISE gate — COLLISION', () => {
  test('same core hook + same central situation collides with citation', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-3', premise: CONFESSION_REWORDED },
      [entry({ story_id: 'story-a', title: 'The Confession Booth' })],
    )
    expect(result.verdict).toBe('COLLISION')
    expect(result.collisions).toHaveLength(1)
    const collision = result.collisions[0]
    // Citation: colliding story_id + title + what matched.
    expect(collision.story_id).toBe('story-a')
    expect(collision.title).toBe('The Confession Booth')
    expect(collision.matched).toContain('core hook')
    expect(collision.matched).toContain('central situation')
    expect(collision.hookScore).toBeGreaterThanOrEqual(0.6)
    expect(collision.situationScore).toBeGreaterThanOrEqual(0.5)

    const message = formatPremiseCollisionMessage(result)
    expect(message).toContain('PREMISE COLLISION (PREMISE-UNIQUENESS-001)')
    expect(message).toContain('story-a')
    expect(message).toContain('The Confession Booth')
    expect(message).toContain('bounced for rework')
  })

  test('an identical premise collides', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-4', premise: CONFESSION_PREMISE },
      [entry({ story_id: 'story-a' })],
    )
    expect(result.verdict).toBe('COLLISION')
  })
})

// ── Cold-storage exemption ──────────────────────────────────────────────────

describe('PREMISE gate — cold storage exempt', () => {
  test('only the four protected states are index-eligible', () => {
    for (const state of PREMISE_PROTECTED_STATES) {
      expect(premiseIndexEligible(state)).toBe(true)
    }
    for (const state of ['cold_storage', 'stories_in_queue', 'scripts_ready', 'being_repaired', 'failed', 'unpublished_library', '', null]) {
      expect(premiseIndexEligible(state as string | null)).toBe(false)
    }
  })

  test('a premise identical to a cold-storage story is CLEAR (cold rows never enter the index)', () => {
    // Simulate index construction from protected states only — the cold_storage
    // story is filtered out exactly as the backfill and sync do.
    const stories = [
      { id: 'cold-1', workflow_state: 'cold_storage', title: 'Old Confession', genre: 'Mystery/Crime', description: '', brief_json: { premise: CONFESSION_PREMISE } },
      { id: 'live-1', workflow_state: 'published', title: 'The Nine Minute Dark', genre: 'Thriller', description: '', brief_json: { premise: LIGHTHOUSE_PREMISE } },
    ]
    const entries = stories
      .filter((s) => premiseIndexEligible(s.workflow_state))
      .map((s) => premiseIndexRowForStory(s))
      .filter(Boolean) as PremiseIndexEntry[]

    expect(entries.map((e) => (e as { story_id: string }).story_id)).toEqual(['live-1'])

    const result = evaluatePremiseGate(
      { storyId: 'candidate-5', premise: CONFESSION_PREMISE },
      entries,
    )
    expect(result.verdict).toBe('CLEAR')
  })

  test('transition to cold_storage deletes the premise_index row (frees the premise)', async () => {
    const calls: Array<{ table: string; op: string; args: unknown }> = []
    const mockSupabase = {
      from(table: string) {
        return {
          delete() {
            return {
              in(column: string, values: string[]) {
                calls.push({ table, op: 'delete.in', args: { column, values } })
                return Promise.resolve({ error: null })
              },
            }
          },
          select() { throw new Error('unexpected select') },
        }
      },
    }
    const result = await syncPremiseIndexForTransition(mockSupabase as never, {
      storyIds: ['story-a', 'story-b'],
      toState: 'cold_storage',
    })
    expect(result).toEqual({ action: 'delete', count: 2, error: null })
    expect(calls).toEqual([
      { table: 'premise_index', op: 'delete.in', args: { column: 'story_id', values: ['story-a', 'story-b'] } },
    ])
  })

  test('transition into a protected state upserts; non-protected transitions are no-ops', async () => {
    const upserts: unknown[] = []
    const mockSupabase = {
      from(table: string) {
        if (table === 'stories') {
          return {
            select() {
              return {
                in() {
                  return Promise.resolve({
                    data: [{
                      id: 'story-a',
                      series_id: null,
                      title: 'The Confession Booth',
                      workflow_state: 'ready_for_review',
                      genre: 'Mystery/Crime',
                      description: 'A dying priest\'s last confession.',
                      brief_json: { premise: CONFESSION_PREMISE },
                    }],
                    error: null,
                  })
                },
              }
            },
          }
        }
        return {
          upsert(rows: unknown, opts: unknown) {
            upserts.push({ rows, opts })
            return Promise.resolve({ error: null })
          },
        }
      },
    }

    const upsertResult = await syncPremiseIndexForTransition(mockSupabase as never, {
      storyIds: ['story-a'],
      toState: 'ready_for_review',
    })
    expect(upsertResult.action).toBe('upsert')
    expect(upsertResult.count).toBe(1)
    expect(upsertResult.error).toBeNull()
    expect(upserts).toHaveLength(1)
    const upserted = (upserts[0] as { rows: Array<Record<string, unknown>>; opts: Record<string, unknown> })
    expect(upserted.opts).toEqual({ onConflict: 'story_id' })
    expect(upserted.rows[0].story_id).toBe('story-a')
    expect(upserted.rows[0].status).toBe('ready_for_review')
    expect(upserted.rows[0].core_hook).toBe(extractCoreHook(CONFESSION_PREMISE))

    // Non-protected destination: nothing written.
    const noop = await syncPremiseIndexForTransition(mockSupabase as never, {
      storyIds: ['story-a'],
      toState: 'being_repaired',
    })
    expect(noop).toEqual({ action: 'noop', count: 0, error: null })
  })
})

// ── Override flag ───────────────────────────────────────────────────────────

describe('PREMISE gate — override (Marc\'s explicit word only)', () => {
  const overriddenBrief = {
    premise: CONFESSION_REWORDED,
    premise_gate_override: {
      approved_by: 'marc',
      reason: 'Marc msg 3001 — intentional revisit of the confession premise for the anthology.',
      approved_at: '2026-07-18T13:30:00Z',
    },
  }

  test('a valid recorded override lets the brief proceed — with citations, never silent', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-6', premise: CONFESSION_REWORDED, briefJson: overriddenBrief },
      [entry({ story_id: 'story-a' })],
    )
    expect(result.verdict).toBe('CLEAR')
    expect(result.overrideApplied).toEqual({
      approved_by: 'marc',
      reason: 'Marc msg 3001 — intentional revisit of the confession premise for the anthology.',
      approved_at: '2026-07-18T13:30:00Z',
    })
    // The overridden collisions remain attached for audit logging.
    expect(result.collisions.length).toBeGreaterThan(0)
    expect(result.collisions[0].story_id).toBe('story-a')
  })

  test('boolean/partial override records are rejected — collision stands', () => {
    const invalidOverrides: unknown[] = [
      { premise_gate_override: true },
      { premise_gate_override: 'yes' },
      { premise_gate_override: {} },
      { premise_gate_override: { approved_by: 'marc' } },          // no reason
      { premise_gate_override: { reason: 'because' } },            // no approver
      { premise_gate_override: { approved_by: ' ', reason: ' ' } }, // blank
    ]
    for (const briefJson of invalidOverrides) {
      expect(parsePremiseOverride(briefJson)).toBeNull()
      const result = evaluatePremiseGate(
        { storyId: 'candidate-7', premise: CONFESSION_REWORDED, briefJson },
        [entry({ story_id: 'story-a' })],
      )
      expect(result.verdict).toBe('COLLISION')
    }
  })

  test('an override on a non-colliding brief is inert (no phantom override logging)', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-8', premise: LIGHTHOUSE_PREMISE, briefJson: overriddenBrief },
      [entry({ story_id: 'story-a' })],
    )
    expect(result.verdict).toBe('CLEAR')
    expect(result.overrideApplied).toBeNull()
  })
})

// ── Backfill parity (JS twin must match the TS gate) ────────────────────────

describe('backfill-premise-index.js parity with lib/premiseGate.ts', () => {
  const fixtures = [
    CONFESSION_PREMISE,
    CONFESSION_REWORDED,
    SAME_SETTING_DIFFERENT_HOOK,
    LIGHTHOUSE_PREMISE,
    'It begins. A retired lighthouse keeper discovers the automated light switches itself off every night.',
    'One sentence only with a strangled priest inside the confessional tonight.',
    '',
  ]

  test('extractCoreHook matches on all fixtures', () => {
    for (const premise of fixtures) {
      expect(backfill.extractCoreHook(premise)).toBe(extractCoreHook(premise))
    }
  })

  test('contentTokens matches on all fixtures', () => {
    for (const premise of fixtures) {
      expect(backfill.contentTokens(premise)).toEqual(contentTokens(premise))
    }
  })

  test('protected states match the gate', () => {
    expect(backfill.PROTECTED_STATES).toEqual([...PREMISE_PROTECTED_STATES])
  })

  test('row builder matches lib/premiseIndex premise/logline source rules', () => {
    const story = {
      id: 'story-z',
      series_id: 'series-9',
      title: 'The Creek Crossing',
      workflow_state: 'published',
      genre: 'Western',
      description: 'Cole rides out to hear what a dying man refuses to say.',
      brief_json: { premise: LIGHTHOUSE_PREMISE },
    }
    const jsRow = backfill.premiseIndexRowForStory(story)
    const tsRow = premiseIndexRowForStory(story)
    expect(jsRow.premise).toBe(tsRow!.premise)
    expect(jsRow.core_hook).toBe(tsRow!.core_hook)
    expect(jsRow.logline).toBe(tsRow!.logline)
    expect(jsRow.status).toBe(tsRow!.status)

    // Legacy story: no brief_json — description is the premise fallback.
    const legacy = { id: 'story-y', title: 'Legacy', workflow_state: 'published', genre: 'Drama', description: 'A drifter returns to settle a debt his brother left behind in a dying town.', brief_json: null }
    const jsLegacy = backfill.premiseIndexRowForStory(legacy)
    const tsLegacy = premiseIndexRowForStory(legacy)
    expect(jsLegacy.premise).toBe(tsLegacy!.premise)
    expect(jsLegacy.core_hook).toBe(tsLegacy!.core_hook)

    // No premise text at all → null (skipped by backfill and sync alike).
    expect(backfill.premiseIndexRowForStory({ id: 'x', brief_json: null, description: '' })).toBeNull()
    expect(premiseIndexRowForStory({ id: 'x', brief_json: null, description: '' })).toBeNull()
  })
})
