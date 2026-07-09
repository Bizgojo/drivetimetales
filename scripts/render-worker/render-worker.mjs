/**
 * render-worker.mjs — Path 2 local render worker
 *
 * Polls Supabase every 30 seconds for production_jobs where:
 *   current_step = 'render_final_mix'
 *   status       = 'queued'
 *   render_path  = 'local'
 *
 * Picks up one job at a time, calls the render-final-mix core via
 * HTTP to http://localhost:3000/api/asc3/render-final-mix, then
 * advances or fails the job.
 *
 * Managed by launchd: com.endlesstales.renderworker
 * Log: scripts/render-worker/render-worker.log
 *
 * Required env (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const envPath = path.join(projectRoot, '.env.local')

try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch (err) {
  log(`WARN: Could not load .env.local from ${envPath}: ${err.message}`)
}

// ── Config ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000
const LOCAL_RENDER_URL = 'http://localhost:3000/api/asc3/render-final-mix'
const WORKER_ID = `local-render-worker-${process.pid}`

// ── Logger ───────────────────────────────────────────────────────────────────
function log(...args) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [render-worker]`, ...args)
}

// ── Supabase client (initialized after env load) ─────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  log('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Poll loop ────────────────────────────────────────────────────────────────
async function poll() {
  try {
    // Find one queued local render job
    const { data: jobs, error: fetchError } = await supabase
      .from('production_jobs')
      .select('id, story_id, series_id, current_step, status, render_path, state_json, logs')
      .eq('current_step', 'render_final_mix')
      .eq('status', 'queued')
      .eq('render_path', 'local')
      .is('locked_by', null)
      .order('created_at', { ascending: true })
      .limit(1)

    if (fetchError) {
      log('ERROR fetching jobs:', fetchError.message)
      return
    }

    if (!jobs || jobs.length === 0) {
      log('No local render jobs queued.')
      return
    }

    const job = jobs[0]
    log(`Picked up job ${job.id.slice(0, 8)} for story ${job.story_id}`)

    // Lock the job
    const now = new Date().toISOString()
    const { error: lockError } = await supabase
      .from('production_jobs')
      .update({
        status: 'running',
        locked_by: WORKER_ID,
        locked_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'queued') // optimistic lock — only update if still queued

    if (lockError) {
      log(`ERROR locking job ${job.id.slice(0, 8)}:`, lockError.message)
      return
    }

    // Re-fetch to confirm we got the lock
    const { data: locked } = await supabase
      .from('production_jobs')
      .select('locked_by')
      .eq('id', job.id)
      .single()

    if (!locked || locked.locked_by !== WORKER_ID) {
      log(`Job ${job.id.slice(0, 8)} was locked by another worker — skipping.`)
      return
    }

    // Call render-final-mix
    let renderResult = null
    let renderError = null

    try {
      log(`Calling render API for story ${job.story_id}...`)
      const response = await fetch(LOCAL_RENDER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: job.story_id }),
      })
      renderResult = await response.json()
      if (!response.ok || !renderResult.success) {
        renderError = renderResult.error || `HTTP ${response.status}`
      }
    } catch (err) {
      renderError = err.message || String(err)
    }

    const completedAt = new Date().toISOString()

    if (!renderError && renderResult?.success) {
      // Advance to next step (complete_story_package or whichever follows render_final_mix)
      const nextStep = 'complete_story_package'
      log(`Job ${job.id.slice(0, 8)} render succeeded → advancing to ${nextStep}`)

      // ATL-RENDER-STATE-INDEX-001: fenced — only advance if this worker still
      // owns the lock and the job wasn't failed/superseded mid-render.
      // Resurrecting a superseded row to 'queued' collides with
      // production_jobs_one_active_per_story/_series.
      const { data: advancedRows } = await supabase
        .from('production_jobs')
        .update({
          status: 'queued',
          current_step: nextStep,
          locked_by: null,
          locked_at: null,
          error_json: null,
          logs: appendLog(job.logs, `[render-worker] render_final_mix complete at ${completedAt}. Advancing to ${nextStep}.`),
        })
        .eq('id', job.id)
        .eq('locked_by', WORKER_ID)
        .eq('status', 'running')
        .select('id')
      if (!advancedRows || advancedRows.length === 0) {
        log(`Job ${job.id.slice(0, 8)} lock lost/superseded during render — NOT advancing (final_mix.mp3 is in storage for reuse).`)
      }
    } else {
      // Fail the job
      log(`Job ${job.id.slice(0, 8)} render FAILED: ${renderError}`)

      // ATL-RENDER-STATE-INDEX-001: fenced — do not fail a job this worker no
      // longer owns.
      const { data: failedRows } = await supabase
        .from('production_jobs')
        .update({
          status: 'failed',
          locked_by: null,
          locked_at: null,
          error_json: {
            reason: renderError,
            step: 'render_final_mix',
            worker: WORKER_ID,
            failedAt: completedAt,
          },
          logs: appendLog(job.logs, `[render-worker] render_final_mix FAILED at ${completedAt}: ${renderError}`),
        })
        .eq('id', job.id)
        .eq('locked_by', WORKER_ID)
        .eq('status', 'running')
        .select('id')
      if (!failedRows || failedRows.length === 0) {
        log(`Job ${job.id.slice(0, 8)} lock lost/superseded — NOT writing failed status.`)
      }
    }
  } catch (err) {
    log('ERROR in poll loop:', err.message || String(err))
  }
}

function appendLog(existing, message) {
  const entries = Array.isArray(existing) ? [...existing] : []
  entries.push({ at: new Date().toISOString(), event: message, source: 'render-worker' })
  return entries
}

// ── Main loop ────────────────────────────────────────────────────────────────
log(`Starting — worker ID: ${WORKER_ID}`)
log(`Polling Supabase every ${POLL_INTERVAL_MS / 1000}s for render_path=local jobs`)

async function run() {
  await poll()
  setInterval(poll, POLL_INTERVAL_MS)
}

run().catch((err) => {
  log('FATAL:', err.message || String(err))
  process.exit(1)
})
