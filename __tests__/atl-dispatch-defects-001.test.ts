/**
 * ATL-DISPATCH-DEFECTS-001: dispatch failure circuit, active-job uniqueness,
 * and console "active" filtering.
 *
 * Deliverable 1 — story/series-level failure circuit:
 *   >=3 failed production_jobs for the same story_id/series_id within a
 *   rolling 2h window must block dispatch (stories move to repair_queue).
 *
 * Deliverable 2 — active-job uniqueness:
 *   dispatch must never create a job while a non-terminal
 *   (queued/running/waiting_for_external) job exists for the same key.
 *
 * Deliverable 3 — UI "active" definition:
 *   only status IN ('running','queued') may render as active; terminal
 *   statuses (failed/cancelled/complete) never. Runner display names must be
 *   the actual pipeline_runner_state ids, not legacy stage names.
 */

import {
  DISPATCH_FAILURE_THRESHOLD,
  DISPATCH_FAILURE_WINDOW_MS,
  countRecentFailures,
  failureCircuitOpen,
  hasActiveJob,
  isNonTerminalJobStatus,
  isTerminalJobStatus,
  isUiActiveJobStatus,
  partitionProductionItems,
  runnerDisplayName,
} from '@/lib/dispatchGuards'

const NOW = Date.parse('2026-07-09T12:00:00Z')

function failedJob(minutesAgo: number) {
  return { status: 'failed', updated_at: new Date(NOW - minutesAgo * 60_000).toISOString() }
}

describe('Deliverable 1 — story/series-level failure circuit (3 failures / 2h)', () => {
  test('constants match the work order', () => {
    expect(DISPATCH_FAILURE_THRESHOLD).toBe(3)
    expect(DISPATCH_FAILURE_WINDOW_MS).toBe(2 * 60 * 60 * 1000)
  })

  test('circuit stays CLOSED with 2 failures inside the window', () => {
    expect(failureCircuitOpen([failedJob(10), failedJob(30)], NOW)).toBe(false)
  })

  test('circuit OPENS with 3 failures inside the window', () => {
    expect(failureCircuitOpen([failedJob(10), failedJob(30), failedJob(110)], NOW)).toBe(true)
  })

  test('rolling window: failures older than 2h do not count', () => {
    const jobs = [failedJob(10), failedJob(30), failedJob(121)] // third is outside 2h
    expect(countRecentFailures(jobs, NOW)).toBe(2)
    expect(failureCircuitOpen(jobs, NOW)).toBe(false)
  })

  test('retry-storm shape (new failed job every ~90s) trips the circuit fast', () => {
    // Yesterday's storm: a failing series accrued a new failed job every cycle
    const storm = [failedJob(1.5), failedJob(3), failedJob(4.5), failedJob(6)]
    expect(failureCircuitOpen(storm, NOW)).toBe(true)
  })

  test('non-failed statuses never count toward the circuit', () => {
    const jobs = [
      { status: 'cancelled', updated_at: new Date(NOW - 60_000).toISOString() },
      { status: 'complete', updated_at: new Date(NOW - 60_000).toISOString() },
      { status: 'running', updated_at: new Date(NOW - 60_000).toISOString() },
      failedJob(5),
    ]
    expect(countRecentFailures(jobs, NOW)).toBe(1)
    expect(failureCircuitOpen(jobs, NOW)).toBe(false)
  })

  test('missing/garbage updated_at is not counted', () => {
    const jobs = [
      { status: 'failed', updated_at: null },
      { status: 'failed', updated_at: 'not-a-date' },
      failedJob(5),
    ]
    expect(countRecentFailures(jobs, NOW)).toBe(1)
  })
})

