/**
 * DAY1A-PROGRESS-ALARM-001 — No-save stuck-job alarm.
 *
 * Pins the Stabilization Week Day1A contract against the Nov 2-4 failure
 * pattern (Graves / Storm / LastWell / Callisto): seg loops spin with
 * presentCount never rising and 0 audio saved while logs stay fresh.
 *
 * Invariants:
 *  1. Health = SAVED in last 30min (presentCount/audio_url/step change).
 *     Log lines, heartbeats, updated_at freshness do NOT count.
 *  2. One alert per stuck job + reminder every 2h until the fingerprint moves.
 *  3. pipelineTruth reports a progress-alarm-stuck running job as STALLED
 *     (needs Marc) even with a fresh lock; existing ZOMBIE/ACTIVE behavior
 *     without the flag is unchanged.
 */

import {
  PROGRESS_STALL_MS,
  PROGRESS_REMINDER_MS,
  fingerprintProgress,
  evaluateProgressAlarm,
  isProgressHealthy,
  buildStuckMessage,
  type SavedProgress,
} from '@/lib/progressAlarm'
import { classifyTrueState } from '@/lib/pipelineTruth'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 3, 12, 0, 0)

// Graves seg2 pattern: 16.9k "processed", zero saved.
function gravesLoop(): SavedProgress {
  return { presentCount: 0, audioUrl: null, step: 'series_generate_voices' }
}

describe('DAY1A thresholds', () => {
  test('stall = 30min, reminder = 2h', () => {
    expect(PROGRESS_STALL_MS).toBe(30 * MIN)
    expect(PROGRESS_REMINDER_MS).toBe(2 * 60 * MIN)
  })
})

describe('fingerprint measures saves, not logs', () => {
  test('identical saves → identical fingerprint (log-only activity invisible)', () => {
    expect(fingerprintProgress(gravesLoop())).toBe(fingerprintProgress(gravesLoop()))
  })
  test.each([
    ['presentCount rises', { ...gravesLoop(), presentCount: 3 }],
    ['audio_url set', { ...gravesLoop(), audioUrl: 'https://cdn/audio.mp3' }],
    ['step advances', { ...gravesLoop(), step: 'render_final_mix' }],
    ['episode saved', { ...gravesLoop(), episodeCount: 1 }],
  ])('fingerprint moves when %s', (_label, changed) => {
    expect(fingerprintProgress(changed)).not.toBe(fingerprintProgress(gravesLoop()))
  })
})

describe('Graves Nov2-4 stuck-loop simulation', () => {
  test('full spell: baseline → stuck alert → quiet → reminder → recovery', () => {
    // First sighting establishes baseline, never alerts.
    let r = evaluateProgressAlarm(null, gravesLoop(), T0)
    expect(r.decision).toBe('ok')
    expect(r.healthy).toBe(true)
    let prev = r.nextState

    // 20min of looping, nothing saved → still ok (under 30min).
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 20 * MIN)
    expect(r.decision).toBe('ok')
    expect(r.healthy).toBe(true)
    prev = r.nextState

    // 31min, zero saved → FIRST alert, unhealthy.
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 31 * MIN)
    expect(r.decision).toBe('stuck_first_alert')
    expect(r.healthy).toBe(false)
    expect(Math.floor(r.minutesSinceSave)).toBe(31)
    prev = { ...r.nextState, lastAlertAt: new Date(T0 + 31 * MIN).toISOString() }

    // 1h later, still looping → no duplicate alert.
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 91 * MIN)
    expect(r.decision).toBe('stuck_already_alerted')
    expect(r.healthy).toBe(false)

    // 2h after the alert, still looping → reminder due.
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 31 * MIN + PROGRESS_REMINDER_MS)
    expect(r.decision).toBe('stuck_reminder_due')
    expect(r.healthy).toBe(false)

    // 3 segments finally save → recovered, healthy, alert state clears.
    const saved: SavedProgress = { ...gravesLoop(), presentCount: 3 }
    r = evaluateProgressAlarm(
      { ...prev, lastAlertAt: new Date(T0 + 31 * MIN).toISOString() },
      saved,
      T0 + 200 * MIN,
    )
    expect(r.decision).toBe('recovered')
    expect(r.healthy).toBe(true)
    expect(r.nextState.stuck).toBe(false)
    expect(r.nextState.lastAlertAt).toBeNull()
  })

  test('a NEW stuck spell after recovery alerts again (one alert per spell)', () => {
    let r = evaluateProgressAlarm(null, gravesLoop(), T0)
    let prev = r.nextState
    r = evaluateProgressAlarm(prev, gravesLoop(), T0 + 31 * MIN)
    expect(r.decision).toBe('stuck_first_alert')

    // Recovery clears the alert timestamp…
    const recovered = evaluateProgressAlarm(
      { ...r.nextState, lastAlertAt: new Date(T0 + 31 * MIN).toISOString() },
      { ...gravesLoop(), presentCount: 1 },
      T0 + 40 * MIN,
    )
    expect(recovered.decision).toBe('recovered')

    // …so a fresh 30min dry spell raises a fresh first alert.
    const again = evaluateProgressAlarm(recovered.nextState, { ...gravesLoop(), presentCount: 1 }, T0 + 75 * MIN)
    expect(again.decision).toBe('stuck_first_alert')
  })
})

