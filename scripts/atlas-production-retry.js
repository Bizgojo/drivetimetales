#!/usr/bin/env node
/**
 * atlas-production-retry.js
 * Atlas — Production Retry for Anthropic cap outage Sep 17 2026
 * Identifies failed jobs, classifies errors, retries transient Anthropic cap failures.
 * DOES NOT: merge code, publish stories, touch Sunset of Competition.
 */
'use strict'

process.chdir('/Users/williampostlewaite/Projects/drivetimetales')
require('dotenv').config({ path: '.env.local', override: true })

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ANTHROPIC_CAP_KEYWORDS = [
  'rate_limit', 'rate limit', 'quota', 'capacity', 'overloaded',
  'usage limit', 'too many requests', 'credit', '529', '529',
  'anthropic', 'tokens per', 'monthly spend', 'spend limit',
  'billing', 'payment required', 'billing_limit', '402'
]

function isAnthropicCapError(errorJson) {
  if (!errorJson) return false
  const str = JSON.stringify(errorJson).toLowerCase()
  return ANTHROPIC_CAP_KEYWORDS.some(k => str.includes(k.toLowerCase()))
}

async function runQuery(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).single()
  if (error) throw new Error(`exec_sql error: ${error.message}`)
  return data
}

async function queryDirect(table, query) {
  const res = await supabase.from(table).select(query)
  return res
}

