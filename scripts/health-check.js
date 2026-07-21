#!/usr/bin/env node
/**
 * scripts/health-check.js — Orion Health Check (ATL-CONSOLE-AUDIT-001)
 *
 * Usage:
 *   node scripts/health-check.js
 *   node scripts/health-check.js --since "2026-07-21T18:00:00Z"
 *   node scripts/health-check.js --window-hours 2
 *
 * Reads from:
 *   - story_workflow_audit  (audit trail written by content-approval route)
 *   - stories               (direct state change detection via workflow_state_changed_at)
 *   - production_jobs       (pipeline runner health)
 *   - pipeline_runner_state (runner heartbeat)
 *   - workers_heartbeat     (worker liveness)
 *
 * Exit codes:
 *   0 = healthy (no warnings)
 *   1 = warnings or external state changes detected
 *   2 = errors / query failures
 */

'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[health-check] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(2)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── State file for last-check timestamp ────────────────────────────────────
const STATE_FILE = path.join(__dirname, '.health-check-state.json')

function readLastCheckTs() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      return s.lastCheckTs || null
    }
  } catch {}
  return null
}

function writeLastCheckTs(ts) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastCheckTs: ts }), 'utf8')
  } catch (err) {
    console.warn('[health-check] Could not write state file:', err.message)
  }
}

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let sinceFlagValue = null
let windowHours = 1

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--since' && args[i + 1]) {
    sinceFlagValue = args[++i]
  } else if (args[i] === '--window-hours' && args[i + 1]) {
    windowHours = parseFloat(args[++i]) || 1
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const nowTs    = new Date().toISOString()
  const savedTs  = readLastCheckTs()
  const sinceTs  = sinceFlagValue
    || savedTs
    || new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  console.log(`\n🔍 Endless Tales Health Check — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EDT`)
  console.log(`   Checking changes since: ${sinceTs}`)
  console.log('─'.repeat(64))

  let hasWarnings = false
  let hasErrors   = false

  // ── 1. External State Changes (story_workflow_audit — console actor) ──────
  // These are Production Console actions that Orion might not know about.
  // ATL-DECISION-TRACKING-001 gap class D: visible in audit table, not polled.
  {
    const { data: auditRows, error } = await supabase
      .from('story_workflow_audit')
      .select('id, story_id, from_state, to_state, changed_by, changed_at, reason')
      .gte('changed_at', sinceTs)
      .in('changed_by', ['console', 'admin'])
      .order('changed_at', { ascending: false })

    if (error) {
      console.error(`❌ story_workflow_audit query failed: ${error.message}`)
      hasErrors = true
    } else if (auditRows && auditRows.length > 0) {
      console.log(`\n⚠️  EXTERNAL STATE CHANGES DETECTED (${auditRows.length})`)
      console.log('   These are Production Console actions Orion may not know about:')
      for (const row of auditRows) {
        const ts = new Date(row.changed_at).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
        console.log(`   • [${ts}] story_id=${row.story_id}`)
        console.log(`     ${row.from_state || '(unknown)'} → ${row.to_state}  by=${row.changed_by}`)
        if (row.reason) console.log(`     reason: ${row.reason}`)
      }
      hasWarnings = true
    } else {
      console.log('✅ No external Console state changes in window')
    }
  }

  // ── 2. Direct DB state changes (stories table — not via audit table) ──────
  // Catches workflow_state changes stamped with workflow_state_changed_by='admin'
  // that predate or bypass the story_workflow_audit write (e.g. legacy direct SQL).
  {
    const { data: directChanges, error } = await supabase
      .from('stories')
      .select('id, title, workflow_state, workflow_state_changed_by, workflow_state_changed_at, workflow_state_change_reason')
      .gte('workflow_state_changed_at', sinceTs)
      .eq('workflow_state_changed_by', 'admin')
      .order('workflow_state_changed_at', { ascending: false })

    if (error) {
      // workflow_state_changed_at may not exist in older schema — non-fatal
      console.warn(`   [stories direct-change query] ${error.message}`)
    } else if (directChanges && directChanges.length > 0) {
      console.log(`\n⚠️  DIRECT STORY WORKFLOW CHANGES (${directChanges.length}) — stamped as 'admin'`)
      for (const row of directChanges) {
        const ts = new Date(row.workflow_state_changed_at).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
        console.log(`   • [${ts}] ${row.title || row.id} → ${row.workflow_state}`)
        if (row.workflow_state_change_reason) console.log(`     reason: ${row.workflow_state_change_reason}`)
      }
      hasWarnings = true
    }
  }

  // ── 3. Production Jobs — recent failures ──────────────────────────────────
  {
    const { data: failedJobs, error } = await supabase
      .from('production_jobs')
      .select('id, story_id, series_id, status, current_step, updated_at, error_json')
      .in('status', ['failed', 'error'])
      .gte('updated_at', sinceTs)
      .order('updated_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error(`❌ production_jobs query failed: ${error.message}`)
      hasErrors = true
    } else if (failedJobs && failedJobs.length > 0) {
      console.log(`\n⚠️  FAILED PRODUCTION JOBS (${failedJobs.length} in window)`)
      for (const job of failedJobs) {
        const ts = new Date(job.updated_at).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
        console.log(`   • [${ts}] job=${job.id} step=${job.current_step || '?'} status=${job.status}`)
        if (job.story_id) console.log(`     story_id=${job.story_id}`)
        if (job.series_id) console.log(`     series_id=${job.series_id}`)
      }
      hasWarnings = true
    } else {
      console.log('✅ No new production job failures in window')
    }
  }

  // ── 4. Queue depth ────────────────────────────────────────────────────────
  {
    const { count, error } = await supabase
      .from('production_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'queued', 'running'])

    if (error) {
      console.warn(`   [queue depth query] ${error.message}`)
    } else {
      const depth = count ?? '?'
      const flag  = typeof depth === 'number' && depth > 20 ? ' ⚠️  HIGH' : ''
      console.log(`\n📊 Active job queue depth: ${depth}${flag}`)
    }
  }

  // ── 5. Pipeline runner heartbeat ─────────────────────────────────────────
  {
    const { data: runnerState, error } = await supabase
      .from('pipeline_runner_state')
      .select('id, last_heartbeat_at, is_running, current_job_id')
      .order('last_heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn(`   [pipeline_runner_state] ${error.message}`)
    } else if (!runnerState) {
      console.log('⚠️  No pipeline runner state found')
      hasWarnings = true
    } else {
      const lastHb  = runnerState.last_heartbeat_at
      const ageMs   = lastHb ? Date.now() - new Date(lastHb).getTime() : Infinity
      const ageMins = Math.round(ageMs / 60000)
      const stale   = ageMs > 10 * 60 * 1000 // >10 min
      const icon    = stale ? '⚠️ ' : '✅'
      console.log(`${icon} Pipeline runner: last heartbeat ${ageMins}m ago, running=${runnerState.is_running}`)
      if (stale) hasWarnings = true
    }
  }

  // ── 6. Worker heartbeats ──────────────────────────────────────────────────
  {
    const { data: workers, error } = await supabase
      .from('workers_heartbeat')
      .select('worker_id, last_seen_at, worker_type')
      .order('last_seen_at', { ascending: false })
      .limit(5)

    if (error) {
      console.warn(`   [workers_heartbeat] ${error.message}`)
    } else if (!workers || workers.length === 0) {
      console.log('⚠️  No worker heartbeats on record')
      hasWarnings = true
    } else {
      const stale = workers.filter((w) => {
        const ageMs = w.last_seen_at ? Date.now() - new Date(w.last_seen_at).getTime() : Infinity
        return ageMs > 15 * 60 * 1000 // >15 min
      })
      if (stale.length > 0) {
        console.log(`⚠️  ${stale.length} stale worker(s):`)
        for (const w of stale) {
          const ageMins = Math.round((Date.now() - new Date(w.last_seen_at).getTime()) / 60000)
          console.log(`   • ${w.worker_id} (${w.worker_type || 'unknown'}) — ${ageMins}m since last heartbeat`)
        }
        hasWarnings = true
      } else {
        console.log(`✅ Workers: ${workers.length} active`)
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(64))
  if (hasErrors) {
    console.log('❌ Health check FAILED — query errors above')
    writeLastCheckTs(nowTs)
    process.exit(2)
  } else if (hasWarnings) {
    console.log('⚠️  Health check complete — WARNINGS detected (see above)')
    writeLastCheckTs(nowTs)
    process.exit(1)
  } else {
    console.log('✅ Health check OK — all systems nominal')
    writeLastCheckTs(nowTs)
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('[health-check] Unexpected error:', err)
  process.exit(2)
})
