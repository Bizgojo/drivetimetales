/**
 * PUBLICATION-HOLD CONCURRENCY — PUBLICATION-HOLD-001 (Marc 2026-10-23,
 * commissions lake-marion-permanent-hold-1433 + lake-marion-repair-enforce-merge-1438).
 *
 * Covers, against the REAL branch modules (no behavior mocks):
 *   A. Hold module — set → held; clear → open; missing row → open;
 *      read error/throw → HELD (fail closed); legacy plain 'held' parses held.
 *   B. Operator path — hold set + gate-clean series → executeOperatorDirectPublish
 *      refuses 409 with ZERO writes (control: evaluateOperatorDirectGates is ok,
 *      proving the 409 came from the hold, not the gates).
 *   C. Autonomous path — hold set → maybeDirectPublishStandalone returns
 *      held_blocked with ZERO writes.
 *   D. Belle gate — Belle-fail copy blocked, Belle-pass copy (EP1/EP2 Harbor
 *      scripts + standalone Night Ferry) accepted; intros ≥20ch, outros ≥30ch,
 *      no 'Endless Tales' phrase in outros.
 *   E. Package evidence — bare {pass:true} rejected; stamped evidence accepted;
 *      wrong-job and changed-script rejected.
 *   F. Hook-detector parity — lib/narrativeHook categories agree with the
 *      publication Belle gate's hook requirement on the same intros.
 */

import {
  PUBLICATION_HOLD_KEY,
  PublicationHoldError,
  assertPublishAllowed,
  clearPublicationHold,
  getPublicationHold,
  isPublicationHeld,
  parsePublicationHold,
  setPublicationHold,
} from '@/lib/publicationHold'
import {
  evaluateBelleCopyForPublish,
  evaluateBelleUnitForPublish,
} from '@/lib/publicationBelleGate'
import {
  hasEarnedPackageEvidence,
  stampPackageEvidence,
} from '@/lib/packageEvidence'
import { detectNarrativeHookCategory } from '@/lib/narrativeHook'
import {
  DirectPublishError,
  evaluateOperatorDirectGates,
  executeOperatorDirectPublish,
  type DirectPublishDb,
  type PreflightGateResult,
} from '@/lib/storyQueue/directPublish'
import { buildContinuityPins } from '@/lib/continuityPin'
import { maybeDirectPublishStandalone } from '@/lib/directPublish'

// ── Belle-passing fixture copy (mirrors __tests__/operator-direct-publish-001.test.ts) ──

const EP1_INTRO =
  'Welcome back to Harbor Test Series, I am Belle with episode one, The Wrong Tide — a fisherman vanished from the harbor last night, and the lighthouse ledger names a boat that should not exist.'
const EP1_OUTRO =
  'Sit with that for a moment — the weight of what she gave up tonight is a lot to carry, and you know the logbook opens again in episode two, where the missing page names the storm. Keep listening for what comes next.'
const EP2_INTRO =
  'Welcome back to Harbor Test Series, I am Belle with episode two, The Logbook — a page no one admits writing vanished from the logbook, and the barometer agrees with a storm no record admits.'
const EP2_OUTRO =
  'Hold onto that feeling — the cost of her choice echoes in every page, and we will follow the beam into the reckoning that waits in the next episode. Stay tuned for what the water gives back.'

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
  `BELLE B: ${EP1_INTRO}`,
  '',
  'MARA: The tide brought in a brass key that belonged to no boat in the harbor.',
  'ELI: Then we ask the lighthouse keeper, who keeps a ledger of every lost thing.',
  'MARA: The ledger showed an entry dated tomorrow, written in her own hand.',
  '',
  'BELLE B OUTRO',
  `BELLE B: ${EP1_OUTRO}`,
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
  `BELLE B: ${EP2_INTRO}`,
  '',
  'MARA: The second entry named the storm that sank the Marigold in eighteen ninety.',
  'ELI: No storm was recorded that year, yet the barometer in the tower agrees.',
  'MARA: She closed the book, and the lighthouse beam swung toward the reef.',
  '',
  'BELLE B OUTRO',
  `BELLE B: ${EP2_OUTRO}`,
].join('\n')

const FERRY_INTRO =
  'Welcome to The Night Ferry, I am Belle with a story where a passenger vanished from the midnight ferry and no manifest admits they ever boarded.'
const FERRY_OUTRO =
  'That was The Night Ferry by Test Author, read by Test Narrator. Sit with the weight of her choice tonight — you are not alone with it, and the harbor holds you close.'

