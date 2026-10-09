/**
 * COVER-PIPELINE-DECOUPLE-001 — cover_missing_alert (Task 7)
 *
 * Fires after COVER_ALERT_AFTER_FAILED_RETRIES (2) failed cover retries.
 * - Logs to agent_logs shape (see agentLogEntryForCoverAlert).
 * - Notifies Holly (injected callback).
 * - NEVER halts the pipeline: fireCoverMissingAlert never throws; sink
 *   failures are swallowed with a console warning.
 *
 * Code only — this module performs no DB writes itself. Production wiring
 * passes a persistence sink explicitly (Marc-governed).
 */

import { COVER_ALERT_AFTER_FAILED_RETRIES, type CoverFailureClass } from './coverRetry'

export interface CoverMissingAlert {
  kind: 'cover_missing_alert'
  at: string
  seriesId: string | null
  storyId: string | null
  episodeNumber: number | null
  taskId: string | null
  taskKind: string | null
  failedAttempts: number
  failureClass: CoverFailureClass | null
  lastError: string | null
  message: string
  /** Delivery receipt (which sinks were invoked). */
  delivered: { logged: boolean; strategosNotified: boolean }
}

export function buildCoverMissingAlert(input: {
  seriesId?: string | null
  storyId?: string | null
  episodeNumber?: number | null
  taskId?: string | null
  taskKind?: string | null
  failedAttempts: number
  failureClass?: CoverFailureClass | null
  lastError?: string | null
}): CoverMissingAlert {
  const ep = input.episodeNumber ?? null
  return {
    kind: 'cover_missing_alert',
    at: new Date().toISOString(),
    seriesId: input.seriesId ?? null,
    storyId: input.storyId ?? null,
    episodeNumber: ep,
    taskId: input.taskId ?? null,
    taskKind: input.taskKind ?? null,
    failedAttempts: input.failedAttempts,
    failureClass: input.failureClass ?? null,
    lastError: input.lastError ?? null,
    message:
      `Cover ${input.taskKind || 'asset'} for ` +
      `${input.seriesId ? `series ${input.seriesId} ` : ''}` +
      `${ep !== null ? `EP${ep} ` : ''}` +
      `failed ${input.failedAttempts} attempt(s)` +
      `${input.failureClass ? ` (${input.failureClass})` : ''}. ` +
      `Flagged cover_missing — pipeline continues; cover addable later.`,
    delivered: { logged: false, strategosNotified: false },
  }
}

/** True when this attempt count should fire the alert (≥2 failed retries). */
export function shouldFireCoverAlert(failedAttempts: number): boolean {
  return Number(failedAttempts || 0) >= COVER_ALERT_AFTER_FAILED_RETRIES
}

/** Row shape for the agent_logs table (returned, never written here). */
export function agentLogEntryForCoverAlert(alert: CoverMissingAlert): Record<string, unknown> {
  return {
    kind: 'cover_missing_alert',
    at: alert.at,
    series_id: alert.seriesId,
    story_id: alert.storyId,
    episode_number: alert.episodeNumber,
    task_id: alert.taskId,
    task_kind: alert.taskKind,
    failed_attempts: alert.failedAttempts,
    failure_class: alert.failureClass,
    message: alert.message,
    last_error: alert.lastError ? String(alert.lastError).slice(0, 500) : null,
  }
}

export interface CoverAlertSinks {
  /** Persist/log the agent_logs-shaped entry (production wiring injects DB here). */
  logToAgentLogs?: (entry: Record<string, unknown>) => void | Promise<void>
  /** Notify Holly (production wiring injects the dispatcher here). */
  notifyStrategos?: (alert: CoverMissingAlert) => void | Promise<void>
}

/**
 * Fire the alert through the provided sinks. NEVER throws and NEVER halts
 * the pipeline — every sink is individually guarded.
 */
export async function fireCoverMissingAlert(
  alert: CoverMissingAlert,
  sinks: CoverAlertSinks = {},
): Promise<CoverMissingAlert> {
  try {
    await sinks.logToAgentLogs?.(agentLogEntryForCoverAlert(alert))
    alert.delivered.logged = true
  } catch (err) {
    console.warn('[cover_missing_alert] log sink failed (non-blocking):', err instanceof Error ? err.message : String(err))
  }
  try {
    await sinks.notifyStrategos?.(alert)
    alert.delivered.strategosNotified = true
  } catch (err) {
    console.warn('[cover_missing_alert] Holly notify failed (non-blocking):', err instanceof Error ? err.message : String(err))
  }
  console.warn(`[cover_missing_alert] ${alert.message}`)
  return alert
}
