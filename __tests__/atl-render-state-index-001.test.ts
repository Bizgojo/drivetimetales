/**
 * ATL-RENDER-STATE-INDEX-001 — series render state vs one-active-job index.
 *
 * Incident (2026-07-09 ~19:08Z, The Courthouse Silence, job 79410154):
 * "Failed to save series render state: duplicate key value violates unique
 * constraint production_jobs_one_active_per_series".
 *
 * Root cause: run-next step-completion writes were unguarded UPDATEs by job
 * id. The pipeline runner aborts run-next calls at 90s while the Vercel
 * invocation keeps rendering server-side. The runner's circuit breaker
 * marked the job failed (terminal → leaves the index predicate),
 * dispatch-queue legitimately inserted a replacement job for the series, and
 * the zombie invocation's completion write then flipped the old row back to
 * 'queued' — a second active row for the series, correctly rejected by the
 * 20260709100000 partial unique index.
 *
 * Fix under test: fenced writes (lib/jobLockGuard.ts) — every mid-flight
 * production_jobs write must match id + locked_by + locked_at + status='running'.
 *
 * These tests exercise the invariant with an in-memory model of the partial
 * unique indexes (insert AND update paths, mirroring Postgres semantics).
 */

import {
  ACTIVE_INDEX_STATUSES,
  isActiveIndexStatus,
  isActiveUniquenessViolation,
  isLockLostError,
  lockLostMessage,
  ownedJobFence,
} from '@/lib/jobLockGuard'
import { NON_TERMINAL_JOB_STATUSES } from '@/lib/dispatchGuards'

// ---------------------------------------------------------------------------
// In-memory production_jobs with the 20260709100000 partial unique indexes
// ---------------------------------------------------------------------------

type Row = {
  id: string
  series_id: string | null
  story_id: string | null
  status: string
  current_step: string
  locked_by: string | null
  locked_at: string | null
  state_json: Record<string, unknown>
}

class UniqueViolation extends Error {
  code = '23505'
  constructor(index: string) {
    super(`duplicate key value violates unique constraint "${index}"`)
  }
}

class ProductionJobsTable {
  rows: Row[] = []

  /** Mirror of the partial-index predicates from the migration. */
  private assertIndexes(candidate: Row, ignoreId?: string) {
    if (!isActiveIndexStatus(candidate.status)) return
    if (candidate.series_id !== null) {
      const clash = this.rows.some(
        (r) =>
          r.id !== candidate.id &&
          r.id !== ignoreId &&
          r.series_id === candidate.series_id &&
          isActiveIndexStatus(r.status),
      )
      if (clash) throw new UniqueViolation('production_jobs_one_active_per_series')
    }
    if (candidate.story_id !== null && candidate.series_id === null) {
      const clash = this.rows.some(
        (r) =>
          r.id !== candidate.id &&
          r.id !== ignoreId &&
          r.story_id === candidate.story_id &&
          r.series_id === null &&
          isActiveIndexStatus(r.status),
      )
      if (clash) throw new UniqueViolation('production_jobs_one_active_per_story')
    }
  }

  insert(row: Row): Row {
    this.assertIndexes(row)
    this.rows.push({ ...row })
    return row
  }

  /** Unfenced UPDATE … WHERE id = $1 (the pre-fix behavior). */
  updateById(id: string, patch: Partial<Row>): Row | null {
    const row = this.rows.find((r) => r.id === id)
    if (!row) return null
    const next = { ...row, ...patch }
    this.assertIndexes(next)
    Object.assign(row, patch)
    return row
  }

  /** Fenced UPDATE … WHERE match(ownedJobFence(job, holder)). 0 rows → null. */
  fencedUpdate(fence: Record<string, string>, patch: Partial<Row>): Row | null {
    const row = this.rows.find(
      (r) =>
        r.id === fence.id &&
        r.locked_by === fence.locked_by &&
        r.status === fence.status &&
        (fence.locked_at === undefined || r.locked_at === fence.locked_at),
    )
    if (!row) return null
    const next = { ...row, ...patch }
    this.assertIndexes(next)
    Object.assign(row, patch)
    return row
  }

  activeFor(seriesId: string): Row[] {
    return this.rows.filter((r) => r.series_id === seriesId && isActiveIndexStatus(r.status))
  }
}

const SERIES = '7cffc169-e86d-42ce-9150-77d8cb782100'

function seriesJob(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    series_id: SERIES,
    story_id: null,
    status: 'queued',
    current_step: 'series_render_final_mix',
    locked_by: null,
    locked_at: null,
    state_json: {},
    ...over,
  }
}

function lock(table: ProductionJobsTable, id: string, holder: string, at: string): Row {
  const row = table.updateById(id, { status: 'running', locked_by: holder, locked_at: at })!
  return { ...row } // snapshot the row as the invocation sees it (fencing token)
}