const FERRY_SCRIPT = [
  'TITLE: The Night Ferry',
  'AUTHOR: Test Author',
  'NARRATOR: Test Narrator',
  '',
  'BELLE B INTRO',
  `BELLE B: ${FERRY_INTRO}`,
  '',
  'MARA: The ferry left at midnight with one passenger too many.',
  '',
  'BELLE B OUTRO',
  `BELLE B: ${FERRY_OUTRO}`,
].join('\n')

// ── Settings mock (key-addressed atlas_settings) ──

type Row = Record<string, unknown>

function settingsDb(settings: Record<string, string | null>, opts?: { errorKey?: string }) {
  return {
    from: (table: string) => {
      if (table !== 'atlas_settings') throw new Error(`unexpected table ${table}`)
      return {
        select: (_cols: string) => {
          const chain: any = {
            _key: null as string | null,
            eq: (col: string, val: unknown) => {
              if (col === 'key') chain._key = String(val)
              return chain
            },
            maybeSingle: async () => {
              if (opts?.errorKey && chain._key === opts.errorKey) {
                return { data: null, error: { message: 'boom-read' } }
              }
              const v = chain._key ? settings[chain._key] : undefined
              if (v == null) return { data: null, error: null }
              return { data: { value: v }, error: null }
            },
          }
          return chain
        },
        upsert: async (row: Row) => {
          settings[String(row.key)] = String(row.value)
          return { error: null }
        },
      }
    },
  }
}

async function realHeldEnvelope(): Promise<string> {
  const settings: Record<string, string | null> = {}
  const db = settingsDb(settings)
  await setPublicationHold(db as never, { by: 'oct23-test', reason: 'concurrency test hold' })
  const stored = settings[PUBLICATION_HOLD_KEY]
  expect(typeof stored).toBe('string')
  expect(parsePublicationHold(stored).held).toBe(true)
  return stored as string
}

// ── A. Hold module ──

describe('publication hold module', () => {
  test('missing row reads OPEN; assertPublishAllowed resolves', async () => {
    const db = settingsDb({})
    expect(await isPublicationHeld(db as never)).toBe(false)
    await expect(assertPublishAllowed(db as never)).resolves.toBeUndefined()
  })

  test('held envelope reads HELD; assertPublishAllowed throws PublicationHoldError', async () => {
    const held = await realHeldEnvelope()
    const db = settingsDb({ [PUBLICATION_HOLD_KEY]: held })
    const state = await getPublicationHold(db as never)
    expect(state.held).toBe(true)
    expect(state.by).toBe('oct23-test')
    await expect(assertPublishAllowed(db as never)).rejects.toBeInstanceOf(PublicationHoldError)
    await expect(assertPublishAllowed(db as never)).rejects.toMatchObject({ code: 'publication_hold' })
  })

  test('legacy plain values parse: held/true/1 → held; direct → open', () => {
    expect(parsePublicationHold('held').held).toBe(true)
    expect(parsePublicationHold('true').held).toBe(true)
    expect(parsePublicationHold('1').held).toBe(true)
    expect(parsePublicationHold('direct').held).toBe(false)
    expect(parsePublicationHold(null).held).toBe(false)
  })

  test('read error fails CLOSED (HELD) — never releases a publish', async () => {
    const db = settingsDb({}, { errorKey: PUBLICATION_HOLD_KEY })
    expect(await isPublicationHeld(db as never)).toBe(true)
    await expect(assertPublishAllowed(db as never)).rejects.toBeInstanceOf(PublicationHoldError)
  })

  test('set → held, clear → open round-trip on one mock store', async () => {
    const settings: Record<string, string | null> = {}
    const db = settingsDb(settings)
    await setPublicationHold(db as never, { by: 'oct23-test', reason: 'round trip' })
    expect(await isPublicationHeld(db as never)).toBe(true)
    await clearPublicationHold(db as never, { by: 'oct23-test', reason: 'round trip clear' })
    expect(await isPublicationHeld(db as never)).toBe(false)
  })
})

// ── B. Operator path: hold → 409 + zero writes ──

const SERIES = '11111111-1111-1111-1111-111111111111'
const EP1 = '22222222-2222-2222-2222-222222222222'
const EP2 = '33333333-3333-3333-3333-333333333333'
const DECISION = 'harbor-direct-publish-auth'

function passingEpisode(id: string, epNum: number, script: string): Row {
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
  }
}

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

