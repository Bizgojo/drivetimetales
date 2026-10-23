/**
 * PUBLICATION-HOLD ATOMIC BARRIER — lake-marion-1445-atomic-bar (Marc 2026-10-23).
 *
 * Extends __tests__/publication-hold-concurrency-oct23.test.ts (untouched; all
 * 17 tests stand as-is). Covers the in-transaction atomicity the code-level
 * check+recheck cannot provide:
 *
 *   A. Trigger predicate — the TypeScript mirror of
 *      supabase/migrations/20261023150000_publication_hold_trigger.sql:
 *      becoming-visible boundary matrix + block-reason verdicts.
 *   B. Migration static proof — the deployed SQL exists, fires BEFORE UPDATE
 *      on stories, aborts with RAISE EXCEPTION on the publication_hold
 *      envelope, and does NOT touch stories_workflow_state_check.
 *   C. Trigger enforcement — a mock stories table enforcing the same
 *      predicate aborts a direct becoming-visible UPDATE while held (zero
 *      writes, row untouched) and allows it when clear; non-publishing
 *      updates while held still pass (narrow firing).
 *   D. Per-writer held proof — EVERY writer refused with zero writes when
 *      held: publish-story series, publish-story single, asc3 legacy,
 *      content-approval series, content-approval single, operator executor,
 *      autonomous standalone, autonomous series (the run-next path invokes
 *      the autonomous executors — same functions, same guards).
 *   E. Atomic case — hold SET between the first check and the terminal write
 *      still blocks (flip-on-second-read): route re-reads refuse 409 and the
 *      executors refuse with zero listener-visible writes.
 *   F. Evidence hardness — package evidence cannot be manufactured from a
 *      bare {pass:true} or an unvalidated skip: wrong-job / changed-script /
 *      wrong-series / dropped-episode / added-episode / fabricated-evidence /
 *      null-evidence / non-true-pass are all rejected; the Marc-ruled
 *      LANDING-STORY-001 skip still earns its stamp for the same job+scripts.
 *   G. Belle negatives kept + compliant success fixtures (intros >=20ch,
 *      outros >=30ch, no 'Endless Tales' phrase) — no existing assertion
 *      weakened (existing file untouched).
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  PUBLICATION_HOLD_KEY,
  isBecomingListenerVisible,
  isListenerVisible,
  parsePublicationHold,
  publicationHoldTriggerBlockReason,
  setPublicationHold,
  type PublicationHoldState,
} from '@/lib/publicationHold'
import {
  hasEarnedPackageEvidence,
  stampPackageEvidence,
} from '@/lib/packageEvidence'
import { evaluateBelleCopyForPublish } from '@/lib/publicationBelleGate'
import {
  DirectPublishError,
  evaluateOperatorDirectGates,
  executeOperatorDirectPublish,
  type PreflightGateResult,
} from '@/lib/storyQueue/directPublish'
import {
  maybeDirectPublishSeries,
  maybeDirectPublishStandalone,
} from '@/lib/directPublish'
import { buildContinuityPins } from '@/lib/continuityPin'

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => (globalThis as any).__PUBHOLD_DB__.from(table),
  }),
}))
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { email: 'marc@endless-tales.com' } } }),
    },
  }),
}))
jest.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [] }),
}))

import { POST as publishStoryPost } from '@/app/api/admin/publish-story/route'
import { POST as asc3Post } from '@/app/api/asc3/publish-story/route'
import { POST as contentApprovalPost } from '@/app/api/admin/content-approval/route'

// ── Belle fixtures (compliant: intros >=20ch, outros >=30ch, no Endless Tales) ──

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

// Belle-failing: outro present but closure-language + no tease/reflection (non-finale).
const BAD_OUTRO_SCRIPT = PASS_SCRIPT_1.replace(
  EP1_OUTRO,
  'That was The Wrong Tide, read at length for the Harbor Test Series.'
)
// Belle-failing standalone: no outro at all.
const NO_OUTRO_FERRY = [
  'TITLE: The Night Ferry',
  'AUTHOR: Test Author',
  'NARRATOR: Test Narrator',
  '',
  'BELLE B INTRO',
  `BELLE B: ${FERRY_INTRO}`,
  '',
  'MARA: The ferry left at midnight with one passenger too many.',
].join('\n')

const SERIES = '11111111-1111-1111-1111-111111111111'
const EP1 = '22222222-2222-2222-2222-222222222222'
const EP2 = '33333333-3333-3333-3333-333333333333'
const FERRY_ID = '44444444-4444-4444-4444-444444444444'

// ── Trigger-enforcing supabase mock (mirrors the SQL trigger) ──

type Row = Record<string, unknown>

async function realHeldEnvelope(memo = 'atomic test hold'): Promise<string> {
  const store: Record<string, string> = {}
  const db = {
    from: (_table: string) => ({
      upsert: async (row: Row) => {
        store[String(row.key)] = String(row.value)
        return { error: null }
      },
    }),
  }
  await setPublicationHold(db as never, { by: 'oct23-atomic', reason: memo })
  const stored = store[PUBLICATION_HOLD_KEY]
  expect(typeof stored).toBe('string')
  expect(parsePublicationHold(stored).held).toBe(true)
  return stored
}

type WorldOpts = {
  stories: Row[]
  hold: string | null
  /** Atomic case: first N publication_hold reads see OPEN, later reads see HELD. */
  flipToHeldAfterReads?: number
  publishMode?: string
  enforceTrigger?: boolean
}

