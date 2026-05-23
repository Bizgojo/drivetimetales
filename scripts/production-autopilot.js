#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

require('dotenv').config({ path: '.env.local' })

const ACTIVE_STATUSES = ['queued', 'running', 'waiting_for_external']
const DEFAULT_BASE_URL = process.env.PRODUCTION_AUTOPILOT_BASE_URL || 'http://127.0.0.1:3000'
const DEFAULT_REPORT_DIR = path.join(process.cwd(), 'reports', 'production-autopilot')
const DEFAULT_MAX_RUNTIME_MINUTES = 360
const DEFAULT_MAX_STEPS = 300
const MAX_LOUDNESS_RETRIES_PER_SEGMENT = 3
const MAX_TRANSIENT_RETRIES_PER_KEY = 1

const KNOWN_SAFE_PHRASING_REWRITES = []

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    reportDir: DEFAULT_REPORT_DIR,
    maxRuntimeMinutes: DEFAULT_MAX_RUNTIME_MINUTES,
    maxSteps: DEFAULT_MAX_STEPS,
    jobId: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      i += 1
      return argv[i]
    }

    if (arg === '--job-id' || arg.startsWith('--job-id=')) args.jobId = readValue()
    else if (arg === '--base-url' || arg.startsWith('--base-url=')) args.baseUrl = readValue()
    else if (arg === '--report-dir' || arg.startsWith('--report-dir=')) args.reportDir = readValue()
    else if (arg === '--max-runtime-minutes' || arg.startsWith('--max-runtime-minutes=')) args.maxRuntimeMinutes = Number(readValue())
    else if (arg === '--max-steps' || arg.startsWith('--max-steps=')) args.maxSteps = Number(readValue())
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/production-autopilot.js [options]',
        '',
        'Options:',
        '  --job-id <uuid>                 Process one explicit production job',
        '  --base-url <url>                run-next base URL (default: http://127.0.0.1:3000)',
        '  --max-steps <number>            Max run-next calls (default: 300)',
        '  --max-runtime-minutes <number>  Max runtime minutes (default: 360)',
        '  --report-dir <path>             Markdown report output directory',
      ].join('\n'))
      process.exit(0)
    }
  }

  if (!Number.isFinite(args.maxRuntimeMinutes) || args.maxRuntimeMinutes <= 0) {
    throw new Error('--max-runtime-minutes must be a positive number')
  }
  if (!Number.isFinite(args.maxSteps) || args.maxSteps <= 0) {
    throw new Error('--max-steps must be a positive number')
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '')
  return args
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function nowIso() {
  return new Date().toISOString()
}

function reportDate() {
  return new Date().toISOString().slice(0, 10)
}

function safeString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function summarizeError(value) {
  const text = safeString(value)
  return text.length > 900 ? `${text.slice(0, 900)}...` : text
}

function getNestedReport(payload) {
  return payload?.voiceGenerationReport
    || payload?.belleQualityReport
    || payload?.belleValidationReport
    || payload?.storyResolutionReport
    || payload?.validatorReport
    || payload?.packageReport
    || payload?.error
    || payload?.message
    || payload
}

function failureText(payload, job) {
  return [
    safeString(payload),
    safeString(job?.error_json),
    safeString(getNestedReport(payload)),
  ].join('\n').toLowerCase()
}

function currentFailureContext(payload, job) {
  const error = payload?.error_json || job?.error_json || {}
  const report = payload?.voiceGenerationReport || error.voiceGenerationReport || {}
  const failure = Array.isArray(report.failures) ? report.failures[0] : null
  return {
    step: payload?.currentStep || error.step || job?.current_step || null,
    storyId: payload?.storyId || error.storyId || failure?.storyId || job?.story_id || null,
    seriesId: payload?.seriesId || error.seriesId || job?.series_id || null,
    episodeNumber: payload?.episodeNumber || error.episodeNumber || null,
    segmentNumber: payload?.segmentNumber || error.segmentNumber || failure?.index || null,
    speaker: failure?.speaker || null,
    failure,
    report,
  }
}