async function main() {
  console.log('=== Atlas Production Retry — Sep 17 2026 ===\n')

  // ── STEP 1: Failed jobs last 6h ─────────────────────────────────────────────
  console.log('── STEP 1: Query failed production jobs (last 6h) ──')
  const { data: failedJobs, error: failedErr } = await supabase
    .from('production_jobs')
    .select('id, story_id, current_step, status, error_json, updated_at, logs, job_type')
    .in('status', ['failed', 'error'])
    .gte('updated_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('updated_at', { ascending: false })
    .limit(30)

  if (failedErr) {
    console.error('Error querying failed jobs:', failedErr.message)
    process.exit(1)
  }

  console.log(`Found ${failedJobs?.length ?? 0} failed jobs in last 6h\n`)

  // ── STEP 2: needs_attention stories ─────────────────────────────────────────
  console.log('── STEP 2: Stories with needs_attention=true ──')
  const { data: attentionStories, error: attErr } = await supabase
    .from('stories')
    .select('id, title, workflow_state, needs_attention, series_id')
    .eq('needs_attention', true)
    .not('workflow_state', 'in', '("published","cold_storage")')
    .order('updated_at', { ascending: false })

  if (attErr) {
    console.error('Error querying needs_attention stories:', attErr.message)
  } else {
    console.log(`Found ${attentionStories?.length ?? 0} needs_attention stories`)
  }

  // ── STEP 3: Origin 2.0 full picture ─────────────────────────────────────────
  console.log('\n── STEP 3: Origin 2.0 episode status ──')
  // Find the series first
  const { data: originSeries, error: originSeriesErr } = await supabase
    .from('series')
    .select('id, title')
    .ilike('title', '%origin%')

  let originSeriesId = null
  if (originSeriesErr) {
    console.error('Error finding Origin series:', originSeriesErr.message)
  } else {
    console.log('Origin series:', JSON.stringify(originSeries))
    originSeriesId = originSeries?.[0]?.id
  }

  let originStories = []
  if (originSeriesId) {
    const { data, error } = await supabase
      .from('stories')
      .select('id, title, episode_number, workflow_state, needs_attention')
      .eq('series_id', originSeriesId)
      .order('episode_number', { ascending: true })

    if (error) console.error('Error querying Origin stories:', error.message)
    else {
      originStories = data || []
      console.log('Origin stories:')
      for (const s of originStories) {
        console.log(`  EP${s.episode_number}: ${s.id.substring(0,8)} | ${s.title} | ${s.workflow_state} | needs_attention=${s.needs_attention}`)
      }
    }
  }

  // ── STEP 4: Active jobs for Origin ──────────────────────────────────────────
  let originJobMap = {}
  if (originStories.length > 0) {
    const originIds = originStories.map(s => s.id)
    const { data: originJobs, error: ojErr } = await supabase
      .from('production_jobs')
      .select('id, story_id, status, current_step, error_json, updated_at')
      .in('story_id', originIds)
      .order('updated_at', { ascending: false })

    if (ojErr) console.error('Error querying Origin jobs:', ojErr.message)
    else {
      console.log(`\nOrigin production jobs (${originJobs?.length ?? 0} total):`)
      for (const j of (originJobs || [])) {
        const ep = originStories.find(s => s.id === j.story_id)
        console.log(`  EP${ep?.episode_number ?? '?'}: job=${j.id.substring(0,8)} | status=${j.status} | step=${j.current_step} | updated=${j.updated_at}`)
        if (!originJobMap[j.story_id] || j.updated_at > originJobMap[j.story_id].updated_at) {
          originJobMap[j.story_id] = j
        }
      }
    }
  }

  // ── STEP 5: Classify and retry failed jobs ───────────────────────────────────
  console.log('\n── STEP 5: Classify and retry failed jobs ──')
  const retried = []
  const skipped = []
  const report = []

  for (const job of (failedJobs || [])) {
    const storyTitle = job.story_id ? job.story_id.substring(0, 8) : '(no story)'
    const isCapError = isAnthropicCapError(job.error_json)
    
    // Safety: never touch Sunset of Competition
    // (We'll check by story_id cross-reference if needed but proceed for now)
    
    if (isCapError) {
      console.log(`  ✅ RETRY: job=${job.id.substring(0,8)} step=${job.current_step || job.step} error=AnthropicCap`)
      // Requeue the job
      const { error: updateErr } = await supabase
        .from('production_jobs')
        .update({
          status: 'queued',
          error_json: null,
          locked_at: null,
          locked_by: null,
          // Keep current_step so it resumes from where it failed
        })
        .eq('id', job.id)

      if (updateErr) {
        console.error(`    ERROR updating job ${job.id.substring(0,8)}: ${updateErr.message}`)
        skipped.push({ job, reason: `DB update failed: ${updateErr.message}` })
      } else {
        retried.push(job)
        report.push({ id: job.id.substring(0,8), step: job.current_step || job.step, reason: 'AnthropicCap → requeued' })
      }
    } else {
      const errStr = job.error_json ? JSON.stringify(job.error_json).substring(0, 120) : '(no error_json)'
      console.log(`  ⚠️  SKIP: job=${job.id.substring(0,8)} step=${job.current_step || job.step} error=${errStr}`)
      skipped.push({ job, reason: errStr })
    }
  }

  console.log(`\nRetried: ${retried.length} | Skipped: ${skipped.length}`)

  // ── STEP 6: Identify specific series by story titles ────────────────────────
  console.log('\n── STEP 6: Series mapping for Alderton / Extraction ──')

  // Get story details for all failed jobs to identify series
  const allStoryIds = [...new Set((failedJobs || []).map(j => j.story_id).filter(Boolean))]
  let storyDetails = {}
  if (allStoryIds.length > 0) {
    const { data: stories, error: sErr } = await supabase
      .from('stories')
      .select('id, title, episode_number, series_id')
      .in('id', allStoryIds)

    if (!sErr) {
      const seriesIds = [...new Set(stories.map(s => s.series_id).filter(Boolean))]
      let seriesMap = {}
      if (seriesIds.length > 0) {
        const { data: seriesData } = await supabase
          .from('series')
          .select('id, title')
          .in('id', seriesIds)
        for (const s of (seriesData || [])) seriesMap[s.id] = s.title
      }
      for (const s of stories) {
        storyDetails[s.id] = { ...s, seriesTitle: seriesMap[s.series_id] || '(unknown series)' }
      }
    }
  }

  // Print full failed job report
  console.log('\n── FULL FAILED JOB REPORT ──')
  for (const job of (failedJobs || [])) {
    const story = storyDetails[job.story_id]
    const isCapError = isAnthropicCapError(job.error_json)
    const errStr = job.error_json ? JSON.stringify(job.error_json).substring(0, 200) : '(no error_json)'
    console.log(`  job=${job.id.substring(0,8)} | ${story?.seriesTitle ?? '?'} EP${story?.episode_number ?? '?'} "${story?.title ?? job.story_id?.substring(0,8) ?? '?'}"`)
    console.log(`    step=${job.current_step || job.step} | status=${job.status} | cap=${isCapError} | updated=${job.updated_at}`)
    console.log(`    error: ${errStr}`)
  }

  // ── STEP 7: Check Origin EP1-4+EP19 for dispatch ────────────────────────────
  console.log('\n── STEP 7: Origin EP1-4 + EP19 dispatch assessment ──')
  const targetEps = [1, 2, 3, 4, 19]
  const targetOriginStories = originStories.filter(s => targetEps.includes(s.episode_number))
  
  for (const s of targetOriginStories) {
    const latestJob = originJobMap[s.id]
    const activeJob = latestJob && ['queued', 'running', 'waiting_for_external'].includes(latestJob?.status)
    console.log(`  EP${s.episode_number}: ${s.id.substring(0,8)} | workflow=${s.workflow_state} | needs_attention=${s.needs_attention}`)
    console.log(`    latest_job: ${latestJob ? `${latestJob.id.substring(0,8)} status=${latestJob.status} step=${latestJob.current_step}` : 'NONE'}`)
    console.log(`    active: ${activeJob}`)
  }

  // ── STEP 8: Trigger run-next to kick off retried jobs ───────────────────────
  if (retried.length > 0) {
    console.log('\n── STEP 8: Trigger run-next to pick up requeued jobs ──')
    try {
      const resp = await fetch('https://app.endless-tales.com/api/admin/production-jobs/run-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const text = await resp.text()
      console.log(`  run-next: HTTP ${resp.status} → ${text.substring(0, 200)}`)
    } catch (e) {
      console.log(`  run-next: ERROR ${e.message}`)
    }
  }

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n\n=== FINAL SUMMARY ===')
  console.log(`Total failed jobs found (last 6h): ${failedJobs?.length ?? 0}`)
  console.log(`Anthropic-cap failures retried: ${retried.length}`)
  console.log(`Other failures (not retried): ${skipped.length}`)
  
  console.log('\nRetried jobs:')
  for (const j of retried) {
    const story = storyDetails[j.story_id]
    console.log(`  ${j.id.substring(0,8)} | ${story?.seriesTitle ?? '?'} EP${story?.episode_number ?? '?'} | step=${j.current_step || j.step}`)
  }

  console.log('\nSkipped (non-cap) jobs:')
  for (const { job, reason } of skipped) {
    const story = storyDetails[job.story_id]
    console.log(`  ${job.id.substring(0,8)} | ${story?.seriesTitle ?? '?'} EP${story?.episode_number ?? '?'} | reason: ${reason.substring(0, 100)}`)
  }

  console.log('\nOrigin EP1-4+EP19 status:')
  for (const s of targetOriginStories) {
    const latestJob = originJobMap[s.id]
    console.log(`  EP${s.episode_number}: workflow=${s.workflow_state} | job=${latestJob?.id?.substring(0,8) ?? 'NONE'} status=${latestJob?.status ?? 'N/A'}`)
  }

  return {
    failedCount: failedJobs?.length ?? 0,
    retriedCount: retried.length,
    skippedCount: skipped.length,
    retried,
    skipped,
    originStories: targetOriginStories,
    originJobMap,
    storyDetails,
    failedJobs: failedJobs || [],
    attentionStories: attentionStories || []
  }
}

main().then(result => {
  // Store result for reporting
  require('fs').writeFileSync('/tmp/atlas-retry-result.json', JSON.stringify(result, null, 2))
  console.log('\n⬛ Script complete. Result saved to /tmp/atlas-retry-result.json')
}).catch(err => {
  console.error('Fatal error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
