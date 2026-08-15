// drive-cass-v2.js — Self-healing drive loop with auto-recovery
// Drives Job 166bf4f3 to completion, auto-recovering from failures
// by resetting job (preserving progress) and retrying.

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const JOB_ID = '166bf4f3-a54e-40fc-afd1-e44fa9d09de0'
const RUN_NEXT_URL = 'http://127.0.0.1:3001/api/admin/production-jobs/run-next'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getJob() {
  const { data } = await sb.from('production_jobs')
    .select('status,current_step,error_json,locked_at,locked_by,state_json')
    .eq('id', JOB_ID)
    .single()
  return data
}

async function resetJob(job, keepProgress = true) {
  const state = job.state_json || {}
  const newState = keepProgress
    ? {
        ...state,
        seriesVoiceGeneration: state.seriesVoiceGeneration
          ? { ...state.seriesVoiceGeneration, failures: [] }
          : null,
        seriesBelleGeneration: state.seriesBelleGeneration,
        seriesRenderFinalMix: state.seriesRenderFinalMix,
      }
    : {
        ...state,
        seriesVoiceGeneration: null,
        seriesBelleGeneration: null,
        seriesRenderFinalMix: null,
      }

  const { error } = await sb.from('production_jobs').update({
    status: 'queued',
    current_step: 'series_generate_voices',
    error_json: null,
    locked_at: null,
    locked_by: null,
    state_json: newState,
  }).eq('id', JOB_ID)
  
  if (error) throw new Error(`Reset failed: ${error.message}`)
}

async function callRunNext() {
  const res = await fetch(RUN_NEXT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: JOB_ID }),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { success: false, error: text.slice(0, 200) } }
  return { status: res.status, ok: res.ok, body }
}

async function main() {
  console.log(`\n🎬 Cass Final Render v2 — Job ${JOB_ID}`)
  console.log(`   Voice: Sage Wilder (cgSgspJ2msm6clMCkdW9) @ speed 0.9`)
  console.log(`   Time: ${new Date().toISOString()}\n`)

  let iteration = 0
  const MAX_ITERATIONS = 400
  let recoveries = 0
  const MAX_RECOVERIES = 50

  while (iteration < MAX_ITERATIONS) {
    iteration++
    
    // Check job state
    const job = await getJob()
    const svg = job.state_json?.seriesVoiceGeneration
    const ep1Progress = svg?.progressByEpisode?.['1']
    const ep2Progress = svg?.progressByEpisode?.['2']
    const ep3Progress = svg?.progressByEpisode?.['3']
    const ep4Progress = svg?.progressByEpisode?.['4']
    
    const presentTotal = [ep1Progress, ep2Progress, ep3Progress, ep4Progress]
      .reduce((sum, ep) => sum + (ep?.presentCount || 0), 0)
    
    console.log(`[${iteration}] status=${job.status} step=${job.current_step} locked=${job.locked_by || 'none'} segments=${presentTotal}`)

    // Done?
    if (job.status === 'complete' && job.current_step === 'ready_for_review') {
      console.log('\n✅ COMPLETE! Job reached ready_for_review')
      break
    }

    // Failed?
    if (job.status === 'failed') {
      if (recoveries >= MAX_RECOVERIES) {
        console.error(`\n❌ Max recoveries (${MAX_RECOVERIES}) exceeded`)
        console.error('Last error:', JSON.stringify(job.error_json, null, 2).slice(0, 500))
        process.exit(1)
      }
      recoveries++
      console.log(`  ⚠️ Failed (recovery ${recoveries}/${MAX_RECOVERIES}) — resetting with preserved progress...`)
      await resetJob(job, true)
      await sleep(2_000)
      continue
    }

    // Locked by someone else?
    if (job.locked_by && job.locked_at) {
      const lockAge = Date.now() - new Date(job.locked_at).getTime()
      if (lockAge < 120_000) {
        // Wait and check again - let the runner work
        console.log(`  locked by ${job.locked_by} (${Math.round(lockAge/1000)}s) — waiting 10s...`)
        await sleep(10_000)
        continue
      }
      // Stale lock - clear it
      console.log(`  stale lock (${Math.round(lockAge/1000)}s) — clearing`)
      await sb.from('production_jobs').update({ locked_at: null, locked_by: null }).eq('id', JOB_ID)
      await sleep(1_000)
      continue
    }

    // Call run-next
    let result
    try {
      result = await callRunNext()
    } catch (e) {
      console.error(`  fetch error: ${e.message}`)
      await sleep(5_000)
      continue
    }

    if (result.ok) {
      const { body } = result
      const segStr = body.segmentNumber != null ? ` seg=${body.segmentNumber}` : ''
      const epStr = body.episodeNumber != null ? ` ep=${body.episodeNumber}` : ''
      const stepStr = body.nextStep ? ` →${body.nextStep}` : ''
      console.log(`  ✅ HTTP ${result.status}${epStr}${segStr}${stepStr}`)
      
      if (body.complete || body.nextStep === 'ready_for_review' ||
          (body.status === 'complete' && body.currentStep === 'ready_for_review')) {
        console.log('\n✅ COMPLETE per response!')
        break
      }
    } else {
      console.log(`  HTTP ${result.status} — ${JSON.stringify(result.body).slice(0, 200)}`)
      // Check if job failed
      await sleep(1_000)
    }

    await sleep(300)
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn('\n⚠️ Max iterations reached')
  }

  const final = await getJob()
  console.log(`\nFinal: status=${final.status} step=${final.current_step}`)
  return final
}

main().then(final => {
  const svg = final?.state_json?.seriesVoiceGeneration
  if (svg) {
    const eps = [1,2,3,4].map(n => {
      const ep = svg.progressByEpisode?.[String(n)]
      return `Ep${n}: ${ep?.presentCount || 0}/${ep?.expectedSegmentCount || '?'}`
    }).join(', ')
    console.log('Voice progress:', eps)
  }
}).catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