function retryKey(kind, context, jobId) {
  return [
    kind,
    jobId,
    context.step || 'unknown_step',
    context.storyId || 'unknown_story',
    context.episodeNumber || 'unknown_episode',
    context.segmentNumber || 'unknown_segment',
  ].join(':')
}

function classifyFailure(payload, job) {
  const text = failureText(payload, job)
  const context = currentFailureContext(payload, job)

  if (/transcript qc failed|detected|expected|tail|coverage|missing final|dropped/.test(text)) {
    return {
      kind: 'semantic_uncertainty',
      retryable: false,
      needsMarc: true,
      reason: 'Transcript QC failure may involve semantic meaning or a dropped phrase.',
      recommendedAction: 'Marc should approve the exact script-line patch or confirm it is a safe normalization case.',
      context,
    }
  }

  if (/quota|billing|insufficient_quota|rate limit|rate_limit|\b429\b/.test(text)) {
    return {
      kind: 'infrastructure',
      retryable: false,
      needsMarc: true,
      reason: 'Infrastructure quota, billing, or rate limit issue.',
      recommendedAction: 'Check provider billing/quota, then rerun this job explicitly.',
      context,
    }
  }

  if (/unexpected token '<'|not valid json|non-json|html|econnreset|etimedout|timeout|fetch failed|socket hang up|storage|supabase|503|502|504/.test(text)) {
    return {
      kind: 'transient',
      retryable: true,
      needsMarc: false,
      reason: 'Transient storage/API response or network failure.',
      recommendedAction: 'Autopilot retries once. If it repeats, Marc should inspect storage/API health.',
      context,
    }
  }

  if (/loudness|lufs|too quiet|lowloudnesssegments/.test(text) && !/transcript qc failed|tail|coverage|semantic/.test(text)) {
    return {
      kind: 'loudness',
      retryable: true,
      needsMarc: false,
      reason: 'Loudness-only QC failure.',
      recommendedAction: `Autopilot retries up to ${MAX_LOUDNESS_RETRIES_PER_SEGMENT} times for this segment.`,
      context,
    }
  }

  if (/validate_story_resolution|story resolution|central conflict|ending|hook|cliffhanger|listener is.*waiting|score_validate_package/.test(text)) {
    return {
      kind: 'story_quality',
      retryable: false,
      needsMarc: true,
      reason: 'Story ending, hook, package, or resolution quality needs editorial judgment.',
      recommendedAction: 'Marc should review the validator report and approve a script repair direction.',
      context,
    }
  }

  if (/validate_belle_quality|belle quality|repair_belle_quality|generic host|emotional|endless tales original/.test(text)) {
    return {
      kind: 'belle_quality',
      retryable: false,
      needsMarc: true,
      reason: 'Belle quality validation needs editorial judgment or failed after repair.',
      recommendedAction: 'Marc should review Belle intro/outro issues and approve repair direction.',
      context,
    }
  }

  if (/cover|art direction|image|thumbnail/.test(text)) {
    return {
      kind: 'cover_art',
      retryable: false,
      needsMarc: true,
      reason: 'Cover/art direction needs Marc review.',
      recommendedAction: 'Marc should provide cover feedback before regenerating.',
      context,
    }
  }

  if (/not implemented|unknown current_step|unknown step|only .* are implemented/.test(text)) {
    return {
      kind: 'unknown_step',
      retryable: false,
      needsMarc: true,
      reason: 'Production job reached a step Autopilot/run-next cannot safely process.',
      recommendedAction: 'Implement the next run-next slice or move the job to a supported step after review.',
      context,
    }
  }

  return {
    kind: 'unknown_qc',
    retryable: false,
    needsMarc: true,
    reason: 'Unknown QC or route failure class.',
    recommendedAction: 'Marc or engineering should inspect the raw error before continuing.',
    context,
  }
}

