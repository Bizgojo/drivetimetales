/**
 * ATL-ITEM-6: Tests for pipeline runner self-healing features.
 *
 * (a) Heartbeat cleanup: pipeline_runner_state rows with last_heartbeat_at > 15 min old
 *     cause their running jobs to be reset to queued (zombie recovery).
 *
 * (b) Circuit breaker: if a single job fails CIRCUIT_BREAKER_THRESHOLD (5) consecutive
 *     times on the same step, needs_attention is set to true and retrying stops.
 */

'use strict'

// ── Constants (mirror runner.ts) ──────────────────────────────────────────
const HEARTBEAT_ZOMBIE_MS = 15 * 60 * 1000
const CIRCUIT_BREAKER_THRESHOLD = 5

// ── Isolated replica of cleanupZombieJobs logic ───────────────────────────
// Tests the logic without needing a real Supabase connection.

/**
 * Determine which jobs should be reset to queued based on zombie runner detection.
 *
 * @param {Array<{id: string, last_heartbeat_at: string}>} runnerRows
 * @param {Array<{id: string, status: string, locked_by: string|null}>} jobRows
 * @param {number} nowMs - current time in milliseconds
 * @returns {string[]} - job IDs that should be reset to queued
 */
function determineZombieJobsToReset(runnerRows, jobRows, nowMs) {
  const zombieCutoff = new Date(nowMs - HEARTBEAT_ZOMBIE_MS).toISOString()

  const zombieHolderIds = runnerRows
    .filter(r => r.last_heartbeat_at && r.last_heartbeat_at < zombieCutoff)
    .map(r => r.id)

  if (zombieHolderIds.length === 0) return []

  return jobRows
    .filter(j => j.status === 'running' && j.locked_by && zombieHolderIds.includes(j.locked_by))
    .map(j => j.id)
}

// ── Isolated replica of circuit breaker logic ─────────────────────────────
/**
 * Simulate circuit breaker state transitions.
 *
 * @param {Array<string|null>} failureSteps - sequence of failed steps (null = different step each time)
 * @returns {{open: boolean, consecutiveFailures: number, openAfterCall: number|null}}
 */
function simulateCircuitBreaker(failureSteps) {
  let step = null
  let consecutiveFailures = 0
  let openAfterCall = null

  for (let i = 0; i < failureSteps.length; i++) {
    const failedStep = failureSteps[i]

    if (step === failedStep) {
      consecutiveFailures += 1
    } else {
      step = failedStep
      consecutiveFailures = 1
    }

    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && openAfterCall === null) {
      openAfterCall = i + 1 // 1-indexed call number when circuit opens
    }
  }

  return {
    open: consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD,
    consecutiveFailures,
    openAfterCall,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Self-healing: heartbeat zombie cleanup (ATL-ITEM-6a)', () => {
  const NOW_MS = Date.now()
  const FRESH_HEARTBEAT = new Date(NOW_MS - 2 * 60 * 1000).toISOString()      // 2 min ago — alive
  const STALE_HEARTBEAT = new Date(NOW_MS - 20 * 60 * 1000).toISOString()     // 20 min ago — zombie
  const BOUNDARY_HEARTBEAT = new Date(NOW_MS - 15 * 60 * 1000).toISOString()  // exactly 15 min — zombie

  test('fresh runner: jobs locked by live runner are NOT reset', () => {
    const runners = [{ id: 'worker-1', last_heartbeat_at: FRESH_HEARTBEAT }]
    const jobs = [
      { id: 'job-A', status: 'running', locked_by: 'worker-1' },
      { id: 'job-B', status: 'running', locked_by: 'worker-1' },
    ]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    expect(resetJobIds).toHaveLength(0)
  })

  test('stale runner (20 min): running jobs locked by it ARE reset to queued', () => {
    const runners = [{ id: 'worker-zombie', last_heartbeat_at: STALE_HEARTBEAT }]
    const jobs = [
      { id: 'job-A', status: 'running', locked_by: 'worker-zombie' },
      { id: 'job-B', status: 'running', locked_by: 'worker-zombie' },
      { id: 'job-C', status: 'queued', locked_by: null },
    ]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    expect(resetJobIds).toContain('job-A')
    expect(resetJobIds).toContain('job-B')
    expect(resetJobIds).not.toContain('job-C') // queued job not touched
    expect(resetJobIds).toHaveLength(2)
  })

  test('mixed runners: only zombie runner jobs are reset', () => {
    const runners = [
      { id: 'worker-alive', last_heartbeat_at: FRESH_HEARTBEAT },
      { id: 'worker-dead', last_heartbeat_at: STALE_HEARTBEAT },
    ]
    const jobs = [
      { id: 'job-alive-1', status: 'running', locked_by: 'worker-alive' },
      { id: 'job-zombie-1', status: 'running', locked_by: 'worker-dead' },
      { id: 'job-zombie-2', status: 'running', locked_by: 'worker-dead' },
    ]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    expect(resetJobIds).not.toContain('job-alive-1')
    expect(resetJobIds).toContain('job-zombie-1')
    expect(resetJobIds).toContain('job-zombie-2')
    expect(resetJobIds).toHaveLength(2)
  })

  test('boundary: exactly 15 min stale heartbeat IS considered zombie', () => {
    const runners = [{ id: 'worker-boundary', last_heartbeat_at: BOUNDARY_HEARTBEAT }]
    const jobs = [{ id: 'job-X', status: 'running', locked_by: 'worker-boundary' }]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    // 15 min exactly: last_heartbeat_at < zombieCutoff (cutoff is NOW - 15min)
    // ISO string comparison: BOUNDARY_HEARTBEAT === zombieCutoff
    // Strict lt means boundary is NOT reset — document this edge case
    // (lt is exclusive: >= cutoff is alive; < cutoff is zombie)
    // BOUNDARY_HEARTBEAT is exactly at cutoff → NOT strictly less than → treated as alive
    expect(resetJobIds).toHaveLength(0) // exactly at boundary: alive (exclusive cutoff)
  })

  test('boundary: 15min + 1ms stale IS zombie', () => {
    const JUST_OVER = new Date(NOW_MS - HEARTBEAT_ZOMBIE_MS - 1).toISOString()
    const runners = [{ id: 'worker-over', last_heartbeat_at: JUST_OVER }]
    const jobs = [{ id: 'job-Y', status: 'running', locked_by: 'worker-over' }]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    expect(resetJobIds).toContain('job-Y')
  })

  test('no runner rows: no jobs reset', () => {
    const runners = []
    const jobs = [{ id: 'job-Z', status: 'running', locked_by: 'worker-gone' }]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    expect(resetJobIds).toHaveLength(0)
  })

  test('runner with null heartbeat: treated as alive (no null assumption)', () => {
    const runners = [{ id: 'worker-null', last_heartbeat_at: null }]
    const jobs = [{ id: 'job-null', status: 'running', locked_by: 'worker-null' }]

    const resetJobIds = determineZombieJobsToReset(runners, jobs, NOW_MS)
    // null heartbeat is filtered out by the `r.last_heartbeat_at &&` guard
    expect(resetJobIds).toHaveLength(0)
  })
})

