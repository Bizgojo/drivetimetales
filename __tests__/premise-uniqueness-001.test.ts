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
  formatPremiseAdjacentWarning,
  clusterHookVariants,
  clusterHookScore,
  runPremiseGate,
  PremiseGateUnavailableError,
  HOOK_COLLISION_THRESHOLD,
  SITUATION_COLLISION_THRESHOLD,
  ADJACENT_CLUSTER_HOOK_THRESHOLD,
  ADJACENT_MEMBER_HOOK_THRESHOLD,
  ADJACENT_MEMBER_SITUATION_THRESHOLD,
  type PremiseIndexEntry,
  type AdjacentCluster,
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

// ── Known-adjacent clusters (amendment, Marc ruling 2026-07-18 09:47 EDT) ───

type SeedCluster = AdjacentCluster & { member_story_ids: string[] }
const SEEDED_CLUSTERS: SeedCluster[] = backfill.KNOWN_ADJACENT_CLUSTERS
const GATE_CLUSTERS: AdjacentCluster[] = SEEDED_CLUSTERS.map(({ slug, label, hook, ruling }) => ({ slug, label, hook, ruling }))

// Real stored member premises/descriptions (fetched read-only 2026-07-18;
// short members use stories.description — same fallback the index uses).
const DRY_RUN_PREMISE =
  'A long-haul trucker named Cole Prest discovers his usual fuel stop has vanished — the building is gone, the lot is empty, and the county records show nothing was ever built there. ' +
  'He drives the same stretch of highway twice and arrives at two different conclusions.'

const SIGNAL_PREMISE =
  'A lone highway patrol officer receives an emergency distress call from a stretch of road that has been officially closed for three years. ' +
  'When she drives out to investigate, she finds a wrecked car, a still-warm engine, and a set of footprints that lead into the desert and simply stop.'

function clusterMemberEntries(): PremiseIndexEntry[] {
  const make = (overrides: Partial<PremiseIndexEntry> & { story_id: string; premise: string }): PremiseIndexEntry => ({
    series_id: null,
    title: null,
    status: 'published',
    genre: null,
    logline: null,
    core_hook: extractCoreHook(overrides.premise),
    adjacent_cluster: null,
    ...overrides,
  })
  return [
    make({ story_id: '09457ef0-e32f-48e2-a1bb-3311ddd68a49', series_id: 'series-falls-park', title: 'The Wrong Quote', genre: 'Mystery', premise: 'A shopkeeper lies dead below Liberty Bridge. June says murder.', adjacent_cluster: 'staged-fall-accidental-ruling' }),
    make({ story_id: '1c54646b-6b13-4f26-b2ba-b633cf017cc6', series_id: 'series-hardin', title: 'The Wound Pattern', genre: 'Mystery', premise: 'A state detective reviews a dead man\'s fall — and the stairs don\'t.', adjacent_cluster: 'staged-fall-accidental-ruling' }),
    make({ story_id: '3dac7ff5-735c-428b-8be2-a58799d7f7bd', title: 'Dry Run', genre: 'Thriller', premise: DRY_RUN_PREMISE, adjacent_cluster: 'impossible-desert-highway-location' }),
    make({ story_id: 'e7cb370a-6401-4030-9f0f-c7c1c88ebdd2', title: 'Signal at Mile Forty', genre: 'Thriller', premise: SIGNAL_PREMISE, adjacent_cluster: 'impossible-desert-highway-location' }),
    make({ story_id: 'fe23bfd4-d6c9-4ad9-b833-37657287c0f3', series_id: 'series-commuter', title: 'The Borrowed Buick', genre: 'Comedy', premise: 'A fake commuter wins a real award and must produce the drive.', adjacent_cluster: 'staged-proof-impostor-farce' }),
    make({ story_id: '4f2b768f-6911-45b8-bf32-cd361b111b63', title: 'Dead in the Water', genre: 'Comedy', premise: 'A man rents a pontoon boat, fakes his fishing history, and buys catfish from Piggly Wiggly to impress his future father-in-law at Lake Marion.', adjacent_cluster: 'staged-proof-impostor-farce' }),
  ]
}

// Briefs written NEAR each seeded cluster hook (calibrated fixtures — each
// trips only its own cluster; verified against the live catalog scan too).
const NEAR_CLUSTER_BRIEFS: Record<string, string> = {
  'staged-fall-accidental-ruling':
    'A beloved high-school coach is found dead at the bottom of the bleacher stairs, ruled an accidental fall by the end of the day. ' +
    'The new county detective reads the wound pattern as inconsistent with a fall and must reopen the case against a sheriff who wants it ruled an accident and closed.',
  'impossible-desert-highway-location':
    'A rideshare driver working a desert highway finds that her regular rest stop officially does not exist — county records say the exit was never built, the road closed years ago — ' +
    'yet there is fresh physical evidence at the spot: skid marks, a warm engine, and a wreck nobody reported.',
  'staged-proof-impostor-farce':
    'To win over his fiancee, a city accountant who faked a hunting lifestyle must stage convincing physical proof of the fake in front of witnesses at the family lodge, ' +
    'recruiting his neighbor as an accomplice and buying props before the lie collapses and he is exposed.',
}

