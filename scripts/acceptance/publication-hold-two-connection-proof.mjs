#!/usr/bin/env node
/**
 * PUBLICATION-HOLD TWO-CONNECTION PROOF — concurrency-proof-standard-1500
 * (Marc 2026-10-23). Committed acceptance proof for branch
 * feat/publication-hold-barrier-v2.
 *
 * What this proves, against REAL PostgreSQL (own throwaway scratch instance
 * created by this script via initdb — never any shared/prod database):
 *   - the EXACT migration file
 *     supabase/migrations/20261023150000_publication_hold_trigger.sql is
 *     executed VERBATIM (read from the repo, no copies, no edits);
 *   - prod-shaped schema (atlas_settings KV + stories with status/is_hidden);
 *   - two live pg Clients racing in both orders plus the hold-waits case;
 *   - ordering A: hold committed first  -> publish raises P0001, 0 visible;
 *   - ordering B (the Lake Marion race): publish reads OPEN, pauses, hold
 *     commits mid-pause, publish write raises P0001, 0 visible;
 *   - ordering C: publish txn open    -> hold-set upsert BLOCKS behind it
 *     (statement-timeout 57014 = shared row lock held), then lands; the next
 *     publish is refused P0001;
 *   - narrow firing: non-publishing updates while held still pass.
 *
 * No mocks. No SQL-text assertions as proof (the two static sanity checks
 * are labelled as such). Exit 0 + ALL CHECKS PASSED on success, 1 otherwise.
 *
 * Run: node scripts/acceptance/publication-hold-two-connection-proof.mjs
 * Requires: pg (devDependency), postgres 16 binaries (initdb/pg_ctl/psql).
 */

import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// Every client gets a noop 'error' listener so a server-side FATAL on an
// idle/bystander connection (e.g. during scratch-instance teardown) can
// never surface as an uncaught 'error' event and crash the harness.
const liveClients = []
function track(c) {
  c.on('error', () => {})
  liveClients.push(c)
  return c
}
async function endAllClients() {
  for (const c of liveClients.splice(0)) {
    try { await c.end() } catch { /* best effort */ }
  }
}

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20261023150000_publication_hold_trigger.sql'
)

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

