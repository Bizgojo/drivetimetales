/**
 * OPERATOR DIRECT-PUBLISH — build tests (Marc order 2026-10-23 05:10 EDT).
 *
 * Covers:
 *   A. Authorization — allowlisted decision id passes, anything else refuses
 *      with ZERO writes (403).
 *   B. Authorized pass — repaired series + all gates green → published via
 *      the three chained canonical edges, audit row per edge, decision id
 *      recorded, repair-count doctrine honored.
 *   C. Gates-enforced refuse — each QC gate failure refuses with ZERO story
 *      writes (422).
 *   D. Gate preservation — canonical matrix bytes unchanged (no
 *      repair_queue → approved_ready shortcut), real preflight validator
 *      wired (pass + fail through runEpisodePreflight).
 *
 * NOTE on preflight: the BELLE-006 structure check reads Belle asset rows
 * from the DB, so it is mocked here to {passed:true} (DB absent in unit
 * tests). Every OTHER preflight check runs for real — the pass/fail tests
 * below exercise the genuine runPreflightChecks validator, the same
 * function + pass criterion as the HTTP-200 path of POST /api/admin/preflight.
 */

import {
  DIRECT_PUBLISH_EPISODE_COLUMNS,
  DIRECT_PUBLISH_MAX_DURATION_MINS,
  DIRECT_PUBLISH_MIN_DURATION_MINS,
  DirectPublishError,
  OPERATOR_DIRECT_PUBLISH_DECISION_ALLOWLIST,
  OPERATOR_DIRECT_PUBLISH_EDGES,
  evaluateOperatorDirectGates,
  executeOperatorDirectPublish,
  isDirectPublishDecisionAuthorized,
  runEpisodePreflight,
  type DirectPublishDb,
  type PreflightGateResult,
} from '@/lib/storyQueue/directPublish'
import { buildContinuityPins } from '@/lib/continuityPin'
import { transitionAllowed, WORKFLOW_TRANSITIONS } from '@/lib/workflowTransitions'

jest.mock('@/lib/belleStructureGate', () => ({
  runBelleStructureGate: async () => ({ passed: true, checks: [], warnings: [] }),
}))

// ── Minimal supabase-js mock (thenable builders for the exact chains used) ──

type Row = Record<string, unknown>

