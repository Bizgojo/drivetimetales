#!/usr/bin/env node
// smoke-setup.js — Create or reset production_jobs for two test stories

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const STORY_IDS = [
  '0088ffd9-54af-4a46-aa8b-5d3ad3bd6bdb', // Caroline Drake / The Inheritance
  '8c682503-44ec-41ed-bc89-02e624ab0de3', // Iris Fontaine / The Inheritance
]

async function main() {
  const results = []

  for (const storyId of STORY_IDS) {
    console.log(`\n--- Processing story: ${storyId} ---`)

    // Check if job exists
    const { data: existing, error: selectErr } = await supabase
      .from('production_jobs')
      .select('id, current_step, status, story_id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (selectErr) {
      console.error(`SELECT error for ${storyId}:`, selectErr.message)
      continue
    }

    let jobId

    if (existing && existing.length > 0) {
      const job = existing[0]
      console.log(`Found existing job: id=${job.id}, step=${job.current_step}, status=${job.status}`)

      // Reset to queued at generate_script
      const { data: updated, error: updateErr } = await supabase
        .from('production_jobs')
        .update({
          status: 'queued',
          current_step: 'generate_script',
          error_json: null,
        })
        .eq('id', job.id)
        .select('id, current_step, status')

      if (updateErr) {
        console.error(`UPDATE error for job ${job.id}:`, updateErr.message)
        continue
      }

      jobId = job.id
      console.log(`Reset job to generate_script: id=${jobId}`)
    } else {
      console.log('No existing job found, creating new one...')

      const { data: inserted, error: insertErr } = await supabase
        .from('production_jobs')
        .insert({
          story_id: storyId,
          status: 'queued',
          current_step: 'generate_script',
          state_json: {},
        })
        .select('id, current_step, status')

      if (insertErr) {
        console.error(`INSERT error for ${storyId}:`, insertErr.message)
        continue
      }

      jobId = inserted[0].id
      console.log(`Created new job: id=${jobId}`)
    }

    results.push({ storyId, jobId })
  }

  console.log('\n=== SETUP COMPLETE ===')
  for (const r of results) {
    console.log(`Story: ${r.storyId} → Job ID: ${r.jobId}`)
  }

  return results
}

main().catch(console.error)