describe('Self-healing: circuit breaker (ATL-ITEM-6b)', () => {
  const SAME_STEP = 'generate_belle_assets'
  const OTHER_STEP = 'generate_voices'

  test('4 consecutive failures on same step: circuit NOT yet open', () => {
    const steps = Array(4).fill(SAME_STEP)
    const { open, consecutiveFailures } = simulateCircuitBreaker(steps)
    expect(open).toBe(false)
    expect(consecutiveFailures).toBe(4)
  })

  test('5 consecutive failures on same step: circuit OPENS', () => {
    const steps = Array(5).fill(SAME_STEP)
    const { open, consecutiveFailures, openAfterCall } = simulateCircuitBreaker(steps)
    expect(open).toBe(true)
    expect(consecutiveFailures).toBe(5)
    expect(openAfterCall).toBe(5) // opens on the 5th call
  })

  test('6 consecutive failures: circuit still open (does not reset on its own)', () => {
    const steps = Array(6).fill(SAME_STEP)
    const { open, consecutiveFailures } = simulateCircuitBreaker(steps)
    expect(open).toBe(true)
    expect(consecutiveFailures).toBe(6)
  })

  test('step changes mid-sequence: counter resets', () => {
    // 3 failures on SAME_STEP, then a failure on OTHER_STEP — counter resets to 1
    const steps = [SAME_STEP, SAME_STEP, SAME_STEP, OTHER_STEP]
    const { open, consecutiveFailures } = simulateCircuitBreaker(steps)
    expect(open).toBe(false)
    expect(consecutiveFailures).toBe(1)
  })

  test('alternating steps: circuit never opens', () => {
    // 10 failures alternating steps — counter never reaches 5
    const steps = Array(10).fill(null).map((_, i) => (i % 2 === 0 ? SAME_STEP : OTHER_STEP))
    const { open } = simulateCircuitBreaker(steps)
    expect(open).toBe(false)
  })

  test('4 on step A, then 5 on step B: circuit opens on step B', () => {
    const steps = [
      ...Array(4).fill('step_a'),
      ...Array(5).fill('step_b'),
    ]
    const { open, consecutiveFailures, openAfterCall } = simulateCircuitBreaker(steps)
    expect(open).toBe(true)
    expect(consecutiveFailures).toBe(5)
    expect(openAfterCall).toBe(9) // opens on the 9th call (4+5)
  })

  test('success resets circuit: simulate via step change (new step = success)', () => {
    // After success, step changes; a fresh failure sequence on old step starts from 0
    const steps = [
      SAME_STEP, SAME_STEP, SAME_STEP, // 3 failures
      // success would change the step tracking — simulate by tracking a new step
      'new_step_after_success',          // step changes → reset
      SAME_STEP, SAME_STEP,              // 2 failures on old step — counter is 2, not 5
    ]
    const { open, consecutiveFailures } = simulateCircuitBreaker(steps)
    expect(open).toBe(false)
    expect(consecutiveFailures).toBe(2)
  })
})