function makeDb(
  stories: Row[],
  opts?: { failAuditOn?: string[]; failUpdateOn?: string[]; seedAudits?: Row[] }
) {
  const writes: Array<{ table: string; op: string; payload?: unknown; id?: unknown }> = []
  const rows = new Map(stories.map((r) => [String(r.id), { ...r }]))
  const audits: Row[] = [...(opts?.seedAudits ?? [])]
  const failAuditOn = new Set(opts?.failAuditOn ?? [])
  const failUpdateOn = new Set(opts?.failUpdateOn ?? [])

  const db: DirectPublishDb = {
    from: (table: string) => {
      if (table === 'stories') {
        return {
          // Mirrors the real chain: update().eq().eq().select() with
          // row-guard semantics (zero matching rows → data []).
          update: (payload: Row) => {
            const filters: Array<[string, unknown]> = []
            const chain: any = {
              eq: (col: string, val: unknown) => {
                filters.push([col, val])
                return chain
              },
              select: async (_cols: string) => {
                const idFilter = filters.find(([c]) => c === 'id')
                const id = idFilter ? String(idFilter[1]) : ''
                if (failUpdateOn.has(id)) return { data: null, error: { message: 'boom-update' } }
                const row = rows.get(id)
                if (!row) return { data: [], error: null }
                for (const [col, val] of filters) {
                  if (String((row as Row)[col] ?? '') !== String(val ?? '')) {
                    return { data: [], error: null }
                  }
                }
                writes.push({ table, op: 'update', payload, id })
                Object.assign(row, payload)
                return { data: [{ id }], error: null }
              },
            }
            return chain
          },
          // Freshness re-read: select().eq('id', …) → one-row data array.
          select: (_cols: string) => ({
            eq: async (col: string, val: unknown) => {
              const found = [...rows.values()].filter(
                (r) => String((r as Row)[col] ?? '') === String(val ?? '')
              )
              return { data: found.map((r) => ({ ...r })), error: null }
            },
          }),
        }
      }
      if (table === 'story_workflow_audit') {
        return {
          insert: async (payload: Row) => {
            const sid = String((payload as Row).story_id ?? '')
            if (failAuditOn.has(sid)) return { error: { message: 'boom-audit' } }
            writes.push({ table, op: 'insert', payload })
            audits.push({ ...(payload as Row) })
            return { error: null }
          },
          // Resume verification: select().eq().eq() thenable.
          select: (_cols: string) => {
            const filters: Array<[string, unknown]> = []
            const chain: any = {
              eq: (col: string, val: unknown) => {
                filters.push([col, val])
                return chain
              },
              then: (res: any, rej: any) =>
                Promise.resolve({
                  data: audits.filter((a) =>
                    filters.every(([c, v]) => String(a[c] ?? '') === String(v ?? ''))
                  ),
                  error: null,
                }).then(res, rej),
            }
            return chain
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db, writes, rows, audits }
}

// ── Fixtures ──

const SERIES = '11111111-1111-1111-1111-111111111111'
const EP1 = '22222222-2222-2222-2222-222222222222'
const EP2 = '33333333-3333-3333-3333-333333333333'
const DECISION = 'harbor-direct-publish-auth'

const PASS_SCRIPT_1 = [
  'TITLE: The Wrong Tide',
  'AUTHOR: Test Author',
  'GENRE: Mystery',
  'SERIES: Harbor Test Series',
  'EPISODE: 1',
  'EPISODE_TITLE: The Wrong Tide',
  'NARRATOR: Test Narrator',
  '',
  'BELLE B INTRO',
  'BELLE B: Welcome back to Harbor Test Series, I am Belle and tonight the foghorn sounds twice over the bay.',
  '',
  'MARA: The tide brought in a brass key that belonged to no boat in the harbor.',
  'ELI: Then we ask the lighthouse keeper, who keeps a ledger of every lost thing.',
  'MARA: The ledger showed an entry dated tomorrow, written in her own hand.',
  '',
  'BELLE B OUTRO',
  'BELLE B: That was The Wrong Tide, an Endless Tales original read at length for the Harbor Test Series.',
].join('\n')

const PASS_SCRIPT_2 = [
  'TITLE: The Logbook',
  'AUTHOR: Test Author',
  'GENRE: Mystery',
  'SERIES: Harbor Test Series',
  'EPISODE: 2',
  'EPISODE_TITLE: The Logbook',
  'NARRATOR: Test Narrator',
  '',
  'BELLE B INTRO',
  'BELLE B: Welcome back to Harbor Test Series, I am Belle and the logbook opens on a page no one admits writing.',
  '',
  'MARA: The second entry named the storm that sank the Marigold in eighteen ninety.',
  'ELI: No storm was recorded that year, yet the barometer in the tower agrees.',
  'MARA: She closed the book, and the lighthouse beam swung toward the reef.',
  '',
  'BELLE B OUTRO',
  'BELLE B: That was The Logbook, an Endless Tales original read at length for the Harbor Test Series.',
].join('\n')

function passingEpisode(id: string, epNum: number, script: string, overrides: Row = {}): Row {
  return {
    id,
    series_id: SERIES,
    series_name: 'Harbor Test Series',
    episode_number: epNum,
    title: epNum === 1 ? 'The Wrong Tide' : 'The Logbook',
    author: 'Test Author',
    genre: 'Mystery',
    narrator_voice_name: 'Test Narrator',
    audio_url: `https://cdn.example/audio-${epNum}.mp3`,
    cover_url: `https://cdn.example/cover-${epNum}.png`,
    announcement_url: `https://cdn.example/ann-${epNum}.mp3`,
    background_music_url: `https://cdn.example/bed-${epNum}.mp3`,
    description: 'A test episode.',
    duration_mins: 17,
    script,
    workflow_state: 'repair_queue',
    review_status: 'pending',
    status: 'audio_ready',
    is_hidden: true,
    production_repair_count: 0,
    ...overrides,
  }
}

/** Two-episode repaired series with VALID continuity pins (real hash chain). */
function passingSeries(): Row[] {
  const ep1 = passingEpisode(EP1, 1, PASS_SCRIPT_1)
  const ep2 = passingEpisode(EP2, 2, PASS_SCRIPT_2)
  ep2.script_json = { series_generation: { continuity_pins_used: buildContinuityPins([ep1]) } }
  ep1.script_json = { series_generation: {} }
  return [ep1, ep2]
}

const preflightOk: Record<string, PreflightGateResult> = {
  [EP1]: { ok: true, blockers: [] },
  [EP2]: { ok: true, blockers: [] },
}

// ── A. Authorization ──

describe('authorization (decision-id allowlist)', () => {
  test('allowlisted decision id passes; anything else refuses', () => {
    expect(OPERATOR_DIRECT_PUBLISH_DECISION_ALLOWLIST).toContain(DECISION)
    expect(isDirectPublishDecisionAuthorized(DECISION)).toBe(true)
    expect(isDirectPublishDecisionAuthorized('bogus')).toBe(false)
    expect(isDirectPublishDecisionAuthorized('')).toBe(false)
    expect(isDirectPublishDecisionAuthorized(undefined)).toBe(false)
    expect(isDirectPublishDecisionAuthorized(' harbor-direct-publish-auth ')).toBe(true) // trimmed
    expect(isDirectPublishDecisionAuthorized('HARBOR-DIRECT-PUBLISH-AUTH')).toBe(false) // exact match
  })

  test('unauthorized execute refuses 403 with ZERO writes', async () => {
    const episodes = passingSeries()
    const { db, writes } = makeDb(episodes)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: 'bogus', preflight: preflightOk })
    ).rejects.toMatchObject({ status: 403 })
    expect(writes).toHaveLength(0)
  })

  test('missing decision id refuses with ZERO writes', async () => {
    const episodes = passingSeries()
    const { db, writes } = makeDb(episodes)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: '', preflight: preflightOk })
    ).rejects.toMatchObject({ status: 403 })
    expect(writes).toHaveLength(0)
  })
})