function extractProgress(payload) {
  const vg = payload?.voiceGeneration || {}
  const report = payload?.voiceGenerationReport || {}
  const progressByEpisode = vg.progressByEpisode || {}
  const episodeKey = String(payload?.episodeNumber || vg.currentEpisodeNumber || '')
  const episodeProgress = episodeKey ? progressByEpisode[episodeKey] : null
  const missing = episodeProgress?.missingSegments || vg.missingSegments || report.missingSegments || payload?.missingSegments || []
  return {
    currentStep: payload?.currentStep || null,
    nextStep: payload?.nextStep || null,
    storyId: payload?.storyId || null,
    seriesId: payload?.seriesId || null,
    episodeNumber: payload?.episodeNumber || vg.currentEpisodeNumber || null,
    segmentNumber: payload?.segmentNumber || null,
    presentCount: episodeProgress?.presentCount || vg.presentCount || report.presentCount || payload?.presentCount || null,
    missingCount: Array.isArray(missing) ? missing.length : null,
    complete: Boolean(payload?.complete),
    episodeComplete: Boolean(payload?.episodeComplete),
  }
}

function createJobReport(job) {
  return {
    jobId: job.id,
    jobType: job.job_type,
    queueItemId: job.queue_item_id || null,
    storyId: job.story_id || null,
    seriesId: job.series_id || null,
    startedStatus: job.status,
    startedStep: job.current_step,
    endedStatus: null,
    endedStep: null,
    runNextCalls: 0,
    retries: [],
    progress: [],
    storiesCompleted: [],
    episodesCompleted: [],
    blockers: [],
  }
}

async function fetchActiveJobs(supabase, jobId) {
  let query = supabase
    .from('production_jobs')
    .select('*')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })

  if (jobId) query = query.eq('id', jobId)

  const { data, error } = await query
  if (error) throw new Error(`Failed to query active production jobs: ${error.message}`)
  return data || []
}

async function fetchJob(supabase, jobId) {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('*')
    .eq('id', jobId)
    .single()
  if (error) throw new Error(`Failed to fetch production job ${jobId}: ${error.message}`)
  return data
}

