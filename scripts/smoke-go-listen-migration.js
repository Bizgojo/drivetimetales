#!/usr/bin/env node
/**
 * smoke-go-listen-migration.js — post-migration smoke test for go_listen_events.
 *
 * Run this after applying ANY migration that touches go_listen_events.
 * Catches CHECK/RLS drift immediately — the failure class that let page_view
 * go dark for a full day after the Jul 23 migration (PAGE-VIEW-001).
 *
 * Three checks:
 *   1. READ  — query pg_policies for current RLS event list
 *   2. DIFF  — compare RLS list to canonical GO_LISTEN_EVENTS in lib/goListenEventList.ts
 *   3. PROBE — insert one row of every canonical event via ANON key; fail on any 42501
 *
 * Exit 0 = all pass. Exit 1 = drift or rejection detected.
 *
 * Usage:
 *   node scripts/smoke-go-listen-migration.js
 *
 * Requirements:
 *   .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY
 */

process.env.NODE_PATH = require('path').join(__dirname, '../node_modules')
require('module').Module._initPaths()

const _log = console.log
console.log = () => {}
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
console.log = _log

const { createClient } = require('@supabase/supabase-js')

// ── Canonical event list ─────────────────────────────────────────────────────
// Must match lib/goListenEventList.ts. If you add an event there, add it here.
const CANONICAL_EVENTS = [
  'play_start',
  'sec_30',
  'pct_25',
  'pct_50',
  'pct_75',
  'complete',
  'cta_click',
  'preview_started',
  'preview_completed',
  'preview_unmuted',
  'preview_to_play',
  'preview_skipped',
  'cta_rendered',
  'page_view',
]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Supabase Management API token (from keychain; needed to query pg_policies).
// The keychain value is go-keyring-base64:<base64>, so extract and decode.
// If not available, skip check 1 and rely on check 3 (probe) alone.
function loadMgmtToken() {
  if (process.env.SUPABASE_MANAGEMENT_TOKEN) return process.env.SUPABASE_MANAGEMENT_TOKEN
  try {
    const { execSync } = require('child_process')
    const raw = execSync(
      'security find-generic-password -s "Supabase CLI" -a "supabase" -w 2>/dev/null',
      { encoding: 'utf8' }
    ).trim()
    const prefix = 'go-keyring-base64:'
    if (raw.startsWith(prefix)) {
      return Buffer.from(raw.slice(prefix.length), 'base64').toString('utf8').trim()
    }
    return raw
  } catch {
    return ''
  }
}
const MGMT_TOKEN = loadMgmtToken()
const PROJECT_REF = SUPABASE_URL ? SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] : ''

// Must be a valid UUID (postgres type check). Version 1, variant 8xx.
const TEST_SESSION = 'f00f0000-cafe-1000-8ace-000000000000'
let failures = 0

function fail(msg) {
  console.error('  ❌', msg)
  failures++
}

function ok(msg) {
  console.log('  ✅', msg)
}

async function getRlsEventList() {
  if (!MGMT_TOKEN || !PROJECT_REF) return null
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `SELECT with_check FROM pg_policies
                WHERE tablename = 'go_listen_events'
                AND cmd = 'INSERT' AND policyname = 'go_listen_events_insert_anon';`,
      }),
    })
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows[0]?.with_check) return null
    const withCheck = rows[0].with_check
    // Extract the event array from the SQL expression:
    // event = ANY (ARRAY['play_start'::text, 'sec_30'::text, ...])
    const m = withCheck.match(/event = ANY \(ARRAY\[([^\]]+)\]\)/)
    if (!m) return null
    return m[1]
      .split(',')
      .map(s => s.trim().replace(/'([^']+)'::text/, '$1').replace(/'/g, ''))
      .filter(Boolean)
  } catch {
    return null
  }
}

async function run() {
  console.log('\n═══ go_listen_events migration smoke test ═══\n')

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const svc = createClient(SUPABASE_URL, SVC_KEY, { auth: { persistSession: false } })

  // ── Check 1: RLS vs canonical diff ────────────────────────────────────────
  console.log('CHECK 1 — RLS policy vs canonical event list:')
  const rlsEvents = await getRlsEventList()
  if (!rlsEvents) {
    console.log('  ⚠️  Skipped (SUPABASE_MANAGEMENT_TOKEN not set or query failed)')
    console.log('     Set the token to enable policy drift detection.')
  } else {
    const rlsSet = new Set(rlsEvents)
    const canonSet = new Set(CANONICAL_EVENTS)
    const inCanonNotRls = CANONICAL_EVENTS.filter(e => !rlsSet.has(e))
    const inRlsNotCanon = rlsEvents.filter(e => !canonSet.has(e))
    if (inCanonNotRls.length === 0 && inRlsNotCanon.length === 0) {
      ok(`RLS policy matches canonical list (${CANONICAL_EVENTS.length} events)`)
    } else {
      if (inCanonNotRls.length) fail(`In canonical but MISSING from RLS: ${inCanonNotRls.join(', ')}`)
      if (inRlsNotCanon.length) fail(`In RLS but NOT in canonical: ${inRlsNotCanon.join(', ')}`)
      console.log('  → RLS-FIX: run DROP + CREATE on go_listen_events_insert_anon with the full canonical list.')
    }
  }

  // ── Check 2: anon-key probe ───────────────────────────────────────────────
  console.log('\nCHECK 2 — anon-key insert probe for all canonical events:')

  // Cleanup first so duplicate-key collisions don't false-pass
  await svc.from('go_listen_events').delete().eq('session_id', TEST_SESSION)

  const results = []
  for (const event of CANONICAL_EVENTS) {
    const { error } = await anon.from('go_listen_events').insert({
      session_id: TEST_SESSION,
      variant: 'b',
      event,
      position_seconds: 0,
      utm_source: 'smoke-test',
    })
    // Delete after each insert to avoid unique-index collision on next event
    await svc.from('go_listen_events').delete().eq('session_id', TEST_SESSION)

    if (!error) {
      results.push({ event, ok: true })
    } else {
      const msg = error.message || ''
      const code = error.code || ''
      if (/42501|row.level security/i.test(msg) || code === '42501') {
        results.push({ event, ok: false, reason: '42501 RLS rejection' })
      } else if (/23514|check constraint/i.test(msg) || code === '23514') {
        results.push({ event, ok: false, reason: '23514 CHECK constraint' })
      } else {
        results.push({ event, ok: false, reason: `${code} ${msg.slice(0, 80)}` })
      }
    }
  }

  const passed = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)

  passed.forEach(r => ok(`${r.event}`))
  failed.forEach(r => fail(`${r.event}: ${r.reason}`))

  if (failed.length > 0) {
    console.log('\n  DRIFT DETECTED: apply a migration that updates the RLS INSERT policy')
    console.log('  (see supabase/migrations/20260724120000_go_listen_rls_sync.sql for template).')
  }

  // Final cleanup
  await svc.from('go_listen_events').delete().eq('session_id', TEST_SESSION)

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────')
  if (failures === 0) {
    console.log('✅ SMOKE TEST PASSED — RLS + CHECK in sync, all events insertable.')
  } else {
    console.error(`❌ SMOKE TEST FAILED — ${failures} failure(s). Do not ship until resolved.`)
    process.exit(1)
  }
  console.log('═══════════════════════════════════════════════\n')
}

run().catch(err => {
  console.error('SMOKE TEST ERROR:', err.message)
  process.exit(1)
})