// ── B. Authorized pass ──

describe('authorized pass', () => {
  test('repaired series publishes via the three chained edges, audit per edge', async () => {
    const episodes = passingSeries()
    const { db, writes, rows } = makeDb(episodes)
    const result = await executeOperatorDirectPublish(db, episodes, {
      seriesId: SERIES,
      decisionId: DECISION,
      preflight: preflightOk,
      storyRecordChanged: true,
    })

    expect(result.seriesId).toBe(SERIES)
    expect(result.decisionId).toBe(DECISION)
    expect(result.episodes).toHaveLength(2)
    for (const ep of result.episodes) {
      expect(ep.transitions).toEqual([
        'repair_queue→ready_for_review',
        'ready_for_review→approved_ready',
        'approved_ready→published',
      ])
    }

    // 3 story updates + 3 audit inserts per episode.
    const updates = writes.filter((w) => w.table === 'stories')
    const audits = writes.filter((w) => w.table === 'story_workflow_audit')
    expect(updates).toHaveLength(6)
    expect(audits).toHaveLength(6)

    // Terminal state is live.
    for (const id of [EP1, EP2]) {
      const row = rows.get(id)!
      expect(row.status).toBe('published')
      expect(row.workflow_state).toBe('published')
      expect(row.is_hidden).toBe(false)
      expect(String(row.published_on ?? '')).not.toBe('')
      // Repair-count doctrine: operator asserted the record changed.
      expect(row.production_repair_count).toBe(1)
    }

    // Every audit row carries the decision id (reason + session_context).
    for (const a of audits) {
      const p = a.payload as Row
      expect(String(p.reason)).toContain(`decision:${DECISION}`)
      expect(String(p.session_context)).toBe(`decision:${DECISION}`)
      expect(p.changed_by).toBe('operator-direct-publish')
    }
    // Audit edges chain without gaps.
    const ep1Audits = audits.filter((a) => String((a.payload as Row).story_id) === EP1)
    expect(ep1Audits.map((a) => `${(a.payload as Row).from_state}→${(a.payload as Row).to_state}`)).toEqual([
      'repair_queue→ready_for_review',
      'ready_for_review→approved_ready',
      'approved_ready→published',
    ])
  })

  test('repair-count doctrine: false/undefined signal does not increment', async () => {
    for (const signal of [false, undefined] as const) {
      const episodes = passingSeries()
      const { db, writes, rows } = makeDb(episodes)
      const result = await executeOperatorDirectPublish(db, episodes, {
        seriesId: SERIES,
        decisionId: DECISION,
        preflight: preflightOk,
        ...(signal === undefined ? {} : { storyRecordChanged: signal }),
      })
      expect(result.episodes).toHaveLength(2)
      expect(writes.filter((w) => w.table === 'stories')).toHaveLength(6)
      for (const id of [EP1, EP2]) {
        expect(rows.get(id)!.production_repair_count).toBe(0)
      }
    }
  })

  test('audit failure fails the publish with ZERO story writes (P1-1, audit-first)', async () => {
    const episodes = passingSeries()
    const { db, writes, rows } = makeDb(episodes, { failAuditOn: [EP1] })
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 500 })
    // Audit-first: the failed audit aborts BEFORE any story write. EP1
    // never left repair_queue; EP2 untouched; zero audit rows persisted.
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
    expect(rows.get(EP1)!.workflow_state).toBe('repair_queue')
    expect(rows.get(EP2)!.workflow_state).toBe('repair_queue')
  })

  test('audit fails on a later episode: earlier episode keeps its audited publish (P1-1)', async () => {
    const episodes = passingSeries()
    const { db, writes, rows } = makeDb(episodes, { failAuditOn: [EP2] })
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 500 })
    // EP1 fully published with its 3 audit rows; EP2 pristine — every live
    // state has its audit, nothing is published-but-unaudited.
    expect(rows.get(EP1)!.workflow_state).toBe('published')
    expect(rows.get(EP2)!.workflow_state).toBe('repair_queue')
    const audits = writes.filter((w) => w.table === 'story_workflow_audit')
    expect(audits).toHaveLength(3)
    expect(audits.every((a) => String((a.payload as Row).story_id) === EP1)).toBe(true)
  })

  test('story update fails after its audit: abort names the over-claim, story untouched (P1-1)', async () => {
    const episodes = passingSeries()
    const { db, writes, rows, audits } = makeDb(episodes, { failUpdateOn: [EP1] })
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 500 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    // Exactly one audit row exists without a matching story transition —
    // fail-closed (nothing live) and explicitly named for reconcile.
    expect(audits).toHaveLength(1)
    expect(rows.get(EP1)!.workflow_state).toBe('repair_queue')
  })
})

