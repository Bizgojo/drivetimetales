#!/usr/bin/env node
/**
 * reset-origin-ep1-ep4-ep19.js
 * AUTHORIZED by Marc Sep 15 18:55 EDT
 * Resets 5 production_jobs to generate_belle_assets / queued.
 * DB writes only. No code changes. No EL renders triggered.
 */
'use strict'

process.chdir('/Users/williampostlewaite/Projects/drivetimetales')
require('dotenv').config({ path: '.env.local', override: true })

const { execSync } = require('child_process')

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const projectRef = SB_URL.replace('https://', '').split('.')[0]

function getPat() {
  const raw = execSync('security find-generic-password -l "Supabase CLI" -w', { stdio: 'pipe' }).toString().trim()
  const PREFIX = 'go-keyring-base64:'
  if (raw.startsWith(PREFIX)) {
    return Buffer.from(raw.slice(PREFIX.length), 'base64').toString('utf8').trim()
  }
  return raw.trim()
}

async function sql(pat, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pat}`,
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text)
}

const JOB_PREFIXES = [
  { prefix: '0b5ff7a8', label: 'EP1' },
  { prefix: 'd58a2dcc', label: 'EP2' },
  { prefix: 'cc1a3fa4', label: 'EP3' },
  { prefix: '93899d33', label: 'EP4' },
  { prefix: '9f8ef82b', label: 'EP19' },
]

async function main() {
  const pat = getPat()
  console.log('PAT:', pat.slice(0, 15) + '...')
  console.log('Project ref:', projectRef)

  // STEP 1: Find full UUIDs
  console.log('\n=== STEP 1: Find full UUIDs ===')
  const jobs = []
  for (const { prefix, label } of JOB_PREFIXES) {
    const rows = await sql(pat, `SELECT id, story_id, status, current_step FROM production_jobs WHERE id::text LIKE '${prefix}%'`)
    if (!rows || rows.length === 0) {
      console.error(`[${label}] No job found for prefix ${prefix}`)
      process.exit(1)
    }
    const row = rows[0]
    console.log(`[${label}] Found: ${row.id} | story_id=${row.story_id} | status=${row.status} | step=${row.current_step}`)
    jobs.push({ ...row, label })
  }

  // STEP 2: Fetch story titles
  console.log('\n=== STEP 2: Fetch story titles ===')
  const storyIds = jobs.map(j => j.story_id).filter(Boolean).map(id => `'${id}'`).join(',')
  let storyTitles = {}
  if (storyIds) {
    const rows = await sql(pat, `SELECT id, title FROM stories WHERE id IN (${storyIds})`)
    for (const s of (rows || [])) storyTitles[s.id] = s.title
  }

  // STEP 3: Reset each job
  console.log('\n=== STEP 3: Reset jobs ===')
  for (const job of jobs) {
    const rows = await sql(pat, `
      UPDATE production_jobs
      SET
        status = 'queued',
        current_step = 'generate_belle_assets',
        error_json = NULL,
        locked_at = NULL,
        locked_by = NULL,
        attempt_count = 0
      WHERE id = '${job.id}'
      RETURNING id, status, current_step
    `)
    if (!rows || rows.length === 0) {
      console.error(`[${job.label}] UPDATE returned no rows for ${job.id}`)
      process.exit(1)
    }
    console.log(`[${job.label}] ✅ ${rows[0].id} -> ${rows[0].status} / ${rows[0].current_step}`)
  }

  // STEP 4: Verify each
  console.log('\n=== STEP 4: Verify each job ===')
  const results = []
  for (const job of jobs) {
    const rows = await sql(pat, `SELECT id, status, current_step FROM production_jobs WHERE id = '${job.id}'`)
    if (!rows || rows.length === 0) {
      console.error(`[${job.label}] Verify: row not found for ${job.id}`)
      process.exit(1)
    }
    const r = rows[0]
    const title = storyTitles[job.story_id] || '(unknown)'
    console.log(`[${job.label}] VERIFY: ${r.id} | status=${r.status} | step=${r.current_step} | "${title}"`)
    results.push({ ...r, label: job.label, story_id: job.story_id, title })
  }

  // STEP 5: Final count
  console.log('\n=== STEP 5: Final count ===')
  const idList = jobs.map(j => `'${j.id}'`).join(',')
  const countRows = await sql(pat, `
    SELECT count(*) FROM production_jobs
    WHERE id IN (${idList})
      AND status = 'queued'
      AND current_step = 'generate_belle_assets'
  `)
  const count = parseInt(countRows[0].count, 10)
  console.log(`Count (queued + generate_belle_assets): ${count} / 5`)

  if (count !== 5) {
    console.error(`ERROR: Expected 5, got ${count}`)
    process.exit(1)
  }

  // SUMMARY
  console.log('\n=== SUMMARY ===')
  for (const r of results) {
    const prefix = r.id.substring(0, 8)
    console.log(`${prefix} | "${r.title}" | ${r.status} | ${r.current_step}`)
  }
  console.log(`\nFinal count = ${count} ✅`)
  console.log('\n⬛ DONE')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
