import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordProductionLearningEvent } from '@/lib/productionLearning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

function clean(value: unknown) {
  return String(value || '').trim()
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function failureTypeFor(errorJson: any, currentStep: string | null) {
  const text = JSON.stringify(errorJson || {}).toLowerCase()
  if (/repeated_identical_truncation|truncation/.test(text)) return 'whisper_truncation'
  if (/transcript qc|detected|expected|coverage|tail/.test(text)) return 'transcript_qc'
  if (/loudness|lufs|too quiet/.test(text)) return 'loudness_qc'
  if (/belle/.test(text) || /belle/.test(String(currentStep || '').toLowerCase())) return 'belle_quality'
  if (/ffmpeg|render|mix/.test(text) || /render|mix/.test(String(currentStep || '').toLowerCase())) return 'mix_render'
  if (/story resolution|validator|score_validate/.test(text) || /validate|score/.test(String(currentStep || '').toLowerCase())) return 'script_validation'
  if (/fetch failed|timeout|network|storage|supabase|quota|rate/.test(text)) return 'infrastructure'
  return 'unknown'
}

function groupCount<T extends Record<string, any>>(rows: T[], keyFn: (row: T) => string) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyFn(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function stageDurations(events: any[]) {
  const byStage = new Map<string, { stage: string; count: number; totalSeconds: number; failed: number }>()
  for (const event of events) {
    const stage = clean(event.stage) || 'unknown'
    const duration = numberOrNull(event.duration_seconds)
    if (duration === null) continue
    const current = byStage.get(stage) || { stage, count: 0, totalSeconds: 0, failed: 0 }
    current.count += 1
    current.totalSeconds += duration
    if (event.status === 'failed') current.failed += 1
    byStage.set(stage, current)
  }

  return Array.from(byStage.values())
    .map(stage => ({
      ...stage,
      averageSeconds: stage.count > 0 ? Math.round(stage.totalSeconds / stage.count) : 0,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
}

function trendFromSeries(events: any[]) {
  const byJob = new Map<string, { jobId: string; seriesTitle: string | null; seconds: number; lastAt: string | null }>()
  for (const event of events) {
    const jobId = clean(event.job_id)
    const duration = numberOrNull(event.duration_seconds)
    if (!jobId || duration === null) continue
    const current = byJob.get(jobId) || { jobId, seriesTitle: event.series_title || null, seconds: 0, lastAt: null }
    current.seconds += duration
    current.lastAt = event.completed_at || event.created_at || current.lastAt
    if (!current.seriesTitle && event.series_title) current.seriesTitle = event.series_title
    byJob.set(jobId, current)
  }

  const rows = Array.from(byJob.values())
    .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')))

  const lastFive = rows.slice(0, 5)
  const previousFive = rows.slice(5, 10)
  const avg = (items: typeof rows) => items.length ? Math.round(items.reduce((sum, item) => sum + item.seconds, 0) / items.length) : null
  const lastFiveAverageSeconds = avg(lastFive)
  const previousFiveAverageSeconds = avg(previousFive)
  const trend =
    lastFiveAverageSeconds === null || previousFiveAverageSeconds === null ? 'insufficient_data' :
      lastFiveAverageSeconds < previousFiveAverageSeconds * 0.95 ? 'faster' :
        lastFiveAverageSeconds > previousFiveAverageSeconds * 1.05 ? 'slower' :
          'unchanged'

  return { latestJobs: rows.slice(0, 10), lastFiveAverageSeconds, previousFiveAverageSeconds, trend }
}

export async function GET() {
  try {
    const [failedJobs, learningEvents, timingEvents] = await Promise.all([
      supabase
        .from('production_jobs')
        .select('id,story_id,series_id,status,current_step,error_json,updated_at,created_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('production_learning_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('production_job_events')
        .select('job_id,series_title,stage,status,duration_seconds,created_at,completed_at')
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (failedJobs.error) throw failedJobs.error
    if (learningEvents.error) throw learningEvents.error
    if (timingEvents.error) throw timingEvents.error

    const failures = failedJobs.data || []
    const events = learningEvents.data || []
    const timing = timingEvents.data || []
    const learnedFailureTypes = new Set(events.map((event: any) => clean(event.failure_type)))

    const latestFailures = failures.slice(0, 20).map((job: any) => ({
      jobId: job.id,
      storyId: job.story_id,
      seriesId: job.series_id,
      stage: job.current_step,
      failureType: failureTypeFor(job.error_json, job.current_step),
      updatedAt: job.updated_at,
      error: job.error_json?.message || job.error_json?.reason || job.error_json?.voiceGenerationReport?.failures?.[0]?.error || null,
    }))
    const repeatedFailureTypes = groupCount(latestFailures, failure => failure.failureType).filter(item => item.count > 1)
    const unresolvedRecurringFailures = repeatedFailureTypes.filter(item => !learnedFailureTypes.has(item.key))
    const bottlenecks = stageDurations(timing)

    return json({
      success: true,
      latestFailures,
      repeatedFailureTypes,
      fixesApplied: events.slice(0, 25),
      unresolvedRecurringFailures,
      topBottleneckStages: bottlenecks.slice(0, 10),
      productionTimeTrend: trendFromSeries(timing),
    })
  } catch (error) {
    console.error('[production-learning] GET failed:', error)
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to load production learning report' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const failureType = clean(body.failure_type || body.failureType)
    if (!failureType) return json({ success: false, error: 'failure_type required' }, 400)

    const confidence = body.confidence === undefined ? undefined : Number(body.confidence)
    if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      return json({ success: false, error: 'confidence must be between 0 and 1' }, 400)
    }

    const result = await recordProductionLearningEvent(supabase, {
      job_id: clean(body.job_id || body.jobId) || null,
      story_id: clean(body.story_id || body.storyId) || null,
      series_id: clean(body.series_id || body.seriesId) || null,
      series_title: clean(body.series_title || body.seriesTitle) || null,
      episode_title: clean(body.episode_title || body.episodeTitle) || null,
      stage: clean(body.stage) || null,
      failure_type: failureType,
      root_cause: clean(body.root_cause || body.rootCause) || null,
      fix_applied: clean(body.fix_applied || body.fixApplied) || null,
      fix_type: clean(body.fix_type || body.fixType) || null,
      prevention_rule: clean(body.prevention_rule || body.preventionRule) || null,
      reusable: Boolean(body.reusable),
      confidence,
    })

    if (result.error) throw result.error
    return json({ success: true, event: result.data })
  } catch (error) {
    console.error('[production-learning] POST failed:', error)
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to record production learning event' }, 500)
  }
}