// ── C. Gates-enforced refuse ──

describe('gates-enforced refuse (zero story writes each)', () => {
  async function expectRefused(episodes: Row[], preflight: Record<string, PreflightGateResult>, input?: { seriesId?: string }) {
    const { db, writes } = makeDb(episodes)
    const verdict = evaluateOperatorDirectGates(episodes, { seriesId: input?.seriesId ?? SERIES, preflight })
    expect(verdict.ok).toBe(false)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: input?.seriesId ?? SERIES, decisionId: DECISION, preflight })
    ).rejects.toMatchObject({ status: 422 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    return (verdict as { blockers: string[] }).blockers
  }

  test('short duration (12 min) refuses', async () => {
    const episodes = passingSeries()
    episodes[0] = { ...episodes[0], duration_mins: 12 }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/duration_mins.*outside.*15–20/)
  })

  test('long duration (25 min) refuses', async () => {
    const episodes = passingSeries()
    episodes[1] = { ...episodes[1], duration_mins: 25 }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/duration_mins/)
  })

  test('missing music bed refuses', async () => {
    const episodes = passingSeries()
    episodes[0] = { ...episodes[0], background_music_url: null }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/music bed/)
  })

  test('missing announcement refuses', async () => {
    const episodes = passingSeries()
    episodes[1] = { ...episodes[1], announcement_url: '' }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/announcement_url/)
  })

  test('missing title refuses via the canonical publishability predicate (P1-3)', async () => {
    const episodes = passingSeries()
    episodes[0] = { ...episodes[0], title: '' }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/canonical publishability: missing title/)
  })

  test('missing cover refuses', async () => {
    const episodes = passingSeries()
    episodes[0] = { ...episodes[0], cover_url: null }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/cover_url/)
  })

  test('failed preflight refuses', async () => {
    const episodes = passingSeries()
    const pf = { ...preflightOk, [EP2]: { ok: false, blockers: ['Intro/outro issues: Intro missing'] } }
    const blockers = await expectRefused(episodes, pf)
    expect(blockers.join(' ')).toMatch(/preflight failed/)
  })

  test('absent preflight result refuses (never publish without a verdict)', async () => {
    const episodes = passingSeries()
    const blockers = await expectRefused(episodes, {})
    expect(blockers.join(' ')).toMatch(/no preflight result/)
  })

  test('non-repair_queue state refuses', async () => {
    const episodes = passingSeries()
    episodes[0] = { ...episodes[0], workflow_state: 'ready_for_review' }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/not 'repair_queue'/)
  })

  test('cross-series episode refuses (Tier-1 scoping)', async () => {
    const episodes = passingSeries()
    episodes[1] = { ...episodes[1], series_id: '99999999-9999-9999-9999-999999999999' }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/Tier-1 scope violation/)
  })

  test('missing seriesId refuses', async () => {
    const episodes = passingSeries()
    const blockers = await expectRefused(episodes, preflightOk, { seriesId: '' })
    expect(blockers.join(' ')).toMatch(/seriesId required/)
  })

  test('continuity pin mismatch refuses', async () => {
    const episodes = passingSeries()
    // Mutate EP1's script AFTER EP2 pinned it (post-consumption correction).
    episodes[0] = { ...episodes[0], script: `${PASS_SCRIPT_1}\nMARA: A new line added after the pin was captured.` }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/continuity pin mismatch/)
  })

  test('personalization blocker ([LISTENER_NAME] in body) refuses', async () => {
    const episodes = passingSeries()
    episodes[0] = {
      ...episodes[0],
      script: `${PASS_SCRIPT_1}\nMARA: Hello [LISTENER_NAME], the key is still warm.`,
    }
    // Re-pin so the pins gate stays green and the test isolates personalization.
    episodes[1] = {
      ...episodes[1],
      script_json: { series_generation: { continuity_pins_used: buildContinuityPins([episodes[0]]) } },
    }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/LISTENER_NAME/)
  })

  test('episode numbering gap refuses', async () => {
    const episodes = passingSeries()
    episodes[1] = { ...episodes[1], episode_number: 3 }
    const blockers = await expectRefused(episodes, preflightOk)
    expect(blockers.join(' ')).toMatch(/numbering gap/)
  })
})

