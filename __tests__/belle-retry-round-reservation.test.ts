/**
 * BELLE-RETRY-PER-ROUND-RESERVATION-001 regression suite.
 *
 * Production control flow under test (run-next route.ts, series Belle-retry
 * block): a BOUNDED regen+validate feedback loop (up to
 * MAX_SERIES_BELLE_RETRIES - currentRetry rounds) where round 1 reuses the
 * initial reservation and EVERY additional round reserves its own count
 * durably (fenced + affected-row-checked, via the REAL
 * reserveBelleRetryCount) BEFORE its paid rewrite. A failed reservation
 * throws before the next paid call.
 *
 * This file mirrors that control flow 1:1 with injected regen/validate
 * fakes (established norm: belle-series-retry-feedback-bound.test.js), but
 * every reservation, final count write, and restart re-read goes through
 * the REAL @supabase/supabase-js QueryBuilder with a stub fetch that
 * captures the outgoing request strings. Assertions run against the
 * captured PATCH sequence (never a mirror), backed by a minimal in-memory
 * PostgREST emulator for production_jobs. The paid regen fake records a
 * wire index so ordering (reservation PATCH strictly before paid call) is
 * asserted against the captured log.
 *
 * Cases:
 *   A. kill after round-two reservation, before round-two paid call:
 *      restart retains BOTH consumed attempts (count == 2).
 *   B. kill after round-one paid call, before round-two reservation:
 *      restart retains round one (count == 1); resume reserves 2, feeds
 *      round-one issues into round two, succeeds with count == 2.
 *   C. failed round-two reservation (lock lost, zero rows): zero further
 *      paid calls; round one retained.
 *   D. round-one behavior unchanged: single passing round, one paid call,
 *      reservation + final write both carry count == 1.
 *   E. uninterrupted two-round success: PATCH sequence [1,2,2], count == 2.
 *
 * Run: npx jest __tests__/belle-retry-round-reservation.test.ts --no-coverage
 */
import { createClient } from '@supabase/supabase-js'
import { reserveBelleRetryCount } from '@/lib/belleRepairPersist'
import { ownedJobFence } from '@/lib/jobLockGuard'

const MAX_SERIES_BELLE_RETRIES = 3
const JOB_ID = 'job-round-res'
const HOLDER = 'holder-1'
const LOCK_AT = '2026-10-22T15:00:00.000Z'
const EP_ID = 'story-creek-ep2'
const EP_NUM = 2
const TS = '2026-10-22T16:00:00.000Z'
const KILL = new Error('SIMULATED-STOP')