function operatorDbWithHold(episodes: Row[], heldEnvelope: string) {
  const writes: Array<{ table: string; op: string; payload?: unknown; id?: unknown }> = []
  const rows = new Map(episodes.map((r) => [String(r.id), { ...r }]))
  const audits: Row[] = []
  const db: DirectPublishDb = {
    from: (table: string) => {
      if (table === 'atlas_settings') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) => ({
              maybeSingle: async () => ({ data: { value: heldEnvelope }, error: null }),
            }),
          }),
        }
      }
      if (table === 'stories') {
        return {
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
            writes.push({ table, op: 'insert', payload })
            audits.push({ ...(payload as Row) })
            return { error: null }
          },
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
  return { db, writes }
}

describe('operator direct-publish under hold', () => {
  test('gate-clean series + hold set → 409 with ZERO writes', async () => {
    const episodes = passingSeries()
    // Control: gates are green, so the refusal below can only come from the hold.
    const gates = evaluateOperatorDirectGates(episodes, {
      seriesId: SERIES,
      preflight: preflightOk,
    })
    expect(gates.ok).toBe(true)

    const held = await realHeldEnvelope()
    const { db, writes } = operatorDbWithHold(episodes, held)
    await expect(
      executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
    ).rejects.toMatchObject({ status: 409 })
    try {
      await executeOperatorDirectPublish(db, episodes, { seriesId: SERIES, decisionId: DECISION, preflight: preflightOk })
      throw new Error('should have refused')
    } catch (e) {
      expect(e).toBeInstanceOf(DirectPublishError)
      expect(String((e as Error).message)).toMatch(/hold is ACTIVE/)
    }
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })
})

// ── C. Autonomous path: hold → held_blocked + zero writes ──

describe('autonomous direct-publish under hold', () => {
  test('hold set → held_blocked with ZERO writes (mode direct)', async () => {
    const held = await realHeldEnvelope()
    const writes: Array<{ table: string; op: string }> = []
    const db: any = {
      from: (table: string) => {
        if (table === 'atlas_settings') {
          return {
            select: (_cols: string) => {
              const chain: any = {
                _key: null as string | null,
                eq: (col: string, val: unknown) => {
                  if (col === 'key') chain._key = String(val)
                  return chain
                },
                maybeSingle: async () => {
                  if (chain._key === 'publish_mode') return { data: { value: 'direct' }, error: null }
                  if (chain._key === PUBLICATION_HOLD_KEY) return { data: { value: held }, error: null }
                  return { data: null, error: null }
                },
              }
              return chain
            },
          }
        }
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          update: () => {
            writes.push({ table, op: 'update' })
            return { eq: () => Promise.resolve({ data: null, error: null }) }
          },
          insert: async () => {
            writes.push({ table, op: 'insert' })
            return { data: null, error: null }
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }
      },
    }
    const report = await maybeDirectPublishStandalone(db, { storyId: 'story-1', jobId: 'job-1' })
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.join(' ')).toMatch(/hold is ACTIVE/)
    expect(writes).toHaveLength(0)
  })
})

// ── D. Belle gate ──

