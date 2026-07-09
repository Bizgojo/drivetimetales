/**
 * PIPE-AUDIT-001 — state machine, title-dedup defect, retry-cap reset floor.
 *
 * Item 1: canonical workflow transition matrix (lib/workflowTransitions.ts)
 *         + writer-level transition suite skeleton (it.todo below).
 * Item 3: series-scoped duplicate detection (lib/dispatchDedup.ts) — the
 *         global-title match that cold-stored Auction House ep4 "The Pattern"
 *         against unrelated series must never happen again.
 * Item 4: retry cap must ignore failures older than the per-story reset or
 *         the global RETRY_CAP_IGNORE_FAILURES_BEFORE deploy floor.
 */

import {
  WORKFLOW_STATES,
  WORKFLOW_TRANSITIONS,
  isWorkflowState,
  transitionAllowed,
} from '@/lib/workflowTransitions'
import { dedupKey, findQueueDuplicates } from '@/lib/dispatchDedup'
import {
  RETRY_CAP,
  RETRY_CAP_WINDOW_MS,
  retryCapWindowStartMs,
  countRetryCapFailures,
} from '@/lib/dispatchGuards'

const NOW = Date.parse('2026-07-09T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

// ─── Item 1: canonical transition matrix ────────────────────────────────────

describe('workflow transition matrix (canonical guard)', () => {
  test('every from/to state in the matrix is a known workflow state', () => {
    for (const [from, tos] of Object.entries(WORKFLOW_TRANSITIONS)) {
      expect(isWorkflowState(from)).toBe(true)
      for (const to of tos) expect(isWorkflowState(to)).toBe(true)
    }
  })

  test('happy path: queue → ready_for_review → approved_ready → published', () => {
    expect(transitionAllowed('stories_in_queue', 'ready_for_review')).toBe(true)
    expect(transitionAllowed('ready_for_review', 'approved_ready')).toBe(true)
    expect(transitionAllowed('approved_ready', 'published')).toBe(true)
  })

  test('repair loop: repair_queue → being_repaired → ready_for_review', () => {
    expect(transitionAllowed('repair_queue', 'being_repaired')).toBe(true)
    expect(transitionAllowed('being_repaired', 'ready_for_review')).toBe(true)
  })

  test('published → cold_storage requires explicit retire', () => {
    expect(transitionAllowed('published', 'cold_storage')).toBe(false)
    expect(transitionAllowed('published', 'cold_storage', true)).toBe(true)
  })

  test('cold_storage may only go to ready_for_review via the guard', () => {
    expect(transitionAllowed('cold_storage', 'ready_for_review')).toBe(true)
    // recover_from_cold_storage / hal requeue write stories_in_queue directly —
    // documented bypass; the guard itself does NOT allow it.
    expect(transitionAllowed('cold_storage', 'stories_in_queue')).toBe(false)
    expect(transitionAllowed('cold_storage', 'published')).toBe(false)
  })

  test('unknown/invalid states are always rejected', () => {
    expect(transitionAllowed('nonsense', 'published')).toBe(false)
    expect(transitionAllowed('ready_for_review', 'nonsense' as any)).toBe(false)
    expect(transitionAllowed('', 'ready_for_review')).toBe(false)
  })

  test('no state can transition to itself through the guard', () => {
    for (const state of WORKFLOW_STATES) {
      expect(transitionAllowed(state, state)).toBe(false)
    }
  })
})

// Writer-level suite skeleton: every code path that writes
// stories.workflow_state or production_jobs.status (PIPE-AUDIT-001 item 1
// transition table) should get an integration test here.
describe('workflow_state writers honor the canonical guard (skeleton)', () => {
  it.todo('content-approval set_workflow_state rejects guard-violating transitions (guarded today)')
  it.todo('content-approval set_series_workflow_state rejects when any episode would violate the guard (guarded today)')
  it.todo('content-approval set_series_ready_for_review — BYPASS: forces ready_for_review from any state; add guard or document')
  it.todo('content-approval recover_from_cold_storage — BYPASS: cold_storage → stories_in_queue not in matrix; add to matrix or guard')
  it.todo('publish-story route publishes only from approved_ready/publishable gates')
  it.todo('dispatch-queue cron only writes repair_queue from stories_in_queue (guard via .eq workflow_state filter)')
  it.todo('dispatch-queue cron duplicate detection flags but never writes workflow_state')
  it.todo('run-next series finalization only promotes episodes from ""/stories_in_queue (PROMOTABLE_STATES)')
  it.todo('run-next ATL-PIPE-014 standalone promotion — BYPASS: no from-state guard before ready_for_review write')
  it.todo('agent scripts (hal) must not write workflow_state without matrix check — currently raw service-role writes')
})

describe('production_jobs.status writers (skeleton)', () => {
  it.todo('dispatch-queue inserts queued only after failure-circuit + retry-cap + uniqueness recheck')
  it.todo('runner lockJob: queued/zombie-running → running with optimistic lock')
  it.todo('runner step advance: running → queued; terminal failure → failed with error_json')
  it.todo('runner completion: running → complete sets completed_at (never cancelled)')
  it.todo('pipeline-runner zombie reaper: stale running → queued (locked/unlocked passes)')
  it.todo('render-worker: queued → running (optimistic) → queued (handback) or failed')
  it.todo('bulk cancellations must set a reason in error_json (Jun 17 mass-cancel had none)')
})

// ─── Item 3: series-scoped duplicate detection ──────────────────────────────

describe('dispatch dedup — series-scoped title matching', () => {
  const row = (id: string, title: string, seriesId: string | null, extra: any = {}) => ({
    id,
    title,
    series_id: seriesId,
    story_type: seriesId ? 'series_episode' : 'standalone',
    production_priority: 0,
    created_at: '2026-07-01T00:00:00Z',
    ...extra,
  })

  test('REGRESSION (Auction House ep4): same title in DIFFERENT series is NOT a duplicate', () => {
    const groups = findQueueDuplicates([
      row('a', 'The Pattern', 'series-auction-house'),
      row('b', 'The Pattern', 'series-lost-signal'),
      row('c', 'The Pattern', null), // standalone
    ])
    expect(groups).toHaveLength(0)
  })

  test('same title within the SAME series is detected (Deep Archaeology ep3/ep8)', () => {
    const groups = findQueueDuplicates([
      row('ep3', 'The Response', 'series-deep-arch', { created_at: '2026-06-01T00:00:00Z' }),
      row('ep8', 'The Response', 'series-deep-arch', { created_at: '2026-06-20T00:00:00Z' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].keeperId).toBe('ep3') // earliest created wins at equal priority
    expect(groups[0].duplicateIds).toEqual(['ep8'])
  })

  test('two standalones with identical title are detected', () => {
    const groups = findQueueDuplicates([
      row('s1', 'Night Shift', null, { production_priority: 5 }),
      row('s2', 'Night Shift', null),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].keeperId).toBe('s1') // higher priority wins
    expect(groups[0].duplicateIds).toEqual(['s2'])
  })

  test('titles are normalized (trim + case) inside a scope', () => {
    const groups = findQueueDuplicates([
      row('x1', '  The Pulse ', 'series-cp'),
      row('x2', 'the pulse', 'series-cp'),
    ])
    expect(groups).toHaveLength(1)
  })

  test('empty titles never match anything', () => {
    const groups = findQueueDuplicates([
      row('e1', '', 'series-a'),
      row('e2', '   ', 'series-a'),
      row('e3', '', null),
    ])
    expect(groups).toHaveLength(0)
  })

  test('dedupKey scopes standalone separately from series', () => {
    expect(dedupKey(row('a', 'The Pattern', null))).toBe('standalone::the pattern')
    expect(dedupKey(row('a', 'The Pattern', 'sid'))).toBe('series:sid::the pattern')
  })
})

// ─── Item 4: retry cap reset floor ──────────────────────────────────────────

describe('retry cap — reset floor (5 failures / 7 days)', () => {
  const failed = (iso: string) => ({ status: 'failed', updated_at: iso })
  // July 6 infra storm: 5 failures, causes since fixed
  const stormFailures = [
    failed(daysAgo(3.4)), failed(daysAgo(3.3)), failed(daysAgo(3.2)),
    failed(daysAgo(3.1)), failed(daysAgo(3.0)),
  ]

  test('constants', () => {
    expect(RETRY_CAP).toBe(5)
    expect(RETRY_CAP_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test('without a reset, storm failures still count (current defect reproduced)', () => {
    expect(countRetryCapFailures(stormFailures, NOW)).toBe(RETRY_CAP)
  })

  test('per-story dispatch_failure_reset_at excludes older failures', () => {
    const count = countRetryCapFailures(stormFailures, NOW, { resetAtIso: daysAgo(2) })
    expect(count).toBe(0)
  })

  test('global RETRY_CAP_IGNORE_FAILURES_BEFORE floor excludes older failures', () => {
    const count = countRetryCapFailures(stormFailures, NOW, { ignoreBeforeIso: daysAgo(2.5) })
    expect(count).toBe(0)
  })

  test('failures AFTER the reset still count', () => {
    const jobs = [...stormFailures, failed(daysAgo(0.5)), failed(daysAgo(0.2))]
    expect(countRetryCapFailures(jobs, NOW, { resetAtIso: daysAgo(1) })).toBe(2)
  })

  test('the newest of window/reset/global floor wins', () => {
    const start = retryCapWindowStartMs(NOW, {
      resetAtIso: daysAgo(2),
      ignoreBeforeIso: daysAgo(1),
    })
    expect(start).toBe(Date.parse(daysAgo(1)))
  })

  test('invalid or missing reset dates fall back to the 7-day window', () => {
    expect(retryCapWindowStartMs(NOW, { resetAtIso: 'not-a-date', ignoreBeforeIso: null }))
      .toBe(NOW - RETRY_CAP_WINDOW_MS)
  })

  test('non-failed statuses never count', () => {
    const jobs = [
      { status: 'cancelled', updated_at: daysAgo(1) },
      { status: 'complete', updated_at: daysAgo(1) },
      { status: 'running', updated_at: daysAgo(0.1) },
    ]
    expect(countRetryCapFailures(jobs, NOW)).toBe(0)
  })
})