describe('isProgressHealthy: saved-in-30min or nothing', () => {
  const iso = (t: number) => new Date(t).toISOString()
  test('saved 29min ago → healthy', () => {
    expect(isProgressHealthy(iso(T0 - 29 * MIN), T0)).toBe(true)
  })
  test('saved 31min ago → NOT healthy', () => {
    expect(isProgressHealthy(iso(T0 - 31 * MIN), T0)).toBe(false)
  })
  test('never saved → NOT healthy', () => {
    expect(isProgressHealthy(null, T0)).toBe(false)
    expect(isProgressHealthy(undefined, T0)).toBe(false)
  })
})

describe('stuck message carries the seg-loop evidence', () => {
  test('first alert and reminder are distinguishable', () => {
    const base = { jobId: 'abcdef123456', step: 'series_generate_voices', minutesSinceSave: 45, presentCount: 0 }
    expect(buildStuckMessage({ ...base, reminder: false })).toMatch('STUCK')
    expect(buildStuckMessage({ ...base, reminder: true })).toMatch('REMINDER')
    expect(buildStuckMessage({ ...base, reminder: false })).toMatch('presentCount=0')
  })
})

describe('pipelineTruth honors the progress-alarm flag', () => {
  const freshLock = new Date(T0 - 5 * MIN).toISOString()
  const freshUpdate = new Date(T0 - 5 * MIN).toISOString()

  test('stuck-flagged running job → STALLED + Marc, despite fresh lock', () => {
    const c = classifyTrueState(
      {
        status: 'running',
        current_step: 'series_generate_voices',
        locked_at: freshLock,
        updated_at: freshUpdate,
        state_json: {
          progress_alarm: { stuck: true, lastSavedAt: new Date(T0 - 45 * MIN).toISOString() },
        },
      },
      T0,
    )
    expect(c.trueState).toBe('STALLED')
    expect(c.marcRequired).toBe(true)
    expect(c.evidenceSummary).toMatch('nothing for 45min')
  })

  test('no flag + fresh lock + fresh update → ACTIVE (existing behavior unchanged)', () => {
    const c = classifyTrueState(
      {
        status: 'running',
        current_step: 'series_generate_voices',
        locked_at: freshLock,
        updated_at: freshUpdate,
      },
      T0,
    )
    expect(c.trueState).toBe('ACTIVE')
  })

  test('flag present but stuck=false → falls through to normal classification', () => {
    const c = classifyTrueState(
      {
        status: 'running',
        current_step: 'series_generate_voices',
        locked_at: freshLock,
        updated_at: freshUpdate,
        state_json: { progress_alarm: { stuck: false } },
      },
      T0,
    )
    expect(c.trueState).toBe('ACTIVE')
  })
})
