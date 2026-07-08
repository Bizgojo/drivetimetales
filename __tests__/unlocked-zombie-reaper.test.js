/**
 * Orion item 12: Tests for unlocked zombie job reaper.
 *
 * An "unlocked zombie" is a production_jobs row where:
 *   status = 'running'
 *   locked_by IS NULL
 *   updated_at older than UNLOCKED_ZOMBIE_STALE_MS (15 min)
 *
 * These jobs are invisible to the heartbeat-based zombie cleaner (which requires
 * locked_by to match a stale runner row) AND to the job pickup query (which skips
 * status='running' rows).
 *
 * Tests:
 *   (a) A job with status=running, locked_by=null, updated_at 20 min ago → gets reset
 *   (b) A job with status=running, locked_by='worker-1', updated_at 20 min ago → NOT reset by this path
 *   (c) A job with status=running, locked_by=null, updated_at 5 min ago → NOT reset (too recent)
 */

'use strict'

// ── Constants (mirror runner.ts) ──────────────────────────────────────────
const UNLOCKED_ZOMBIE_STALE_MS = 15 * 60 * 1000 // 15 min

// ── Isolated replica of unlocked zombie logic ─────────────────────────────

/**
 * Determine which jobs should be reset by the unlocked zombie cleanup pass.
 *
 * @param {Array<{id: string, status: string, locked_by: string|null, updated_at: string}>} jobRows
 * @param {number} nowMs - current time in milliseconds
 * @returns {string[]} - job IDs that should be reset to queued
 */
function determineUnlockedZombiesToReset(jobRows, nowMs) {
  const cutoff = new Date(nowMs - UNLOCKED_ZOMBIE_STALE_MS).toISOString()

  return jobRows
    .filter(j =>
      j.status === 'running' &&
      j.locked_by === null &&
      j.updated_at < cutoff
    )
    .map(j => j.id)
}

/**
 * Simulate the log message emitted for each reset job.
 */
function getResetLogMessage(jobId, updatedAtIso, nowMs) {
  const ageMin = Math.round((nowMs - new Date(updatedAtIso).getTime()) / 60_000)
  return `[self-healing] UNLOCKED_ZOMBIE_RESET: job ${jobId} reset after ${ageMin}min with no lock`
}

// ── Test helpers ──────────────────────────────────────────────────────────

const NOW_MS = Date.now()
const AGO_20_MIN = new Date(NOW_MS - 20 * 60 * 1000).toISOString() // 20 min ago — stale
const AGO_5_MIN  = new Date(NOW_MS -  5 * 60 * 1000).toISOString() //  5 min ago — recent

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Unlocked zombie reaper (Orion item 12)', () => {

  describe('(a) running + locked_by=null + updated_at 20 min ago → gets reset', () => {
    const jobs = [
      { id: 'zombie-001', status: 'running', locked_by: null, updated_at: AGO_20_MIN },
    ]

    it('includes the stale unlocked job in the reset list', () => {
      const toReset = determineUnlockedZombiesToReset(jobs, NOW_MS)
      expect(toReset).toContain('zombie-001')
      expect(toReset).toHaveLength(1)
    })

    it('emits the expected UNLOCKED_ZOMBIE_RESET log message', () => {
      const msg = getResetLogMessage('zombie-001', AGO_20_MIN, NOW_MS)
      expect(msg).toMatch(/UNLOCKED_ZOMBIE_RESET/)
      expect(msg).toMatch(/zombie-001/)
      expect(msg).toMatch(/20min/)
    })
  })

  describe('(b) running + locked_by=worker-1 + updated_at 20 min ago → NOT reset by this path', () => {
    const jobs = [
      { id: 'locked-job-001', status: 'running', locked_by: 'worker-1', updated_at: AGO_20_MIN },
    ]

    it('does not include a locked running job in the unlocked-zombie reset list', () => {
      const toReset = determineUnlockedZombiesToReset(jobs, NOW_MS)
      expect(toReset).not.toContain('locked-job-001')
      expect(toReset).toHaveLength(0)
    })
  })

  describe('(c) running + locked_by=null + updated_at 5 min ago → NOT reset (too recent)', () => {
    const jobs = [
      { id: 'recent-job-001', status: 'running', locked_by: null, updated_at: AGO_5_MIN },
    ]

    it('does not reset a job that is too recent', () => {
      const toReset = determineUnlockedZombiesToReset(jobs, NOW_MS)
      expect(toReset).not.toContain('recent-job-001')
      expect(toReset).toHaveLength(0)
    })
  })

  describe('mixed batch — only stale unlocked jobs get reset', () => {
    const jobs = [
      { id: 'zombie-stale',   status: 'running', locked_by: null,       updated_at: AGO_20_MIN }, // ✓ reset
      { id: 'locked-stale',   status: 'running', locked_by: 'worker-1', updated_at: AGO_20_MIN }, // ✗ has lock
      { id: 'zombie-recent',  status: 'running', locked_by: null,       updated_at: AGO_5_MIN  }, // ✗ too recent
      { id: 'complete-job',   status: 'complete', locked_by: null,      updated_at: AGO_20_MIN }, // ✗ not running
      { id: 'queued-job',     status: 'queued',  locked_by: null,       updated_at: AGO_20_MIN }, // ✗ not running
    ]

    it('resets only the stale unlocked running job', () => {
      const toReset = determineUnlockedZombiesToReset(jobs, NOW_MS)
      expect(toReset).toContain('zombie-stale')
      expect(toReset).not.toContain('locked-stale')
      expect(toReset).not.toContain('zombie-recent')
      expect(toReset).not.toContain('complete-job')
      expect(toReset).not.toContain('queued-job')
      expect(toReset).toHaveLength(1)
    })
  })

  describe('log message format', () => {
    it('includes UNLOCKED_ZOMBIE_RESET, job id, and age in minutes', () => {
      const jobId = 'test-job-abc'
      const updatedAt = new Date(NOW_MS - 18.6 * 60 * 1000).toISOString() // ~18.6 min ago
      const msg = getResetLogMessage(jobId, updatedAt, NOW_MS)
      expect(msg).toMatch(/UNLOCKED_ZOMBIE_RESET/)
      expect(msg).toContain(jobId)
      expect(msg).toMatch(/\d+min/)
      expect(msg).toMatch(/no lock/)
    })
  })

})
