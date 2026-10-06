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
import { ownedJobFence } from '@/lib/jobLockGuard'

const ACTIVE_STATUSES = ['queued', 'running', 'waiting_for_external']
const LOCK_STALE_MS = 10 * 60 * 1000     // 10 min — matches run-next
const LEASE_DURATION_MS = 850_000         // 850s
const RUNNER_DEADLINE_MS = 740_000        // 740s = 800s maxDuration − 60s grace
const STEP_ADVANCE_SLEEP_MS = 500
const LOCK_CONTENTION_SLEEP_MS = 30_000
const TRANSIENT_RETRY_SLEEP_MS = 5_000
const LOUDNESS_RETRY_SLEEP_MS = 2_000
const STALL_THRESHOLD_MS = 45 * 60 * 1000 // 45 min

// ── Self-healing constants ─────────────────────────────────────────────────
// HEARTBEAT_ZOMBIE_MS: If a pipeline_runner_state row has last_heartbeat_at
// older than this, its worker is considered dead. Running jobs locked by that
// worker are reset to queued so another worker can pick them up.
const HEARTBEAT_ZOMBIE_MS = 15 * 60 * 1000 // 15 min

// CIRCUIT_BREAKER_THRESHOLD: If the same job fails this many consecutive times
// on the same step, set needs_attention=true and stop retrying (circuit open).
const CIRCUIT_BREAKER_THRESHOLD = 5

// ── Per-step run-next abort timeouts (ATL-RUNNER-TIMEOUT-001) ──────────────
// Most steps respond well within 90s. The final-mix render steps legitimately
// run longer on long episodes (segment download + ffmpeg concat + two-pass
// loudnorm + upload), so a flat 90s AbortSignal killed healthy renders
// mid-flight. The aborted fetch left the job running+locked; the runner's
// zombie cleanup then reset it, the next invocation re-rendered from scratch,
// and the cycle repeated (zombie lock thrash). Fix: give final-mix steps a
// 600s budget — still inside RUNNER_DEADLINE_MS (740s) — and keep 90s for
// everything else. Add steps to the map if another long-running step appears.
// NOTE: This is the per-step fetch abort only. It deliberately does NOT touch
// LOCK_STALE_MS, LEASE_DURATION_MS, or the heartbeat/zombie thresholds.
export const RUN_NEXT_TIMEOUT_DEFAULT_MS = 90_000
export const RUN_NEXT_TIMEOUT_MS_BY_STEP: Record<string, number> = {
  render_final_mix: 600_000,
  series_render_final_mix: 600_000,
}

export function runNextTimeoutMs(step: string | null | undefined): number {
  if (step && Object.prototype.hasOwnProperty.call(RUN_NEXT_TIMEOUT_MS_BY_STEP, step)) {
    return RUN_NEXT_TIMEOUT_MS_BY_STEP[step]
  }
  return RUN_NEXT_TIMEOUT_DEFAULT_MS
}

