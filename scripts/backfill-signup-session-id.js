#!/usr/bin/env node
/**
 * backfill-signup-session-id.js
 *
 * Backfills signup_session_id for existing bell-invitation users by matching
 * each user's created_at timestamp against wall_submit events in go_listen_events.
 *
 * MATCHING RULE:
 *   For each user (signup_source='bell-invitation', signup_session_id IS NULL):
 *     Find wall_submit events in go_listen_events where:
 *       created_at BETWEEN (user.created_at - 2s) AND (user.created_at + 10s)
 *
 *   - Exactly 1 match  → write signup_session_id. "Confident match."
 *   - 0 matches        → "No match" (user predates go_listen_events or no wall_submit fired)
 *   - 2+ matches       → "Ambiguous, skipping." Do NOT write.
 *
 * Run: node scripts/backfill-signup-session-id.js [--dry-run]
 *   --dry-run   Print what would be written, don't actually write.
 */
process.chdir('/Users/williampostlewaite/Projects/drivetimetales')
require('dotenv').config({ path: '.env.local', override: true })

const { createClient } = require('@supabase/supabase-js')

const DRY_RUN = process.argv.includes('--dry-run')

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '')

if (!SB_URL) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }
if (!SB_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })

async function run() {
  console.log(`=== backfill-signup-session-id ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===`)
  console.log('SB URL:', SB_URL)

  // 1. Fetch all bell-invitation users without signup_session_id
  console.log('\n[1/4] Fetching bell-invitation users with signup_session_id IS NULL...')
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, email, first_name, created_at, signup_session_id')
    .eq('signup_source', 'bell-invitation')
    .is('signup_session_id', null)
    .order('created_at', { ascending: true })

  if (userErr) {
    console.error('Failed to fetch users:', userErr.message)
    process.exit(1)
  }

  console.log(`  Found ${users.length} users to process`)

  if (users.length === 0) {
    console.log('  Nothing to backfill.')
    return
  }

  // 2. Fetch ALL wall_submit events from go_listen_events
  //    (paginate if necessary — 1000 row PostgREST cap)
  console.log('\n[2/4] Fetching wall_submit events from go_listen_events...')
  const PAGE_SIZE = 1000
  const allEvents = []
  for (let from = 0; from < 100_000; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('go_listen_events')
      .select('session_id, variant, event, created_at')
      .eq('event', 'wall_submit')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('go_listen_events fetch failed:', error.message)
      process.exit(1)
    }
    allEvents.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  console.log(`  Found ${allEvents.length} wall_submit events total`)

  // 3. Match each user to a wall_submit event
  console.log('\n[3/4] Matching users to wall_submit events...')

  const results = {
    confident: [],   // { user, sessionId }
    noMatch: [],     // { user }
    ambiguous: [],   // { user, candidates }
  }

  for (const user of users) {
    const userCreatedAt = new Date(user.created_at).getTime()
    // Window: -2s to +10s relative to user.created_at
    const windowStart = userCreatedAt - 2_000
    const windowEnd   = userCreatedAt + 10_000

    const candidates = allEvents.filter(ev => {
      const evTime = new Date(ev.created_at).getTime()
      return evTime >= windowStart && evTime <= windowEnd
    })

    if (candidates.length === 0) {
      results.noMatch.push({ user })
    } else if (candidates.length === 1) {
      results.confident.push({ user, sessionId: candidates[0].session_id, event: candidates[0] })
    } else {
      results.ambiguous.push({ user, candidates })
    }
  }

  console.log(`  Confident matches:  ${results.confident.length}`)
  console.log(`  No match:           ${results.noMatch.length}`)
  console.log(`  Ambiguous (skip):   ${results.ambiguous.length}`)

  // 4. Write confident matches
  console.log('\n[4/4] Writing signup_session_id for confident matches...')

  let written = 0
  let writeErrors = 0
  for (const { user, sessionId, event } of results.confident) {
    console.log(`  ${DRY_RUN ? '[DRY-RUN] Would write' : 'Writing'} user ${user.id.slice(0, 8)} (${user.email}) → session_id ${sessionId.slice(0, 8)}...`)
    console.log(`    user.created_at: ${user.created_at} | event.created_at: ${event.created_at} | variant: ${event.variant}`)

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from('users')
        .update({ signup_session_id: sessionId })
        .eq('id', user.id)
        .is('signup_session_id', null) // Safety: only update if still null

      if (updateErr) {
        console.error(`    ✗ Update failed: ${updateErr.message}`)
        writeErrors++
      } else {
        written++
        console.log(`    ✓ Written`)
      }
    } else {
      written++
    }
  }

  // 5. Summary
  console.log('\n=== SUMMARY ===')
  console.log(`Confident matches (${DRY_RUN ? 'would write' : 'written'}): ${written}`)
  console.log(`No match:          ${results.noMatch.length}`)
  console.log(`Ambiguous (skip):  ${results.ambiguous.length}`)
  if (writeErrors > 0) console.log(`Write errors:      ${writeErrors}`)

  if (results.confident.length > 0) {
    console.log('\n--- Confident matches ---')
    for (const { user, sessionId, event } of results.confident) {
      console.log(`  [CONFIDENT] ${user.email} → ${sessionId} (variant: ${event.variant}, event_at: ${event.created_at})`)
    }
  }

  if (results.noMatch.length > 0) {
    console.log('\n--- No match ---')
    for (const { user } of results.noMatch) {
      console.log(`  [NO MATCH]  ${user.email} (created_at: ${user.created_at})`)
    }
  }

  if (results.ambiguous.length > 0) {
    console.log('\n--- Ambiguous (skipped) ---')
    for (const { user, candidates } of results.ambiguous) {
      console.log(`  [AMBIGUOUS] ${user.email} (created_at: ${user.created_at}) — ${candidates.length} candidates:`)
      for (const c of candidates) {
        console.log(`    session_id=${c.session_id.slice(0, 8)}... variant=${c.variant} at ${c.created_at}`)
      }
    }
  }
}

run().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