interface ReqLog {
  method: string
  url: string
  body: string | null
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function projectRow(row: any, select: string | null): any {
  if (!select || select === '*') return clone(row)
  const out: any = {}
  for (const col of select.split(',')) {
    const c = col.trim()
    if (c && c in row) out[c] = clone(row[c])
  }
  return out
}

function rowMatchesParams(row: any, sp: URLSearchParams): boolean {
  for (const [col, expr] of sp) {
    if (col === 'select' || col === 'order' || col === 'limit' || col === 'offset') continue
    if (expr === 'is.null') {
      if ((row as any)[col] !== null && (row as any)[col] !== undefined) return false
      continue
    }
    if (expr.startsWith('eq.')) {
      if (String((row as any)[col] ?? '') !== expr.slice(3)) return false
      continue
    }
    if (expr.startsWith('neq.')) {
      if (String((row as any)[col] ?? '') === expr.slice(4)) return false
      continue
    }
    return false
  }
  return true
}

function makeEmulator(seedJobs: Record<string, any>) {
  const jobs = new Map<string, any>(Object.entries(clone(seedJobs)))
  const requests: ReqLog[] = []
  const stubFetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input?.url)
    const method = String(init?.method || 'GET').toUpperCase()
    const bodyText =
      init?.body == null ? null : typeof init.body === 'string' ? init.body : String(init.body)
    requests.push({ method, url, body: bodyText })
    const parsed = new URL(url)
    const accept = (() => {
      try {
        return new Headers(init?.headers).get('accept') || ''
      } catch {
        return ''
      }
    })()
    const wantsSingle = accept.includes('application/vnd.pgrst.object+json')
    const restMatch = parsed.pathname.match(/^\/rest\/v1\/([^/]+)$/)
    if (!restMatch) return jsonResponse({ message: 'emu: unknown path' }, 404)
    if (restMatch[1] !== 'production_jobs') return jsonResponse({ message: 'emu: unknown table' }, 404)
    const sp = parsed.searchParams
    if (method === 'GET') {
      const matched = [...jobs.values()].filter((r) => rowMatchesParams(r, sp))
      const select = sp.get('select')
      if (wantsSingle) {
        if (matched.length !== 1) {
          return jsonResponse({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406)
        }
        return jsonResponse(projectRow(matched[0], select))
      }
      return jsonResponse(matched.map((r) => projectRow(r, select)))
    }
    if (method === 'PATCH') {
      const values = JSON.parse(bodyText || '{}')
      const matched: any[] = []
      for (const row of jobs.values()) {
        if (!rowMatchesParams(row, sp)) continue
        for (const [k, v] of Object.entries(values)) (row as any)[k] = clone(v)
        matched.push(row)
      }
      const select = sp.get('select')
      if (select) {
        if (wantsSingle) {
          if (matched.length !== 1) {
            return jsonResponse({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406)
          }
          return jsonResponse(projectRow(matched[0], select))
        }
        return jsonResponse(matched.map((r) => projectRow(r, select)))
      }
      return jsonResponse([])
    }
    return jsonResponse({ message: 'emu: unsupported method' }, 405)
  }
  const client = createClient('https://xyz.supabase.co', 'test-anon-key', {
    global: { fetch: stubFetch as any },
  })
  return { client, requests, jobs }
}

type Emu = ReturnType<typeof makeEmulator>

function seedJobRow(): Record<string, any> {
  return {
    [JOB_ID]: {
      id: JOB_ID,
      status: 'running',
      locked_by: HOLDER,
      locked_at: LOCK_AT,
      state_json: { seriesCompleteStoryPackage: { belleRetry: { byEpisode: {} } } },
    },
  }
}

const LOCK_SNAPSHOT = { id: JOB_ID, locked_by: HOLDER, locked_at: LOCK_AT }

/** Counts carried by each production_jobs PATCH body, in wire order. */
function jobPatchCounts(emu: Emu): number[] {
  return emu.requests
    .filter((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/production_jobs'))
    .map((r) => {
      const body = JSON.parse(r.body || '{}')
      return Number(body?.state_json?.seriesCompleteStoryPackage?.belleRetry?.byEpisode?.[EP_ID]?.count ?? NaN)
    })
}

function assertCleanWire(emu: Emu): void {
  expect(emu.requests.length).toBeGreaterThan(0)
  for (const r of emu.requests) {
    expect(r.url).not.toContain('[object Object]')
    expect(r.url).not.toContain('object+Object')
    expect(r.url).not.toContain('%5Bobject')
  }
}

async function readEpCount(client: any): Promise<number> {
  const { data, error } = await client
    .from('production_jobs')
    .select('state_json')
    .eq('id', JOB_ID)
    .single()
  if (error) throw new Error('restart re-read failed: ' + String(error.message || error))
  return Number((data as any)?.state_json?.seriesCompleteStoryPackage?.belleRetry?.byEpisode?.[EP_ID]?.count ?? 0)
}

interface MirrorOpts {
  client: any
  requests: ReqLog[]
  currentRetry: number
  issues: string[]
  regen: (round: number, issues: string[]) => Promise<{ introText: string; outroText: string }>
  validate: (round: number) => Promise<{ passed: boolean; issues: string[] }>
  events: Array<{ kind: string; round: number; idx: number }>
  killBeforePaid?: Set<number>
  killAfterPaid?: Set<number>
  beforeReserve?: (round: number, count: number) => void
}

/**
 * 1:1 mirror of the production retry block (reservation builder shape,
 * loop, per-round reservation, bound-aware after-writes). Reservations and
 * count writes use the REAL client; regen/validate are injected.
 */
async function runReservedRetryLoop(opts: MirrorOpts): Promise<{ retryCount: number; roundsUsed: number }> {
  const { client, requests, currentRetry, issues } = opts
  const buildReserveState = (count: number) => ({
    seriesCompleteStoryPackage: {
      belleRetry: {
        byEpisode: {
          [EP_ID]: {
            count,
            max: MAX_SERIES_BELLE_RETRIES,
            episodeNumber: EP_NUM,
            issues,
            repairedIntro: null,
            repairedOutro: null,
            deletedBelleFiles: [],
            lastRetriedAt: TS,
          },
        },
      },
      lastUpdatedAt: TS,
    },
  })
  const doReserve = async (round: number, count: number) => {
    if (opts.beforeReserve) opts.beforeReserve(round, count)
    await reserveBelleRetryCount(client, {
      jobId: JOB_ID,
      fence: ownedJobFence(LOCK_SNAPSHOT, HOLDER),
      stateJson: buildReserveState(count),
    })
    opts.events.push({ kind: 'reserve', round, idx: requests.length - 1 })
  }
  await doReserve(1, currentRetry + 1)
  const remaining = Math.max(MAX_SERIES_BELLE_RETRIES - currentRetry, 0)
  let roundsUsed = 0
  let passed = false
  let lastIssues = [...issues]
  for (let attempt = 0; attempt < remaining; attempt++) {
    const round = attempt + 1
    if (attempt > 0) {
      await doReserve(round, currentRetry + attempt + 1)
    }
    if (opts.killBeforePaid && opts.killBeforePaid.has(round)) throw KILL
    const attemptIssues = attempt === 0 ? [...issues] : [...lastIssues]
    opts.events.push({ kind: 'paid', round, idx: requests.length })
    const repaired = await opts.regen(round, attemptIssues)
    void repaired
    if (opts.killAfterPaid && opts.killAfterPaid.has(round)) throw KILL
    const v = await opts.validate(round)
    roundsUsed += 1
    lastIssues = [...v.issues]
    if (v.passed) {
      passed = true
      break
    }
  }
  const finalCount = currentRetry + Math.max(roundsUsed, 1)
  await client
    .from('production_jobs')
    .update({ state_json: buildReserveState(finalCount) })
    .match(ownedJobFence(LOCK_SNAPSHOT, HOLDER))
  if (!passed) {
    throw new Error('Belle retry produced invalid copy: ' + lastIssues.join('; '))
  }
  return { retryCount: finalCount, roundsUsed }
}

function reserveIdx(events: Array<{ kind: string; round: number; idx: number }>, round: number): number {
  const e = events.find((x) => x.kind === 'reserve' && x.round === round)
  if (!e) throw new Error('missing reserve event for round ' + round)
  return e.idx
}

function paidIdx(events: Array<{ kind: string; round: number; idx: number }>, round: number): number {
  const e = events.find((x) => x.kind === 'paid' && x.round === round)
  if (!e) throw new Error('missing paid event for round ' + round)
  return e.idx
}

describe('BELLE-RETRY-PER-ROUND-RESERVATION-001', () => {
  test('A: kill after round-two reservation, before round-two paid call retains BOTH attempts', async () => {
    const emu = makeEmulator(seedJobRow())
    const events: MirrorOpts['events'] = []
    let paid = 0
    let thrown: unknown = null
    try {
      await runReservedRetryLoop({
        client: emu.client,
        requests: emu.requests,
        currentRetry: 0,
        issues: ['hook'],
        regen: async () => {
          paid += 1
          return { introText: 'weak', outroText: '' }
        },
        validate: async () => ({ passed: false, issues: ['still weak'] }),
        events,
        killBeforePaid: new Set([2]),
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBe(KILL)
    expect(paid).toBe(1)
    expect(jobPatchCounts(emu)).toEqual([1, 2])
    expect(reserveIdx(events, 1)).toBeLessThan(paidIdx(events, 1))
    expect(paidIdx(events, 1)).toBeLessThanOrEqual(reserveIdx(events, 2))
    assertCleanWire(emu)
    // Restart re-read: BOTH consumed attempts retained.
    expect(await readEpCount(emu.client)).toBe(2)

    // Resume from the retained count with always-failing validation: one
    // round remains (3 - 2), reserves 3, then exhausts the bound.
    const events2: MirrorOpts['events'] = []
    let thrown2: unknown = null
    try {
      await runReservedRetryLoop({
        client: emu.client,
        requests: emu.requests,
        currentRetry: 2,
        issues: ['hook'],
        regen: async () => {
          paid += 1
          return { introText: 'weak', outroText: '' }
        },
        validate: async () => ({ passed: false, issues: ['still weak'] }),
        events: events2,
      })
    } catch (err) {
      thrown2 = err
    }
    expect(thrown2).not.toBeNull()
    expect(String((thrown2 as Error).message)).toMatch(/Belle retry produced invalid copy/)
    expect(paid).toBe(2)
    expect(jobPatchCounts(emu)).toEqual([1, 2, 3, 3])
    expect(await readEpCount(emu.client)).toBe(3)
    assertCleanWire(emu)
  })

  test('B: kill after round-one paid call, before round-two reservation retains round one; resume feeds issues forward', async () => {
    const emu = makeEmulator(seedJobRow())
    const events: MirrorOpts['events'] = []
    let paid = 0
    let thrown: unknown = null
    try {
      await runReservedRetryLoop({
        client: emu.client,
        requests: emu.requests,
        currentRetry: 0,
        issues: ['hook'],
        regen: async () => {
          paid += 1
          return { introText: 'weak', outroText: '' }
        },
        validate: async () => ({ passed: false, issues: ['still weak'] }),
        events,
        killAfterPaid: new Set([1]),
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBe(KILL)
    expect(paid).toBe(1)
    expect(jobPatchCounts(emu)).toEqual([1])
    expect(await readEpCount(emu.client)).toBe(1)

    // Resume: round one fails validation again, round two passes with the
    // fed-back issues; reservation for round two lands before its paid call.
    const events2: MirrorOpts['events'] = []
    const seenIssues: string[][] = []
    const out = await runReservedRetryLoop({
      client: emu.client,
      requests: emu.requests,
      currentRetry: 1,
      issues: ['hook'],
      regen: async (_round, iss) => {
        paid += 1
        seenIssues.push([...iss])
        return { introText: 'strong hook', outroText: '' }
      },
      validate: async (round) =>
        round === 1 ? { passed: false, issues: ['round-one miss'] } : { passed: true, issues: [] },
      events: events2,
    })
    expect(out.retryCount).toBe(3)
    expect(out.roundsUsed).toBe(2)
    expect(paid).toBe(3)
    expect(seenIssues[0]).toEqual(['hook'])
    expect(seenIssues[1]).toEqual(['round-one miss'])
    expect(reserveIdx(events2, 1)).toBeLessThan(paidIdx(events2, 1))
    expect(paidIdx(events2, 1)).toBeLessThanOrEqual(reserveIdx(events2, 2))
    expect(reserveIdx(events2, 2)).toBeLessThan(paidIdx(events2, 2))
    expect(jobPatchCounts(emu)).toEqual([1, 2, 3, 3])
    expect(await readEpCount(emu.client)).toBe(3)
    assertCleanWire(emu)
  })

  test('C: failed round-two reservation (lock lost, zero rows) means zero further paid calls', async () => {
    const emu = makeEmulator(seedJobRow())
    const events: MirrorOpts['events'] = []
    let paid = 0
    let thrown: unknown = null
    try {
      await runReservedRetryLoop({
        client: emu.client,
        requests: emu.requests,
        currentRetry: 0,
        issues: ['hook'],
        regen: async () => {
          paid += 1
          return { introText: 'weak', outroText: '' }
        },
        validate: async () => ({ passed: false, issues: ['still weak'] }),
        events,
        beforeReserve: (round) => {
          if (round === 2) {
            emu.jobs.get(JOB_ID).locked_by = 'intruder'
          }
        },
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).not.toBeNull()
    expect(String((thrown as Error).message)).toMatch(/zero rows/)
    expect(paid).toBe(1)
    // Round-two reservation was attempted on the wire (count 2) but matched
    // zero rows; nothing with count 3 exists; round one retained in the row.
    expect(jobPatchCounts(emu)).toEqual([1, 2])
    expect(await readEpCount(emu.client)).toBe(1)
    assertCleanWire(emu)
  })

  test('D: round-one behavior unchanged (single passing round)', async () => {
    const emu = makeEmulator(seedJobRow())
    const events: MirrorOpts['events'] = []
    let paid = 0
    const out = await runReservedRetryLoop({
      client: emu.client,
      requests: emu.requests,
      currentRetry: 0,
      issues: ['hook'],
      regen: async () => {
        paid += 1
        return { introText: 'good hook', outroText: '' }
      },
      validate: async () => ({ passed: true, issues: [] }),
      events,
    })
    expect(out.retryCount).toBe(1)
    expect(out.roundsUsed).toBe(1)
    expect(paid).toBe(1)
    expect(jobPatchCounts(emu)).toEqual([1, 1])
    expect(reserveIdx(events, 1)).toBeLessThan(paidIdx(events, 1))
    expect(await readEpCount(emu.client)).toBe(1)
    assertCleanWire(emu)
  })

  test('E: uninterrupted two-round success reserves per round in order', async () => {
    const emu = makeEmulator(seedJobRow())
    const events: MirrorOpts['events'] = []
    let paid = 0
    const out = await runReservedRetryLoop({
      client: emu.client,
      requests: emu.requests,
      currentRetry: 0,
      issues: ['hook'],
      regen: async () => {
        paid += 1
        return { introText: 'copy', outroText: '' }
      },
      validate: async (round) =>
        round === 1 ? { passed: false, issues: ['miss'] } : { passed: true, issues: [] },
      events,
    })
    expect(out.retryCount).toBe(2)
    expect(paid).toBe(2)
    expect(jobPatchCounts(emu)).toEqual([1, 2, 2])
    expect(reserveIdx(events, 1)).toBeLessThan(paidIdx(events, 1))
    expect(paidIdx(events, 1)).toBeLessThanOrEqual(reserveIdx(events, 2))
    expect(reserveIdx(events, 2)).toBeLessThan(paidIdx(events, 2))
    expect(await readEpCount(emu.client)).toBe(2)
    assertCleanWire(emu)
  })
})
