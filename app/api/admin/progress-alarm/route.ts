/**
 * DAY1A-PROGRESS-ALARM-001 — No-save stuck-job alarm scanner.
 *
 * GET /api/admin/progress-alarm
 *
 * Scans every non-terminal production job and measures what it actually
 * SAVED (storage presentCount / stories.audio_url / series episode saves /
 * current_step) — NOT log lines, heartbeats, or updated_at freshness.
 *
 * A running job that saves nothing for ≥30min gets exactly one alert, then
 * a reminder every 2h until its fingerprint moves. Alert state persists on
 * the job row (state_json.progress_alarm — no migration). Alerts reuse the
 * existing runner event log + PIPELINE_ALERT_WEBHOOK_URL path.
 *
 * Intended trigger: Vercel cron (or manual GET from Production Console).
 * Read-only except: state_json.progress_alarm updates + runner event log
 * writes on alert transitions. No publish/queue/text changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  evaluateProgressAlarm,
  buildStuckMessage,
  type ProgressAlarmState,
  type SavedProgress,
} from '@/lib/progressAlarm'
import { writeRunnerEvent, sendWebhookAlert } from '@/lib/pipeline-runner/notify'
import type { RunnerEvent } from '@/lib/pipeline-runner/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCANNED_STATUSES = ['queued', 'running', 'waiting_for_external']
const SCAN_LIMIT = 100
const STORAGE_PAGE_LIMIT = 500

type JobRow = {
  id: string
  status: string | null
  current_step: string | null
  story_id: string | null
  series_id: string | null
  state_json?: any
  error_json?: any
}

function readStoryId(job: JobRow): string | null {
  const candidates = [
    job.story_id,
    job.error_json?.storyId,
    job.error_json?.story_id,
    job.state_json?.storyId,
    job.state_json?.story_id,
  ]
  for (const c of candidates) {
    const clean = String(c || '').trim()
    if (clean) return clean
  }
  return null
}

function countSegments(files: { name: string }[] | null): number {
  if (!files) return 0
  let n = 0
  for (const f of files) {
    if (/^segment_\d{4}\.mp3$/.test(f.name)) n += 1
  }
  return n
}

export async function GET(_req: NextRequest) {
  try {
    const nowMs = Date.now()
    const { data: jobs, error: jobsError } = await supabase
      .from('production_jobs')
      .select('id,status,current_step,story_id,series_id,state_json,error_json')
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

      if (job.series_id) {
        const { count } = await supabase
          .from('stories')
          .select('id', { count: 'exact', head: true })
          .eq('series_id', job.series_id)
          .not('audio_url', 'is', null)
        episodeCount = count ?? 0
      }

      const curr: SavedProgress = { presentCount, audioUrl, step, episodeCount }
      const prev = (job.state_json?.progress_alarm as ProgressAlarmState | undefined) || null
      const evalResult = evaluateProgressAlarm(prev, curr, nowMs)

      // Persist (merge — never clobber other state_json keys).
      const nextStateJson = { ...(job.state_json || {}), progress_alarm: evalResult.nextState }
      await supabase.from('production_jobs').update({ state_json: nextStateJson }).eq('id', job.id)

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
        await writeRunnerEvent(supabase, job.id, event)
        await sendWebhookAlert(event)
        // Record the alert timestamp so reminders stay on the 2h cadence.
        const stamped = {
          ...nextStateJson,
          progress_alarm: { ...evalResult.nextState, lastAlertAt: new Date(nowMs).toISOString() },
        }
        await supabase.from('production_jobs').update({ state_json: stamped }).eq('id', job.id)
        evalResult.nextState.lastAlertAt = stamped.progress_alarm.lastAlertAt
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

    const stuck = report.filter((r) => r.stuck)
    return NextResponse.json({
      success: true,
      checkedAt: new Date(nowMs).toISOString(),
      scanned: report.length,
      stuckCount: stuck.length,
      alertsSent,
      // Health rule: healthy ONLY if SAVED in the last 30min.
      healthy: stuck.length === 0,
      jobs: report,
    })
  } catch (err: any) {
    console.error('[progress-alarm] GET failed:', err)
    return NextResponse.json({ success: false, error: err?.message || 'progress alarm failed' }, { status: 500 })
  }
}