// ── D. Gate preservation ──

describe('gate preservation (matrix + shared predicates untouched)', () => {
  test('no repair_queue → approved_ready shortcut edge exists', () => {
    expect(transitionAllowed('repair_queue', 'approved_ready')).toBe(false)
    expect(WORKFLOW_TRANSITIONS.repair_queue).toEqual(['being_repaired', 'ready_for_review', 'cold_storage'])
  })

  test('executor chains exactly the canonical edges', () => {
    expect(OPERATOR_DIRECT_PUBLISH_EDGES).toEqual([
      ['repair_queue', 'ready_for_review'],
      ['ready_for_review', 'approved_ready'],
      ['approved_ready', 'published'],
    ])
    for (const [from, to] of OPERATOR_DIRECT_PUBLISH_EDGES) {
      expect(transitionAllowed(from, to)).toBe(true)
    }
  })

  test('duration band constants match the product minimum + brief cap', () => {
    expect(DIRECT_PUBLISH_MIN_DURATION_MINS).toBe(15)
    expect(DIRECT_PUBLISH_MAX_DURATION_MINS).toBe(20)
  })

  test('real preflight validator PASSES a well-formed repaired episode', async () => {
    const ep = passingEpisode(EP1, 1, PASS_SCRIPT_1)
    const result = await runEpisodePreflight(ep)
    expect(result).toEqual({ ok: true, blockers: [] })
  })

  test('real preflight validator FAILS a deficient episode (fail-closed wiring)', async () => {
    const ep = passingEpisode(EP1, 1, '', {
      series_name: '',
      title: '',
      duration_mins: null,
      narrator_voice_name: null,
    })
    const result = await runEpisodePreflight(ep)
    expect(result.ok).toBe(false)
    expect(result.blockers.length).toBeGreaterThan(0)
  })
})

// ── E. Concurrency + ordering + read-after-write (P1-2 / P1-4 / P2-5 / P2-6) ──

describe('concurrency guard (single-flight + row-guard)', () => {
  test('concurrent double-publish: exactly one publish proceeds (P1-2)', async () => {
    const episodes = passingSeries()
    const { db, writes, rows } = makeDb(episodes)
    const input = { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk }
    const [r1, r2] = await Promise.allSettled([
      executeOperatorDirectPublish(db, episodes, input),
      executeOperatorDirectPublish(db, episodes, input),
    ])
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled')
    const rejected = [r1, r2].filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 })
    // Exactly one publish worth of story updates — no double-publish.
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(6)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(6)
    for (const id of [EP1, EP2]) {
      expect(rows.get(id)!.workflow_state).toBe('published')
    }
  })

  test('row moved concurrently: zero-row update refuses 409 with no further writes (P1-2)', async () => {
    const episodes = passingSeries()
    // Simulate a concurrent mover: EP1 is already out of repair_queue in the DB.
    episodes[0] = { ...episodes[0], workflow_state: 'ready_for_review' }
    const { db, writes } = makeDb(episodes)
    // Gates on the stale snapshot still see repair_queue (caller-supplied
    // rows); the row guard must catch the drift at write time.
    const stale = passingSeries()
    await expect(
      executeOperatorDirectPublish(db, stale, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 409 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })
})