function nowIso(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Self-healing: heartbeat-based zombie cleanup
// ---------------------------------------------------------------------------

/**
 * Reset zombie jobs — any production_jobs row that is still status='running'
 * but whose runner's last_heartbeat_at is older than HEARTBEAT_ZOMBIE_MS.
 *
 * This prevents jobs from sitting in a phantom-running state for hours when
 * a Vercel worker crashes or times out without releasing its lock.
 *
 * Safe: only touches jobs whose locked_by matches a zombie runner row.
 * Returns the number of jobs reset.
 */
async function cleanupZombieJobs(supabase: SupabaseClient): Promise<number> {
  const zombieCutoff = new Date(Date.now() - HEARTBEAT_ZOMBIE_MS).toISOString()

  // Find pipeline_runner_state rows with stale heartbeats
  const { data: zombieRunners, error: runnerError } = await supabase
    .from('pipeline_runner_state')
    .select('id, last_heartbeat_at')
    .not('last_heartbeat_at', 'is', null)
    .lt('last_heartbeat_at', zombieCutoff)

  if (runnerError || !zombieRunners?.length) return 0

  const zombieHolderIds = (zombieRunners as Array<{ id: string; last_heartbeat_at: string }>)
    .map(r => r.id)

  if (zombieHolderIds.length === 0) return 0

  // Reset any running jobs locked by these zombie runners back to queued
  const { data: resetJobs, error: resetError } = await supabase
    .from('production_jobs')
    .update({
      status: 'queued',
      locked_at: null,
      locked_by: null,
    })
    .eq('status', 'running')
    .in('locked_by', zombieHolderIds)
    .select('id')

  if (resetError) {
    console.warn('[self-healing] Failed to reset zombie jobs:', resetError.message)
    return 0
  }

  const count = resetJobs?.length ?? 0
  if (count > 0) {
    console.log(`[self-healing] Reset ${count} zombie job(s) from runners: ${zombieHolderIds.join(', ')}`)
  }

  // ── Second pass: unlocked zombie cleanup ──────────────────────────────────
  // Jobs where status='running', locked_by IS NULL, and updated_at is older
  // than UNLOCKED_ZOMBIE_STALE_MS are invisible to both the heartbeat-based
  // cleanup above AND the job pickup query. They must be reset independently.
  const unlockedZombieCount = await cleanupUnlockedZombieJobs(supabase)

  return count + unlockedZombieCount
}

// ---------------------------------------------------------------------------
// Unlocked zombie cleanup — second cleanup pass
// ---------------------------------------------------------------------------

const UNLOCKED_ZOMBIE_STALE_MS = 15 * 60 * 1000 // 15 min

/**
 * Reset "unlocked zombie" jobs: status='running', locked_by IS NULL,
 * updated_at older than UNLOCKED_ZOMBIE_STALE_MS.
 *
 * These are invisible to the heartbeat-based zombie cleaner (which requires
 * locked_by to match a stale runner row) AND to the job pickup query (which
 * skips status='running' rows). A second dedicated pass is required.
 *
 * Resets to status='queued' so any available runner can pick them up.
 * Returns the number of jobs reset.
 */
async function cleanupUnlockedZombieJobs(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - UNLOCKED_ZOMBIE_STALE_MS).toISOString()

  const { data: candidates, error: fetchError } = await supabase
    .from('production_jobs')
    .select('id, updated_at')
    .eq('status', 'running')
    .is('locked_by', null)
    .lt('updated_at', cutoff)

  if (fetchError || !candidates?.length) return 0

  let resetCount = 0
  for (const job of candidates as Array<{ id: string; updated_at: string }>) {
    const ageMin = Math.round((Date.now() - new Date(job.updated_at).getTime()) / 60_000)

    const { error: updateError } = await supabase
      .from('production_jobs')
      .update({
        status: 'queued',
        locked_by: null,
        locked_at: null,
      })
      .eq('id', job.id)
      .eq('status', 'running')   // guard: only reset if still running
      .is('locked_by', null)     // guard: only reset if still unlocked

    if (!updateError) {
      console.log(`[self-healing] UNLOCKED_ZOMBIE_RESET: job ${job.id} reset after ${ageMin}min with no lock`)
      resetCount++
    } else {
      console.warn(`[self-healing] Failed to reset unlocked zombie ${job.id}:`, updateError.message)
    }
  }

  return resetCount
}

// ---------------------------------------------------------------------------
// Self-healing: circuit breaker — track consecutive step failures per job
// ---------------------------------------------------------------------------

type CircuitBreakerState = {
  step: string | null
  consecutiveFailures: number
}

/**
 * Update the circuit breaker state for a job.
 *
 * ATLAS-P3-REPAIR-002 fencing symmetry: every write here is fenced with
 * ownedJobFence (same predicate as the render writes in run-next) — a stale
 * runner whose lock was reclaimed mid-flight must NOT mark another worker's
 * job failed or scribble circuit state onto a superseded row. A 0-row write
 * returns lockLost=true and the caller stops stepping the job.
 *
 * @returns Whether the circuit is now open (threshold reached → stop retrying).
 */
