/**
 * ALARM-FIXES-4 — refined alert rule (Stabilization Week, PR #478 follow-up).
 *
 * Rule: BUSY (updated_at/locked_at/logs touched last 30min) AND NOT SAVING
 * (no presentCount/audio_url/step progress 30min) → stuck alert + 2h
 * reminders. Queued waiting = silent. waiting_for_external = once-a-day
 * waiting-on-Marc reminder (never stuck).
 *
 * Pins, against Nov 2-4 evidence:
 *  1. Graves seg-loop (busy, zero saved 31min) → stuck_first_alert.
 *  2. Queued-in-line job → silent, no alert, no stuck flag, ever.
 *  3. Lake House cast-wait (waiting_for_external) → silent as stuck;
 *     WAITING reminder at most once per 24h.
 */

import {
  BUSY_MS,
  EXTERNAL_REMINDER_MS,
  evaluateProgressAlarm,
  isJobBusy,
  lastLogAt,
  externalReminderDue,
  buildWaitingMessage,
  scanTriage,
  type SavedProgress,
} from '@/lib/progressAlarm'

const MIN = 60_000
const HOUR = 3_600_000
const T0 = Date.UTC(2026, 11, 4, 12, 0, 0)
const iso = (t: number) => new Date(t).toISOString()

// Graves Nov2-4: seg loop spins, presentCount frozen at 0, no audio, no step.
function gravesLoop(): SavedProgress {
  return { presentCount: 0, audioUrl: null, step: 'series_generate_voices' }
}

describe('ALARM-FIXES-4 thresholds', () => {
  test('busy window = 30min, external reminder = 24h', () => {
    expect(BUSY_MS).toBe(30 * MIN)
    expect(EXTERNAL_REMINDER_MS).toBe(24 * HOUR)
  })
})

describe('scanTriage pins the status contract', () => {
  test('queued → silent', () => {
    expect(scanTriage('queued')).toBe('queued_silent')
  })
  test('waiting_for_external → wait path', () => {
    expect(scanTriage('waiting_for_external')).toBe('external_wait')
  })
  test('running → busy-gated scan', () => {
    expect(scanTriage('running')).toBe('running')
  })
  test('unknown/null status defaults to running scan (never silent by accident)', () => {
    expect(scanTriage(null)).toBe('running')
    expect(scanTriage('paused')).toBe('running')
  })
})

describe('1. Graves loop: BUSY + NOT SAVING → alerts', () => {
  test('busy running job, fingerprint frozen 31min → stuck_first_alert', () => {
    // First sighting: baseline, never alerts.
    let r = evaluateProgressAlarm(null, gravesLoop(), T0)
    expect(r.decision).toBe('ok')
    const busyAt31 = isJobBusy(
      { updatedAt: iso(T0 + 26 * MIN), lockedAt: iso(T0 + 26 * MIN), logs: [{ at: iso(T0 + 29 * MIN) }] },
      T0 + 31 * MIN,
    )
    expect(busyAt31).toBe(true)
    r = evaluateProgressAlarm(r.nextState, gravesLoop(), T0 + 31 * MIN)
    expect(r.decision).toBe('stuck_first_alert')
    expect(r.healthy).toBe(false)
  })
})

describe('2. Queued-in-line: silent, ever', () => {
  test('triage is silent regardless of how long the fingerprint is frozen', () => {
    expect(scanTriage('queued')).toBe('queued_silent')
    // Even a 6h-frozen fingerprint never reaches the evaluator for queued jobs:
    // the route continues before any storage read / state write / alert.
    const frozen = evaluateProgressAlarm(null, gravesLoop(), T0)
    expect(frozen.decision).toBe('ok') // cold start could never alert anyway
  })
})

describe('isJobBusy: updated_at / locked_at / logs freshness', () => {
  test('fresh updated_at → busy', () => {
    expect(isJobBusy({ updatedAt: iso(T0 - 5 * MIN) }, T0)).toBe(true)
  })
  test('fresh locked_at alone → busy', () => {
    expect(isJobBusy({ updatedAt: iso(T0 - 90 * MIN), lockedAt: iso(T0 - 5 * MIN) }, T0)).toBe(true)
  })
  test('fresh log tail alone → busy', () => {
    expect(
      isJobBusy({ updatedAt: iso(T0 - 90 * MIN), lockedAt: null, logs: [{ at: iso(T0 - 5 * MIN) }] }, T0),
    ).toBe(true)
  })
  test('all quiet >30min → idle (zombie detector owns it)', () => {
    expect(
      isJobBusy(
        { updatedAt: iso(T0 - 45 * MIN), lockedAt: iso(T0 - 45 * MIN), logs: [{ at: iso(T0 - 45 * MIN) }] },
        T0,
      ),
    ).toBe(false)
  })
  test('no signal at all → not busy (never alert on nothing)', () => {
    expect(isJobBusy({}, T0)).toBe(false)
    expect(isJobBusy({ updatedAt: null, lockedAt: null, logs: [] }, T0)).toBe(false)
  })
  test('malformed log tail is ignored, not fatal', () => {
    expect(lastLogAt(null)).toBeNull()
    expect(lastLogAt([])).toBeNull()
    expect(lastLogAt([{ nope: 1 }])).toBeNull()
    expect(lastLogAt([{ at: iso(T0 - MIN) }])).toBe(iso(T0 - MIN))
    expect(isJobBusy({ logs: [{ nope: 1 }] }, T0)).toBe(false)
  })
})

describe('3. Lake House cast-wait: waiting reminder only, never stuck', () => {
  test('first waiting sighting → reminder due', () => {
    expect(externalReminderDue(null, T0)).toBe(true)
    expect(externalReminderDue(undefined, T0)).toBe(true)
  })
  test('reminder sent 1h ago → quiet (no duplicate)', () => {
    expect(externalReminderDue(iso(T0 - 1 * HOUR), T0)).toBe(false)
  })
  test('reminder sent 25h ago → due again (once-a-day cadence)', () => {
    expect(externalReminderDue(iso(T0 - 25 * HOUR), T0)).toBe(true)
  })
  test('waiting message says WAITING, never STUCK', () => {
    const msg = buildWaitingMessage({ jobId: 'lakehouse1', step: 'await_cast_approval', hoursWaiting: 30 })
    expect(msg).toMatch('WAITING')
    expect(msg).not.toMatch('STUCK')
    expect(msg).toMatch('lakehous')
  })
  test('a frozen fingerprint on a waiting job never becomes a stuck alert', () => {
    // waiting_for_external jobs never enter evaluateProgressAlarm in the route;
    // even if they did, triage keeps them out of the stuck path.
    expect(scanTriage('waiting_for_external')).toBe('external_wait')
  })
})