describe('publish ordering (P1-4)', () => {
  test('reversed input still publishes EP1 before EP2', async () => {
    const episodes = passingSeries().reverse()
    expect(String(episodes[0].id)).toBe(EP2)
    const { db, writes, rows } = makeDb(episodes)
    const result = await executeOperatorDirectPublish(db, episodes, {
      seriesId: SERIES,
      decisionId: DECISION,
      preflight: preflightOk,
    })
    expect(result.episodes.map((e) => e.id)).toEqual([EP1, EP2])
    // First story write targets EP1, not EP2.
    expect(writes.filter((w) => w.table === 'stories')[0].id).toBe(EP1)
    for (const id of [EP1, EP2]) {
      expect(rows.get(id)!.workflow_state).toBe('published')
    }
  })
})

describe('strictness (P2-5 / P2-6)', () => {
  test('gate column list selects every field the predicates read (P2-6)', () => {
    for (const col of [
      'announcement_text',
      'series_number',
      'announcement_url',
      'background_music_url',
      'episode_number',
      'workflow_state',
      'review_status',
      'script',
      'script_json',
      'published_on',
      'workflow_state_changed_by',
      'workflow_state_changed_at',
      'workflow_state_change_reason',
    ]) {
      expect(DIRECT_PUBLISH_EPISODE_COLUMNS.split(',')).toContain(col)
    }
  })
})

// ── F. Resume + freshness (Codex R2 items 4–5) ──

/** An episode already published by this path, with its 3-edge audit chain. */
function publishedEpisode(id: string, epNum: number): { row: Row; audits: Row[] } {
  const row = {
    ...passingEpisode(id, epNum, epNum === 1 ? PASS_SCRIPT_1 : PASS_SCRIPT_2),
    workflow_state: 'published',
    review_status: 'approved',
    status: 'published',
    is_hidden: false,
    published_on: '2026-10-23T09:00:00.000Z',
    workflow_state_changed_by: 'operator-direct-publish',
    workflow_state_changed_at: '2026-10-23T09:00:00.000Z',
    workflow_state_change_reason: `decision:${DECISION}: prior run`,
  }
  const edges: Array<[string, string]> = [
    ['repair_queue', 'ready_for_review'],
    ['ready_for_review', 'approved_ready'],
    ['approved_ready', 'published'],
  ]
  const audits = edges.map(([from_state, to_state]) => ({
    story_id: id,
    from_state,
    to_state,
    changed_by: 'operator-direct-publish',
    changed_at: '2026-10-23T09:00:00.000Z',
    reason: `decision:${DECISION}: prior run`,
    session_context: `decision:${DECISION}`,
  }))
  return { row, audits }
}