// ── locate postgres binaries ──────────────────────────────────────────────
function findBin(name) {
  const extra = ['/opt/homebrew/bin', '/opt/homebrew/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin', '/usr/local/bin']
  const envPath = (process.env.PATH || '').split(path.delimiter).concat(extra)
  for (const dir of envPath) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let dataDir = null
let startedPostgres = false

async function stopPostgres() {
  if (!startedPostgres || !dataDir) return
  try {
    spawnSync(findBin('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'ignore', timeout: 15000 })
  } catch { /* best effort */ }
}

async function main() {
  const initdb = findBin('initdb')
  const pgCtl = findBin('pg_ctl')
  const psql = findBin('psql')
  if (!initdb || !pgCtl || !psql) {
    console.log('FAIL  postgres 16 binaries (initdb/pg_ctl/psql) not found on PATH')
    process.exitCode = 1
    return
  }

  // ── throwaway scratch instance (this script's own; never shared/prod) ──
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubhold-proof-'))
  const port = await freePort()
  const sockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubhold-sock-'))
  const run = (bin, args, opts = {}) =>
    spawnSync(bin, args, { encoding: 'utf8', timeout: 60000, ...opts })

  const pgEnv = { ...process.env, LC_ALL: 'C', LC_NUMERIC: 'C', LANG: 'C' }
  let r = run(initdb, ['-D', dataDir, '-E', 'UTF8', '--locale=C', '--auth=trust'], { env: pgEnv })
  if (r.status !== 0) {
    console.log(`FAIL  initdb scratch cluster  — ${(r.stderr || r.stdout || '').slice(0, 300)}`)
    process.exitCode = 1
    return
  }
  const postgres = spawn(
    findBin('postgres'),
    ['-D', dataDir, '-p', String(port), '-k', sockDir, '-c', 'listen_addresses=127.0.0.1'],
    { stdio: 'ignore', detached: true, env: pgEnv }
  )
  postgres.unref()
  startedPostgres = true

  const conn = { host: sockDir, port, database: 'postgres', user: process.env.USER || 'postgres' }
  // NOTE: a pg Client instance cannot be re-connected after a failed
  // connect(), so each readiness attempt uses a fresh Client.
  let admin = null
  let lastConnectErr = ''
  const deadline = Date.now() + 30000
  for (;;) {
    const attempt = track(new Client(conn))
    try {
      await attempt.connect()
      admin = attempt
      break
    } catch (e) {
      lastConnectErr = (e && e.message) ? e.message : String(e)
      try { await attempt.end() } catch { /* best effort */ }
      if (Date.now() > deadline) {
        console.log(`FAIL  scratch postgres did not start in 30s  — last: ${lastConnectErr.slice(0, 200)}`)
        process.exitCode = 1
        await stopPostgres()
        return
      }
      await sleep(250)
    }
  }

  // ── prod-shaped schema (barrier-relevant columns of the real tables) ────
  // atlas_settings DDL mirrors 20261011164500_atlas_publish_mode.sql exactly
  // (key/value/updated_at/updated_by). stories carries the columns the
  // trigger reads (id/status/is_hidden); other prod columns are irrelevant
  // to the barrier and omitted.
  await admin.query(`create table public.atlas_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now(),
    updated_by text not null default 'system'
  )`)
  await admin.query(`create table public.stories (
    id text primary key,
    status text not null default 'draft',
    is_hidden boolean not null default true
  )`)

  // ── execute the EXACT migration file, verbatim ──────────────────────────
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  check(
    'migration artifact non-empty (static sanity, not proof)',
    migrationSql.length > 1000 && migrationSql.includes('SELECT value INTO hold_value')
      && migrationSql.includes('FOR UPDATE'),
    'trigger must read the envelope with SELECT ... FOR UPDATE (the v1 plain-SELECT is the ruled-insufficient mechanism)'
  )
  await admin.query(migrationSql)
  await admin.end()

  const openEnvelope = JSON.stringify({
    held: false, state: 'released', by: 'proof-reset', reason: 'ordering isolation', at: new Date().toISOString(),
  })
  const heldEnvelope = (by, reason) => JSON.stringify({
    held: true, state: 'held', by, reason, at: new Date().toISOString(),
  })
  const resetOpen = async (c) => {
    await c.query(`insert into public.atlas_settings(key,value,updated_by) values('publication_hold',$1,'proof-reset')
      on conflict(key) do update set value=excluded.value, updated_by=excluded.updated_by`, [openEnvelope])
  }
  const seedStory = async (c, id) => {
    await c.query(`insert into public.stories(id,status,is_hidden) values($1,'draft',true)
      on conflict(id) do update set status='draft', is_hidden=true`, [id])
  }
  const visibleCount = async (c) => {
    const { rows } = await c.query(
      `select count(*)::int as n from public.stories where status='published' and is_hidden=false`)
    return rows[0].n
  }

  // Two live pg Clients = the two racing connections.
  const publisher = track(new Client({ ...conn }))
  const holder = track(new Client({ ...conn }))
  await publisher.connect()
  await holder.connect()

  // ── precondition + installation sanity (not proof by themselves) ────────
  {
    const { rows } = await publisher.query(
      `select value from public.atlas_settings where key='publication_hold'`)
    check('seed OPEN row exists (serialization precondition)',
      rows.length === 1 && rows[0].value.includes('"held":false'),
      JSON.stringify(rows[0] || {}).slice(0, 120))
    const tg = await publisher.query(
      `select tgname from pg_trigger where tgname='trg_block_publication_while_hold_active'`)
    check('trigger installed on stories (static sanity, not proof)',
      tg.rows.length === 1, 'trg_block_publication_while_hold_active')
  }

  // ── ordering A: hold committed first → publish raises, 0 visible ────────
  await resetOpen(publisher)
  await seedStory(publisher, 's1')
  await holder.query(`update public.atlas_settings set value=$1, updated_by='proof'
    where key='publication_hold'`, [heldEnvelope('marc-proof', 'ordering A hold-first')])
  {
    let err = null
    try {
      await publisher.query(`update public.stories set status='published', is_hidden=false where id='s1'`)
    } catch (e) { err = e }
    check('T1 hold-first blocks publish', err && err.code === 'P0001' && /publication_hold/.test(err.message),
      err ? `${err.code}: ${String(err.message).slice(0, 90)}` : 'NO ERROR (BAD)')
    const { rows } = await publisher.query(`select status, is_hidden from public.stories where id='s1'`)
    check('T1 row untouched', rows[0].status === 'draft' && rows[0].is_hidden === true,
      JSON.stringify(rows[0]))
    check('T1 zero listener-visible rows', (await visibleCount(publisher)) === 0)
    // narrow firing: a non-publishing update while held must still pass
    let narrowErr = null
    try {
      await publisher.query(`update public.stories set status='draft' where id='s1'`)
    } catch (e) { narrowErr = e }
    check('T1 non-publishing update while held passes (narrow firing)', narrowErr === null,
      narrowErr ? String(narrowErr.message).slice(0, 120) : 'draft touch ok')
  }

  // ── ordering B: the Lake Marion race ─────────────────────────────────────
  // publisher reads OPEN (the app pre-gate read), pauses (app work between
  // read and write), the hold commits mid-pause, then the publish write
  // must still raise — the trigger re-reads inside the write transaction.
  await resetOpen(publisher)
  await seedStory(publisher, 's2')
  {
    const pre = await publisher.query(`select value from public.atlas_settings where key='publication_hold'`)
    const sawOpen = pre.rows[0].value.includes('"held":false')
    check('T2 publisher pre-read saw OPEN hold', sawOpen)
    await sleep(300) // app pause between pre-gate read and terminal write
    await holder.query(`update public.atlas_settings set value=$1, updated_by='proof'
      where key='publication_hold'`, [heldEnvelope('marc-proof', 'ordering B mid-pause hold (Lake Marion race)')])
    let err = null
    try {
      await publisher.query(`update public.stories set status='published', is_hidden=false where id='s2'`)
    } catch (e) { err = e }
    check('T2 hold-during-pause blocks publish write', err && err.code === 'P0001' && /publication_hold/.test(err.message),
      err ? `${err.code}: ${String(err.message).slice(0, 90)}` : 'NO ERROR (BAD)')
    const { rows } = await publisher.query(`select status, is_hidden from public.stories where id='s2'`)
    check('T2 row untouched', rows[0].status === 'draft' && rows[0].is_hidden === true,
      JSON.stringify(rows[0]))
    check('T2 zero listener-visible rows', (await visibleCount(publisher)) === 0)
  }

  // ── ordering C: publish txn open → hold-set BLOCKS, then lands ──────────
  await resetOpen(publisher)
  await seedStory(publisher, 's3')
  await seedStory(publisher, 's4')
  {
    await publisher.query('BEGIN')
    // In-flight publish: trigger's SELECT ... FOR UPDATE takes the hold-row
    // lock and holds it until this transaction ends.
    await publisher.query(`update public.stories set status='published', is_hidden=false where id='s3'`)
    // Concurrent hold-set (the code-shaped upsert: UPDATE the same row,
    // which needs the same row lock). statement_timeout turns the block
    // into observable evidence: 57014 = it waited on OUR lock, never
    // slipped past it. (FOR UPDATE + UPDATE conflict waits; no SKIP.)
    const holderBlocked = track(new Client({ ...conn, statement_timeout: 2000 }))
    await holderBlocked.connect()
    const t0 = Date.now()
    let blockErr = null
    try {
      await holderBlocked.query(`update public.atlas_settings set value=$1, updated_by='proof'
        where key='publication_hold'`, [heldEnvelope('marc-proof', 'ordering C racing hold')])
    } catch (e) { blockErr = e }
    const waitedMs = Date.now() - t0
    await holderBlocked.end()
    check('T3 hold-set BLOCKS behind in-flight publish (shared lock)',
      blockErr && blockErr.code === '57014' && waitedMs >= 1500,
      blockErr ? `${blockErr.code} after ${waitedMs}ms (blocked, then timeout-cancelled)` : 'DID NOT BLOCK (BAD)')
    // Release: the in-flight publish commits (it locked first, so it wins —
    // by design it is NOT retroactively aborted).
    await publisher.query('COMMIT')
    check('T3 in-flight publish committed once lock released',
      (await visibleCount(publisher)) === 1)
    // The racing hold now lands (retry after the publish committed).
    await holder.query(`update public.atlas_settings set value=$1, updated_by='proof'
      where key='publication_hold'`, [heldEnvelope('marc-proof', 'ordering C racing hold (landed after publish)')])
    const cur = await publisher.query(`select value from public.atlas_settings where key='publication_hold'`)
    check('T3 hold lands after publish commits', cur.rows[0].value.includes('"held":true'))
    // Every subsequent publish is refused.
    let err = null
    try {
      await publisher.query(`update public.stories set status='published', is_hidden=false where id='s4'`)
    } catch (e) { err = e }
    check('T3 next publish after hold is refused', err && err.code === 'P0001',
      err ? String(err.code) : 'NO ERROR (BAD)')
    check('T3 only the pre-hold in-flight publish is visible',
      (await visibleCount(publisher)) === 1)
  }

  await publisher.end()
  await holder.end()
  await stopPostgres()

  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? '\nALL CHECKS PASSED' : `\n${failed.length} CHECK(S) FAILED`)
}

main().catch(async (e) => {
  console.log(`FAIL  proof harness threw  — ${e && e.message ? e.message : String(e)}`)
  process.exitCode = 1
  try { await endAllClients() } catch { /* best effort */ }
  try { await stopPostgres() } catch { /* best effort */ }
}).finally(async () => {
  // best-effort scratch cleanup (never touches anything outside tmp)
  try {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
  } catch { /* best effort */ }
})
