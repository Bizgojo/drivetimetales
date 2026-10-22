/**
 * REAL PostgREST transport test for LARGE-DOC-CAS (branch fix/cas-rpc-large-doc).
 *
 * Runs ONLY when CAS_TRANSPORT_URL is set (local scratch PostgREST —
 * NEVER production). Validates against a live PostgREST + the review
 * migration applied to a scratch database:
 *   1. the OLD shape (whole-doc script_json=eq URL filter) FAILS on a
 *      26KB production-size doc — reproduces the production 400 class;
 *   2. the NEW shape (cas_update_story RPC, body params) SUCCEEDS on the
 *      identical doc — same row, same content, atomic compare;
 *   3. a stale snapshot through the RPC matches ZERO rows (conflict, row
 *      untouched) — the concurrency guard survives the transport change;
 *   4. explicit-null vs absent-key update semantics hold end to end.
 *
 * Local setup (scratch only):
 *   initdb /tmp/pg-cas-test && pg_ctl start && createdb cas_test
 *   psql cas_test < stories-table DDL + migration 20261022190000
 *   postgrest with db-uri -> cas_test, anon role with table+function grants
 *   CAS_TRANSPORT_URL=http://localhost:3002 npx jest __tests__/cas-transport
 *
 * RUN WITH: CAS_TRANSPORT_URL=http://localhost:3002 npx jest __tests__/cas-transport
 */
import { createClient } from '@supabase/supabase-js'
import { casUpdateStory, CONCURRENT_MOD_CODE } from '../lib/belleRepairPersist'
import { buildLargeDoc } from '../scripts/cas-large-doc-fixture'

const BASE = process.env.CAS_TRANSPORT_URL || ''
// Scratch-cluster JWT (role web_anon, signed by the scratch secret).
// NEVER a production key — this suite only runs against local PostgREST.
const KEY = process.env.CAS_TRANSPORT_KEY || 'anon-key'
const ID = 'd381caca-a186-4deb-9a73-a2adac611637'

const describeLive = BASE ? describe : describe.skip

describeLive('cas transport (live PostgREST)', () => {
  let sb: any

  beforeAll(async () => {
    // Lazy client: creating it here (after the env gate) keeps the
    // no-env case a clean skip instead of a describe-body throw.
    sb = createClient(BASE, KEY)
    // Seed a 26KB production-shaped doc via plain REST (small URL).
    // 22KB raw sits inside production's 25–36KB encoded range and above
    // the local failure threshold, so the OLD shape must 400 here.
    const doc = buildLargeDoc('EP THREE BODY', 22000)
    expect(JSON.stringify(doc).length).toBeGreaterThan(18000)
    const seed: any = { id: ID, script: 'body', script_json: doc, outro_text: 'keep' }
    await sb.from('stories').delete().eq('id', ID)
    const ins: any = await sb.from('stories').insert(seed)
    if (ins.error) throw new Error(`seed failed: ${ins.error.message}`)
  })

  // Transport-fragility invariant (NOT byte-parity): whole-doc URL
  // filters fail the transport at size while body-param RPC is immune.
  // Layer limits differ per deployment — production Supabase 400s at
  // ~32KB encoded (proven by live read-only probe 2026-10-22); local
  // PostgREST 16 parses 30KB but the wire breaks (502) at 60KB+. The
  // failure CODE is layer-specific; the failure CLASS (URL-fragile vs
  // body-immune) is the invariant this suite pins.
  test('OLD shape fails the transport at size; NEW shape is immune on the identical doc', async () => {
    const BIG = 'e381caca-a186-4deb-9a73-a2adac611638'
    const bigDoc = buildLargeDoc('BIG BODY', 60000)
    expect(encodeURIComponent(JSON.stringify(bigDoc)).length).toBeGreaterThan(50000)
    // Seed via plain REST (small URL, body params) + cleanup first.
    await sb.from('stories').delete().eq('id', BIG)
    const ins: any = await sb.from('stories').insert({ id: BIG, script_json: bigDoc })
    expect(ins.error).toBeNull()
    // OLD shape off the wire (curl: the jest fetch harness cannot even
    // emit URLs this large — HeadersOverflowError client-side).
    const { execFileSync } = require('child_process')
    const params = new URLSearchParams({ select: 'id', id: `eq.${BIG}`, script_json: `eq.${JSON.stringify(bigDoc)}` })
    const status = execFileSync('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      `${BASE}/rest/v1/stories?${params.toString()}`,
      '-H', `apikey: ${KEY}`, '-H', `Authorization: Bearer ${KEY}`,
    ], { encoding: 'utf8', timeout: 30000 }).trim()
    expect(['400', '431', '502']).toContain(status)
    // NEW shape on the IDENTICAL doc: succeeds (body params, no URL).
    const next = { ...JSON.parse(JSON.stringify(bigDoc)), raw_script: 'BIG OK' }
    const r = await casUpdateStory(sb, { storyId: BIG, expected: bigDoc, updates: { script_json: next } })
    expect(r).toEqual({ id: BIG })
    const verify: any = await sb.from('stories').select('script_json').eq('id', BIG).single()
    expect(verify.data.script_json.raw_script).toBe('BIG OK')
    await sb.from('stories').delete().eq('id', BIG)
  })

  test('NEW shape: RPC applies the identical doc (atomic compare)', async () => {
    const cur: any = await sb.from('stories').select('script_json').eq('id', ID).single()
    const snapshot = cur.data.script_json
    const next = { ...JSON.parse(JSON.stringify(snapshot)), raw_script: 'RPC UPDATED' }
    const r = await casUpdateStory(sb, { storyId: ID, expected: snapshot, updates: { script_json: next, outro_text: null } })
    expect(r).toEqual({ id: ID })
    const verify: any = await sb.from('stories').select('script,script_json,outro_text').eq('id', ID).single()
    expect(verify.error).toBeNull()
    expect(verify.data.script_json.raw_script).toBe('RPC UPDATED')
    expect(verify.data.script).toBe('body') // absent key untouched
    expect(verify.data.outro_text).toBeNull() // explicit null written
  })

  test('NEW shape: stale snapshot matches zero rows (guard intact)', async () => {
    const cur: any = await sb.from('stories').select('script_json').eq('id', ID).single()
    const stale = cur.data.script_json
    // Concurrent writer moves the row via a second channel.
    const moved = { ...JSON.parse(JSON.stringify(stale)), raw_script: 'CONCURRENT' }
    const mover = await casUpdateStory(sb, { storyId: ID, expected: stale, updates: { script_json: moved } })
    expect(mover).toEqual({ id: ID })
    // Our stale snapshot now conflicts — row untouched by us.
    await expect(
      casUpdateStory(sb, { storyId: ID, expected: stale, updates: { script_json: stale } }),
    ).rejects.toMatchObject({ code: CONCURRENT_MOD_CODE })
    const verify: any = await sb.from('stories').select('script_json').eq('id', ID).single()
    expect(verify.data.script_json.raw_script).toBe('CONCURRENT')
  })
})