function makeWorld(opts: WorldOpts) {
  const writes: Array<{ table: string; op: string; id?: unknown; payload?: unknown }> = []
  const rows = new Map(opts.stories.map((r) => [String(r.id), { ...r }]))
  const audits: Row[] = []
  const enforceTrigger = opts.enforceTrigger !== false
  let holdReads = 0
  const world = {
    writes,
    rows,
    hold: opts.hold as string | null,
    setHold(v: string | null) {
      world.hold = v
    },
  }

  const flipActive = () =>
    opts.flipToHeldAfterReads != null && holdReads > (opts.flipToHeldAfterReads as number)

  const peekHold = (): string | null => {
    if (flipActive()) return (world as any).__held as string
    return world.hold
  }
  const readHold = (): string | null => {
    holdReads += 1
    return peekHold()
  }

  function applyFilters(list: Row[], filters: Array<(r: Row) => boolean>): Row[] {
    return list.filter((r) => filters.every((f) => f(r)))
  }

  function matches(row: Row, filters: Array<(r: Row) => boolean>): boolean {
    return filters.every((f) => f(row))
  }

  function filterBuilder(filters: Array<(r: Row) => boolean>): any {
    const b: any = {
      eq: (c: string, v: unknown) => {
        filters.push((r) => String(r[c] ?? '') === String(v ?? ''))
        return b
      },
      neq: (c: string, v: unknown) => {
        filters.push((r) => String(r[c] ?? '') !== String(v ?? ''))
        return b
      },
      ilike: (c: string, pattern: unknown) => {
        const needle = String(pattern ?? '').replace(/%/g, '').toLowerCase()
        filters.push((r) => String(r[c] ?? '').toLowerCase().includes(needle))
        return b
      },
      like: (c: string, pattern: unknown) => {
        const needle = String(pattern ?? '').replace(/%/g, '').toLowerCase()
        filters.push((r) => String(r[c] ?? '').toLowerCase().includes(needle))
        return b
      },
      gte: (c: string, v: unknown) => {
        filters.push((r) => Number(r[c]) >= Number(v))
        return b
      },
      order: (_c: string, _o?: unknown) => b,
      limit: (_n: number) => b,
    }
    return b
  }

  function storiesSelect() {
    const filters: Array<(r: Row) => boolean> = []
    const b: any = filterBuilder(filters)
    const run = () => applyFilters([...rows.values()], filters).map((r) => ({ ...r }))
    b.single = async () => {
      const m = run()
      return m.length ? { data: m[0], error: null } : { data: null, error: { message: 'none', code: 'PGRST116' } }
    }
    b.maybeSingle = async () => {
      const m = run()
      return { data: m.length ? m[0] : null, error: null }
    }
    b.then = (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej)
    return b
  }

  function storiesUpdate(payload: Row) {
    const filters: Array<(r: Row) => boolean> = []
    const b: any = filterBuilder(filters)
    const run = async () => {
      const matched = [...rows.values()].filter((r) => matches(r, filters))
      // Trigger check FIRST across the whole statement: any becoming-visible
      // row while held aborts with ZERO writes (statement-level atomicity,
      // same as the SQL trigger aborting the transaction).
      if (enforceTrigger) {
        const holdState = parsePublicationHold(peekHold())
        for (const row of matched) {
          const reason = publicationHoldTriggerBlockReason({ ...row }, { ...row, ...payload }, holdState)
          if (reason) return { data: null as unknown, error: { message: reason, code: 'P0001' } }
        }
      }
      for (const row of matched) {
        Object.assign(row, payload)
        writes.push({ table: 'stories', op: 'update', id: row.id, payload: { ...payload } })
      }
      return { data: matched.map((r) => ({ ...r })), error: null }
    }
    b.select = (_cols?: string) => {
      const s: any = {
        then: (res: any, rej: any) => run().then(res, rej),
        single: async () => {
          const r = await run()
          if (r.error) return { data: null, error: r.error }
          const list = r.data as Row[]
          return list.length ? { data: list[0], error: null } : { data: null, error: { message: 'none', code: 'PGRST116' } }
        },
        maybeSingle: async () => {
          const r = await run()
          if (r.error) return { data: null, error: r.error }
          const list = r.data as Row[]
          return { data: list.length ? list[0] : null, error: null }
        },
      }
      return s
    }
    return b
  }

  function auditApi() {
    const filters: Array<(r: Row) => boolean> = []
    const b: any = filterBuilder(filters)
    const run = () => applyFilters(audits, filters).map((r) => ({ ...r }))
    b.single = async () => {
      const m = run()
      return m.length ? { data: m[0], error: null } : { data: null, error: { message: 'none', code: 'PGRST116' } }
    }
    b.maybeSingle = async () => ({ data: run()[0] ?? null, error: null })
    b.then = (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej)
    return {
      ...b,
      select: (_cols: string) => b,
      insert: async (payload: Row | Row[]) => {
        const list = Array.isArray(payload) ? payload : [payload]
        for (const p of list) {
          audits.push({ ...(p as Row) })
          writes.push({ table: 'story_workflow_audit', op: 'insert', payload: { ...(p as Row) } })
        }
        return { error: null }
      },
    }
  }

  const db = {
    from: (table: string) => {
      if (table === 'atlas_settings') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, val: unknown) => ({
              maybeSingle: async () => {
                const key = String(val)
                if (key === PUBLICATION_HOLD_KEY) {
                  const v = readHold()
                  return v == null ? { data: null, error: null } : { data: { value: v }, error: null }
                }
                if (key === 'publish_mode') {
                  return { data: { value: opts.publishMode ?? 'direct' }, error: null }
                }
                return { data: null, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'stories') {
        return { select: (_cols: string) => storiesSelect(), update: (p: Row) => storiesUpdate(p) }
      }
      return auditApi()
    },
  }
  return { db, world, writes, rows }
}

async function primeFlip(world: { __held?: string }, held: string) {
  ;(world as any).__held = held
}

function reqWithBody(body: unknown): never {
  return { json: async () => body } as never
}

function approvalReq(action: string, body: unknown): never {
  return {
    nextUrl: new URL(`http://localhost/api/admin/content-approval?action=${action}`),
    json: async () => body,
  } as never
}

// ── Row fixtures ──

const BASE_URLS = {
  audio_url: 'https://cdn.example/audio.mp3',
  cover_url: 'https://cdn.example/cover.png',
  announcement_url: 'https://cdn.example/ann.mp3',
  background_music_url: 'https://cdn.example/bed.mp3',
}

function ferryRow(overrides: Row = {}): Row {
  return {
    id: FERRY_ID,
    title: 'The Night Ferry',
    author: 'Test Author',
    genre: 'Mystery',
    description: 'A test standalone.',
    duration_mins: 17,
    announcement_text: 'Belle announcement',
    script: FERRY_SCRIPT,
    workflow_state: 'approved_ready',
    review_status: 'approved',
    status: 'audio_ready',
    is_hidden: true,
    production_repair_count: 0,
    series_id: null,
    ...BASE_URLS,
    ...overrides,
  }
}

function harborEpisode(id: string, epNum: number, script: string, overrides: Row = {}): Row {
  return {
    id,
    series_id: SERIES,
    series_name: 'Harbor Test Series',
    episode_number: epNum,
    title: epNum === 1 ? 'The Wrong Tide' : 'The Logbook',
    author: 'Test Author',
    genre: 'Mystery',
    narrator_voice_name: 'Test Narrator',
    description: 'A test episode.',
    duration_mins: 17,
    announcement_text: 'Belle announcement',
    script,
    workflow_state: 'approved_ready',
    review_status: 'approved',
    status: 'audio_ready',
    is_hidden: true,
    production_repair_count: 0,
    ...BASE_URLS,
    ...overrides,
  }
}

function operatorEpisode(id: string, epNum: number, script: string): Row {
  // Operator-executor entry state: repair_queue (mirrors the concurrency suite).
  return harborEpisode(id, epNum, script, { workflow_state: 'repair_queue', review_status: 'pending' })
}

function operatorSeries(): Row[] {
  const ep1 = operatorEpisode(EP1, 1, PASS_SCRIPT_1)
  const ep2 = operatorEpisode(EP2, 2, PASS_SCRIPT_2)
  ep2.script_json = { series_generation: { continuity_pins_used: buildContinuityPins([ep1]) } }
  ep1.script_json = { series_generation: {} }
  return [ep1, ep2]
}

const operatorPreflight: Record<string, PreflightGateResult> = {
  [EP1]: { ok: true, blockers: [] },
  [EP2]: { ok: true, blockers: [] },
}

function setWorld(w: { db: unknown }) {
  ;(globalThis as any).__PUBHOLD_DB__ = w.db
}

// ── A. Trigger predicate ──

describe('trigger predicate (TypeScript mirror of the SQL)', () => {
  const hidden: Row = { status: 'audio_ready', is_hidden: true }
  const visible: Row = { status: 'published', is_hidden: false }
  const publishedHidden: Row = { status: 'published', is_hidden: true }

  test('isListenerVisible: only published+unhidden rows are visible', () => {
    expect(isListenerVisible(visible)).toBe(true)
    expect(isListenerVisible(hidden)).toBe(false)
    expect(isListenerVisible(publishedHidden)).toBe(false)
    expect(isListenerVisible({ status: 'Published', is_hidden: false })).toBe(true)
    expect(isListenerVisible(null)).toBe(false)
    expect(isListenerVisible(undefined)).toBe(false)
  })

  test('isBecomingListenerVisible: fires only on hidden/draft -> published+visible', () => {
    expect(isBecomingListenerVisible(hidden, visible)).toBe(true)
    expect(isBecomingListenerVisible(publishedHidden, visible)).toBe(true)
    expect(isBecomingListenerVisible(null, visible)).toBe(true)
    expect(isBecomingListenerVisible(visible, visible)).toBe(false)
    expect(isBecomingListenerVisible(visible, { ...visible, title: 'retitled' })).toBe(false)
    expect(isBecomingListenerVisible(hidden, hidden)).toBe(false)
    expect(isBecomingListenerVisible(hidden, publishedHidden)).toBe(false)
    expect(isBecomingListenerVisible(hidden, null)).toBe(false)
  })

  test('block reason: held + becoming -> reason; otherwise null', () => {
    const held: PublicationHoldState = { held: true, by: 'marc', reason: 'race test', at: 'now' }
    const open: PublicationHoldState = { held: false, by: null, reason: null, at: null }
    expect(publicationHoldTriggerBlockReason(hidden, visible, held)).toMatch(/publication_hold/)
    expect(publicationHoldTriggerBlockReason(hidden, visible, open)).toBeNull()
    expect(publicationHoldTriggerBlockReason(hidden, visible, null)).toBeNull()
    expect(publicationHoldTriggerBlockReason(visible, visible, held)).toBeNull()
    expect(publicationHoldTriggerBlockReason(hidden, hidden, held)).toBeNull()
  })
})

// ── B. Migration static proof ──

describe('migration static proof', () => {
  const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '20261023150000_publication_hold_trigger.sql')
  const sql = fs.readFileSync(MIGRATION, 'utf8')

  test('trigger fires BEFORE UPDATE on stories and aborts on the hold envelope', () => {
    expect(sql).toMatch(/BEFORE UPDATE ON public\.stories/i)
    expect(sql).toMatch(/FOR EACH ROW/i)
    expect(sql).toMatch(/RAISE EXCEPTION/i)
    expect(sql).toMatch(/publication_hold/)
    expect(sql).toMatch(/trg_block_publication_while_hold_active/)
    expect(sql).toMatch(/IS DISTINCT FROM/)
  })

  test('migration does not touch stories_workflow_state_check or any other gate', () => {
    expect(sql).not.toMatch(/stories_workflow_state_check/)
    expect(sql).not.toMatch(/DROP TABLE/i)
    expect(sql).not.toMatch(/ALTER TABLE/i)
  })
})

// ── C. Trigger enforcement at the mock table ──

describe('trigger enforcement (direct UPDATE against a trigger-enforcing table)', () => {
  test('becoming-visible UPDATE while held aborts: error + zero writes + row untouched', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, rows } = makeWorld({ stories: [ferryRow()], hold: held })
    const client = db as any
    const res = await client
      .from('stories')
      .update({ status: 'published', workflow_state: 'published', is_hidden: false })
      .eq('id', FERRY_ID)
      .select('id')
    expect(res.error).not.toBeNull()
    expect(String(res.error.message)).toMatch(/publication_hold/)
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    const row = rows.get(FERRY_ID) as Row
    expect(row.status).toBe('audio_ready')
    expect(row.is_hidden).toBe(true)
  })

  test('same UPDATE when clear succeeds and records the write', async () => {
    const { db, writes, rows } = makeWorld({ stories: [ferryRow()], hold: null })
    const client = db as any
    const res = await client
      .from('stories')
      .update({ status: 'published', workflow_state: 'published', is_hidden: false })
      .eq('id', FERRY_ID)
      .select('id')
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(1)
    expect((rows.get(FERRY_ID) as Row).is_hidden).toBe(false)
  })

  test('non-publishing updates while held still pass (narrow firing)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({ stories: [ferryRow()], hold: held })
    const client = db as any
    const res = await client.from('stories').update({ description: 'edited' }).eq('id', FERRY_ID).select('id')
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(1)
  })

  test('touching an already-visible row while held still passes', async () => {
    const held = await realHeldEnvelope()
    const live = ferryRow({ status: 'published', workflow_state: 'published', is_hidden: false })
    const { db, writes } = makeWorld({ stories: [live], hold: held })
    const client = db as any
    const res = await client.from('stories').update({ description: 'edited' }).eq('id', FERRY_ID).select('id')
    expect(res.error).toBeNull()
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(1)
  })
})

