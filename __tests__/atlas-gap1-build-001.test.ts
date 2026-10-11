/**
 * ATLAS-GAP1-BUILD-001 tests — Gap-1 build to Marc's 2026-10-11 16:37 decisions.
 *
 * Decisions: gap1-blueprint-table-oct11-1637 (NEW dedicated approval table),
 * gap1-token-mint-oct11-1637 (token ref stored SAME step as approval write,
 * interface only — never real key material),
 * gap1-audit-table-oct11-1637 (NEW dedicated audit table, story-less safe).
 *
 * Pure-logic + mocked-supabase tests for lib/storyQueue/dispatch.ts
 * (no DB, no network). Route wiring (bearer-first, HTTP mapping) is
 * documented in drafts/ATLAS-COMBINED-BUILD-20261011-1637.md § tests.
 *
 * Run: npx jest __tests__/atlas-gap1-build-001.test.ts --no-coverage
 */

import {
  ACTIVE_JOB_STATUSES,
  APPROVED_STATUS,
  BLUEPRINT_APPROVALS_TABLE,
  DISPATCH_AUDIT_TABLE,
  DispatchError,
  approveBlueprintAndRecordToken,
  authorizeAndDispatchQueueItem,
  normalizeDispatchMode,
  requireStrategosToken,
  resolveEpisodeCount,
  verifyBlueprintApproval,
} from '../lib/storyQueue/dispatch'

// ---------------------------------------------------------------------------
// Mock supabase: chainable query builder backed by a scripted response map.
// Every terminal call appends to `ops` so tests can assert zero-write paths.
// ---------------------------------------------------------------------------

type OpLog = Array<{ table: string; op: string }>

function resolveResponse(table: string, op: string, responses: Record<string, any>) {
  const v = responses[`${table}:${op}`]
  if (typeof v === 'function') return v()
  return v ?? { data: null, error: null }
}