describe('publication Belle gate', () => {
  test('EP1/EP2 Harbor scripts pass as series non-finale episodes', () => {
    const eps = [
      { id: EP1, title: 'The Wrong Tide', author: 'Test Author', script: PASS_SCRIPT_1, series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 1 },
      { id: EP2, title: 'The Logbook', author: 'Test Author', script: PASS_SCRIPT_2, series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 2 },
    ]
    for (const ep of eps) {
      const v = evaluateBelleCopyForPublish(ep)
      expect(v.ok).toBe(true)
    }
    expect(evaluateBelleUnitForPublish(eps).ok).toBe(true)
  })

  test('standalone Night Ferry passes (title+author+narrator credited, no tease)', () => {
    const v = evaluateBelleCopyForPublish({
      id: 'story-1',
      title: 'The Night Ferry',
      author: 'Test Author',
      script: FERRY_SCRIPT,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) throw new Error(`unexpected blockers: ${(v as { blockers: string[] }).blockers.join('; ')}`)
    expect(v.episodeType).toBe('standalone')
  })

  test('Belle-fail copy blocked: closure-language outro with no tease/reflection fails non-finale', () => {
    const bad = PASS_SCRIPT_1.replace(EP1_OUTRO, 'That was The Wrong Tide, an Endless Tales original read at length for the Harbor Test Series.')
    const v = evaluateBelleCopyForPublish({
      id: EP1,
      title: 'The Wrong Tide',
      author: 'Test Author',
      script: bad,
      series_id: SERIES,
      series_name: 'Harbor Test Series',
      episode_number: 1,
    })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected blockers')
    expect(v.blockers.length).toBeGreaterThan(0)
    expect(evaluateBelleUnitForPublish([{ id: EP1, title: 'The Wrong Tide', author: 'Test Author', script: bad, series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 1 }]).ok).toBe(false)
  })

  test('fixture copy constraints: intros ≥20ch, outros ≥30ch, no Endless Tales in outros', () => {
    for (const intro of [EP1_INTRO, EP2_INTRO, FERRY_INTRO]) {
      expect(intro.length).toBeGreaterThanOrEqual(20)
    }
    for (const outro of [EP1_OUTRO, EP2_OUTRO, FERRY_OUTRO]) {
      expect(outro.length).toBeGreaterThanOrEqual(30)
      expect(outro).not.toMatch(/Endless Tales/)
    }
  })
})

// ── E. Package evidence ──

describe('package-validation evidence', () => {
  const JOB = 'job-ev-1'
  const SERIES_ID = 'series-ev-1'
  const episodes = [
    { id: 'e1', script: PASS_SCRIPT_1 },
    { id: 'e2', script: PASS_SCRIPT_2 },
  ]

  test('bare {pass:true} with no evidence is rejected', () => {
    expect(hasEarnedPackageEvidence({ pass: true }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })

  test('stamped evidence for this job + series + scripts is accepted', () => {
    const stamped = stampPackageEvidence({ pass: true }, {
      jobId: JOB,
      seriesId: SERIES_ID,
      episodes,
      kind: 'series-package-validator',
      note: 'oct23 test run',
    })
    expect(hasEarnedPackageEvidence(stamped, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(true)
  })

  test('evidence from the wrong job is rejected', () => {
    const stamped = stampPackageEvidence({ pass: true }, {
      jobId: 'other-job',
      seriesId: SERIES_ID,
      episodes,
      kind: 'series-package-validator',
      note: 'oct23 test run',
    })
    expect(hasEarnedPackageEvidence(stamped, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })

  test('evidence against changed scripts is rejected', () => {
    const stamped = stampPackageEvidence({ pass: true }, {
      jobId: JOB,
      seriesId: SERIES_ID,
      episodes,
      kind: 'series-package-validator',
      note: 'oct23 test run',
    })
    const changed = [
      { id: 'e1', script: PASS_SCRIPT_1 },
      { id: 'e2', script: `${PASS_SCRIPT_2}\nMARA: One more line changes the hash.` },
    ]
    expect(hasEarnedPackageEvidence(stamped, { jobId: JOB, seriesId: SERIES_ID, episodes: changed })).toBe(false)
  })
})

// ── F. Hook-detector parity ──

describe('narrative-hook detector parity with the Belle gate', () => {
  test('Harbor intros detect a hook category; hookless intro does not', () => {
    expect(detectNarrativeHookCategory(EP1_INTRO)).not.toBeNull()
    expect(detectNarrativeHookCategory(EP2_INTRO)).not.toBeNull()
    expect(detectNarrativeHookCategory(FERRY_INTRO)).toBe('missing_person')
    expect(detectNarrativeHookCategory('Welcome back to the show, I am Belle and tonight is calm and pleasant.')).toBeNull()
  })

  test('gate hook requirement agrees with the detector on the same intros', () => {
    const withHook = evaluateBelleCopyForPublish({
      id: EP1, title: 'The Wrong Tide', author: 'Test Author', script: PASS_SCRIPT_1,
      series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 1,
    })
    const hookBlockers = withHook.ok ? [] : (withHook as { blockers: string[] }).blockers.filter((b) => b.includes('narrative hook'))
    expect(detectNarrativeHookCategory(EP1_INTRO)).not.toBeNull()
    expect(hookBlockers).toHaveLength(0)

    const hooklessIntro = 'Welcome back to Harbor Test Series, I am Belle with episode one, The Wrong Tide — tonight is calm and pleasant over the bay.'
    expect(detectNarrativeHookCategory(hooklessIntro)).toBeNull()
    const hooklessScript = PASS_SCRIPT_1.replace(EP1_INTRO, hooklessIntro)
    const withoutHook = evaluateBelleCopyForPublish({
      id: EP1, title: 'The Wrong Tide', author: 'Test Author', script: hooklessScript,
      series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 1,
    })
    expect(withoutHook.ok).toBe(false)
    if (!withoutHook.ok) {
      expect(withoutHook.blockers.some((b) => b.includes('narrative hook'))).toBe(true)
    }
  })
});
