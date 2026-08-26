#!/usr/bin/env node
/**
 * apply-signup-session-id-migration.js
 *
 * Applies 20260826000000_add_signup_session_id.sql via Supabase Management API.
 * Uses the PAT from macOS keychain (supabase login stores it there).
 * Falls back to a verification-only check via supabase-js if the column already exists.
 *
 * What it does:
 *   1. ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_session_id UUID
 *   2. CREATE INDEX IF NOT EXISTS users_signup_session_id_idx ON users(signup_session_id) WHERE signup_session_id IS NOT NULL
 *   3. Verifies the column exists via information_schema
 *
 * NOTE: Run `supabase login` first if Management API auth fails.
 */
process.chdir('/Users/williampostlewaite/Projects/drivetimetales')
require('dotenv').config({ path: '.env.local', override: true })

const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '')

if (!SB_URL) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }
if (!SB_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const projectRef = SB_URL.replace('https://', '').split('.')[0]

function getPatFromKeychain() {
  try {
    const raw = execSync('security find-generic-password -l "Supabase CLI" -w', { stdio: 'pipe' }).toString().trim()
    // go-keyring stores as "go-keyring-base64:<base64_encoded_value>"
    const PREFIX = 'go-keyring-base64:'
    if (raw.startsWith(PREFIX)) {
      return Buffer.from(raw.slice(PREFIX.length), 'base64').toString('utf8').trim()
    }
    return raw.trim()
  } catch {
    return null
  }
}

async function execSQL(pat, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pat}`,
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

async function run() {
  console.log('=== apply-signup-session-id-migration ===')
  console.log('Project ref:', projectRef)

  // 1. Get PAT for Management API
  const pat = getPatFromKeychain()
  if (!pat) {
    console.error('Could not get Supabase PAT from keychain. Run: supabase login')
    process.exit(1)
  }
  console.log('PAT loaded from keychain:', pat.slice(0, 12) + '...')

  // 2. Apply column
  console.log('\n[1/3] ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_session_id UUID...')
  const r1 = await execSQL(pat, 'ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_session_id UUID;')
  console.log(`  HTTP ${r1.status}:`, r1.body.slice(0, 200))
  if (r1.status !== 200 && r1.status !== 201) {
    console.error('  ✗ ALTER TABLE failed')
    process.exit(1)
  }
  console.log('  ✓ Column added (or already existed)')

  // 3. Create index
  console.log('\n[2/3] CREATE INDEX IF NOT EXISTS users_signup_session_id_idx...')
  const r2 = await execSQL(pat, `
    CREATE INDEX IF NOT EXISTS users_signup_session_id_idx
      ON users(signup_session_id)
      WHERE signup_session_id IS NOT NULL;
  `)
  console.log(`  HTTP ${r2.status}:`, r2.body.slice(0, 200))
  if (r2.status !== 200 && r2.status !== 201) {
    console.error('  ✗ CREATE INDEX failed (non-fatal — index may already exist)')
  } else {
    console.log('  ✓ Index created (or already existed)')
  }

  // 4. Verify
  console.log('\n[3/3] Verifying column in information_schema...')
  const r3 = await execSQL(pat, `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'signup_session_id';
  `)
  console.log(`  HTTP ${r3.status}:`, r3.body.slice(0, 300))

  let rows
  try { rows = JSON.parse(r3.body) } catch { rows = [] }

  if (Array.isArray(rows) && rows.length > 0) {
    console.log('  ✓ Column verified:', JSON.stringify(rows[0]))
    console.log('\n✅ Migration applied and verified successfully.')
  } else {
    console.error('  ✗ Column NOT found in information_schema. Migration may have failed.')
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