describe('Deliverable 2 — active-job uniqueness guard', () => {
  test('non-terminal statuses block dispatch', () => {
    expect(hasActiveJob([{ status: 'queued' }])).toBe(true)
    expect(hasActiveJob([{ status: 'running' }])).toBe(true)
    expect(hasActiveJob([{ status: 'waiting_for_external' }])).toBe(true)
  })

  test('terminal statuses do not block dispatch', () => {
    expect(hasActiveJob([{ status: 'failed' }, { status: 'cancelled' }, { status: 'complete' }])).toBe(false)
    expect(hasActiveJob([])).toBe(false)
  })

  test("Charity's Shadow regression: running job present => dispatch must skip", () => {
    // Job 0176b1dc (created 01:52Z) was still running when dispatch created
    // duplicate c60617e1 at 02:07Z. With the guard, the running job blocks.
    const jobs = [
      { status: 'failed', updated_at: '2026-07-09T02:06:58Z' },  // 150f0ec1
      { status: 'running', updated_at: '2026-07-09T02:05:00Z' }, // 0176b1dc still running
    ]
    expect(hasActiveJob(jobs)).toBe(true)
  })

  test('status normalization: whitespace/case handled', () => {
    expect(isNonTerminalJobStatus(' Running ')).toBe(true)
    expect(isNonTerminalJobStatus('QUEUED')).toBe(true)
    expect(isNonTerminalJobStatus(undefined)).toBe(false)
    expect(isNonTerminalJobStatus('')).toBe(false)
  })
})

describe('Deliverable 3 — UI "active" filter and runner names', () => {
  test('only running/queued count as UI-active', () => {
    expect(isUiActiveJobStatus('running')).toBe(true)
    expect(isUiActiveJobStatus('queued')).toBe(true)
    expect(isUiActiveJobStatus('waiting_for_external')).toBe(false)
    expect(isUiActiveJobStatus('failed')).toBe(false)
    expect(isUiActiveJobStatus('cancelled')).toBe(false)
    expect(isUiActiveJobStatus('complete')).toBe(false)
  })

  test('terminal statuses are recognized', () => {
    expect(isTerminalJobStatus('failed')).toBe(true)
    expect(isTerminalJobStatus('cancelled')).toBe(true)
    expect(isTerminalJobStatus('complete')).toBe(true)
    expect(isTerminalJobStatus('running')).toBe(false)
    expect(isTerminalJobStatus('queued')).toBe(false)
  })

  test('partitionProductionItems: terminal jobs can NEVER land in active', () => {
    const items = [
      { key: 'a', status: 'running' },
      { key: 'b', status: 'queued' },
      { key: 'c', status: 'failed' },                              // 911 Dispatcher case
      { key: 'd', status: 'cancelled', op: { isStalled: true } },  // stalled render
      { key: 'e', status: 'cancelled' },
      { key: 'f', status: 'complete' },
      { key: 'g', status: 'waiting_for_external' },
    ]
    const { active, stalled, terminal, waiting } = partitionProductionItems(items)
    expect(active.map(i => i.key)).toEqual(['a', 'b'])
    expect(stalled.map(i => i.key)).toEqual(['d'])
    expect(terminal.map(i => i.key)).toEqual(['c', 'e', 'f'])
    expect(waiting.map(i => i.key)).toEqual(['g'])
    // Invariant: no terminal status in the active bucket
    expect(active.some(i => ['failed', 'cancelled', 'complete'].includes(String(i.status)))).toBe(false)
  })

  test('runner display names are pipeline_runner_state ids, not Moe/Groucho', () => {
    expect(runnerDisplayName('production-runner:worker-1')).toBe('worker-1')
    expect(runnerDisplayName('production-runner:worker-3')).toBe('worker-3')
    expect(runnerDisplayName('production-runner:worker-4')).toBe('worker-4')
    expect(runnerDisplayName('custom-runner-id')).toBe('custom-runner-id')
    expect(runnerDisplayName(null)).toBe('unknown-worker')
    // Legacy stage names must not appear
    for (const legacy of ['Larry', 'Curly', 'Moe', 'Groucho']) {
      expect(runnerDisplayName('production-runner:worker-1')).not.toBe(legacy)
    }
  })
})