async function updateCircuitBreaker(
  supabase: SupabaseClient,
  jobId: string,
  failedStep: string | null,
  currentState: CircuitBreakerState,
  holderId: string,
  lockedAt: string | null,
): Promise<{ open: boolean; consecutiveFailures: number; lockLost: boolean }> {
  let { step, consecutiveFailures } = currentState

  if (step === failedStep) {
    consecutiveFailures += 1
  } else {
    // Step changed — reset counter
    step = failedStep
    consecutiveFailures = 1
  }

  const circuitOpen = consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD
  const fence = ownedJobFence({ id: jobId, locked_by: holderId, locked_at: lockedAt }, holderId)

  // Persist updated circuit state in state_json so it survives across runner invocations
  // Only update if we're approaching or at the threshold to reduce write overhead
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD - 1) {
    const { data: job } = await supabase
      .from('production_jobs')
      .select('state_json,error_json')
      .eq('id', jobId)
      .single()
    // TRANSIENT-FAILURE-001: keep an outside-failure tag if one was recorded.
    const priorErrorJson = (job?.error_json as Record<string, unknown> | null) ?? null
    const keepTransient = priorErrorJson?.transient === true
      ? { transient: true, transient_cause: priorErrorJson.transient_cause ?? null, marc_required: false }
      : {}

    const existingState = (job?.state_json as Record<string, unknown>) ?? {}

    const { data: fencedRows } = await supabase
      .from('production_jobs')
      .update({
        state_json: {
          ...existingState,
          circuitBreaker: { step: failedStep, consecutiveFailures },
        },
        ...(circuitOpen ? {
          status: 'failed',
          // ATL-RENDER-STATE-INDEX-001: release the lock when opening the
          // circuit — the (possibly still running) zombie invocation must not
          // keep an ownership claim on a terminal row. run-next writes are
          // fenced on locked_by/locked_at/status='running', so the zombie's
          // late completion write becomes a harmless 0-row no-op.
          locked_at: null,
          locked_by: null,
          needs_attention: true,
          needs_attention_reason: `Circuit breaker open: step "${failedStep}" failed ${consecutiveFailures} consecutive times. Stopped retrying — needs manual inspection.`,
          error_json: {
            kind: 'circuit_breaker_open',
            message: `Circuit breaker triggered: ${consecutiveFailures} consecutive failures on step "${failedStep}". Job halted.`,
            step: failedStep,
            marc_required: true,
            at: nowIso(),
            ...keepTransient,
          },
        } : {}),
      })
      .match(fence)
      .select('id')

    if (!fencedRows || fencedRows.length === 0) {
      // Lock lost while failing — another worker reclaimed the job (or the
      // job left running state). Our verdict is stale; do not retry, do not
      // re-write. The current lock owner decides the job's fate.
      console.warn(`[circuit-breaker] Job ${jobId.slice(0, 8)} lock lost during breaker update (fence matched 0 rows) — abandoning, owner decides.`)
      return { open: false, consecutiveFailures, lockLost: true }
    }

    if (circuitOpen) {
      console.error(`[circuit-breaker] Job ${jobId.slice(0, 8)} OPEN after ${consecutiveFailures} consecutive failures on step "${failedStep}". needs_attention=true.`)
    }
  }

  return { open: circuitOpen, consecutiveFailures, lockLost: false }
}

