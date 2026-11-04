/**
 * OWN-STATE-001 + BUSY-BY-ACTIVITY (Stabilization Week, PR #478 follow-up).
 *
 * Fix 1 — busy-by-activity regardless of status: stuck =
 * (updated_at OR locked_at OR runner logs touched last 30min) AND
 * (saved-progress fingerprint frozen 30min). Status ignored for the busy
 * decision. Only jobs with NO touch in 30min are silent (incl. untouched
 * queued). waiting_for_external → daily WAITING reminder only.
 *
 * Fix 2 — own state, never touch production_jobs: alarm state lives in
 * progress_alarm_state keyed by job_id. No code path writes job.state_json
 * or updates production_jobs rows (reads only; alerts via webhook).
 *
 * Pins:
 *  1. REAL Nov 2-4 flip pattern: status flips running<->queued every scan
 *     cycle, touches stay fresh, saves frozen → MUST alert.
 *  2. Untouched queued (no touch 30min) → silent, no alert, ever.
 *  3. Lake House cast-wait (waiting_for_external) → WAITING reminder only,
 *     never stuck, at most once per 24h.
 *  4. No production_jobs writes: store mock/spy sees only
 *     progress_alarm_state; route source contains no production_jobs
 *     update and no state_json writes.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  evaluateProgressAlarm,
  isJobBusy,
  triageByActivity,
  externalReminderDue,
  buildWaitingMessage,
  type SavedProgress,
} from '@/lib/progressAlarm'
import {
  ALARM_STATE_TABLE,
  loadAlarmState,
  saveAlarmState,
  saveWaitReminder,
  type AlarmStateDb,
  type AlarmStateRow,
} from '@/lib/progressAlarmStore'

const MIN = 60_000
const HOUR = 3_600_000
const T0 = Date.UTC(2026, 10, 3, 12, 0, 0)
const iso = (t: number) => new Date(t).toISOString()

// Nov 2-4 Graves fingerprint: seg loop spins, nothing saved.
function gravesLoop(): SavedProgress {
  return { presentCount: 0, audioUrl: null, step: 'series_generate_voices' }
}

describe('1. REAL Nov2-4 flip pattern: running<->queued + frozen saves → ALERTS', () => {
  test('status flips every cycle, touches fresh, saves frozen → stuck_first_alert at 31min', () => {
    // First sighting (running): baseline, never alerts.
    let r = evaluateProgressAlarm(null, gravesLoop(), T0)
    expect(r.decision).toBe('ok')
    let prev = r.nextState

    // Cycles every ~5min flip running<->queued; each cycle touches
    // updated_at + log tail (the runner is spinning, the queue is churning).
    const statuses = ['queued', 'running', 'queued', 'running', 'queued', 'running']
    let now = T0
    statuses.forEach((status, i) => {
      now = T0 + (i + 1) * 5 * MIN
      const touch = {
        updatedAt: iso(now - 1 * MIN),
        lockedAt: iso(now - 1 * MIN),
        logs: [{ at: iso(now - 1 * MIN) }],
      }
      // Status IGNORED for the busy decision: busy in EVERY cycle.
      expect(isJobBusy(touch, now)).toBe(true)
      expect(triageByActivity(status, true)).toBe('scan')
      // Fingerprint frozen the whole time.
      r = evaluateProgressAlarm(prev, gravesLoop(), now)
      prev = r.nextState
      if (now - T0 < 30 * MIN) expect(r.healthy).toBe(true)
    })

    // 31min frozen (across the flips) → FIRST alert, unhealthy.
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 31 * MIN)
    expect(r.decision).toBe('stuck_first_alert')
    expect(r.healthy).toBe(false)
    expect(triageByActivity('queued', true)).toBe('scan') // even as queued
    expect(triageByActivity('running', true)).toBe('scan')
  })
})

describe('2. Untouched queued: silent, ever', () => {
  test('queued + NO touch in 30min → silent_idle (no scan, no alert)', () => {
    const quiet = {
      updatedAt: iso(T0 - 45 * MIN),
      lockedAt: iso(T0 - 45 * MIN),
      logs: [{ at: iso(T0 - 45 * MIN) }],
    }
    expect(isJobBusy(quiet, T0)).toBe(false)
    expect(triageByActivity('queued', false)).toBe('silent_idle')
    expect(triageByActivity('queued', isJobBusy({}, T0))).toBe('silent_idle')
  })
})

describe('3. Lake House cast-wait: WAITING reminder only, never stuck', () => {
  test('waiting_for_external → external_wait whether busy or not', () => {
    expect(triageByActivity('waiting_for_external', true)).toBe('external_wait')
    expect(triageByActivity('waiting_for_external', false)).toBe('external_wait')
  })
  test('24h cadence: first due, 1h quiet, 25h due', () => {
    expect(externalReminderDue(null, T0)).toBe(true)
    expect(externalReminderDue(iso(T0 - 1 * HOUR), T0)).toBe(false)
    expect(externalReminderDue(iso(T0 - 25 * HOUR), T0)).toBe(true)
  })
  test('waiting message says WAITING, never STUCK', () => {
    const msg = buildWaitingMessage({ jobId: 'lakehouse9', step: 'await_cast_approval', hoursWaiting: 30 })
    expect(msg).toMatch('WAITING')
    expect(msg).not.toMatch('STUCK')
  })
})

describe('4. OWN-STATE-001: no production_jobs writes', () => {
  /** In-memory mock of the minimal DB surface; spies on every table address. */
  function mockDb() {
    const tables: string[] = []
    const writes: { table: string; op: string }[] = []
    let row: AlarmStateRow | null = null
    const db: AlarmStateDb = {
      from: (table: string) => {
        tables.push(table)
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: row }),
            }),
          }),
          upsert: async (next: AlarmStateRow) => {
            writes.push({ table, op: 'upsert' })
            row = next
            return {}
          },
        }
      },
    }
    return { db, tables, writes, getRow: () => row }
  }

  test('store addresses ONLY progress_alarm_state (load + save + wait reminder)', async () => {
    const m = mockDb()
    const loaded = await loadAlarmState(m.db, 'job-1')
    expect(loaded).toEqual({ progress: null, waitLastReminderAt: null })

    const base = evaluateProgressAlarm(null, gravesLoop(), T0).nextState
    await saveAlarmState(m.db, 'job-1', base, null, T0)
    await saveWaitReminder(m.db, 'job-1', T0 + HOUR)

    expect(m.tables.length).toBeGreaterThan(0)
    for (const t of m.tables) expect(t).toBe(ALARM_STATE_TABLE)
    expect(ALARM_STATE_TABLE).toBe('progress_alarm_state')
    for (const w of m.writes) expect(w.table).not.toBe('production_jobs')

    const again = await loadAlarmState(m.db, 'job-1')
    expect(again.progress?.fingerprint).toBe(base.fingerprint)
    expect(again.waitLastReminderAt).toBe(iso(T0 + HOUR))
  })

  test('route source: no production_jobs writes, no state_json writes, no runner-event DB writes', () => {
    const routePath = path.join(__dirname, '..', 'app', 'api', 'admin', 'progress-alarm', 'route.ts')
    const src = fs.readFileSync(routePath, 'utf8')
    // No writes to production_jobs rows (reads via .select are allowed).
    expect(src).not.toMatch(/from\(['"]production_jobs['"]\)\s*\.\s*update/)
    expect(src).not.toMatch(/from\(['"]production_jobs['"]\)\s*\.\s*upsert/)
    expect(src).not.toMatch(/from\(['"]production_jobs['"]\)\s*\.\s*delete/)
    // No alarm state smuggled through job.state_json.
    expect(src).not.toMatch(/state_json/)
    // No runner-event DB writes (writeRunnerEvent updates production_jobs.logs).
    expect(src).not.toMatch(/writeRunnerEvent/)
    // Alarm state goes to the OWN table via the store.
    expect(src).toMatch(/progressAlarmStore/)
    expect(src).toMatch(/loadAlarmState/)
    expect(src).toMatch(/saveAlarmState/)
  })
})
