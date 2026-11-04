/**
 * DAY1A-PROGRESS-ALARM-001 — No-save stuck-job alarm (Stabilization Week Day 1A).
 *
 * Problem (Nov 2–4 evidence: Graves / Storm / LastWell / Callisto):
 * seg loops spin with presentCount never rising and 0 audio saved, while
 * job updated_at / logs stay fresh (log lines, heartbeats, retries). Any
 * health signal based on log/heartbeat freshness therefore reports a
 * stuck job as healthy.
 *
 * Rule: a running job is healthy ONLY if it SAVED something in the last
 * 30 minutes. "Saved" = a change in the saved-artifact fingerprint:
 *   - presentCount (voice segments present in storage asc3/{storyId}), OR
 *   - audio_url (stories.audio_url / story_audio_url), OR
 *   - episodeCount (series episodes with saved audio), OR
 *   - current_step (production_jobs.current_step advance)
 *
 * Alert policy: one alert per stuck job + a reminder every 2h until the
 * fingerprint moves again. Alert state lives on the job row itself
 * (state_json.progress_alarm) so no migration is needed.
 *
 * This module is pure (no I/O) so it is unit-testable with $0 spend.
 *
 * ALARM-FIXES-4 refinement (same file, no behavior change to the core
 * evaluator): stuck alerts fire only for BUSY running jobs (updated_at /
 * locked_at / logs touched in the last 30min) that are NOT SAVING. Queued
 * jobs are silent (waiting in line, not spinning); idle running jobs are
 * silent here (zombie detector's domain); waiting_for_external jobs get a
 * once-a-day WAITING reminder, never a stuck alert.
 */

export const PROGRESS_STALL_MS = 30 * 60 * 1000 // 30 min without a save → stuck
export const PROGRESS_REMINDER_MS = 2 * 60 * 60 * 1000 // 2 h between reminders

/** ALARM-FIXES-4: BUSY window — a running job counts as busy only if
 *  updated_at / locked_at / logs were touched inside this window. Idle
 *  running jobs are the zombie detector's domain, not this alarm's. */
export const BUSY_MS = 30 * 60 * 1000 // 30 min

/** ALARM-FIXES-4: waiting_for_external jobs get at most one waiting-on-Marc
 *  reminder per day. They are WAITING, never stuck. */
export const EXTERNAL_REMINDER_MS = 24 * 60 * 60 * 1000 // 24 h

/** Measurable saved-artifact progress for one running job. */
export type SavedProgress = {
  /** Voice segments present in storage (asc3/{storyId}/segment_NNNN.mp3). */
  presentCount: number
  /** Saved final/story audio URL (stories.audio_url, fallback story_audio_url). */
  audioUrl: string | null
  /** Current pipeline step (production_jobs.current_step). */
  step: string | null
  /** Series episodes with saved audio (series jobs; omit for single). */
  episodeCount?: number
}

/** Persisted alarm state (stored at state_json.progress_alarm on the job row). */
export type ProgressAlarmState = {
  fingerprint: string
  /** ISO timestamp of the last observed fingerprint change (= last save). */
  lastSavedAt: string
  /** ISO timestamp of the last alert sent for the current stuck spell. */
  lastAlertAt: string | null
  stuck: boolean
}

export type AlarmDecision =
  | 'ok' // saving (or first observation baseline) — healthy
  | 'stuck_first_alert' // no save ≥30min, no alert sent yet this spell
  | 'stuck_reminder_due' // still stuck, ≥2h since last alert
  | 'stuck_already_alerted' // still stuck, reminder not yet due
  | 'recovered' // fingerprint moved after a stuck spell

export type AlarmEvaluation = {
  decision: AlarmDecision
  /** Minutes since the last observed save (0 when the fingerprint just moved). */
  minutesSinceSave: number
  /** Next persisted alarm state for this job. */
  nextState: ProgressAlarmState
  /** True iff the job SAVED within the last 30 minutes. */
  healthy: boolean
}

export function fingerprintProgress(p: SavedProgress): string {
  return JSON.stringify([
    Math.max(0, Math.floor(Number(p.presentCount) || 0)),
    String(p.audioUrl || ''),
    String(p.step || ''),
    Math.max(0, Math.floor(Number(p.episodeCount) || 0)),
  ])
}

/** ALARM-FIXES-4: persisted waiting-reminder state for waiting_for_external
 *  jobs. Separate key from progress_alarm — waiting is not stuck. */
export type ExternalWaitState = {
  /** ISO timestamp of the last waiting-on-Marc reminder, or null if never sent. */
  lastReminderAt: string | null
}

function parseMs(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : fallback
}

/**
 * Evaluate one job's saved progress. Pure — no I/O.
 *
 * Cold start (prev === null): establishes the baseline fingerprint with
 * lastSavedAt = now. A job that is ALREADY stuck therefore alerts on the
 * first scan ≥30min later, never immediately (no false positive on first
 * sighting).
 */