async function reactivateJob(supabase, jobId) {
  const { data, error } = await supabase
    .from('production_jobs')
    .update({
      status: 'running',
      error_json: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
    .select('id,status,current_step')
    .single()

  if (error) throw new Error(`Failed to reactivate production job ${jobId}: ${error.message}`)
  return data
}

async function callRunNext(baseUrl, jobId) {
  const response = await fetch(`${baseUrl}/api/admin/production-jobs/run-next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId }),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      payload: {
        success: false,
        message: 'run-next returned non-JSON response',
        bodySnippet: text.slice(0, 500),
      },
    }
  }

  return {
    ok: response.ok && payload?.success !== false,
    httpStatus: response.status,
    payload,
  }
}

async function maybeApplyKnownSafeRewrite() {
  return {
    applied: false,
    reason: KNOWN_SAFE_PHRASING_REWRITES.length === 0
      ? 'No exact safe phrasing rewrites are configured for Phase 1.'
      : 'No configured exact safe phrasing rewrite matched this failure.',
  }
}

function recordBlocker(jobReport, classification, rawPayload) {
  const context = classification.context || {}
  jobReport.blockers.push({
    at: nowIso(),
    kind: classification.kind,
    needsMarc: classification.needsMarc,
    reason: classification.reason,
    recommendedAction: classification.recommendedAction,
    step: context.step || null,
    storyId: context.storyId || null,
    seriesId: context.seriesId || null,
    episodeNumber: context.episodeNumber || null,
    segmentNumber: context.segmentNumber || null,
    raw: summarizeError(rawPayload),
  })
}

async function processJob({ supabase, baseUrl, job, ledger, limits, retryState }) {
  const jobReport = createJobReport(job)
  ledger.jobs.push(jobReport)

  while (ledger.runNextCalls < limits.maxSteps && Date.now() < limits.deadlineMs) {
    const latest = await fetchJob(supabase, job.id)
    jobReport.endedStatus = latest.status
    jobReport.endedStep = latest.current_step

    if (!ACTIVE_STATUSES.includes(latest.status)) {
      if (latest.status === 'complete') {
        jobReport.storiesCompleted.push({
          storyId: latest.story_id || null,
          seriesId: latest.series_id || null,
          step: latest.current_step,
        })
      } else if (latest.status === 'failed') {
        const classification = classifyFailure(latest.error_json || {}, latest)
        recordBlocker(jobReport, classification, latest.error_json || latest)
      }
      return
    }

    const result = await callRunNext(baseUrl, latest.id)
    ledger.runNextCalls += 1
    jobReport.runNextCalls += 1

    const progress = extractProgress(result.payload)
    jobReport.progress.push({
      at: nowIso(),
      httpStatus: result.httpStatus,
      success: result.ok,
      ...progress,
    })

    if (progress.episodeComplete) {
      jobReport.episodesCompleted.push({
        at: nowIso(),
        seriesId: progress.seriesId,
        storyId: progress.storyId,
        episodeNumber: progress.episodeNumber,
      })
    }

    if (progress.complete && progress.storyId) {
      jobReport.storiesCompleted.push({
        at: nowIso(),
        storyId: progress.storyId,
        seriesId: progress.seriesId,
        step: progress.nextStep || progress.currentStep,
      })
    }

    if (result.ok) {
      const refreshed = await fetchJob(supabase, latest.id)
      jobReport.endedStatus = refreshed.status
      jobReport.endedStep = refreshed.current_step
      if (!ACTIVE_STATUSES.includes(refreshed.status)) return
      continue
    }

    const failedJob = await fetchJob(supabase, latest.id)
    const classification = classifyFailure(result.payload, failedJob)
    const key = retryKey(classification.kind, classification.context, latest.id)

    if (classification.kind === 'loudness') {
      const attempts = retryState.get(key) || 0
      if (attempts < MAX_LOUDNESS_RETRIES_PER_SEGMENT) {
        retryState.set(key, attempts + 1)
        await reactivateJob(supabase, latest.id)
        jobReport.retries.push({
          at: nowIso(),
          kind: classification.kind,
          attempt: attempts + 1,
          maxAttempts: MAX_LOUDNESS_RETRIES_PER_SEGMENT,
          context: classification.context,
        })
        continue
      }
    }

    if (classification.kind === 'transient') {
      const attempts = retryState.get(key) || 0
      if (attempts < MAX_TRANSIENT_RETRIES_PER_KEY) {
        retryState.set(key, attempts + 1)
        if (failedJob.status === 'failed') await reactivateJob(supabase, latest.id)
        jobReport.retries.push({
          at: nowIso(),
          kind: classification.kind,
          attempt: attempts + 1,
          maxAttempts: MAX_TRANSIENT_RETRIES_PER_KEY,
          context: classification.context,
        })
        continue
      }
    }

    if (classification.kind === 'semantic_uncertainty') {
      const rewrite = await maybeApplyKnownSafeRewrite()
      if (rewrite.applied) {
        await reactivateJob(supabase, latest.id)
        jobReport.retries.push({
          at: nowIso(),
          kind: 'known_safe_phrasing_rewrite',
          context: classification.context,
        })
        continue
      }
      classification.reason = `${classification.reason} ${rewrite.reason}`
    }

    recordBlocker(jobReport, classification, result.payload)
    return
  }

  if (ledger.runNextCalls >= limits.maxSteps) {
    jobReport.blockers.push({
      at: nowIso(),
      kind: 'safety_limit',
      needsMarc: false,
      reason: `Stopped after max run-next calls (${limits.maxSteps}).`,
      recommendedAction: 'Resume Autopilot with a higher limit if this progress is expected.',
    })
  } else if (Date.now() >= limits.deadlineMs) {
    jobReport.blockers.push({
      at: nowIso(),
      kind: 'safety_limit',
      needsMarc: false,
      reason: `Stopped after max runtime (${limits.maxRuntimeMinutes} minutes).`,
      recommendedAction: 'Review the report and resume if no blocker is listed.',
    })
  }
}

function markdownValue(value) {
  if (value == null || value === '') return 'n/a'
  return String(value).replace(/\n/g, ' ')
}

function writeReport(reportDir, ledger) {
  fs.mkdirSync(reportDir, { recursive: true })
  const filePath = path.join(reportDir, `${reportDate()}-morning-report.md`)
  const jobsProcessed = ledger.jobs.length
  const storiesCompleted = ledger.jobs.flatMap((job) => job.storiesCompleted)
  const episodesCompleted = ledger.jobs.flatMap((job) => job.episodesCompleted)
  const blockers = ledger.jobs.flatMap((job) => job.blockers.map((blocker) => ({ ...blocker, jobId: job.jobId })))
  const marcBlockers = blockers.filter((blocker) => blocker.needsMarc)

  const lines = [
    '# Production Autopilot Morning Report',
    '',
    `Date: ${reportDate()}`,
    `Started: ${ledger.startedAt}`,
    `Ended: ${ledger.endedAt || nowIso()}`,
    `Base URL: ${ledger.baseUrl}`,
    `Run-next calls: ${ledger.runNextCalls}`,
    'Public publishes: 0',
    '',
    '## Summary',
    '',
    `- Jobs processed: ${jobsProcessed}`,
    `- Stories completed: ${storiesCompleted.length}`,
    `- Episodes completed: ${episodesCompleted.length}`,
    `- Jobs with blockers: ${blockers.length}`,
    `- Items needing Marc approval: ${marcBlockers.length}`,
    '',
    '## Jobs Processed',
    '',
  ]

  for (const job of ledger.jobs) {
    lines.push(`### ${job.jobId}`)
    lines.push('')
    lines.push(`- Type: ${markdownValue(job.jobType)}`)
    lines.push(`- Started: ${markdownValue(job.startedStatus)} / ${markdownValue(job.startedStep)}`)
    lines.push(`- Ended: ${markdownValue(job.endedStatus)} / ${markdownValue(job.endedStep)}`)
    lines.push(`- Run-next calls: ${job.runNextCalls}`)
    lines.push(`- Story ID: ${markdownValue(job.storyId)}`)
    lines.push(`- Series ID: ${markdownValue(job.seriesId)}`)
    lines.push('')

    if (job.progress.length) {
      const last = job.progress[job.progress.length - 1]
      lines.push(`Last progress: step ${markdownValue(last.currentStep)} -> ${markdownValue(last.nextStep)}, episode ${markdownValue(last.episodeNumber)}, segment ${markdownValue(last.segmentNumber)}, present ${markdownValue(last.presentCount)}, missing ${markdownValue(last.missingCount)}.`)
      lines.push('')
    }

    if (job.retries.length) {
      lines.push('Retries:')
      for (const retry of job.retries) {
        lines.push(`- ${retry.kind}: attempt ${retry.attempt || 1}/${retry.maxAttempts || 1}, step ${markdownValue(retry.context?.step)}, story ${markdownValue(retry.context?.storyId)}, episode ${markdownValue(retry.context?.episodeNumber)}, segment ${markdownValue(retry.context?.segmentNumber)}`)
      }
      lines.push('')
    }
  }

  lines.push('## Completed')
  lines.push('')
  if (!storiesCompleted.length && !episodesCompleted.length) {
    lines.push('- None completed in this run.')
  } else {
    for (const item of storiesCompleted) {
      lines.push(`- Story complete: ${markdownValue(item.storyId)}${item.seriesId ? ` (series ${item.seriesId})` : ''}`)
    }
    for (const item of episodesCompleted) {
      lines.push(`- Episode complete: series ${markdownValue(item.seriesId)}, episode ${markdownValue(item.episodeNumber)}, story ${markdownValue(item.storyId)}`)
    }
  }
  lines.push('')

  lines.push('## Current Blockers')
  lines.push('')
  if (!blockers.length) {
    lines.push('- No blockers recorded.')
  } else {
    for (const blocker of blockers) {
      lines.push(`### ${blocker.jobId}`)
      lines.push('')
      lines.push(`- Needs Marc: ${blocker.needsMarc ? 'yes' : 'no'}`)
      lines.push(`- Kind: ${markdownValue(blocker.kind)}`)
      lines.push(`- Step: ${markdownValue(blocker.step)}`)
      lines.push(`- Story ID: ${markdownValue(blocker.storyId)}`)
      lines.push(`- Series ID: ${markdownValue(blocker.seriesId)}`)
      lines.push(`- Episode: ${markdownValue(blocker.episodeNumber)}`)
      lines.push(`- Segment: ${markdownValue(blocker.segmentNumber)}`)
      lines.push(`- Reason: ${markdownValue(blocker.reason)}`)
      lines.push(`- Exact approval needed: ${blocker.needsMarc ? markdownValue(blocker.recommendedAction) : 'None; operational retry/restart only.'}`)
      lines.push(`- Raw detail: ${markdownValue(blocker.raw)}`)
      lines.push('')
    }
  }

  lines.push('## Recommended Next Action')
  lines.push('')
  if (marcBlockers.length) {
    const first = marcBlockers[0]
    lines.push(`Review ${first.kind} on job ${first.jobId}. ${first.recommendedAction}`)
  } else if (blockers.length) {
    lines.push('Review operational blockers, then rerun Autopilot with the same explicit job ID if appropriate.')
  } else {
    lines.push('No Marc approval is required from this run. Continue Autopilot or advance the next supported production slice.')
  }
  lines.push('')

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
  return filePath
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supabase = createSupabase()
  const startedAt = nowIso()
  const ledger = {
    startedAt,
    endedAt: null,
    baseUrl: args.baseUrl,
    runNextCalls: 0,
    jobs: [],
  }
  const limits = {
    maxSteps: args.maxSteps,
    maxRuntimeMinutes: args.maxRuntimeMinutes,
    deadlineMs: Date.now() + args.maxRuntimeMinutes * 60 * 1000,
  }
  const retryState = new Map()

  const jobs = await fetchActiveJobs(supabase, args.jobId)
  if (args.jobId && jobs.length === 0) {
    const job = await fetchJob(supabase, args.jobId)
    const report = createJobReport(job)
    report.endedStatus = job.status
    report.endedStep = job.current_step
    if (job.status === 'failed') {
      const classification = classifyFailure(job.error_json || {}, job)
      recordBlocker(report, classification, job.error_json || job)
    } else {
      report.blockers.push({
        at: nowIso(),
        kind: 'not_active',
        needsMarc: false,
        reason: `Requested job is not active; status is ${job.status}.`,
        recommendedAction: 'No Autopilot action was taken.',
      })
    }
    ledger.jobs.push(report)
  } else {
    for (const job of jobs) {
      if (ledger.runNextCalls >= limits.maxSteps || Date.now() >= limits.deadlineMs) break
      await processJob({
        supabase,
        baseUrl: args.baseUrl,
        job,
        ledger,
        limits,
        retryState,
      })
    }
  }

  ledger.endedAt = nowIso()
  const reportPath = writeReport(args.reportDir, ledger)
  console.log(JSON.stringify({
    success: true,
    reportPath,
    jobsProcessed: ledger.jobs.length,
    runNextCalls: ledger.runNextCalls,
    blockers: ledger.jobs.reduce((count, job) => count + job.blockers.length, 0),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
