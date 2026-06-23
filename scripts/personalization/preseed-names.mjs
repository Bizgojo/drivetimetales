#!/usr/bin/env node

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { doubleMetaphone } from 'double-metaphone'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const NAMES = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua',
  'Kenneth', 'Kevin', 'Brian', 'George', 'Edward',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Lisa', 'Nancy', 'Sandra', 'Betty', 'Margaret', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
  'Carol', 'Amanda', 'Melissa', 'Deborah', 'Dorothy',
]

function normalizeName(raw) {
  const firstToken = String(raw || '').trim().replace(/\s+/g, ' ').split(' ')[0] || ''
  const lettersOnly = firstToken.replace(/[^A-Za-z]/g, '')
  return lettersOnly || null
}

function titleCase(value) {
  const lower = String(value || '').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

async function resolveNameKey(raw) {
  const normalized = normalizeName(raw)
  if (!normalized) return null

  const inputSpelling = normalized.toLowerCase()
  const { data: override, error: overrideError } = await supabase
    .from('name_overrides')
    .select('pronunciation_key,canonical_spelling,phonetic_hint')
    .eq('input_spelling', inputSpelling)
    .maybeSingle()

  if (overrideError) throw new Error(`name_overrides lookup failed for ${raw}: ${overrideError.message}`)
  if (override?.pronunciation_key) {
    return {
      name: raw,
      pronunciationKey: String(override.pronunciation_key),
      canonicalSpelling: String(override.canonical_spelling || titleCase(normalized)),
      phoneticHint: override.phonetic_hint ? String(override.phonetic_hint) : null,
      source: 'override',
    }
  }

  const [primary] = doubleMetaphone(normalized)
  if (!primary) return null
  return {
    name: raw,
    pronunciationKey: primary,
    canonicalSpelling: titleCase(normalized),
    phoneticHint: null,
    source: 'double_metaphone',
  }
}

function groupByKey(resolvedNames) {
  const byKey = new Map()
  for (const item of resolvedNames) {
    if (!item?.pronunciationKey) continue
    const current = byKey.get(item.pronunciationKey) || []
    current.push(item)
    byKey.set(item.pronunciationKey, current)
  }
  return byKey
}

async function readyPoolsForKeys(keys) {
  if (!keys.length) return new Map()
  const { data, error } = await supabase
    .from('name_pools')
    .select('pronunciation_key,canonical_spelling,status,clip_count')
    .in('pronunciation_key', keys)
    .eq('status', 'ready')
  if (error) throw new Error(`ready pool lookup failed: ${error.message}`)
  return new Map((data || []).map(row => [row.pronunciation_key, row]))
}

async function pendingOrProcessingJobsForKeys(keys) {
  if (!keys.length) return new Map()
  const { data, error } = await supabase
    .from('name_pool_jobs')
    .select('pronunciation_key,status')
    .in('pronunciation_key', keys)
    .in('status', ['pending', 'processing'])
  if (error) throw new Error(`job lookup failed: ${error.message}`)
  return new Map((data || []).map(row => [row.pronunciation_key, row]))
}

async function analyze(resolvedNames, readyPools) {
  const byKey = groupByKey(resolvedNames)

  console.log('NAME -> KEY')
  for (const item of resolvedNames) {
    const source = item.source === 'override' ? ' override' : ''
    console.log(`${item.name} -> ${item.pronunciationKey}${source}`)
  }

  console.log('\nSHARED KEYS')
  const shared = [...byKey.entries()].filter(([, rows]) => rows.length >= 2)
  if (!shared.length) {
    console.log('(none)')
  } else {
    for (const [key, rows] of shared) {
      console.log(`${key}: ${rows.map(row => row.name).join(', ')}`)
    }
  }

  console.log('\nALREADY READY POOLS')
  const ready = resolvedNames.filter(item => readyPools.has(item.pronunciationKey))
  if (!ready.length) {
    console.log('(none)')
  } else {
    const seen = new Set()
    for (const item of ready) {
      if (seen.has(item.pronunciationKey)) continue
      seen.add(item.pronunciationKey)
      const pool = readyPools.get(item.pronunciationKey)
      console.log(`${item.pronunciationKey}: ${pool.canonical_spelling} clip_count=${pool.clip_count}`)
    }
  }
}

async function queueMissing(resolvedNames, readyPools) {
  const byKey = groupByKey(resolvedNames)
  const keys = [...byKey.keys()].filter(key => !readyPools.has(key))
  const existingJobs = await pendingOrProcessingJobsForKeys(keys)
  let poolsCreated = 0
  let jobsCreated = 0
  let skippedReady = [...byKey.keys()].filter(key => readyPools.has(key)).length
  let skippedExistingJob = 0

  for (const key of keys) {
    const primary = byKey.get(key)[0]
    const { error: poolError } = await supabase
      .from('name_pools')
      .upsert({
        pronunciation_key: key,
        canonical_spelling: primary.canonicalSpelling,
        phonetic_hint: primary.phoneticHint,
        status: 'pending',
      }, { onConflict: 'pronunciation_key' })
    if (poolError) throw new Error(`Failed to upsert name_pools ${key}: ${poolError.message}`)
    poolsCreated += 1

    if (existingJobs.has(key)) {
      skippedExistingJob += 1
      continue
    }

    const { error: jobError } = await supabase
      .from('name_pool_jobs')
      .insert({
        pronunciation_key: key,
        canonical_spelling: primary.canonicalSpelling,
        status: 'pending',
      })
    if (jobError && jobError.code !== '23505') {
      throw new Error(`Failed to insert name_pool_jobs ${key}: ${jobError.message}`)
    }
    if (!jobError) jobsCreated += 1
  }

  console.log('QUEUE SUMMARY')
  console.log(`distinct keys: ${byKey.size}`)
  console.log(`skipped ready: ${skippedReady}`)
  console.log(`pools pending/upserted: ${poolsCreated}`)
  console.log(`jobs created: ${jobsCreated}`)
  console.log(`skipped existing pending/processing jobs: ${skippedExistingJob}`)
}

async function main() {
  const mode = process.argv.includes('--queue') ? 'queue' : 'analyze'
  const resolvedNames = []
  for (const name of NAMES) {
    const resolved = await resolveNameKey(name)
    if (!resolved) throw new Error(`Could not resolve name key for ${name}`)
    resolvedNames.push(resolved)
  }

  const keys = [...new Set(resolvedNames.map(item => item.pronunciationKey))]
  const readyPools = await readyPoolsForKeys(keys)

  if (mode === 'queue') {
    await queueMissing(resolvedNames, readyPools)
    return
  }

  await analyze(resolvedNames, readyPools)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