function baseUrl(): string {
  // ORION-RUNNER-ORIGIN-001 (2026-07-11): in production, internal pipeline
  // calls (run-next → generate-voices etc.) must ALWAYS hit the current
  // production deployment via the canonical domain. Deriving this from
  // NEXT_PUBLIC_APP_URL proved dangerous: pointed at a stale deployment it
  // silently pins the ENTIRE pipeline to old code — QC fixes shipped to main
  // (e.g. spoken-number normalization, 3f612fb4) were live on the public
  // domain while voice-gen kept failing on pre-fix code (Consciousness ep2
  // seg50, REPEATED_IDENTICAL_TRUNCATION, Jul 10-11). Canonical domain always
  // tracks the latest production deployment; env override remains for
  // local/preview only.
  if (process.env.VERCEL_ENV === 'production') return 'https://app.endless-tales.com'
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
  preferJobId?: string | null,
): Promise<Record<string, unknown> | null> {
  const staleLockCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString()

  // Step 0: Am I ALREADY running a job? If so, re-claim it immediately.
  // This prevents two concurrent invocations of the same worker from each picking up a separate job.
  if (holderId) {
    const { data: myRunningJob } = await supabase
      .from('production_jobs')
      .select('*')
      .eq('status', 'running')
      .eq('locked_by', holderId)
      .gte('locked_at', staleLockCutoff)
      .order('locked_at', { ascending: false })
      .limit(1)
      .single()
    if (myRunningJob) return myRunningJob as Record<string, unknown>
  }

  // Runner affinity: if this worker last worked on a specific job, try to re-claim it first.
  // This keeps each runner sticky to one story until it reaches RFR.
  if (preferJobId) {
    const { data: preferred } = await supabase
      .from('production_jobs')
      .select('*')
      .eq('id', preferJobId)
      .in('status', ACTIVE_STATUSES)
      .single()
    if (preferred) {
      const lockedAt = (preferred as Record<string, unknown>).locked_at as string | null
      const lockedBy = (preferred as Record<string, unknown>).locked_by as string | null
      const status = (preferred as Record<string, unknown>).status as string
      const isUnlocked = !lockedAt && !lockedBy
      const isOwnedByMe = holderId && lockedBy === holderId
      const isStale = lockedAt && new Date(lockedAt).getTime() < new Date(staleLockCutoff).getTime()
      // Don't re-claim a running job via affinity unless we own the lock.
      // A running+unlocked job is a zombie — let the queued candidates pick it up normally.
      const isZombie = status === 'running' && !lockedBy
      if (!isZombie && (isUnlocked || isOwnedByMe || isStale)) return preferred as Record<string, unknown>
    }
  }

  // Step 1: Find all story/series IDs currently running by OTHER workers (not stale).
  // This prevents two runners from ever working on the same story simultaneously.
  const { data: runningByOthers } = await supabase
    .from('production_jobs')
    .select('story_id, series_id')
    .eq('status', 'running')
    .not('locked_by', 'is', null)
    .neq('locked_by', holderId || '')
    .gte('locked_at', staleLockCutoff)

  const busyStoryIds = new Set<string>()
  for (const job of (runningByOthers || []) as Array<{ story_id: string | null; series_id: string | null }>) {
    const sid = job.story_id || job.series_id
    if (sid) busyStoryIds.add(sid)
  }

  // Step 2: Get only QUEUED jobs as candidates (running jobs belong to their holders).
  const { data: candidates, error } = await supabase
    .from('production_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) throw new Error(`Failed to query active production jobs: ${error.message}`)
  if (!candidates?.length) return null

  // Step 3: Pick the first queued job whose story isn't already being run by another worker.
  for (const job of candidates as Record<string, unknown>[]) {
    if (preferJobId && (job as Record<string, unknown>).id === preferJobId) continue // already tried above
    const lockedAt = (job as Record<string, unknown>).locked_at as string | null
    const lockedBy = (job as Record<string, unknown>).locked_by as string | null
    const storyId = ((job as Record<string, unknown>).story_id || (job as Record<string, unknown>).series_id) as string | null
    const isUnlocked = !lockedAt && !lockedBy
    const isOwnedByMe = holderId && lockedBy === holderId
    const isStale = lockedAt && new Date(lockedAt).getTime() < new Date(staleLockCutoff).getTime()
    // Skip if another runner is already running this story
    if (storyId && busyStoryIds.has(storyId) && !isOwnedByMe) continue
    if (isUnlocked || isOwnedByMe || isStale) return job as Record<string, unknown>
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

/** Fetch-failure kinds for run-next calls (ATLAS-P3-REPAIR-002). */
export type RunNextFetchErrorKind = 'timeout' | 'killed' | 'oom' | 'connection' | 'unknown'

/** Heartbeat cadence while a run-next fetch is in flight (ATLAS-P3-REPAIR-002). */
export const RUN_NEXT_FETCH_HEARTBEAT_MS = 60_000

/**
 * ATLAS-P3-REPAIR-002: distinguish WHY a run-next fetch failed so the
 * failure path can tell a slow render (timeout — likely transient) from a
 * dead worker (connection) from resource exhaustion (kill/OOM).
 *
 * Pure (no I/O) — unit-tested in __tests__/atlas-p3-repair-002.test.ts.
 */
export function classifyRunNextFetchError(
  err: unknown,
  step: string | null,
  budgetMs: number,
): { kind: RunNextFetchErrorKind; message: string } {
  const msg = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : ''
  const causeMsg = err instanceof Error && (err as { cause?: unknown }).cause != null
    ? String((err as { cause?: unknown }).cause)
    : ''
  const hay = `${name} ${msg} ${causeMsg}`
  const stepLabel = step ?? 'unknown_step'
  if (/TimeoutError|AbortError|aborted|exceeded.*timeout|timed out/i.test(hay) || /timeout/i.test(name)) {
    return {
      kind: 'timeout',
      message: `run-next fetch timeout: step "${stepLabel}" exceeded its ${budgetMs}ms abort budget (server may still be rendering; job lock decides ownership).`,
    }
  }
  if (/out of memory|heap out of memory|ENOMEM|\bOOM\b/i.test(hay)) {
    return { kind: 'oom', message: `run-next fetch OOM signature at step "${stepLabel}": ${msg}` }
  }
  if (/SIGKILL|SIGTERM|process killed|terminated/i.test(hay)) {
    return { kind: 'killed', message: `run-next fetch killed at step "${stepLabel}": ${msg}` }
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR_[A-Z_]+|network/i.test(hay)) {
    return { kind: 'connection', message: `run-next fetch connection error at step "${stepLabel}": ${msg}` }
  }
  return { kind: 'unknown', message: `run-next fetch error at step "${stepLabel}": ${msg}` }
}

async function callRunNext(
  jobId: string,
  holderId: string,
  currentStep: string | null,
  opts?: { supabase?: SupabaseClient },
): Promise<RunNextResult> {
  const url = `${baseUrl()}/api/admin/production-jobs/run-next`
  // ATL-RUNNER-TIMEOUT-001: per-step abort budget (600s for final-mix
  // renders, 90s default). See runNextTimeoutMs above.
  const budgetMs = runNextTimeoutMs(currentStep)

  // ATLAS-P3-REPAIR-002 render heartbeat: while blocked in a long fetch the
  // runner cannot reach its per-step heartbeat refresh — keep the worker row
  // alive so self-healing does not reclaim this runner's jobs mid-render.
  // Fire-and-forget; never blocks or fails the call.
  const heartbeatSupabase = opts?.supabase
  const heartbeatTimer = heartbeatSupabase
    ? setInterval(() => {
        heartbeatSupabase.from('pipeline_runner_state')
          .update({ last_heartbeat_at: nowIso(), updated_at: nowIso() })
          .eq('id', holderId)
          .then(() => {/* in-flight heartbeat refreshed */})
          .catch(() => {/* non-fatal */})
      }, RUN_NEXT_FETCH_HEARTBEAT_MS)
    : undefined
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, holderId }),
        signal: AbortSignal.timeout(budgetMs),
      })
    } catch (err: unknown) {
      const classified = classifyRunNextFetchError(err, currentStep, budgetMs)
      const rawMsg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        httpStatus: 0,
        payload: {
          success: false,
          message: classified.message,
          bodySnippet: rawMsg,
          fetchErrorKind: classified.kind,
          fetchStep: currentStep,
          fetchTimeoutMs: budgetMs,
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
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
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

  // Acquire per-worker lease once for the full invocation
  try {
    const leaseResult = await acquireLease(supabase, holderId)
    if (!leaseResult.acquired) {
      return {
        jobId: null,
        stepsCalled: 0,
        exitReason: 'lease_skip',
        message: `Lease held by ${leaseResult.currentHolder ?? 'unknown'}. Skipping this invocation.`,
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { jobId: null, stepsCalled: 0, exitReason: 'error', message: `Lease acquisition error: ${msg}` }
  }

  // One deadline for the entire invocation.
  // Runner chains through multiple jobs until budget runs out or queue is empty.
  const deadline = Date.now() + RUNNER_DEADLINE_MS
  let totalStepsCalled = 0
  let lastJobId: string | null = null
  let lastExitReason: RunnerResult['exitReason'] = 'no_active_job'
  let lastExitMessage = 'No active production jobs found.'
  let jobsCompleted = 0

  try {
    // ── Self-healing: zombie job cleanup ──────────────────────────────────────
    // Run once per invocation before entering the job loop.
    // Resets running jobs whose runner's heartbeat is stale (> HEARTBEAT_ZOMBIE_MS).
    try {
      await cleanupZombieJobs(supabase)
    } catch (cleanupErr: unknown) {
      // Non-fatal — log and continue
      console.warn('[self-healing] Zombie cleanup error (non-fatal):', cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr))
    }

    // ── Outer job loop ────────────────────────────────────────────────────────
    while (Date.now() < deadline) {
      // Find the next available job
      let job: Record<string, unknown> | null
      try {
        // Pass lastJobId so runner re-claims its own story first (affinity)
        job = await fetchOldestActiveJob(supabase, holderId, lastJobId)
      } catch (err: unknown) {
        lastExitReason = 'error'
        lastExitMessage = err instanceof Error ? err.message : String(err)
        break
      }

      if (!job) {
        lastExitReason = jobsCompleted > 0 ? 'complete' : 'no_active_job'
        lastExitMessage = jobsCompleted > 0
          ? `Completed ${jobsCompleted} job(s). Queue empty.`
          : 'No active production jobs found.'
        break
      }

      const jobId = job.id as string
      lastJobId = jobId

      // Per-job state — reset for each new job
      let stepsCalled = 0
      let exitReason: RunnerResult['exitReason'] = 'budget_exit'
      let exitMessage = 'Budget deadline reached without completing the job.'
      const retryState = new Map<string, number>()
      const stallTracker = new Map<string, StallRecord>()

      // Circuit breaker state — tracks consecutive failures on the same step.
      // Seeded from state_json.circuitBreaker if a previous invocation persisted it.
      const persistedCb = (job.state_json as Record<string, unknown> | null)?.circuitBreaker as
        { step: string | null; consecutiveFailures: number } | undefined
      let cbState: CircuitBreakerState = {
        step: persistedCb?.step ?? null,
        consecutiveFailures: persistedCb?.consecutiveFailures ?? 0,
      }

      // ── Inner step loop ──────────────────────────────────────────────────────
      while (Date.now() < deadline) {
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

        // Check for completion
        if (jobStatus === 'complete' || !ACTIVE_STATUSES.includes(jobStatus)) {
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

        // Refresh heartbeat before each run-next call so zombie detection stays accurate.
        // Fire-and-forget — don't block the pipeline on this update.
        supabase.from('pipeline_runner_state')
          .update({ last_heartbeat_at: nowIso(), updated_at: nowIso() })
          .eq('id', holderId)
          .then(() => {/* heartbeat refreshed */})
          .catch(() => {/* non-fatal */})

        // Call run-next (ATLAS-P3-REPAIR-002: pass supabase so the fetch
        // heartbeat keeps this worker's row alive during long renders)
        let result: RunNextResult
        try {
          result = await callRunNext(jobId, holderId, currentStep, { supabase })
        } catch (err: unknown) {
          exitReason = 'error'
          exitMessage = err instanceof Error ? err.message : String(err)
          break
        }

        stepsCalled += 1

        // 409 lock contention — back off
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

          if (newStep !== currentStep) {
            stallTracker.clear()
            // Step advanced → reset circuit breaker consecutive failure count
            cbState = { step: newStep, consecutiveFailures: 0 }
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

        // ── Circuit breaker: count consecutive failures on this step ─────────
        // If the same step fails CIRCUIT_BREAKER_THRESHOLD times in a row,
        // mark the job needs_attention and stop retrying (circuit open).
        const failedStep = classification.context.step ?? currentStep
        let cbResult: { open: boolean; consecutiveFailures: number; lockLost: boolean } = { open: false, consecutiveFailures: 0, lockLost: false }
        try {
          // ATLAS-P3-REPAIR-002: fence the breaker on our lock (symmetric
          // with render writes) — latestJob carries the fencing token.
          cbResult = await updateCircuitBreaker(
            supabase,
            jobId,
            failedStep,
            cbState,
            holderId,
            (latestJob.locked_at as string | null) ?? null,
          )
          cbState = { step: failedStep, consecutiveFailures: cbResult.consecutiveFailures }
        } catch (cbErr: unknown) {
          console.warn('[circuit-breaker] Update error (non-fatal):', cbErr instanceof Error ? cbErr.message : String(cbErr))
        }

        if (cbResult.lockLost) {
          // Another worker owns the job now — stop stepping it. No failure
          // event (we must not write verdicts onto a job we don't own).
          exitReason = 'error'
          exitMessage = `Lock lost on job ${jobId.slice(0, 8)} during circuit-breaker update — job reclaimed by another worker. Stopping.`
          break
        }

        if (cbResult.open) {
          // Circuit is open — job has been marked needs_attention by updateCircuitBreaker.
          // Stop retrying; exit failure loop.
          exitReason = 'failure'
          exitMessage = `Circuit breaker open: step "${failedStep}" failed ${cbResult.consecutiveFailures} consecutive times. Job needs attention.`
          break
        }

        // Non-retryable failure
        const failureEvent: RunnerEvent = {
          at: nowIso(),
          source: 'autonomous-runner',
          event: 'failure',
          jobId,
          step: failedStep,
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
      } // end inner step loop

      // Accumulate and decide whether to chain to next job
      totalStepsCalled += stepsCalled
      lastExitReason = exitReason
      lastExitMessage = exitMessage

      if (exitReason === 'complete') {
        jobsCompleted++
        // Chain to next job if enough budget remains (30s grace for overhead)
        if (Date.now() + 30_000 < deadline) continue
      }
      break
    } // end outer job loop

  } finally {
    await releaseLease(supabase, holderId, {
      jobId: lastJobId,
      stepsCalled: totalStepsCalled,
      jobsCompleted,
      exitReason: lastExitReason,
      exitMessage: lastExitMessage,
      at: nowIso(),
    })
  }

  return { jobId: lastJobId, stepsCalled: totalStepsCalled, exitReason: lastExitReason, message: lastExitMessage }
}