describe('idempotent resume', () => {
  test('interrupted series retries: EP1 verified+skipped, EP2 publishes', async () => {
    const fresh = passingSeries()
    const ep1 = publishedEpisode(EP1, 1)
    // Pins hash scripts only, and the published EP1 row carries the same
    // script — EP2's pins stay green without rebuilding.
    const ep2 = { ...fresh[1] }
    const { db, writes, rows } = makeDb([ep1.row, ep2], { seedAudits: ep1.audits })
    const result = await executeOperatorDirectPublish(db, [ep1.row, ep2], {
      seriesId: SERIES,
      decisionId: DECISION,
      preflight: preflightOk,
    })
    expect(result.episodes[0]).toMatchObject({ id: EP1 })
    expect(result.episodes[0].transitions).toEqual([
      'resumed: verified already-published (3-edge audit chain complete)',
    ])
    expect(result.episodes[1].transitions).toEqual([
      'repair_queue→ready_for_review',
      'ready_for_review→approved_ready',
      'approved_ready→published',
    ])
    // EP1 never re-written; EP2 got exactly its 3 updates + 3 audits.
    expect(writes.filter((w) => w.table === 'stories' && w.id === EP1)).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'stories' && w.id === EP2)).toHaveLength(3)
    expect(rows.get(EP2)!.workflow_state).toBe('published')
  })

  test('resume with incomplete audit chain refuses (never claims unverified)', async () => {
    const fresh = passingSeries()
    const ep1 = publishedEpisode(EP1, 1)
    const { db, writes } = makeDb([ep1.row, fresh[1]], {
      seedAudits: ep1.audits.slice(0, 2), // third edge missing
    })
    await expect(
      executeOperatorDirectPublish(db, [ep1.row, fresh[1]], {
        seriesId: SERIES,
        decisionId: DECISION,
        preflight: preflightOk,
      })
    ).rejects.toMatchObject({ status: 422 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
  })

  test('published episode from another writer refuses (marker mismatch)', async () => {
    const fresh = passingSeries()
    const ep1 = publishedEpisode(EP1, 1)
    ep1.row.workflow_state_changed_by = 'admin'
    const { db } = makeDb([ep1.row, fresh[1]], { seedAudits: ep1.audits })
    await expect(
      executeOperatorDirectPublish(db, [ep1.row, fresh[1]], {
        seriesId: SERIES,
        decisionId: DECISION,
        preflight: preflightOk,
      })
    ).rejects.toMatchObject({ status: 422 })
  })

  test('published episode after an unreleased one refuses (order violated)', async () => {
    const fresh = passingSeries()
    const ep2pub = publishedEpisode(EP2, 2)
    const { db } = makeDb([fresh[0], ep2pub.row], { seedAudits: ep2pub.audits })
    const verdict = evaluateOperatorDirectGates([fresh[0], ep2pub.row], {
      seriesId: SERIES,
      preflight: preflightOk,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers.join(' ')).toMatch(/order violated/)
    await expect(
      executeOperatorDirectPublish(db, [fresh[0], ep2pub.row], {
        seriesId: SERIES,
        decisionId: DECISION,
        preflight: preflightOk,
      })
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('freshness re-read (stale gates cannot publish)', () => {
  test('asset swap without state change aborts 409 with zero writes', async () => {
    const episodes = passingSeries()
    const drifted = passingSeries()
    // Concurrent edit: cover swapped after gate evaluation, state unchanged.
    drifted[0] = { ...drifted[0], cover_url: 'https://cdn.example/cover-1-EVIL.png' }
    const { db, writes } = makeDb(drifted)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 409 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })

  test('title cleared after gates aborts 409 with zero writes (gate-input drift)', async () => {
    const episodes = passingSeries()
    const drifted = passingSeries()
    // Concurrent edit: title wiped after gate evaluation — canonical
    // publishability would now fail; the fingerprint must catch it.
    drifted[0] = { ...drifted[0], title: '' }
    const { db, writes } = makeDb(drifted)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 409 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })

  test('resume skip delisted after gates refuses with zero writes', async () => {
    const fresh = passingSeries()
    const ep1 = publishedEpisode(EP1, 1)
    const ep2 = { ...fresh[1] }
    const driftedEp1 = { ...ep1.row, is_hidden: true }
    const { db, writes } = makeDb([driftedEp1, ep2], { seedAudits: ep1.audits })
    // Gated snapshot still shows EP1 live; the fresh read must catch the delist.
    await expect(
      executeOperatorDirectPublish(db, [ep1.row, ep2], {
        seriesId: SERIES,
        decisionId: DECISION,
        preflight: preflightOk,
      })
    ).rejects.toMatchObject({ status: 422 })
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(0)
  })

  test('published-but-hidden snapshot refuses at gate time', async () => {
    const fresh = passingSeries()
    const ep1 = publishedEpisode(EP1, 1)
    ep1.row.is_hidden = true
    const verdict = evaluateOperatorDirectGates([ep1.row, fresh[1]], {
      seriesId: SERIES,
      preflight: preflightOk,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers.join(' ')).toMatch(/not verifiably live-by-this-path/)
  })

  test('script edit without state change aborts 409 with zero writes', async () => {
    const episodes = passingSeries()
    const drifted = passingSeries()
    drifted[1] = { ...drifted[1], script: `${PASS_SCRIPT_2}\nMARA: An unreviewed line.` }
    const { db, writes } = makeDb(drifted)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 409 })
    // EP1 promoted (fresh) before EP2's drift was caught — EP1 fully audited.
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(3)
    expect(writes.filter((w) => w.table === 'story_workflow_audit')).toHaveLength(3)
  })
})
