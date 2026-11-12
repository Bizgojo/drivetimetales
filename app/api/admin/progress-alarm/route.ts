/**
 * DAY1A-PROGRESS-ALARM-001 — No-save stuck-job alarm scanner.
 *
 * GET /api/admin/progress-alarm
 *
 * Scans every non-terminal production job and measures what it actually
 * SAVED (storage presentCount / stories.audio_url / series episode saves /
 * current_step) — NOT log lines, heartbeats, or updated_at freshness.
 *
 * A BUSY job (updated_at/locked_at/logs touched last 30min) that saves
 * nothing for ≥30min gets exactly one alert, then a reminder every 2h
 * until its fingerprint moves. Status is IGNORED for the busy decision —
 * a queued job that is still being touched with frozen saves is the real
 * Nov 2-4 running<->queued flip pattern and MUST alert. Only jobs with NO
 * touch in 30min are silent (incl. untouched queued + idle running).
 * waiting_for_external jobs get a once-a-day WAITING reminder, never stuck.
 *
 * OWN-STATE-001: alarm state lives in the alarm's OWN table
 * (progress_alarm_state keyed by job_id — see lib/progressAlarmStore.ts).
 * This scanner NEVER WRITES production_jobs rows: no job-row writes at all,
 * no logs/updated_at writes. Reads production_jobs/stories/storage only.
 * Alerts go out via PIPELINE_ALERT_WEBHOOK_URL only (no runner-event DB
 * writes, which would themselves touch production_jobs rows).
 *
 * ⚠️ The progress_alarm_state table needs Marc-side apply
 * (supabase/migrations/20261104120000_progress_alarm_state.sql). Until
 * applied, the scanner runs stateless (baseline each scan).
 *
 * Intended trigger: Vercel cron (or manual GET from Production Console).
 * No publish/queue/text changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  evaluateProgressAlarm,
  buildStuckMessage,
  buildWaitingMessage,
  isJobBusy,
  externalReminderDue,
  lastLogAt,
  triageByActivity,
  countSegments,
  sumSeriesSegments,
  failureAlertDue,
  failureAlertKey,
  failureReason,
  buildFailureMessage,
  FAILURE_LOOKBACK_MS,
  type SavedProgress,
} from '@/lib/progressAlarm'
import {
  loadAlarmState,
  saveAlarmState,
  saveWaitReminder,
  type AlarmStateDb,
} from '@/lib/progressAlarmStore'
import { sendWebhookAlert } from '@/lib/pipeline-runner/notify'
import type { RunnerEvent } from '@/lib/pipeline-runner/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// OWN-STATE-001: cast once — the store only ever addresses
// progress_alarm_state, never production_jobs.
const alarmDb = supabase as unknown as AlarmStateDb

const SCANNED_STATUSES = ['queued', 'running', 'waiting_for_external']
const SCAN_LIMIT = 100
const STORAGE_PAGE_LIMIT = 500

type JobRow = {
  id: string
  status: string | null
  current_step: string | null
  story_id: string | null
  series_id: string | null
  updated_at: string | null
  locked_at: string | null
  logs: unknown
  error_json?: any
}

function readStoryId(job: JobRow): string | null {
  const candidates = [job.story_id, job.error_json?.storyId, job.error_json?.story_id]
  for (const c of candidates) {
    const clean = String(c || '').trim()
    if (clean) return clean
  }
  return null
}

export async function GET(_req: NextRequest) {
  try {
    const nowMs = Date.now()
    const { data: jobs, error: jobsError } = await supabase
      .from('production_jobs')
      .select('id,status,current_step,story_id,series_id,updated_at,locked_at,logs,error_json')
      .in('status', SCANNED_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(SCAN_LIMIT)

    if (jobsError) {
      console.error('[progress-alarm] Failed to load jobs:', jobsError)
      return NextResponse.json({ success: false, error: jobsError.message }, { status: 500 })
    }

    const report: Record<string, any>[] = []
    let alertsSent = 0

    for (const job of ((jobs || []) as JobRow[])) {
      const step = job.current_step ?? null
      const busy = isJobBusy(
        { updatedAt: job.updated_at, lockedAt: job.locked_at, logs: job.logs },
        nowMs,
      )

      // BUSY-BY-ACTIVITY triage: waiting_for_external takes the daily
      // WAITING path; NO-touch jobs are silent (any status); BUSY jobs
      // of ANY status (incl. busy queued) are evaluated for saves.
      const triage = triageByActivity(job.status, busy)

      if (triage === 'external_wait') {
        const { waitLastReminderAt } = await loadAlarmState(alarmDb, job.id)
        const due = externalReminderDue(waitLastReminderAt, nowMs)
        const firstTouchMs = [
          new Date(job.updated_at || 0).getTime(),
          new Date(job.locked_at || 0).getTime(),
        ].filter((t) => Number.isFinite(t) && t > 0)
        const hoursWaiting =
          firstTouchMs.length > 0 ? Math.max(0, (nowMs - Math.max(...firstTouchMs)) / 3_600_000) : 0
        let alertSent: string | null = null
        if (due) {
          const message = buildWaitingMessage({ jobId: job.id, step, hoursWaiting })
          const event: RunnerEvent = {
            at: new Date(nowMs).toISOString(),
            source: 'progress-alarm',
            event: 'external_wait',
            jobId: job.id,
            step,
            needs_marc: true,
            message,
          }
          // OWN-STATE-001: webhook only — no production_jobs writes.
          await sendWebhookAlert(event)
          await saveWaitReminder(alarmDb, job.id, nowMs)
          alertSent = 'waiting'
          alertsSent += 1
        }
        report.push({
          jobId: job.id,
          status: job.status,
          step,
          silent: !due,
          healthy: true,
          stuck: false,
          decision: due ? 'waiting_reminder_sent' : 'waiting_quiet',
          alertSent,
          hoursWaiting: Math.round(hoursWaiting * 10) / 10,
        })
        continue
      }

      if (triage === 'silent_idle') {
        report.push({
          jobId: job.id,
          status: job.status,
          step,
          silent: true,
          healthy: true,
          stuck: false,
          decision: job.status === 'queued' ? 'silent_queued' : 'idle_not_busy',
          alertSent: null,
          lastLogAt: lastLogAt(job.logs),
          note:
            job.status === 'queued'
              ? 'queued and untouched >30min: waiting in line, no alert'
              : 'running but quiet >30min: zombie detector owns this, no stuck alert',
        })
        continue
      }

      // BUSY (any status, incl. busy queued): frozen fingerprint 30min ALERTS.
      const storyId = readStoryId(job)
      let presentCount = 0
      let audioUrl: string | null = null
      let episodeCount: number | undefined

      if (storyId) {
        const { data: story } = await supabase
          .from('stories')
          .select('audio_url,story_audio_url')
          .eq('id', storyId)
          .maybeSingle()
        audioUrl = (story?.audio_url as string | null) || (story?.story_audio_url as string | null) || null

        const { data: files } = await supabase.storage
          .from('audio')
          .list(`asc3/${storyId}`, { limit: STORAGE_PAGE_LIMIT })
        presentCount = countSegments(files as { name: string }[] | null)
      }

      if (job.series_id && !storyId) {
        // ALARM-SERIES-SEGMENTS-001: series jobs have no story_id; count
        // saved segments across every episode folder of the series.
        const { data: eps } = await supabase
          .from('stories')
          .select('id')
          .eq('series_id', job.series_id)
        const listings: Array<{ name: string }[] | null> = []
        for (const ep of ((eps || []) as { id: string }[])) {
          const { data: files } = await supabase.storage
            .from('audio')
            .list(`asc3/${ep.id}`, { limit: STORAGE_PAGE_LIMIT })
          listings.push(files as { name: string }[] | null)
        }
        presentCount = sumSeriesSegments(listings)
      }

      if (job.series_id) {
        const { count } = await supabase
          .from('stories')
          .select('id', { count: 'exact', head: true })
          .eq('series_id', job.series_id)
          .not('audio_url', 'is', null)
        episodeCount = count ?? 0
      }

      const curr: SavedProgress = { presentCount, audioUrl, step, episodeCount }
      const { progress: prev } = await loadAlarmState(alarmDb, job.id)
      const evalResult = evaluateProgressAlarm(prev, curr, nowMs)

      // OWN-STATE-001: persist to progress_alarm_state ONLY.
      await saveAlarmState(alarmDb, job.id, evalResult.nextState, null, nowMs)

      let alertSent: string | null = null
      if (evalResult.decision === 'stuck_first_alert' || evalResult.decision === 'stuck_reminder_due') {
        const reminder = evalResult.decision === 'stuck_reminder_due'
        const message = buildStuckMessage({
          jobId: job.id,
          step,
          minutesSinceSave: evalResult.minutesSinceSave,
          presentCount,
          reminder,
        })
        const event: RunnerEvent = {
          at: new Date(nowMs).toISOString(),
          source: 'progress-alarm',
          event: 'progress_stall',
          jobId: job.id,
          step,
          needs_marc: true,
          message,
        }
        // OWN-STATE-001: webhook only — no production_jobs writes.
        await sendWebhookAlert(event)
        // Record the alert timestamp so reminders stay on the 2h cadence.
        const stamped = { ...evalResult.nextState, lastAlertAt: new Date(nowMs).toISOString() }
        await saveAlarmState(alarmDb, job.id, stamped, null, nowMs)
        evalResult.nextState.lastAlertAt = stamped.lastAlertAt
        alertSent = reminder ? 'reminder' : 'first'
        alertsSent += 1
      }

      report.push({
        jobId: job.id,
        status: job.status,
        step,
        presentCount,
        hasAudioUrl: Boolean(audioUrl),
        episodeCount: episodeCount ?? null,
        minutesSinceSave: Math.round(evalResult.minutesSinceSave * 10) / 10,
        healthy: evalResult.healthy,
        stuck: evalResult.nextState.stuck,
        decision: evalResult.decision,
        alertSent,
      })
    }

    // FAILURE-ALERT-001: failed jobs alert once, within one scan of failing (lib/progressAlarm.ts).
    const failedSince = new Date(nowMs - FAILURE_LOOKBACK_MS).toISOString()
    const { data: failedJobs, error: failedError } = await supabase
      .from('production_jobs')
      .select('id,status,current_step,updated_at,error_json')
      .eq('status', 'failed')
      .gte('updated_at', failedSince)
      .order('updated_at', { ascending: false })
      .limit(SCAN_LIMIT)
    if (failedError) console.error('[progress-alarm] Failed to load failed jobs:', failedError)
    let failedAlerts = 0
    for (const job of ((failedJobs || []) as JobRow[])) {
      const { progress: prev } = await loadAlarmState(alarmDb, job.id)
      if (!failureAlertDue(prev?.fingerprint, job.updated_at, nowMs)) continue
      const step = job.current_step ?? null
      const marcRequired = Boolean(job.error_json?.marc_required)
      const message = buildFailureMessage({ jobId: job.id, step, failedAt: job.updated_at, reason: failureReason(job.error_json), marcRequired })
      const event: RunnerEvent = {
        at: new Date(nowMs).toISOString(),
        source: 'progress-alarm',
        event: 'failure',
        jobId: job.id,
        step,
        needs_marc: true,
        message,
      }
      // OWN-STATE-001: webhook only — no production_jobs writes.
      await sendWebhookAlert(event)
      await saveAlarmState(alarmDb, job.id, {
        fingerprint: failureAlertKey(job.updated_at),
        lastSavedAt: String(job.updated_at),
        lastAlertAt: new Date(nowMs).toISOString(),
        stuck: false,
      }, null, nowMs)
      failedAlerts += 1
      alertsSent += 1
      report.push({ jobId: job.id, status: job.status, step, healthy: false, stuck: false, decision: 'failed_alert_sent', alertSent: 'failed', failedAt: job.updated_at })
    }

    const stuck = report.filter((r) => r.stuck)
    return NextResponse.json({
      success: true,
      checkedAt: new Date(nowMs).toISOString(),
      scanned: report.length,
      stuckCount: stuck.length,
      failedAlerts,
      alertsSent,
      // Health rule: healthy ONLY if SAVED in the last 30min.
      healthy: stuck.length === 0 && failedAlerts === 0,
      jobs: report,
    })
  } catch (err: any) {
    console.error('[progress-alarm] GET failed:', err)
    return NextResponse.json({ success: false, error: err?.message || 'progress alarm failed' }, { status: 500 })
  }
}
