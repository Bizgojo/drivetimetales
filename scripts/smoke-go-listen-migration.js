#!/usr/bin/env node
/**
 * smoke-go-listen-migration.js — post-migration smoke test for go_listen_events.
 *
 * Run this after applying ANY migration that touches go_listen_events.
 * Catches CHECK/RLS drift immediately — the failure class that let page_view
 * go dark for a full day after the Jul 23 migration (PAGE-VIEW-001).
 *
 * Two checks:
 *   1. WARN  — compare RLS policy against app list (lib/goListenEventList.ts).
 *              Events in RLS but NOT in the app list → warn-only (non-blocking).
 *              Events in app list but missing from RLS → caught by Check 2 (probe).
 *   2. PROBE — insert one row of every app-list event via ANON key; fail on any 42501.
 *              This is the only CI-failing check. Every event the app writes must be
 *              accepted by the live policy.
 *
 * Exit 0 = all pass. Exit 1 = probe rejection detected.
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
// Loaded dynamically from lib/goListenEventList.ts — the single source of truth.
// Falls back to an inline list only when the file cannot be read.
// DO NOT maintain a separate hardcoded list here; update goListenEventList.ts.
function loadCanonicalEventsFromTs() {
  try {
    const fs = require('fs')
    const tsPath = require('path').join(__dirname, '../lib/goListenEventList.ts')
    const src = fs.readFileSync(tsPath, 'utf8')
    // Extract the string literals from the GO_LISTEN_EVENTS array body.
    const match = src.match(/GO_LISTEN_EVENTS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/)
    if (!match) return null
    const events = match[1].match(/'([a-z_0-9]+)'/g)?.map(s => s.replace(/'/g, ''))
    return (events && events.length > 0) ? events : null
  } catch {
    return null
  }
}

const CANONICAL_EVENTS = loadCanonicalEventsFromTs() || [
  // Fallback — keep in sync with lib/goListenEventList.ts.
  // History: 2026-07-26 GVL-EAVESDROP-001 added eavesdrop_pressed/ep_complete/wall_shown/wall_submit.
  'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75',
  'complete', 'cta_click',
  'preview_started', 'preview_completed', 'preview_unmuted',
  'preview_to_play', 'preview_skipped', 'cta_rendered', 'page_view',
  'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
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

  // ── Check 1: RLS stale-event warning (non-blocking) ──────────────────────
  // Purpose: flag events present in the RLS policy that are no longer in the
  // app list — likely deprecated events that should be cleaned up in a
  // maintenance window. This check NEVER fails the build.
  // Note: app-list events missing from RLS are caught by Check 2 (probe).
  console.log('CHECK 1 — RLS stale-event scan (warn-only):')
  const rlsEvents = await getRlsEventList()
  if (!rlsEvents) {
    console.log('  ⚠️  Skipped (SUPABASE_MANAGEMENT_TOKEN not set or query failed)')
    console.log('     Set the token to enable stale-event detection.')
  } else {
    const canonSet = new Set(CANONICAL_EVENTS)
    const inRlsNotCanon = rlsEvents.filter(e => !canonSet.has(e))
    if (inRlsNotCanon.length === 0) {
      ok(`RLS policy contains no stale events (${rlsEvents.length} events, all in app list)`)
    } else {
      console.log(`  ⚠️  WARN (non-blocking): ${inRlsNotCanon.length} event(s) in RLS policy not in app list: ${inRlsNotCanon.join(', ')}`)
      console.log('  → These may be deprecated events. Low-priority cleanup for a maintenance window.')
    }
  }

  // ── Check 2: anon-key probe (CI-failing) ─────────────────────────────────
  // Every event the app writes must be accepted by the live RLS policy.
  // A 42501 here means the policy is missing this event — migration needed.
  console.log('\nCHECK 2 — anon-key insert probe for all app-list events (CI-failing):')

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
    console.log('\n  PROBE FAILED: apply a migration that adds the missing event(s) to the RLS INSERT policy.')
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