// ── D+E. Per-writer proof: routes (held -> 409 + zero writes; flip -> 409) ──

describe('writer: publish-story series', () => {
  test('held -> 409 publication_hold with ZERO story writes', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({
      stories: [harborEpisode(EP1, 1, BAD_OUTRO_SCRIPT), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: held,
    })
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ seriesId: SERIES }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('ATOMIC: hold set between check and terminal write still blocks (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, world } = makeWorld({
      stories: [harborEpisode(EP1, 1, PASS_SCRIPT_1), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: null,
      flipToHeldAfterReads: 1,
    })
    await primeFlip(world, held)
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ seriesId: SERIES }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('control: same fixtures with hold clear pass the hold gate (Belle 422, not 409)', async () => {
    const { db } = makeWorld({
      stories: [harborEpisode(EP1, 1, BAD_OUTRO_SCRIPT), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: null,
    })
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ seriesId: SERIES }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('belle_publish_refused')
  })
})

describe('writer: publish-story single', () => {
  test('held -> 409 publication_hold with ZERO story writes', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({ stories: [ferryRow()], hold: held })
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('ATOMIC: hold set between check and terminal write still blocks (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, world } = makeWorld({ stories: [ferryRow()], hold: null, flipToHeldAfterReads: 1 })
    await primeFlip(world, held)
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('control: hold clear passes the hold gate (Belle 422, not 409)', async () => {
    const { db } = makeWorld({ stories: [ferryRow({ script: NO_OUTRO_FERRY })], hold: null })
    setWorld({ db } as never)
    const res = await publishStoryPost(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('belle_publish_refused')
  })
})

describe('writer: asc3 legacy publish', () => {
  test('held -> 409 publication_hold with ZERO story writes', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({ stories: [ferryRow()], hold: held })
    setWorld({ db } as never)
    const res = await asc3Post(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('ATOMIC: hold set between check and terminal write still blocks (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, world } = makeWorld({ stories: [ferryRow()], hold: null, flipToHeldAfterReads: 1 })
    await primeFlip(world, held)
    setWorld({ db } as never)
    const res = await asc3Post(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('control: hold clear passes the hold gate (Belle 422, not 409)', async () => {
    const { db } = makeWorld({ stories: [ferryRow({ script: NO_OUTRO_FERRY })], hold: null })
    setWorld({ db } as never)
    const res = await asc3Post(reqWithBody({ storyId: FERRY_ID }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('belle_publish_refused')
  })
})

describe('writer: content-approval series -> published', () => {
  const action = 'set_series_workflow_state'
  test('held -> 409 publication_hold with ZERO story writes', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({
      stories: [harborEpisode(EP1, 1, BAD_OUTRO_SCRIPT), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: held,
    })
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { seriesId: SERIES, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('ATOMIC: hold set between check and terminal write still blocks (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, world } = makeWorld({
      stories: [harborEpisode(EP1, 1, PASS_SCRIPT_1), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: null,
      flipToHeldAfterReads: 1,
    })
    await primeFlip(world, held)
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { seriesId: SERIES, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('control: hold clear passes the hold gate (Belle 422, not 409)', async () => {
    const { db } = makeWorld({
      stories: [harborEpisode(EP1, 1, BAD_OUTRO_SCRIPT), harborEpisode(EP2, 2, PASS_SCRIPT_2)],
      hold: null,
    })
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { seriesId: SERIES, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('belle_publish_refused')
  })
})

describe('writer: content-approval single -> published', () => {
  const action = 'set_workflow_state'
  test('held -> 409 publication_hold with ZERO story writes', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({ stories: [ferryRow()], hold: held })
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { storyId: FERRY_ID, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('ATOMIC: hold set between check and terminal write still blocks (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes, world } = makeWorld({ stories: [ferryRow()], hold: null, flipToHeldAfterReads: 1 })
    await primeFlip(world, held)
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { storyId: FERRY_ID, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('publication_hold')
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  test('control: hold clear passes the hold gate (Belle 422, not 409)', async () => {
    const { db } = makeWorld({ stories: [ferryRow({ script: NO_OUTRO_FERRY })], hold: null })
    setWorld({ db } as never)
    const res = await contentApprovalPost(approvalReq(action, { storyId: FERRY_ID, state: 'published' }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('belle_publish_refused')
  })
})

// ── D+E. Per-writer proof: executors (operator + autonomous incl. run-next path) ──

describe('writer: operator direct-publish executor', () => {
  test('ATOMIC: hold set after gate check still blocks every episode (409, zero writes)', async () => {
    const held = await realHeldEnvelope()
    const episodes = operatorSeries()
    // Control: gates are green, so the refusal below can only come from the hold.
    expect(evaluateOperatorDirectGates(episodes, { seriesId: SERIES, preflight: operatorPreflight }).ok).toBe(true)

    const { db, writes, world } = makeWorld({ stories: episodes, hold: null, flipToHeldAfterReads: 1 })
    await primeFlip(world, held)
    await expect(
      executeOperatorDirectPublish(db as never, episodes, {
        seriesId: SERIES,
        decisionId: 'harbor-direct-publish-auth',
        preflight: operatorPreflight,
      })
    ).rejects.toMatchObject({ status: 409 })
    try {
      await executeOperatorDirectPublish(db as never, episodes, {
        seriesId: SERIES,
        decisionId: 'harbor-direct-publish-auth',
        preflight: operatorPreflight,
      })
      throw new Error('should have refused')
    } catch (e) {
      expect(e).toBeInstanceOf(DirectPublishError)
      expect(String((e as Error).message)).toMatch(/hold is ACTIVE/)
    }
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })
})

describe('writer: autonomous executors (standalone + series = the run-next path)', () => {
  test('standalone ATOMIC: hold set between entry check and terminal write -> held_blocked, zero listener-visible writes', async () => {
    const held = await realHeldEnvelope()
    const story = ferryRow({ workflow_state: 'ready_for_review', review_status: 'pending' })
    const { db, writes, rows, world } = makeWorld({ stories: [story], hold: null, flipToHeldAfterReads: 1 })
    await primeFlip(world, held)
    const report = await maybeDirectPublishStandalone(db as never, { storyId: FERRY_ID, jobId: 'job-atomic-1' })
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.join(' ')).toMatch(/hold is ACTIVE/)
    // No row may have become listener-visible through this path.
    for (const row of rows.values()) {
      expect(isListenerVisible(row)).toBe(false)
    }
    expect(writes.filter((w) => w.table === 'stories')).toHaveLength(0)
  })

  test('standalone held from the start -> held_blocked with ZERO writes of any kind', async () => {
    const held = await realHeldEnvelope()
    const story = ferryRow({ workflow_state: 'ready_for_review', review_status: 'pending' })
    const { db, writes } = makeWorld({ stories: [story], hold: held })
    const report = await maybeDirectPublishStandalone(db as never, { storyId: FERRY_ID, jobId: 'job-atomic-2' })
    expect(report.action).toBe('held_blocked')
    expect(writes).toHaveLength(0)
  })

  test('series held from the start -> held_blocked with ZERO writes (run-next series path)', async () => {
    const held = await realHeldEnvelope()
    const { db, writes } = makeWorld({ stories: [], hold: held })
    const report = await maybeDirectPublishSeries(db as never, {
      seriesId: SERIES,
      episodeIds: [EP1, EP2],
      jobId: 'job-atomic-3',
    })
    expect(report.action).toBe('held_blocked')
    expect(report.blockers?.join(' ')).toMatch(/hold is ACTIVE/)
    expect(writes).toHaveLength(0)
  })
})

// ── F. Evidence hardness ──

describe('package evidence hardness (no manufactured PASS)', () => {
  const JOB = 'job-ev-atomic'
  const SERIES_ID = 'series-ev-atomic'
  const episodes = [
    { id: 'e1', script: PASS_SCRIPT_1 },
    { id: 'e2', script: PASS_SCRIPT_2 },
  ]

  function stampedLanding() {
    return stampPackageEvidence(
      { pass: true, issues: [], confidence: 1, summary: 'LANDING-STORY-001 preview package skip. Marc ruling 2026-07-24 19:38.' },
      { jobId: JOB, seriesId: SERIES_ID, episodes, kind: 'landing-skip', note: 'LANDING-STORY-001. Marc ruling 2026-07-24 19:38.' }
    )
  }

  test('earned landing-skip accepted for the same job + series + scripts', () => {
    expect(hasEarnedPackageEvidence(stampedLanding(), { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(true)
  })

  test('landing-skip from another job rejected (must re-validate)', () => {
    const other = stampPackageEvidence({ pass: true }, {
      jobId: 'other-job', seriesId: SERIES_ID, episodes, kind: 'landing-skip', note: 'skip',
    })
    expect(hasEarnedPackageEvidence(other, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })

  test('landing-skip against changed scripts rejected', () => {
    const changed = [
      { id: 'e1', script: PASS_SCRIPT_1 },
      { id: 'e2', script: `${PASS_SCRIPT_2}\nMARA: One more line changes the hash.` },
    ]
    expect(hasEarnedPackageEvidence(stampedLanding(), { jobId: JOB, seriesId: SERIES_ID, episodes: changed })).toBe(false)
  })

  test('landing-skip for the wrong series rejected', () => {
    expect(hasEarnedPackageEvidence(stampedLanding(), { jobId: JOB, seriesId: 'other-series', episodes })).toBe(false)
  })

  test('dropped episode rejected (2-episode evidence, 1-episode package)', () => {
    const one = [{ id: 'e1', script: PASS_SCRIPT_1 }]
    expect(hasEarnedPackageEvidence(stampedLanding(), { jobId: JOB, seriesId: SERIES_ID, episodes: one })).toBe(false)
  })

  test('added episode rejected (evidence missing the new episode)', () => {
    const stamped = stampPackageEvidence({ pass: true }, {
      jobId: JOB, seriesId: SERIES_ID, episodes: [{ id: 'e1', script: PASS_SCRIPT_1 }],
      kind: 'series-package-validator', note: 'one-episode run',
    })
    expect(hasEarnedPackageEvidence(stamped, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })

  test('fabricated evidence object (hand-made hashes) rejected', () => {
    const fabricated = {
      pass: true,
      evidence: {
        jobId: JOB,
        seriesId: SERIES_ID,
        validatedAt: new Date().toISOString(),
        kind: 'series-package-validator',
        episodeHashes: { e1: 'deadbeef', e2: 'deadbeef' },
        note: 'forged',
      },
    }
    expect(hasEarnedPackageEvidence(fabricated, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })

  test('null / string / missing evidence rejected; non-true pass rejected', () => {
    expect(hasEarnedPackageEvidence({ pass: true, evidence: null }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
    expect(hasEarnedPackageEvidence({ pass: true, evidence: 'stamped' }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
    expect(hasEarnedPackageEvidence({ pass: true }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
    expect(hasEarnedPackageEvidence(null, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
    const stamped = stampedLanding() as unknown as Record<string, unknown>
    expect(hasEarnedPackageEvidence({ ...stamped, pass: 'true' }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
    expect(hasEarnedPackageEvidence({ ...stamped, pass: 1 }, { jobId: JOB, seriesId: SERIES_ID, episodes })).toBe(false)
  })
})

// ── G. Belle negatives kept + compliant success fixtures ──

describe('Belle gate negatives kept (no weakening)', () => {
  test('closure-language outro with no tease/reflection fails non-finale', () => {
    const v = evaluateBelleCopyForPublish({
      id: EP1, title: 'The Wrong Tide', author: 'Test Author', script: BAD_OUTRO_SCRIPT,
      series_id: SERIES, series_name: 'Harbor Test Series', episode_number: 1,
    })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected blockers')
    expect(v.blockers.length).toBeGreaterThan(0)
  })

  test('standalone without outro fails', () => {
    const v = evaluateBelleCopyForPublish({ id: FERRY_ID, title: 'The Night Ferry', author: 'Test Author', script: NO_OUTRO_FERRY })
    expect(v.ok).toBe(false)
  })

  test('standalone teasing a next episode fails', () => {
    const tease = FERRY_SCRIPT.replace(FERRY_OUTRO, `${FERRY_OUTRO} Tune in next episode for what happens next.`)
    const v = evaluateBelleCopyForPublish({ id: FERRY_ID, title: 'The Night Ferry', author: 'Test Author', script: tease })
    expect(v.ok).toBe(false)
  })

  test('compliant fixtures pass with length/phrase constraints intact', () => {
    for (const intro of [EP1_INTRO, EP2_INTRO, FERRY_INTRO]) {
      expect(intro.length).toBeGreaterThanOrEqual(20)
    }
    for (const outro of [EP1_OUTRO, EP2_OUTRO, FERRY_OUTRO]) {
      expect(outro.length).toBeGreaterThanOrEqual(30)
      expect(outro).not.toMatch(/Endless Tales/)
    }
    expect(evaluateBelleCopyForPublish({ id: FERRY_ID, title: 'The Night Ferry', author: 'Test Author', script: FERRY_SCRIPT }).ok).toBe(true)
  })
})
