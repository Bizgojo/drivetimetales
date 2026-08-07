// drive-cass-final-render.js
// Drive the Cass Wearing My Face Ep1-4 final render (Job 166bf4f3)
// Speed 0.9, Sage Wilder voice. Do NOT advance stories to RfR.

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const JOB_ID = '166bf4f3-a54e-40fc-afd1-e44fa9d09de0'
const BASE_URL = 'http://127.0.0.1:3001'
const RUN_NEXT_URL = `${BASE_URL}/api/admin/production-jobs/run-next`

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TERMINAL_STEPS = ['ready_for_review', 'failed']
const TARGET_COMPLETE_STATUS = 'complete'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getJobStatus() {
  const { data, error } = await sb.from('production_jobs')
    .select('status,current_step,error_json,locked_at,locked_by')
    .eq('id', JOB_ID)
    .single()
  if (error) throw new Error(`DB query failed: ${error.message}`)
  return data
}

async function runNextStep(attempt) {
  const res = await fetch(RUN_NEXT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: JOB_ID }),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { status: res.status, ok: res.ok, body }
}

async function main() {
  console.log(`\n🎬 Cass Final Render — Job ${JOB_ID}`)
  console.log(`   Voice: Sage Wilder (cgSgspJ2msm6clMCkdW9) @ speed 0.9`)
  console.log(`   Time: ${new Date().toISOString()}\n`)

  let iteration = 0
  const MAX_ITERATIONS = 300
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 3

  while (iteration < MAX_ITERATIONS) {
    iteration++
    const job = await getJobStatus()
    console.log(`[${iteration}] status=${job.status} step=${job.current_step} locked_by=${job.locked_by || 'none'}`)

    // Check if done
    if (job.status === TARGET_COMPLETE_STATUS && TERMINAL_STEPS.includes(job.current_step)) {
      console.log(`\n✅ Render complete! Final status=${job.status} step=${job.current_step}`)
      break
    }

    if (job.status === 'failed') {
      console.error(`\n❌ Job failed at step=${job.current_step}`)
      console.error('error_json:', JSON.stringify(job.error_json, null, 2))
      process.exit(1)
    }

    // If locked, wait
    if (job.locked_by && job.locked_at) {
      const lockAge = Date.now() - new Date(job.locked_at).getTime()
      if (lockAge < 600_000) { // 10 minutes
        console.log(`  Job locked by ${job.locked_by}, age=${Math.round(lockAge/1000)}s — waiting 15s...`)
        await sleep(15_000)
        continue
      } else {
        console.log(`  Lock is stale (${Math.round(lockAge/1000)}s) — clearing and retrying`)
        await sb.from('production_jobs').update({ locked_at: null, locked_by: null }).eq('id', JOB_ID)
        await sleep(2_000)
        continue
      }
    }

    // Run next step
    console.log(`  → Calling run-next...`)
    let result
    try {
      result = await runNextStep(iteration)
    } catch (e) {
      consecutiveErrors++
      console.error(`  ❗ fetch error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${e.message}`)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive errors — aborting')
        process.exit(1)
      }
      await sleep(10_000)
      continue
    }

    consecutiveErrors = 0
    console.log(`  ← HTTP ${result.status}`)

    if (!result.ok) {
      console.error(`  ❌ run-next returned ${result.status}:`, JSON.stringify(result.body).slice(0, 400))
      // Check if the job itself shows an error
      const jobAfter = await getJobStatus()
      if (jobAfter.status === 'failed') {
        console.error('Job transitioned to failed:', JSON.stringify(jobAfter.error_json, null, 2))
        process.exit(1)
      }
      // Soft fail — wait and retry
      console.log('  Soft-failing — waiting 20s before retry')
      // Reset lock if present
      if (jobAfter.locked_by) {
        await sb.from('production_jobs').update({ locked_at: null, locked_by: null, status: 'queued' }).eq('id', JOB_ID)
      }
      await sleep(20_000)
      continue
    }

    const body = result.body
    if (body.step) console.log(`  step completed: ${body.step}`)
    if (body.nextStep) console.log(`  next step: ${body.nextStep}`)
    if (body.message) console.log(`  message: ${body.message}`)

    // Check for completion in response
    if (body.status === 'complete' || body.nextStep === 'ready_for_review' || body.complete) {
      console.log(`\n✅ Render complete per response body!`)
      const finalJob = await getJobStatus()
      console.log(`Final: status=${finalJob.status} step=${finalJob.current_step}`)
      break
    }

    // Brief pause between steps — minimal to reduce cron runner interference
    await sleep(500)
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn('\n⚠️  Max iterations reached — check job status manually')
  }

  // Final check
  const final = await getJobStatus()
  console.log(`\nFinal job state: status=${final.status} step=${final.current_step}`)
  return final
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
