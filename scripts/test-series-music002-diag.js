#!/usr/bin/env node
/**
 * Test: series pipeline run on branch fix/music-002-and-series-finalize
 * Sep 1 2026 — Marc-authorized test run
 * 
 * Creates a NEW test series with 2 episodes, then runs the series
 * finalize step (complete_story_package → ready_for_review) via run-next.
 * Tests the is_hidden=true fix and audit row insert.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const BASE_URL = 'http://127.0.0.1:3000'
const STUB_AUDIO_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3/31a37408-a084-4317-8dbe-e8a65ac467ce/final_mix.mp3'
const CAROLINE_DRAKE_AUTHOR_ID = 'fb5ea62a-d82a-4c1c-900d-0f24b7924ce3'
const IRIS_CALLOWAY_VOICE_ID = 'hpp4J3VqNfWAUOO0d1Us'
const IRIS_CALLOWAY_VOICE_NAME = 'Iris Calloway'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const now = new Date().toISOString()
  const ts = Date.now()
  
  console.log('[test] Creating new test series + episodes for music-002 branch validation')
  console.log('[test] Timestamp:', now)

  // 1. Create series
  const { data: series, error: seriesErr } = await sb.from('series').insert({
    title: `Music002 Test Series ${ts}`,
    description: 'Test series for fix/music-002-and-series-finalize branch validation',
    author: 'Caroline Drake',
    total_episodes: 2,
    category: 'Mystery',
    is_complete: false,
    created_at: now,
  }).select('id').single()

  if (seriesErr || !series) {
    console.error('[test] Failed to create series:', seriesErr?.message)
    process.exit(1)
  }
  const seriesId = series.id
  console.log('[test] Created series:', seriesId)

  // 2. Create 2 episode stories
  // Both need:
  //   status=audio_ready, is_hidden=false (to be promoted), published_on=null
  //   workflow_state='' (promotable), review_status=pending
  //   All required fields for complete-story-package verification
  const storyBase = {
    author: 'Caroline Drake',
    author_id: CAROLINE_DRAKE_AUTHOR_ID,
    genre: 'Mystery',
    description: 'Test stub episode.',
    duration_mins: 2,
    duration_label: '2 min',
    credits: 2,
    color: 'from-purple-600 to-purple-900',
    audio_url: STUB_AUDIO_URL,
    story_audio_url: STUB_AUDIO_URL,
    cover_url: STUB_AUDIO_URL,
    prose_text: 'Stub prose text.',
    narrator_voice_id: IRIS_CALLOWAY_VOICE_ID,
    narrator_voice_name: IRIS_CALLOWAY_VOICE_NAME,
    status: 'audio_ready',
    review_status: 'pending',
    is_hidden: false,
    published_on: null,
    workflow_state: null,
    series_id: seriesId,
    series_name: `Music002 Test Series ${ts}`,
    series_total_episodes: 2,
    source_tool: 'test-music002-diag',
    script: '[TITLE: Test Episode]\n[This is a test stub script]\nNARRATOR: This is a test episode stub.\n',
    created_at: now,
  }

  const { data: ep1, error: ep1Err } = await sb.from('stories').insert({
    ...storyBase,
    title: `Music002 Test Ep1 ${ts}`,
    episode_number: 1,
    series_episode_number: 1,
    series_is_finale: false,
  }).select('id').single()

  if (ep1Err || !ep1) {
    console.error('[test] Failed to create ep1:', ep1Err?.message)
    process.exit(1)
  }
  console.log('[test] Created ep1:', ep1.id)

  const { data: ep2, error: ep2Err } = await sb.from('stories').insert({
    ...storyBase,
    title: `Music002 Test Ep2 ${ts}`,
    episode_number: 2,
    series_episode_number: 2,
    series_is_finale: true,
  }).select('id').single()

  if (ep2Err || !ep2) {
    console.error('[test] Failed to create ep2:', ep2Err?.message)
    process.exit(1)
  }
  console.log('[test] Created ep2:', ep2.id)

  const ep1Id = ep1.id
  const ep2Id = ep2.id

  // 3. Create production job at complete_story_package step
  // Pre-seed doneByEp so the complete-story-package HTTP calls are skipped
  // (stories don't have real audio in storage, just stub URLs)
  const preseededState = {
    episodes: [
      { storyId: ep1Id, episodeNumber: 1, title: `Music002 Test Ep1 ${ts}`, status: 'audio_ready' },
      { storyId: ep2Id, episodeNumber: 2, title: `Music002 Test Ep2 ${ts}`, status: 'audio_ready' },
    ],
    seriesId,
    seriesTitle: `Music002 Test Series ${ts}`,
    totalEpisodes: 2,
    initialStep: 'complete_story_package',
    dispatchedAt: now,
    dispatchSource: 'test-music002-diag',
    // Pre-seed so the complete-story-package loop skips external calls
    // (stories have stub URLs, not real audio files in storage)
    seriesCompleteStoryPackage: {
      episodeCount: 2,
      doneByEp: { '1': true, '2': true },
      reportsByEp: {
        '1': { success: true, steps: [], storyId: ep1Id, note: 'pre-seeded for test' },
        '2': { success: true, steps: [], storyId: ep2Id, note: 'pre-seeded for test' },
      },
      verifiedByEp: {
        '1': { success: true, missingFields: [], story: { id: ep1Id, status: 'audio_ready', episodeNumber: 1, review_status: 'pending', coverUrlPresent: true, storyAudioUrlPresent: true } },
        '2': { success: true, missingFields: [], story: { id: ep2Id, status: 'audio_ready', episodeNumber: 2, review_status: 'pending', coverUrlPresent: true, storyAudioUrlPresent: true } },
      },
      allDone: true,
      completedAt: now,
      lastUpdatedAt: now,
    },
  }

  // TEST-ISOLATION-001: prefix job_type with TEST_ so production cron workers
  // (which use the open-ended selectCandidate path) never pick this job up.
  // Only our explicit { jobId } calls to run-next can drive it.
  const { data: job, error: jobErr } = await sb.from('production_jobs').insert({
    job_type: 'TEST_series',
    status: 'queued',
    current_step: 'complete_story_package',
    series_id: seriesId,
    input_json: {
      mode: 'series',
      source: 'test-music002-diag',
      testRun: true,
      seriesId,
      testNote: `music-002 branch validation ${now}`,
    },
    state_json: preseededState,
    created_by: 'atlas-subagent',
    created_at: now,
  }).select('id').single()

  if (jobErr || !job) {
    console.error('[test] Failed to create production job:', jobErr?.message)
    process.exit(1)
  }
  const jobId = job.id
  console.log('[test] Created production job:', jobId)
  console.log('[test] Series ID:', seriesId)
  console.log('[test] Episode IDs:', ep1Id, ep2Id)

  // 4. Call run-next for this job
  console.log('[test] Calling run-next...')
  let stepCount = 0
  const maxSteps = 5

  while (stepCount < maxSteps) {
    stepCount++
    
    const res = await fetch(`${BASE_URL}/api/admin/production-jobs/run-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })

    let payload
    try {
      payload = await res.json()
    } catch {
      payload = { error: `Non-JSON response: HTTP ${res.status}` }
    }

    console.log(`[test] Step ${stepCount}: HTTP ${res.status}`)
    console.log('[test] Response:', JSON.stringify(payload, null, 2))

    // Check job status
    const { data: latestJob } = await sb.from('production_jobs')
      .select('id,status,current_step,logs')
      .eq('id', jobId)
      .single()
    
    console.log('[test] Job status:', latestJob?.status, 'step:', latestJob?.current_step)

    if (latestJob?.status === 'complete' || latestJob?.status === 'failed' || latestJob?.status === 'cancelled') {
      console.log('[test] Job reached terminal state:', latestJob.status)
      break
    }

    if (!res.ok) {
      console.error('[test] run-next failed, stopping')
      break
    }

    await sleep(1000)
  }

  // 5. Verify results
  console.log('\n[test] === VERIFICATION ===')
  const { data: finalEp1 } = await sb.from('stories')
    .select('id,title,status,is_hidden,workflow_state,published_on,review_status')
    .eq('id', ep1Id)
    .single()
  const { data: finalEp2 } = await sb.from('stories')
    .select('id,title,status,is_hidden,workflow_state,published_on,review_status')
    .eq('id', ep2Id)
    .single()

  console.log('[test] Ep1 final state:', JSON.stringify(finalEp1, null, 2))
  console.log('[test] Ep2 final state:', JSON.stringify(finalEp2, null, 2))

  // Check audit rows
  const { data: auditRows } = await sb.from('story_workflow_audit')
    .select('*')
    .in('story_id', [ep1Id, ep2Id])
    .order('changed_at', { ascending: true })
  console.log('[test] Audit rows:', JSON.stringify(auditRows, null, 2))

  // Final report
  console.log('\n[test] === RESULT ===')
  console.log('[test] Series ID:', seriesId)
  console.log('[test] Story IDs (episodes):')
  console.log(ep1Id)
  console.log(ep2Id)
  
  const ep1Promoted = finalEp1?.workflow_state === 'ready_for_review' && finalEp1?.is_hidden === true
  const ep2Promoted = finalEp2?.workflow_state === 'ready_for_review' && finalEp2?.is_hidden === true
  const auditOk = (auditRows || []).length >= 2
  
  console.log(`[test] is_hidden=true fix: ${ep1Promoted && ep2Promoted ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`[test] audit rows inserted: ${auditOk ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!ep1Promoted || !ep2Promoted) {
    console.error('[test] FAIL: stories were not promoted with is_hidden=true')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[test] Fatal error:', err)
  process.exit(1)
})