export function evaluateProgressAlarm(
  prev: ProgressAlarmState | null,
  curr: SavedProgress,
  nowMs: number = Date.now(),
): AlarmEvaluation {
  const fingerprint = fingerprintProgress(curr)

  if (!prev) {
    const baseline: ProgressAlarmState = {
      fingerprint,
      lastSavedAt: new Date(nowMs).toISOString(),
      lastAlertAt: null,
      stuck: false,
    }
    return { decision: 'ok', minutesSinceSave: 0, nextState: baseline, healthy: true }
  }

  // Fingerprint moved → something was SAVED. Spell over (even a past one).
  if (prev.fingerprint !== fingerprint) {
    const nextState: ProgressAlarmState = {
      fingerprint,
      lastSavedAt: new Date(nowMs).toISOString(),
      lastAlertAt: null,
      stuck: false,
    }
    return {
      decision: prev.stuck ? 'recovered' : 'ok',
      minutesSinceSave: 0,
      nextState,
      healthy: true,
    }
  }

  // Fingerprint unchanged → nothing saved since prev.lastSavedAt.
  const lastSavedMs = parseMs(prev.lastSavedAt, nowMs)
  const minutesSinceSave = Math.max(0, (nowMs - lastSavedMs) / 60_000)
  const healthy = nowMs - lastSavedMs < PROGRESS_STALL_MS

  if (healthy) {
    return {
      decision: 'ok',
      minutesSinceSave,
      nextState: { ...prev, stuck: false },
      healthy: true,
    }
  }

  const lastAlertMs = parseMs(prev.lastAlertAt, NaN)
  if (!prev.lastAlertAt || !Number.isFinite(lastAlertMs)) {
    return {
      decision: 'stuck_first_alert',
      minutesSinceSave,
      nextState: { ...prev, stuck: true },
      healthy: false,
    }
  }
  if (nowMs - lastAlertMs >= PROGRESS_REMINDER_MS) {
    return {
      decision: 'stuck_reminder_due',
      minutesSinceSave,
      nextState: { ...prev, stuck: true },
      healthy: false,
    }
  }
  return {
    decision: 'stuck_already_alerted',
    minutesSinceSave,
    nextState: { ...prev, stuck: true },
    healthy: false,
  }
}

/** Healthy ⟺ SAVED within the last 30 minutes. Log/heartbeat freshness is not health. */
export function isProgressHealthy(lastSavedAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!lastSavedAt) return false
  return nowMs - parseMs(lastSavedAt, NaN) < PROGRESS_STALL_MS
}

export function buildStuckMessage(input: {
  jobId: string
  step: string | null
  minutesSinceSave: number
  presentCount: number
  reminder: boolean
}): string {
  const kind = input.reminder ? 'REMINDER' : 'STUCK'
  return (
    `[progress-alarm] ${kind} job ${input.jobId.slice(0, 8)} on step "${input.step ?? 'unknown'}" ` +
    `saved nothing for ${Math.floor(input.minutesSinceSave)}min ` +
    `(presentCount=${input.presentCount}, audio_url/step unchanged). ` +
    `Seg-loop pattern (Nov 2-4 Graves): processing without saving. Needs Marc.`
  )
}

/**
 * ALARM-FIXES-4 — scan triage by status (pure, pins the status contract).
 *  - 'queued_silent': waiting in line, never scanned, never alerted.
 *  - 'external_wait': waiting on Marc, daily WAITING reminder only.
 *  - 'running': BUSY + NOT SAVING alone may alert (see isJobBusy +
 *    evaluateProgressAlarm); idle running jobs stay silent here.
 */
export function scanTriage(status: string | null): 'queued_silent' | 'external_wait' | 'running' {
  if (status === 'queued') return 'queued_silent'
  if (status === 'waiting_for_external') return 'external_wait'
  return 'running'
}

/**
 * ALARM-FIXES-4 — BUSY gate (pure). A running job may only raise a stuck
 * alert when it is BUSY (updated_at / locked_at / logs touched in the last
 * 30min) AND NOT SAVING (fingerprint unchanged 30min). A running job that
 * went quiet is idle — the zombie/stale-lock detector's domain, silent here.
 */
export function lastLogAt(logs: unknown): string | null {
  if (!Array.isArray(logs) || logs.length === 0) return null
  const tail = logs[logs.length - 1] as { at?: unknown }
  return typeof tail?.at === 'string' ? tail.at : null
}

export function isJobBusy(
  input: { updatedAt?: string | null; lockedAt?: string | null; logs?: unknown },
  nowMs: number = Date.now(),
): boolean {
  const touchMs = [
    parseMs(input.updatedAt, NaN),
    parseMs(input.lockedAt, NaN),
    parseMs(lastLogAt(input.logs), NaN),
  ].filter((t) => Number.isFinite(t))
  if (touchMs.length === 0) return false
  return nowMs - Math.max(...touchMs) < BUSY_MS
}

/** ALARM-FIXES-4 — waiting_for_external reminder cadence (pure). */
export function externalReminderDue(
  lastReminderAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastReminderAt) return true
  return nowMs - parseMs(lastReminderAt, NaN) >= EXTERNAL_REMINDER_MS
}

/**
 * ALARM-FIXES-4 — waiting-on-Marc reminder text. Deliberately says WAITING,
 * never STUCK: a cast-wait / external-wait job holding still is expected.
 */
export function buildWaitingMessage(input: {
  jobId: string
  step: string | null
  hoursWaiting: number
}): string {
  return (
    `[progress-alarm] WAITING job ${input.jobId.slice(0, 8)} on step "${input.step ?? 'unknown'}" ` +
    `is waiting on Marc/external for ${Math.floor(input.hoursWaiting)}h. ` +
    `Not stuck — queued-in-line and cast-wait jobs hold still by design. ` +
    `Daily reminder only; no action unless the wait itself is wrong.`
  )
}
