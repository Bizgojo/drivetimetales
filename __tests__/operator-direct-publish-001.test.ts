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

function makeDb(stories: Row[], opts?: { failAuditOn?: string[]; failUpdateOn?: string[] }) {
  const writes: Array<{ table: string; op: string; payload?: unknown; id?: unknown }> = []
  const rows = new Map(stories.map((r) => [String(r.id), { ...r }]))
  const failAuditOn = new Set(opts?.failAuditOn ?? [])
  const failUpdateOn = new Set(opts?.failUpdateOn ?? [])

  const db: DirectPublishDb = {
    from: (table: string) => {
      if (table === 'stories') {
        return {
          update: (payload: Row) => ({
            eq: async (_col: string, val: unknown) => {
              const id = String(val)
              if (failUpdateOn.has(id)) return { error: { message: 'boom-update' } }
              const row = rows.get(id)
              if (!row) return { error: { message: 'not found' } }
              writes.push({ table, op: 'update', payload, id })
              Object.assign(row, payload)
              return { error: null }
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
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db, writes, rows }
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

  test('audit failure aborts: story update without audit is not permitted', async () => {
    const episodes = passingSeries()
    const { db, writes } = makeDb(episodes, { failAuditOn: [EP1] })
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 500 })
    // EP1 got its first story update, then the audit failed → abort. EP2 untouched.
    const ep2Writes = writes.filter((w) => String((w.id ?? (w.payload as Row)?.story_id) ?? '') === EP2)
    expect(ep2Writes).toHaveLength(0)
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
    expect(blockers.join(' ')).toMatch(/personalization guard/)
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
