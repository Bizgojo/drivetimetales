/**
 * CAST-REVIEW-001 — approve a parked cast review and let recording start.
 *
 *   npx tsx scripts/cast-review-approve.ts <productionJobId>
 *
 * Only acts on a job in status waiting_for_external with
 * error_json.kind = 'awaiting_cast_approval'. Sets
 * state_json.castReview.approvedAt, clears the error, and re-queues the job at
 * series_generate_voices. Recast any character BEFORE running this.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { createClient } from '@supabase/supabase-js'

async function main() {
  const jobId = process.argv[2]
  if (!jobId) throw new Error('usage: cast-review-approve.ts <productionJobId>')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: job, error } = await db.from('production_jobs').select('id,status,current_step,state_json,error_json,logs').eq('id', jobId).single()
  if (error || !job) throw new Error(`job not found: ${error?.message || jobId}`)
  if (job.status !== 'waiting_for_external' || (job.error_json as any)?.kind !== 'awaiting_cast_approval') {
    throw new Error(`job ${jobId} is not waiting for cast approval (status=${job.status}, kind=${(job.error_json as any)?.kind})`)
  }
  const state = (job.state_json && typeof job.state_json === 'object' ? job.state_json : {}) as Record<string, any>
  const at = new Date().toISOString()
  const logs = [...(Array.isArray(job.logs) ? job.logs : []), { at, message: 'Cast approved by Marc — recording starts (CAST-REVIEW-001)' }]
  const { error: upErr } = await db
    .from('production_jobs')
    .update({
      status: 'queued',
      current_step: 'series_generate_voices',
      state_json: { ...state, castReview: { ...(state.castReview || {}), approvedAt: at } },
      error_json: null,
      logs,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
    .eq('status', 'waiting_for_external')
  if (upErr) throw new Error(`update failed: ${upErr.message}`)
  console.log(`approved ${jobId} at ${at}; job re-queued at series_generate_voices`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
