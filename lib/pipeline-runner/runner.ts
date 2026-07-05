/**
 * Pipeline Runner — Core runner loop
 *
 * Called by the production-runner cron route. Holds a distributed lease so
 * only one invocation runs at a time across Vercel function instances.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunnerConfig, RunnerResult, RunnerEvent, StallRecord } from './types'
import { classifyFailure, retryKey, MAX_LOUDNESS_RETRIES_PER_SEGMENT, MAX_TRANSIENT_RETRIES_PER_KEY } from './classify'
import { writeRunnerEvent, sendWebhookAlert } from './notify'

const ACTIVE_STATUSES = ['queued', 'running', 'waiting_for_external']
const LOCK_STALE_MS = 10 * 60 * 1000     // 10 min — matches run-next
const LEASE_DURATION_MS = 850_000         // 850s
const RUNNER_DEADLINE_MS = 740_000        // 740s = 800s maxDuration − 60s grace
const STEP_ADVANCE_SLEEP_MS = 500
const LOCK_CONTENTION_SLEEP_MS = 30_000
const TRANSIENT_RETRY_SLEEP_MS = 5_000
const LOUDNESS_RETRY_SLEEP_MS = 2_000
const STALL_THRESHOLD_MS = 45 * 60 * 1000 // 45 min

function nowIso(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function baseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '') ||
    'https://drivetimetales.vercel.app'
  )
}

// ---------------------------------------------------------------------------
// Lease management
// ---------------------------------------------------------------------------

async function acquireLease(
  supabase: SupabaseClient,
  holderId: string,
): Promise<{ acquired: boolean; currentHolder: string | null }> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS)

  // Per-worker lease — each holderId gets its own row, enabling parallel workers.
  // Job-level locking (locked_at / locked_by on production_jobs) prevents two
  // workers from processing the same job simultaneously.
  const { error } = await supabase
    .from('pipeline_runner_state')
    .upsert({
      id: holderId,
      lease_holder: holderId,
      lease_acquired_at: now.toISOString(),
      lease_expires_at: expiresAt.toISOString(),
      last_heartbeat_at: now.toISOString(),
      updated_at: now.toISOString(),
    })

  if (error) {
    return { acquired: false, currentHolder: null }
  }

  return { acquired: true, currentHolder: holderId }
}

async function releaseLease(
  supabase: SupabaseClient,
  holderId: string,
  summary: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase
      .from('pipeline_runner_state')
      .update({
        lease_holder: null,
        lease_expires_at: null,
        last_run_summary: summary,
        updated_at: nowIso(),
      })
      .eq('id', holderId)
  } catch {
    // Best-effort release
  }
}

// ---------------------------------------------------------------------------
// Job query
// ---------------------------------------------------------------------------

async function fetchOldestActiveJob(
  supabase: SupabaseClient,
  holderId?: string,
): Promise<Record<string, unknown> | null> {
  // Only pick up jobs that are unlocked (or locked by this worker from a prior step).
  // This allows multiple parallel workers to each claim a different job safely.
  const staleLockCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString()

  const { data: candidates, error } = await supabase
    .from('production_jobs')
    .select('*')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) throw new Error(`Failed to query active production jobs: ${error.message}`)
  if (!candidates?.length) return null

  // Find the first job not locked by another worker
  for (const job of candidates as Record<string, unknown>[]) {
    const lockedAt = job.locked_at as string | null
    const lockedBy = job.locked_by as string | null
    const isUnlocked = !lockedAt && !lockedBy
    const isOwnedByMe = holderId && lockedBy === holderId
    const isStale = lockedAt && new Date(lockedAt).getTime() < new Date(staleLockCutoff).getTime()
    if (isUnlocked || isOwnedByMe || isStale) return job
  }
  return null
}

async function fetchJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error) throw new Error(`Failed to fetch production job ${jobId}: ${error.message}`)
  return data as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// run-next call
// ---------------------------------------------------------------------------

type RunNextResult = {
  ok: boolean
  httpStatus: number
  payload: Record<string, unknown>
}

async function callRunNext(jobId: string, holderId: string): Promise<RunNextResult> {
  const url = `${baseUrl()}/api/admin/production-jobs/run-next`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, holderId }),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      httpStatus: 0,
      payload: {
        success: false,
        message: `run-next fetch error: ${msg}`,
        bodySnippet: msg,
      },
    }
  }

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    payload = {
      success: false,
      message: 'run-next returned non-JSON response',
      bodySnippet: text.slice(0, 500),
    }
  }

  return {
    ok: response.ok && payload?.success !== false,
    httpStatus: response.status,
    payload,
  }
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function runPipelineLoop(
  supabase: SupabaseClient,
  config: RunnerConfig,
): Promise<RunnerResult> {
  const { holderId } = config

  // 1. Find the oldest active job
  let job: Record<string, unknown> | null
  try {
    job = await fetchOldestActiveJob(supabase, holderId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { jobId: null, stepsCalled: 0, exitReason: 'error', message: msg }
  }

  if (!job) {
    return {
      jobId: null,
      stepsCalled: 0,
      exitReason: 'no_active_job',
      message: 'No active production jobs found.',
    }
  }

  const jobId = job.id as string

  // 2. Acquire lease
  let leaseAcquired = false
  try {
    const leaseResult = await acquireLease(supabase, holderId)
    if (!leaseResult.acquired) {
      const leaseSkipEvent: RunnerEvent = {
        at: nowIso(),
        source: 'autonomous-runner',
        event: 'lease_skip',
        jobId,
        step: (job.current_step as string | null) ?? null,
        needs_marc: false,
        message: `Lease held by ${leaseResult.currentHolder ?? 'unknown'}. Skipping this invocation.`,
      }
      await writeRunnerEvent(supabase, jobId, leaseSkipEvent)
      return {
        jobId,
        stepsCalled: 0,
        exitReason: 'lease_skip',
        message: leaseSkipEvent.message,
      }
    }
    leaseAcquired = true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { jobId, stepsCalled: 0, exitReason: 'error', message: `Lease acquisition error: ${msg}` }
  }

  // 3. Inner runner loop
  const deadline = Date.now() + RUNNER_DEADLINE_MS
  let stepsCalled = 0
  let exitReason: RunnerResult['exitReason'] = 'budget_exit'
  let exitMessage = 'Budget deadline reached without completing the job.'

  const retryState = new Map<string, number>()
  const stallTracker = new Map<string, StallRecord>()

  try {
    while (Date.now() < deadline) {
      // Re-fetch job state each iteration
      let latestJob: Record<string, unknown>
      try {
        latestJob = await fetchJob(supabase, jobId)
      } catch (err: unknown) {
        exitReason = 'error'
        exitMessage = err instanceof Error ? err.message : String(err)
        break
      }

      const currentStep = (latestJob.current_step as string | null) ?? null
      const jobStatus = (latestJob.status as string) ?? ''

      // Check for completion (but NOT ready_for_review — that step must execute first to update story state)
      if (
        jobStatus === 'complete' ||
        !ACTIVE_STATUSES.includes(jobStatus)
      ) {
        const completeEvent: RunnerEvent = {
          at: nowIso(),
          source: 'autonomous-runner',
          event: 'complete',
          jobId,
          step: currentStep,
          needs_marc: false,
          message: `Job reached terminal state: step=${currentStep}, status=${jobStatus}`,
        }
        await writeRunnerEvent(supabase, jobId, completeEvent)
        exitReason = 'complete'
        exitMessage = completeEvent.message
        break
      }

      // Stall detection
      const stepKey = currentStep ?? '__null__'
      const now = Date.now()
      if (!stallTracker.has(stepKey)) {
        stallTracker.set(stepKey, { step: currentStep, firstSeenAt: now })
      } else {
        const record = stallTracker.get(stepKey)!
        if (now - record.firstSeenAt > STALL_THRESHOLD_MS) {
          const stallEvent: RunnerEvent = {
            at: nowIso(),
            source: 'autonomous-runner',
            event: 'stall',
            jobId,
            step: currentStep,
            needs_marc: true,
            message: `Job stalled on step "${currentStep}" for >${Math.round(STALL_THRESHOLD_MS / 60_000)}min.`,
          }
          await writeRunnerEvent(supabase, jobId, stallEvent)
          await sendWebhookAlert(stallEvent)
          exitReason = 'stall'
          exitMessage = stallEvent.message
          break
        }
      }

      // Call run-next
      let result: RunNextResult
      try {
        result = await callRunNext(jobId, holderId)
      } catch (err: unknown) {
        exitReason = 'error'
        exitMessage = err instanceof Error ? err.message : String(err)
        break
      }

      stepsCalled += 1

      // 409 lock contention — back off, don't count as failure
      if (result.httpStatus === 409) {
        await sleep(LOCK_CONTENTION_SLEEP_MS)
        continue
      }

      // Success
      if (result.ok) {
        const newStep =
          (result.payload?.currentStep as string | null) ??
          (result.payload?.nextStep as string | null) ??
          currentStep

        const advanceEvent: RunnerEvent = {
          at: nowIso(),
          source: 'autonomous-runner',
          event: 'step_advance',
          jobId,
          step: newStep,
          needs_marc: false,
          message: `Step advanced: ${currentStep} → ${newStep}`,
        }
        await writeRunnerEvent(supabase, jobId, advanceEvent)

        // Reset stall tracker if step changed
        if (newStep !== currentStep) {
          stallTracker.clear()
        }

        await sleep(STEP_ADVANCE_SLEEP_MS)
        continue
      }

      // Failure path — classify
      const classification = classifyFailure(result.payload, latestJob)
      const key = retryKey(classification.kind, classification.context, jobId)
      const rawSnippet = (result.payload?.bodySnippet as string | undefined) ??
        (result.payload?.message as string | undefined) ??
        JSON.stringify(result.payload).slice(0, 500)

      if (classification.kind === 'loudness') {
        const attempts = retryState.get(key) ?? 0
        if (attempts < MAX_LOUDNESS_RETRIES_PER_SEGMENT) {
          retryState.set(key, attempts + 1)
          await sleep(LOUDNESS_RETRY_SLEEP_MS)
          continue
        }
      }

      if (classification.kind === 'transient') {
        const attempts = retryState.get(key) ?? 0
        if (attempts < MAX_TRANSIENT_RETRIES_PER_KEY) {
          retryState.set(key, attempts + 1)
          await sleep(TRANSIENT_RETRY_SLEEP_MS)
          continue
        }
      }

      // Cap exceeded or non-retryable
      const failureEvent: RunnerEvent = {
        at: nowIso(),
        source: 'autonomous-runner',
        event: 'failure',
        jobId,
        step: classification.context.step ?? currentStep,
        classification,
        needs_marc: classification.needsMarc,
        message: classification.reason,
        raw_snippet: rawSnippet,
      }
      await writeRunnerEvent(supabase, jobId, failureEvent)
      await sendWebhookAlert(failureEvent)
      exitReason = 'failure'
      exitMessage = classification.reason
      break
    }
  } finally {
    // 4. Release lease
    await releaseLease(supabase, holderId, {
      jobId,
      stepsCalled,
      exitReason,
      exitMessage,
      at: nowIso(),
    })
  }

  return { jobId, stepsCalled, exitReason, message: exitMessage }
}