describe('PREMISE gate — known-adjacent clusters (Marc ruling 2026-07-18 09:47 EDT)', () => {
  test('seed integrity: three clusters, unique slugs, sweep member ids, variant hooks', () => {
    expect(SEEDED_CLUSTERS).toHaveLength(3)
    const slugs = SEEDED_CLUSTERS.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(3)
    expect(slugs.sort()).toEqual([
      'impossible-desert-highway-location',
      'staged-fall-accidental-ruling',
      'staged-proof-impostor-farce',
    ])
    const bySlug = Object.fromEntries(SEEDED_CLUSTERS.map((c) => [c.slug, c]))
    expect(bySlug['staged-fall-accidental-ruling'].member_story_ids).toHaveLength(6)
    expect(bySlug['impossible-desert-highway-location'].member_story_ids).toHaveLength(2)
    expect(bySlug['staged-proof-impostor-farce'].member_story_ids).toHaveLength(4)
    for (const c of SEEDED_CLUSTERS) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(String(c.ruling)).toContain('2026-07-18 09:47')
      const variants = clusterHookVariants(c.hook)
      expect(variants).toHaveLength(3) // one engine phrasing + one per member pair
      for (const v of variants) expect(contentTokens(v).length).toBeGreaterThanOrEqual(10)
    }
    // member → slug mapping helper
    expect(backfill.adjacentClusterForStory('3dac7ff5-735c-428b-8be2-a58799d7f7bd')).toBe('impossible-desert-highway-location')
    expect(backfill.adjacentClusterForStory('no-such-story')).toBeNull()
  })

  test('adjacency thresholds sit strictly below the collision bar', () => {
    expect(ADJACENT_MEMBER_HOOK_THRESHOLD).toBeLessThan(HOOK_COLLISION_THRESHOLD)
    expect(ADJACENT_MEMBER_SITUATION_THRESHOLD).toBeLessThan(SITUATION_COLLISION_THRESHOLD)
    expect(ADJACENT_CLUSTER_HOOK_THRESHOLD).toBe(0.5)
    expect(ADJACENT_MEMBER_HOOK_THRESHOLD).toBe(0.4)
    expect(ADJACENT_MEMBER_SITUATION_THRESHOLD).toBe(0.35)
  })

  test.each(Object.keys(NEAR_CLUSTER_BRIEFS))('a brief near cluster %s → ADJACENT with cluster + member citation, no bounce', (slug) => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-adjacent', premise: NEAR_CLUSTER_BRIEFS[slug] },
      clusterMemberEntries(),
      GATE_CLUSTERS,
    )
    expect(result.verdict).toBe('ADJACENT')
    expect(result.collisions).toHaveLength(0) // published precedent, not a blocker — nothing to bounce
    expect(result.adjacencies.length).toBeGreaterThanOrEqual(1)
    const top = result.adjacencies[0]
    expect(top.cluster_slug).toBe(slug)
    expect(top.score).toBeGreaterThanOrEqual(ADJACENT_CLUSTER_HOOK_THRESHOLD)
    // Citation carries the cluster name and the member stories.
    const cluster = SEEDED_CLUSTERS.find((c) => c.slug === slug)!
    expect(top.cluster_label).toBe(cluster.label)
    expect(top.members.length).toBe(2) // both sides of the published pair (series-deduped)
    for (const member of top.members) expect(top.matched).toContain(member.title)
    const warning = formatPremiseAdjacentWarning(result)
    expect(warning).toContain('PREMISE ADJACENT')
    expect(warning).toContain('Not a bounce')
    expect(warning).toContain(cluster.label)
  })

  test('near-cluster briefs do not cross-flag other clusters', () => {
    for (const [slug, premise] of Object.entries(NEAR_CLUSTER_BRIEFS)) {
      const result = evaluatePremiseGate({ storyId: 'x', premise }, clusterMemberEntries(), GATE_CLUSTERS)
      for (const adjacency of result.adjacencies) expect(adjacency.cluster_slug).toBe(slug)
    }
  })

  test('member-proximity trigger: sub-collision closeness to one tagged member → ADJACENT, not COLLISION', () => {
    // Shares roughly half of Dry Run's hook (0.4 ≤ hook < 0.6, sit ≥ 0.35) —
    // clusters list intentionally empty to isolate the member trigger.
    const midBand =
      'A delivery courier discovers his usual overnight stop has vanished from the highway — the building gone, the lot empty — though the county says otherwise. ' +
      'What he finds there instead changes everything about the route he thought he knew.'
    const result = evaluatePremiseGate({ storyId: 'candidate-midband', premise: midBand }, clusterMemberEntries(), [])
    expect(result.verdict).toBe('ADJACENT')
    expect(result.collisions).toHaveLength(0)
    expect(result.adjacencies).toHaveLength(1)
    expect(result.adjacencies[0].cluster_slug).toBe('impossible-desert-highway-location')
    expect(result.adjacencies[0].trigger).toBe('member_proximity')
  })

  test('CLEAR briefs stay CLEAR with clusters seeded (no adjacency noise)', () => {
    for (const premise of [LIGHTHOUSE_PREMISE, SAME_SETTING_DIFFERENT_HOOK]) {
      const result = evaluatePremiseGate(
        { storyId: 'candidate-clear', premise },
        [entry({ story_id: 'story-a' }), ...clusterMemberEntries()],
        GATE_CLUSTERS,
      )
      expect(result.verdict).toBe('CLEAR')
      expect(result.adjacencies).toHaveLength(0)
      expect(result.collisions).toHaveLength(0)
    }
  })

  test('COLLISION behavior unchanged with clusters seeded (reworded near-twin still bounces)', () => {
    const result = evaluatePremiseGate(
      { storyId: 'candidate-collide', premise: CONFESSION_REWORDED },
      [entry({ story_id: 'story-a' }), ...clusterMemberEntries()],
      GATE_CLUSTERS,
    )
    expect(result.verdict).toBe('COLLISION')
    expect(result.collisions[0].story_id).toBe('story-a')
    expect(formatPremiseCollisionMessage(result)).toContain('bounced for rework')
  })

  test('a Ground-Keeps/Limestone-grade sinkhole near-twin still COLLIDES with clusters seeded', () => {
    // Same-hook + same-situation sinkhole pair in the HIGH-collision pattern
    // the sweep flagged (the live Limestone episodes are cold_storage now, so
    // this is the fixture-level regression that the adjacency amendment did
    // not weaken the hard gate).
    const groundKeepsEntry: PremiseIndexEntry = {
      story_id: 'story-ground-keeps',
      series_id: 'series-ground-keeps',
      title: 'What the Ground Keeps',
      status: 'published',
      genre: 'Horror',
      logline: 'A surveyor descends into a sinkhole and finds a chamber.',
      core_hook: null,
      premise:
        'County surveyor Nora Velde descends into a record-setting South Tampa sinkhole and finds a sealed ancient chamber at the bottom. ' +
        'Nearby residents begin exhibiting spreading behavioral changes, and she races the development company\'s concrete trucks to seal the site before they fill the hole.',
      adjacent_cluster: null,
    }
    const limestoneCandidate =
      'Geological surveyor Elena Muro descends into a record-setting South Tampa sinkhole and finds a sealed limestone chamber at the bottom. ' +
      'Nearby residents begin exhibiting spreading behavioral changes, and she has seventy-two hours before the development company arrives to fill the hole.'
    const result = evaluatePremiseGate(
      { storyId: 'candidate-limestone', premise: limestoneCandidate },
      [groundKeepsEntry, ...clusterMemberEntries()],
      GATE_CLUSTERS,
    )
    expect(result.verdict).toBe('COLLISION')
    expect(result.collisions[0].story_id).toBe('story-ground-keeps')
    expect(result.collisions[0].hookScore).toBeGreaterThanOrEqual(HOOK_COLLISION_THRESHOLD)
    expect(result.collisions[0].situationScore).toBeGreaterThanOrEqual(SITUATION_COLLISION_THRESHOLD)
  })

  test('an override clears the collision but never silences the adjacency warning', () => {
    // Candidate collides with a tagged member AND is near its cluster: the
    // override lets it proceed, but the verdict stays ADJACENT (visible).
    const result = evaluatePremiseGate(
      {
        storyId: 'candidate-override',
        premise: DRY_RUN_PREMISE,
        briefJson: { premise_gate_override: { approved_by: 'marc', reason: 'Marc msg — intentional revisit.' } },
      },
      clusterMemberEntries(),
      GATE_CLUSTERS,
    )
    expect(result.overrideApplied).not.toBeNull()
    expect(result.verdict).toBe('ADJACENT')
    expect(result.adjacencies[0].cluster_slug).toBe('impossible-desert-highway-location')
  })

  test('runPremiseGate fails closed when the clusters table is unreadable', async () => {
    const mockSupabase = {
      from(table: string) {
        return {
          select() {
            if (table === 'premise_index') return Promise.resolve({ data: [], error: null })
            return Promise.resolve({ data: null, error: { message: 'relation "premise_adjacent_clusters" does not exist' } })
          },
        }
      },
    }
    await expect(
      runPremiseGate(mockSupabase as never, { storyId: 'x', premise: LIGHTHOUSE_PREMISE }),
    ).rejects.toThrow(PremiseGateUnavailableError)
  })

  test('clusterHookScore takes the best variant; clusterHookVariants splits on newlines', () => {
    const hook = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet\nkilo lima mike november oscar papa quebec romeo sierra tango'
    expect(clusterHookVariants(hook)).toHaveLength(2)
    const premiseTokens = contentTokens('kilo lima mike november oscar papa quebec romeo sierra tango')
    expect(clusterHookScore(hook, premiseTokens)).toBe(1)
  })
})