// ---------------------------------------------------------------------------
// Fence shape
// ---------------------------------------------------------------------------

describe('ownedJobFence', () => {
  test('includes id, holder, running status, and the locked_at fencing token', () => {
    const fence = ownedJobFence(
      { id: 'job-1', locked_by: 'runner-a', locked_at: '2026-07-09T19:00:00.000+00:00' },
      'runner-a',
    )
    expect(fence).toEqual({
      id: 'job-1',
      locked_by: 'runner-a',
      status: 'running',
      locked_at: '2026-07-09T19:00:00.000+00:00',
    })
  })

  test('falls back to job.locked_by when holder is not passed (failJob path)', () => {
    const fence = ownedJobFence({ id: 'job-1', locked_by: 'runner-b', locked_at: 'T1' })
    expect(fence.locked_by).toBe('runner-b')
  })

  test('unresolvable holder produces a fence that can never match', () => {
    const fence = ownedJobFence({ id: 'job-1', locked_by: null, locked_at: null })
    expect(fence.locked_by).toBe('__no_lock_holder__')
    expect(fence.locked_at).toBeUndefined()
  })

  test('index predicate matches the migration statuses exactly', () => {
    expect([...ACTIVE_INDEX_STATUSES]).toEqual(['queued', 'running', 'waiting_for_external'])
    // must stay in lockstep with the dispatch guards
    expect([...NON_TERMINAL_JOB_STATUSES]).toEqual([...ACTIVE_INDEX_STATUSES])
    expect(isActiveIndexStatus('failed')).toBe(false)
    expect(isActiveIndexStatus('complete')).toBe(false)
    expect(isActiveIndexStatus('running')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Incident replay — the exact 19:08Z sequence
// ---------------------------------------------------------------------------

describe('incident replay: zombie completion write vs replacement job', () => {
  function buildIncident() {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('79410154')) // the long-running render job
    // Invocation locks the job and starts rendering (long step)
    const owned = lock(table, '79410154', 'runner-a', '2026-07-09T18:59:00.000+00:00')
    // Runner client aborts at 90s; circuit breaker opens → job failed, lock released
    table.updateById('79410154', { status: 'failed', locked_by: null, locked_at: null })
    // dispatch-queue sees no active job → legitimately inserts replacement
    table.insert(seriesJob('d16ccf83', { current_step: 'score_validate_package' }))
    return { table, owned }
  }

  test('OLD behavior (unfenced update by id) violates the one-active index — the bug', () => {
    const { table } = buildIncident()
    expect(() =>
      table.updateById('79410154', {
        status: 'queued',
        locked_by: null,
        locked_at: null,
      }),
    ).toThrow(/production_jobs_one_active_per_series/)
  })

  test('NEW behavior (fenced write) no-ops: no resurrection, no violation, replacement stays sole active', () => {
    const { table, owned } = buildIncident()
    const result = table.fencedUpdate(ownedJobFence(owned, 'runner-a'), {
      status: 'queued',
      locked_by: null,
      locked_at: null,
    })
    expect(result).toBeNull() // 0 rows — write skipped
    const active = table.activeFor(SERIES)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('d16ccf83')
    // old row remains terminal
    expect(table.rows.find((r) => r.id === '79410154')!.status).toBe('failed')
  })

  test('fenced write also refuses when the same worker re-locked the job (stale locked_at token)', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('79410154'))
    const staleOwned = lock(table, '79410154', 'runner-a', '2026-07-09T18:00:00.000+00:00')
    // job released and re-locked later by the SAME worker id (new invocation)
    table.updateById('79410154', { status: 'queued', locked_by: null, locked_at: null })
    lock(table, '79410154', 'runner-a', '2026-07-09T18:05:00.000+00:00')
    // stale invocation tries to write with its old token
    const result = table.fencedUpdate(ownedJobFence(staleOwned, 'runner-a'), {
      state_json: { clobber: true },
    })
    expect(result).toBeNull()
    expect(table.rows.find((r) => r.id === '79410154')!.state_json).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Series render completes with the index present (happy path)
// ---------------------------------------------------------------------------

describe('series render flow with the one-active index present', () => {
  test('per-episode checkpoint → release → re-lock cycles complete without ever violating the index', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('render-job'))

    const episodes = ['1', '2', '3', '4', '5']
    const doneByEp: Record<string, boolean> = {}

    for (const ep of episodes) {
      // runner picks the queued job up
      const owned = lock(table, 'render-job', 'runner-a', `2026-07-09T19:0${ep}:00.000+00:00`)
      // render episode… then fenced state checkpoint (keeps the lock)
      doneByEp[ep] = true
      const checkpointed = table.fencedUpdate(ownedJobFence(owned, 'runner-a'), {
        state_json: { seriesRenderFinalMix: { doneByEp: { ...doneByEp } } },
      })
      expect(checkpointed).not.toBeNull()

      const allDone = episodes.every((e) => doneByEp[e])
      // single fenced release performed by the step handler
      const released = table.fencedUpdate(ownedJobFence(owned, 'runner-a'), {
        status: 'queued',
        current_step: allDone ? 'series_complete_packages' : 'series_render_final_mix',
        locked_by: null,
        locked_at: null,
      })
      expect(released).not.toBeNull()
      // invariant holds at every step boundary
      expect(table.activeFor(SERIES)).toHaveLength(1)
    }

    const job = table.rows.find((r) => r.id === 'render-job')!
    expect(job.status).toBe('queued')
    expect(job.current_step).toBe('series_complete_packages')
    expect((job.state_json.seriesRenderFinalMix as any).doneByEp).toEqual({
      '1': true, '2': true, '3': true, '4': true, '5': true,
    })
  })

  test('fenced checkpoint refuses to write after the job was superseded mid-render', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('render-job'))
    const owned = lock(table, 'render-job', 'runner-a', '2026-07-09T19:00:00.000+00:00')
    // watchdog fails the job mid-render
    table.updateById('render-job', { status: 'failed', locked_by: null, locked_at: null })
    const checkpointed = table.fencedUpdate(ownedJobFence(owned, 'runner-a'), {
      state_json: { seriesRenderFinalMix: { doneByEp: { '1': true } } },
    })
    expect(checkpointed).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Duplicate dispatch still blocked (the reason the index exists)
// ---------------------------------------------------------------------------

describe('duplicate dispatch remains blocked', () => {
  test('insert of a second active series job is rejected while one is queued/running/waiting', () => {
    for (const status of ACTIVE_INDEX_STATUSES) {
      const table = new ProductionJobsTable()
      table.insert(seriesJob('job-a', { status }))
      expect(() => table.insert(seriesJob('job-b'))).toThrow(
        /production_jobs_one_active_per_series/,
      )
    }
  })

  test('insert of a second active standalone-story job is rejected', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('job-a', { series_id: null, story_id: 'story-1', status: 'running' }))
    expect(() =>
      table.insert(seriesJob('job-b', { series_id: null, story_id: 'story-1' })),
    ).toThrow(/production_jobs_one_active_per_story/)
  })

  test('terminal statuses do not block a fresh dispatch', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('job-a', { status: 'failed' }))
    expect(() => table.insert(seriesJob('job-b'))).not.toThrow()
  })

  test('operator/autopilot reactivation of a failed job is rejected while a replacement is active', () => {
    const table = new ProductionJobsTable()
    table.insert(seriesJob('old-job', { status: 'failed' }))
    table.insert(seriesJob('replacement'))
    let caught: unknown = null
    try {
      table.updateById('old-job', { status: 'running' })
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(isActiveUniquenessViolation(caught as { code?: string; message?: string })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Lock-lost error plumbing
// ---------------------------------------------------------------------------

describe('lock-lost detection helpers', () => {
  test('PGRST116 (0 rows through .single()) is recognized as lock lost', () => {
    expect(isLockLostError({ code: 'PGRST116', message: 'x' })).toBe(true)
    expect(
      isLockLostError({ message: 'JSON object requested, multiple (or no) rows returned' }),
    ).toBe(true)
    expect(
      isLockLostError({ message: 'Cannot coerce the result to a single JSON object' }),
    ).toBe(true)
  })

  test('real database errors are NOT classified as lock lost', () => {
    expect(isLockLostError({ code: '23505', message: 'duplicate key value…' })).toBe(false)
    expect(isLockLostError(null)).toBe(false)
  })

  test('lockLostMessage names the step, job, and work order', () => {
    const msg = lockLostMessage('series_render_final_mix', '79410154-ce0b-4131')
    expect(msg).toContain('series_render_final_mix')
    expect(msg).toContain('79410154')
    expect(msg).toContain('ATL-RENDER-STATE-INDEX-001')
  })

  test('isActiveUniquenessViolation matches both partial indexes and 23505', () => {
    expect(
      isActiveUniquenessViolation({
        message:
          'duplicate key value violates unique constraint "production_jobs_one_active_per_series"',
      }),
    ).toBe(true)
    expect(
      isActiveUniquenessViolation({
        message:
          'duplicate key value violates unique constraint "production_jobs_one_active_per_story"',
      }),
    ).toBe(true)
    expect(isActiveUniquenessViolation({ code: 'PGRST116', message: 'no rows' })).toBe(false)
  })
})