// Models supabase-js builders: intermediate methods chain; terminal methods
// (maybeSingle/single) execute; AND a bare `await builder` executes too
// (builders are thenable — the audit inserts rely on this).
function chainFor(table: string, op: string, ops: OpLog, responses: Record<string, any>) {
  const terminal = new Set(['maybeSingle', 'single'])
  const handler: ProxyHandler<any> = {
    get(_t, prop: string) {
      if (terminal.has(prop)) {
        return async () => {
          ops.push({ table, op })
          return resolveResponse(table, op, responses)
        }
      }
      // Thenable: `await supabase.from(t).insert(...)` executes the query.
      if (prop === 'then') {
        return (resolve: (v: any) => void) => {
          ops.push({ table, op })
          resolve(resolveResponse(table, op, responses))
        }
      }
      return (..._a: any[]) => proxy
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

function makeSupabase(responses: Record<string, any> = {}) {
  const ops: OpLog = []
  return {
    ops,
    client: {
      from(table: string) {
        return {
          select: (..._a: any[]) => chainFor(table, 'select', ops, responses),
          update: (..._a: any[]) => chainFor(table, 'update', ops, responses),
          insert: (..._a: any[]) => chainFor(table, 'insert', ops, responses),
        }
      },
    } as any,
  }
}

function reqWithBearer(token?: string): Request {
  return {
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : '',
    },
  } as any
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('normalizeDispatchMode', () => {
  test('accepts single/series, rejects everything else', () => {
    expect(normalizeDispatchMode('single')).toBe('single')
    expect(normalizeDispatchMode('series')).toBe('series')
    expect(normalizeDispatchMode('batch')).toBeNull()
    expect(normalizeDispatchMode('')).toBeNull()
    expect(normalizeDispatchMode(undefined)).toBeNull()
  })
})

describe('resolveEpisodeCount', () => {
  test('prefers explicit totalEpisodes', () => {
    expect(resolveEpisodeCount({ totalEpisodes: 4 })).toBe(4)
  })
  test('parses notes "Total episodes: N" label', () => {
    expect(resolveEpisodeCount({ notes: 'Total episodes: 6\nrest' })).toBe(6)
  })
  test('defaults to 0', () => {
    expect(resolveEpisodeCount({})).toBe(0)
  })
})

describe('requireStrategosToken', () => {
  const ENV = process.env
  beforeEach(() => {
    process.env = { ...ENV }
    delete process.env.STRATEGOS_SERVICE_TOKEN
  })
  afterAll(() => {
    process.env = ENV
  })

  test('env unset → fail-closed (never runs open)', () => {
    expect(requireStrategosToken(reqWithBearer('anything'))).toEqual({
      ok: false,
      error: 'service token not configured',
    })
  })

  test('wrong/missing bearer → rejected', () => {
    process.env.STRATEGOS_SERVICE_TOKEN = 's3cret'
    expect(requireStrategosToken(reqWithBearer('wrong')).ok).toBe(false)
    expect(requireStrategosToken(reqWithBearer()).ok).toBe(false)
  })

  test('exact bearer match → ok (exact match only, no prefix games)', () => {
    process.env.STRATEGOS_SERVICE_TOKEN = 's3cret'
    expect(requireStrategosToken(reqWithBearer('s3cret')).ok).toBe(true)
    expect(requireStrategosToken(reqWithBearer('s3cret-extra')).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// verifyBlueprintApproval — real table lookup, fail-closed
// ---------------------------------------------------------------------------

describe('verifyBlueprintApproval', () => {
  test('blank ref → fail-closed, zero DB writes', async () => {
    const { ops, client } = makeSupabase()
    const r = await verifyBlueprintApproval(client, '  ')
    expect(r.ok).toBe(false)
    expect(ops).toEqual([])
  })

  test('approved row → ok', async () => {
    const { ops, client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: {
          id: 'a1',
          queue_item_id: 'q1',
          blueprint_ref: 'bp-1',
          status: APPROVED_STATUS,
        },
        error: null,
      },
    })
    const r = await verifyBlueprintApproval(client, 'bp-1')
    expect(r).toEqual({ ok: true })
    expect(ops).toEqual([{ table: BLUEPRINT_APPROVALS_TABLE, op: 'select' }])
  })

  test('no approved row → fail-closed with reason', async () => {
    const { client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: { data: null, error: null },
    })
    const r = await verifyBlueprintApproval(client, 'bp-nope')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not approved/)
  })

  test('lookup error → fail-closed (never fail open)', async () => {
    const { client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: null,
        error: { message: 'relation does not exist' },
      },
    })
    const r = await verifyBlueprintApproval(client, 'bp-1')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/unavailable/)
  })
})

// ---------------------------------------------------------------------------
// approveBlueprintAndRecordToken — single-step approval + token ref
// ---------------------------------------------------------------------------

describe('approveBlueprintAndRecordToken', () => {
  const approvalRow = {
    id: 'appr-1',
    queue_item_id: 'q1',
    blueprint_ref: 'bp-1',
    approved_by: 'strategos',
    approved_at: '2026-10-11T20:00:00.000Z',
    status: APPROVED_STATUS,
    token_ref: 'tokref-abc-123',
  }

  function approvalSupabase(tokenRef: string | null) {
    return makeSupabase({
      'story_queue_items:select': { data: { id: 'q1' }, error: null },
      [`${BLUEPRINT_APPROVALS_TABLE}:insert`]: {
        data: { ...approvalRow, token_ref: tokenRef },
        error: null,
      },
      [`${DISPATCH_AUDIT_TABLE}:insert`]: { data: {}, error: null },
    })
  }

  test('single step: approval row carries caller-supplied tokenRef verbatim', async () => {
    const { ops, client } = approvalSupabase('tokref-abc-123')
    const r = await approveBlueprintAndRecordToken(client, {
      queueItemId: 'q1',
      blueprintRef: 'bp-1',
      approvedBy: 'strategos',
      tokenRef: 'tokref-abc-123',
    })
    // Stored reference echoes the input exactly: passthrough, never generated.
    expect(r.approval.token_ref).toBe('tokref-abc-123')
    expect(r.tokenRecorded).toBe(true)
    // One approval insert + two audit inserts (approval + token_recorded).
    expect(ops.filter((o) => o.table === BLUEPRINT_APPROVALS_TABLE)).toHaveLength(1)
    expect(ops.filter((o) => o.table === DISPATCH_AUDIT_TABLE)).toHaveLength(2)
  })

  test('absent tokenRef → token_ref NULL, tokenRecorded false (Marc mints later)', async () => {
    const { client } = approvalSupabase(null)
    const r = await approveBlueprintAndRecordToken(client, {
      queueItemId: 'q1',
      blueprintRef: 'bp-1',
      approvedBy: 'strategos',
    })
    expect(r.approval.token_ref).toBeNull()
    expect(r.tokenRecorded).toBe(false)
  })

  test('missing fields → 400, zero writes', async () => {
    const { ops, client } = makeSupabase()
    await expect(
      approveBlueprintAndRecordToken(client, { queueItemId: '', blueprintRef: 'bp', approvedBy: 's' })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      approveBlueprintAndRecordToken(client, { queueItemId: 'q', blueprintRef: '', approvedBy: 's' })
    ).rejects.toMatchObject({ status: 400 })
    expect(ops).toEqual([])
  })

  test('unknown queue item → 404', async () => {
    const { client } = makeSupabase({
      'story_queue_items:select': { data: null, error: null },
    })
    await expect(
      approveBlueprintAndRecordToken(client, { queueItemId: 'ghost', blueprintRef: 'bp', approvedBy: 's' })
    ).rejects.toMatchObject({ status: 404 })
  })

  test('duplicate active approval → 409, never duplicated', async () => {
    const { client } = makeSupabase({
      'story_queue_items:select': { data: { id: 'q1' }, error: null },
      [`${BLUEPRINT_APPROVALS_TABLE}:insert`]: {
        data: null,
        error: { message: 'duplicate key value violates unique constraint' },
      },
    })
    await expect(
      approveBlueprintAndRecordToken(client, { queueItemId: 'q1', blueprintRef: 'bp-1', approvedBy: 's' })
    ).rejects.toMatchObject({ status: 409 })
  })
})

// ---------------------------------------------------------------------------
// authorizeAndDispatchQueueItem
// ---------------------------------------------------------------------------

describe('authorizeAndDispatchQueueItem', () => {
  const item = {
    id: 'q1',
    story_id: null, // story-less: the common Strategos case
    status: 'queued',
    authorized: false,
    released_to_hal: false,
    released_to_hal_at: null,
    totalEpisodes: 3,
  }
  const job = {
    id: 'job-1',
    status: 'queued',
    current_step: 'queued',
    queue_item_id: 'q1',
    job_type: 'single',
    created_at: '2026-10-11T20:00:00.000Z',
  }

  function happySupabase() {
    return makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: { id: 'a1', status: APPROVED_STATUS },
        error: null,
      },
      'story_queue_items:select': { data: item, error: null },
      'production_jobs:select': { data: null, error: null },
      'story_queue_items:update': {
        data: { id: 'q1', status: 'dispatched', authorized: true, released_to_hal: true },
        error: null,
      },
      'production_jobs:insert': { data: job, error: null },
      [`${DISPATCH_AUDIT_TABLE}:insert`]: { data: {}, error: null },
    })
  }

  const input = {
    queueItemId: 'q1',
    mode: 'single' as const,
    blueprintRef: 'bp-1',
    caller: 'strategos' as const,
    authorizedBy: 'strategos',
  }

  test('happy path: authorized + job + DEDICATED audit row (story-less item)', async () => {
    const { ops, client } = happySupabase()
    const r = await authorizeAndDispatchQueueItem(client, input)
    expect(r.job.id).toBe('job-1')
    expect(r.item).toMatchObject({ authorized: true, releasedToHal: true })
    // Audit went to the NEW dedicated table — exactly one dispatched row.
    const audits = ops.filter((o) => o.table === DISPATCH_AUDIT_TABLE)
    expect(audits).toHaveLength(1)
  })

  test('unapproved blueprint → 422 with ZERO state writes (verify-first)', async () => {
    const { ops, client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: { data: null, error: null },
      [`${DISPATCH_AUDIT_TABLE}:insert`]: { data: {}, error: null },
    })
    await expect(authorizeAndDispatchQueueItem(client, input)).rejects.toMatchObject({
      status: 422,
    })
    const writes = ops.filter((o) => o.op !== 'select' && o.table !== DISPATCH_AUDIT_TABLE)
    expect(writes).toEqual([])
  })

  test('active job exists → 409, item untouched', async () => {
    const { ops, client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: { id: 'a1', status: APPROVED_STATUS },
        error: null,
      },
      'story_queue_items:select': { data: item, error: null },
      'production_jobs:select': { data: { id: 'job-old' }, error: null },
    })
    const err = await authorizeAndDispatchQueueItem(client, input).catch((e) => e)
    expect(err).toBeInstanceOf(DispatchError)
    expect(err.status).toBe(409)
    expect(ops.some((o) => o.op === 'update' || o.op === 'insert')).toBe(false)
  })

  test('series gate: <2 episodes → 400', async () => {
    const { client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: { id: 'a1', status: APPROVED_STATUS },
        error: null,
      },
      'story_queue_items:select': { data: { ...item, totalEpisodes: 1 }, error: null },
      'production_jobs:select': { data: null, error: null },
    })
    await expect(
      authorizeAndDispatchQueueItem(client, { ...input, mode: 'series' })
    ).rejects.toMatchObject({ status: 400 })
  })

  test('job-insert failure → item stamp FULLY reverted (all four columns)', async () => {
    let revertPayload: any = null
    const { client } = makeSupabase({
      [`${BLUEPRINT_APPROVALS_TABLE}:select`]: {
        data: { id: 'a1', status: APPROVED_STATUS },
        error: null,
      },
      'story_queue_items:select': { data: item, error: null },
      'production_jobs:select': { data: null, error: null },
      'story_queue_items:update': () => {
        // First update call = the stamp (succeeds); second = the revert.
        if (!revertPayload) {
          revertPayload = 'stamp'
          return {
            data: { id: 'q1', status: 'dispatched', authorized: true, released_to_hal: true },
            error: null,
          }
        }
        return { data: item, error: null }
      },
      'production_jobs:insert': { data: null, error: { message: 'insert boom' } },
    })
    // Wrap update to capture the revert payload.
    const origFrom = client.from.bind(client)
    let captured: any = null
    ;(client as any).from = (table: string) => {
      const q = origFrom(table)
      if (table === 'story_queue_items') {
        const origUpdate = (q as any).update.bind(q)
        ;(q as any).update = (payload: any) => {
          if (revertPayload === 'stamp') captured = payload
          return origUpdate(payload)
        }
      }
      return q
    }
    await expect(authorizeAndDispatchQueueItem(client, input)).rejects.toMatchObject({
      status: 500,
    })
    // D3 fix: revert restores authorized + status + released_to_hal + released_to_hal_at.
    expect(captured).toMatchObject({
      authorized: false,
      status: 'queued',
      released_to_hal: false,
      released_to_hal_at: null,
    })
  })
})

describe('table constants', () => {
  test('dedicated tables named per decision (no reuse, no external store)', () => {
    expect(BLUEPRINT_APPROVALS_TABLE).toBe('story_blueprint_approvals')
    expect(DISPATCH_AUDIT_TABLE).toBe('story_queue_dispatch_audit')
    expect(APPROVED_STATUS).toBe('approved')
    expect(ACTIVE_JOB_STATUSES).toEqual(['queued', 'running', 'waiting_for_external'])
  })
})
