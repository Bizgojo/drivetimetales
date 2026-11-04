/**
 * PROGRESS-ALARM-OWN-STATE-001 — alarm state lives in its OWN table.
 *
 * Table: public.progress_alarm_state (see
 * supabase/migrations/20261104120000_progress_alarm_state.sql —
 * ⚠️ needs Marc-side apply before the scanner can persist across scans).
 *
 * Contract: this module is the ONLY writer of alarm state, and it writes
 * ONLY to progress_alarm_state. It NEVER touches production_jobs
 * (no state_json writes, no logs/updated_at writes). Reads of
 * production_jobs/stories/storage happen in the route, not here.
 *
 * The db parameter is a minimal structural subset of SupabaseClient so
 * tests can pass a mock/spy. Anything that is not progress_alarm_state
 * is rejected by the mock in tests and absent in production code paths.
 */

import type { ProgressAlarmState } from './progressAlarm'

export const ALARM_STATE_TABLE = 'progress_alarm_state'

export type AlarmStateRow = {
  job_id: string
  fingerprint: string
  last_saved_at: string
  last_alert_at: string | null
  stuck: boolean
  wait_last_reminder_at: string | null
  updated_at: string
}

/** Minimal DB surface the store needs (subset of SupabaseClient). */
export type AlarmStateDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: AlarmStateRow | null }>
      }
    }
    upsert: (row: AlarmStateRow, opts?: { onConflict?: string }) => Promise<{ error?: unknown }>
  }
}

export type LoadedAlarmState = {
  progress: ProgressAlarmState | null
  waitLastReminderAt: string | null
}

function toProgress(row: AlarmStateRow): ProgressAlarmState {
  return {
    fingerprint: row.fingerprint,
    lastSavedAt: row.last_saved_at,
    lastAlertAt: row.last_alert_at,
    stuck: row.stuck,
  }
}

/** Load this job's alarm state from the OWN table. Nulls on first sighting.
 *  Never throws: if the table is missing (migration not yet Marc-applied)
 *  the scan falls back to stateless baselines rather than failing. */
export async function loadAlarmState(db: AlarmStateDb, jobId: string): Promise<LoadedAlarmState> {
  try {
    const { data } = await db.from(ALARM_STATE_TABLE).select('*').eq('job_id', jobId).maybeSingle()
    if (!data) return { progress: null, waitLastReminderAt: null }
    return { progress: toProgress(data), waitLastReminderAt: data.wait_last_reminder_at }
  } catch {
    return { progress: null, waitLastReminderAt: null }
  }
}

/**
 * Persist this job's alarm state to the OWN table (upsert by job_id).
 * Pass the progress state from evaluateProgressAlarm's nextState and, for
 * waiting_for_external jobs, the wait reminder timestamp. Unrelated keys
 * are preserved by read-modify-write inside this table only.
 */
export async function saveAlarmState(
  db: AlarmStateDb,
  jobId: string,
  progress: ProgressAlarmState,
  waitLastReminderAt: string | null = null,
  nowMs: number = Date.now(),
): Promise<void> {
  let existing: LoadedAlarmState
  try {
    existing = await loadAlarmState(db, jobId)
  } catch {
    existing = { progress: null, waitLastReminderAt: null }
  }
  const row: AlarmStateRow = {
    job_id: jobId,
    fingerprint: progress.fingerprint,
    last_saved_at: progress.lastSavedAt,
    last_alert_at: progress.lastAlertAt,
    stuck: progress.stuck,
    wait_last_reminder_at: waitLastReminderAt ?? existing.waitLastReminderAt,
    updated_at: new Date(nowMs).toISOString(),
  }
  try {
    await db.from(ALARM_STATE_TABLE).upsert(row, { onConflict: 'job_id' })
  } catch {
    // Never throw from state persistence (missing-table fallback).
  }
}

/** Record only the waiting-reminder timestamp (waiting path never touches stuck state). */
export async function saveWaitReminder(
  db: AlarmStateDb,
  jobId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const existing = await loadAlarmState(db, jobId)
  const at = new Date(nowMs).toISOString()
  if (existing.progress) {
    await saveAlarmState(db, jobId, existing.progress, at, nowMs)
    return
  }
  // No progress baseline yet: store a neutral placeholder so the 24h
  // cadence persists. Fingerprint '' never matches a real scan.
  await saveAlarmState(
    db,
    jobId,
    { fingerprint: '', lastSavedAt: at, lastAlertAt: null, stuck: false },
    at,
    nowMs,
  )
}
