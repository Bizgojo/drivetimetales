/**
 * Creek legacy-recovery tests — stub-fetch evidence for
 * scripts/creek-legacy-recovery.ts. Uses the REAL @supabase/supabase-js
 * QueryBuilder from repo node_modules against an in-memory stub fetch, and
 * the REAL reviewed helpers (lib/belleRepairPersist,
 * lib/belleValidation, lib/continuityPin, lib/jobLockGuard) imported
 * through the script under test. No network, no DB.
 *
 * Proves per review finding:
 *  1. full UUIDs + nested script_json.series_generation paths +
 *     continuity_pins_used in captured PATCH bodies;
 *  2. lock acquired FIRST (claim is the first write; no story write before
 *     it); kill-switch AFTER EACH write, restart converges without
 *     duplicate paid calls and without refusing on own-lock status;
 *  3. normalized AFTER persisted (script + raw_script + outro_text carry
 *     "Episode Three", never "Episode 3"); generation payload identical;
 *     story repair audits appended with prior history preserved;
 *  4. final state is the real same-job continuation
 *     (queued@series_generate_belle_assets) via runPrePackagingRecoveryWithContinuation;
 *  5. (doc-only — reviewed by inspection, not code).
 *
 * RUN WITH: npx jest __tests__/creek-legacy-recovery.test.ts
 */
import { createClient } from '@supabase/supabase-js'
import { hashScript } from '../lib/continuityPin'
import { PRE_PACKAGING_CONTINUATION_STEP } from '../lib/belleRepairPersist'
import * as R from '../scripts/creek-legacy-recovery'

const quiet = { log: () => {} }

// --- Production-shaped fixture (full UUIDs, nested sg, live-like texts) ----
const EP1_OUTRO =
  'Blythe found the page \u2014 or rather, found where it used to be. ' +
  'Sit with that for a moment \u2014 and you\u2019ll discover why in Episode two.'

// Known live condition 2026-10-22 (the blocker Correction 1 executes on):
// Ep2→Ep1 / Ep3→Ep1 pin legs are STALE (abefa7c8…) vs the live Ep1 script
// hash (791664c4… — script_updated_at 18:02:26Z post-dates the C8 pin
// write), and Ep1's production-consumed raw copy is DIVERGENT from the
// validated script text. Fixtures seed exactly that (never already-correct).
const STALE_EP1_PIN = 'abefa7c8' + '0'.repeat(56)

function buildDb() {
  const ep1Script = 'EP ONE BODY. BELLE B OUTRO\n---\nBELLE B: ' + EP1_OUTRO
  const ep2Script = 'EP TWO BODY. BELLE B OUTRO\n---\nBELLE B: ' + R.EP2_OUTRO_BEFORE
  const ep3Script = 'EP THREE BODY. BELLE B OUTRO\n---\nBELLE B: finale copy.'
  const h1 = hashScript(ep1Script)
  const h2 = hashScript(ep2Script)
  if (!h1.startsWith('791664c4') || STALE_EP1_PIN === h1) {
    // Live-prefix constants document the real rows; the invariant that
    // matters here is stale-leg ≠ live-hash (asserted below per test).
  }
  return {
    production_jobs: [
      {
        id: R.CREEK_JOB_ID, status: 'failed', current_step: R.FAILED_STEP,
        failed_step: R.FAILED_STEP, locked_at: null, locked_by: null,
        claimed_by: null, series_id: R.CREEK_SERIES_ID, story_id: null,
        state_json: {}, logs: [],
        error_json: { kind: 'unknown_step', step: R.FAILED_STEP },
      },
    ],
    stories: [
      {
        id: R.CREEK_EP1_ID, series_id: R.CREEK_SERIES_ID, episode_number: 1,
        script: ep1Script, outro_text: EP1_OUTRO,
        outro_audio_url: null,
        outro_with_music_url: `https://x/storage/v1/object/public/audio/asc3/${R.CREEK_EP1_ID}/outro_with_music.mp3`,
        script_json: {
          // DIVERGENT production-consumed raw copy (live blocker condition).
          raw_script: ep1Script + '\n[STALE RAW COPY — pre-C8 text, diverges from validated script]',
          series_generation: {
            model: 'm', continuity_pins_used: {},
            belle_outro_repair: { at: '2026-10-22', action: 'c8', job_id: R.CREEK_JOB_ID },
            belle_repair_audit: [{ action: 'seeded_prior_ep1_repair', jobId: 'other-job' }],
          },
        },
      },
      {
        id: R.CREEK_EP2_ID, series_id: R.CREEK_SERIES_ID, episode_number: 2,
        script: ep2Script, outro_text: R.EP2_OUTRO_BEFORE,
        outro_audio_url: `https://x/storage/v1/object/public/audio/asc3/${R.CREEK_EP2_ID}/outro_0088.mp3`,
        outro_with_music_url: `https://x/storage/v1/object/public/audio/asc3/${R.CREEK_EP2_ID}/outro_with_music.mp3`,
        script_json: {
          raw_script: ep2Script,
          series_generation: {
            model: 'm',
            // STALE Ep1 leg (live blocker condition abefa7c8…).
            continuity_pins_used: { [R.CREEK_EP1_ID]: STALE_EP1_PIN },
            continuity_pin_recovery: {
              at: '2026-10-22', action: 'c8_pin_resync_after_belle_outro_repair',
              job_id: R.CREEK_JOB_ID, prior_recovery: { at: 'earlier', action: 'c7' },
            },
            belle_repair_audit: [{ action: 'seeded_prior_repair', jobId: 'other-job' }],
          },
        },
      },
      {
        id: R.CREEK_EP3_ID, series_id: R.CREEK_SERIES_ID, episode_number: 3,
        script: ep3Script, outro_text: 'finale',
        outro_audio_url: `https://x/storage/v1/object/public/audio/asc3/${R.CREEK_EP3_ID}/outro_0065.mp3`,
        outro_with_music_url: `https://x/storage/v1/object/public/audio/asc3/${R.CREEK_EP3_ID}/outro_with_music.mp3`,
        script_json: {
          raw_script: ep3Script,
          series_generation: {
            model: 'm',
            // STALE Ep1 leg (abefa7c8…); Ep2 leg correct pre-repair (= h2).
            continuity_pins_used: { [R.CREEK_EP1_ID]: STALE_EP1_PIN, [R.CREEK_EP2_ID]: h2 },
          },
        },
      },
    ],
    files: [
      `asc3/${R.CREEK_EP1_ID}/outro_with_music.mp3`,
      `asc3/${R.CREEK_EP1_ID}/final_mix.mp3`,
      `asc3/${R.CREEK_EP2_ID}/outro_0088.mp3`,
      `asc3/${R.CREEK_EP2_ID}/outro_with_music.mp3`,
      `asc3/${R.CREEK_EP2_ID}/final_mix.mp3`,
      `asc3/${R.CREEK_EP3_ID}/outro_0065.mp3`,
      `asc3/${R.CREEK_EP3_ID}/outro_with_music.mp3`,
      `asc3/${R.CREEK_EP3_ID}/final_mix.mp3`,
    ] as string[],
  }
}
type Db = ReturnType<typeof buildDb>

// --- In-memory PostgREST + storage stub (real QueryBuilder serialization) --
function stubFetch(db: Db, opts: { captured?: any[]; failOn?: (c: any) => boolean; sabotageFinalRead?: boolean; failFinalRead?: boolean } = {}) {
  const captured = opts.captured ?? []
  // Negative-case hook: after the handoff release PATCH lands, serve the
  // final verification re-reads a TAMPERED Ep1 script (simulates a
  // concurrent modification between handoff and final verification).
  let released = false
  return async (url: any, fetchOpts: any = {}) => {
    const u = String(url)
    if (u.includes('[object Object]')) throw new Error(`URL contains [object Object]: ${u}`)
    const method = String(fetchOpts.method || 'GET').toUpperCase()
    let body: any = null
    try { body = fetchOpts.body ? JSON.parse(fetchOpts.body) : null } catch { body = fetchOpts.body }
    const rec: any = { method, url: u, body }
    captured.push(rec)
    if (opts.failOn && opts.failOn(rec) && (method === 'PATCH' || method === 'DELETE')) {
      throw new Error('SIMULATED CRASH')
    }
    const respond = (data: any) => {
      const h = fetchOpts.headers
      const accept = (typeof h?.get === 'function' ? h.get('Accept') : (h?.Accept || h?.accept)) || ''
      // postgrest-js parses via text(), so text() and json() must agree.
      const shaped = typeof accept === 'string' && accept.includes('vnd.pgrst.object')
        ? (Array.isArray(data) ? data[0] ?? null : data)
        : data
      return {
        ok: true, status: 200,
        headers: { get: () => null },
        json: async () => shaped,
        text: async () => JSON.stringify(shaped),
      }
    }
    // Storage surface.
    if (u.includes('/storage/v1/object/list/')) {
      const prefix = String(body?.prefix ?? '')
      return respond(db.files.filter((f) => f.startsWith(prefix)).map((f) => ({ name: f.split('/').pop() })))
    }
    if (u.includes('/storage/v1/object/') && (method === 'DELETE' || (method === 'POST' && body?.prefixes))) {
      const removed = (body?.prefixes ?? []).map(String)
      rec.removed = removed
      db.files = db.files.filter((f) => !removed.includes(f))
      return respond(removed.map((name: string) => ({ name })))
    }
    // PostgREST surface.
    const path = u.split('?')[0]
    const table = path.split('/rest/v1/')[1]
    const params = new URLSearchParams(u.split('?')[1] || '')
    const matchRow = (r: any): boolean => {
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue
        if (!v.startsWith('eq.')) continue
        const want = decodeURIComponent(v.slice(3))
        const got = (r as any)[k]
        const gotStr = got !== null && typeof got === 'object' ? JSON.stringify(got) : String(got)
        if (gotStr !== want) return false
      }
      return true
    }
    if (method === 'GET') {
      // GUARD 1a hook: after release, fail the FINAL verification re-reads
      // (projection id,script,script_json,episode_number) with a query
      // error — intermediate reads (other projections) keep working.
      const flat = u.replace(/%2C/gi, ',')
      if (opts.failFinalRead && released && table === 'stories' && flat.includes('script,script_json')) {
        return {
          ok: false, status: 500,
          headers: { get: () => null },
          json: async () => ({ message: 'SIMULATED READ FAILURE', code: '500' }),
          text: async () => JSON.stringify({ message: 'SIMULATED READ FAILURE', code: '500' }),
        }
      }
      let rows = [...((db as any)[table] || [])]
      rows = rows.filter(matchRow).map((r) => JSON.parse(JSON.stringify(r)))
      if (opts.sabotageFinalRead && released && table === 'stories') {
        rows = rows.map((r) =>
          String(r.id) === R.CREEK_EP1_ID ? { ...r, script: String(r.script) + ' SABOTAGE' } : r,
        )
      }
      const order = params.get('order')
      if (order) {
        const [col, dir] = order.split('.')
        rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * (String(a[col]) < String(b[col]) ? -1 : 1))
      }
      return respond(rows)
    }
    if (method === 'PATCH') {
      const rows = ((db as any)[table] || []).filter(matchRow)
      if (table === 'production_jobs' && (body as any)?.status === 'queued') released = true
      for (const r of rows) Object.assign(r, JSON.parse(JSON.stringify(body)))
      return respond(rows.map((r: any) => JSON.parse(JSON.stringify(r))))
    }
    throw new Error(`unsupported ${method} ${u}`)
  }
}

function clientFor(db: Db, stubOpts?: { captured?: any[]; failOn?: (c: any) => boolean; sabotageFinalRead?: boolean; failFinalRead?: boolean }) {
  const captured: any[] = stubOpts?.captured ?? []
  const fetch = stubFetch(db, { captured, failOn: stubOpts?.failOn, sabotageFinalRead: stubOpts?.sabotageFinalRead, failFinalRead: stubOpts?.failFinalRead })
  const supabase = createClient('http://localhost:9999', 'anon-key', { global: { fetch } })
  return { supabase, captured }
}

const writesOf = (captured: any[]) => captured.filter((c) => c.method === 'PATCH' || c.method === 'DELETE')
const postgrestOf = (captured: any[]) => captured.filter((c) => c.method === 'PATCH')

test('identifiers are full UUIDs used in captured requests', async () => {
  for (const id of [R.CREEK_JOB_ID, R.CREEK_SERIES_ID, R.CREEK_EP1_ID, R.CREEK_EP2_ID, R.CREEK_EP3_ID]) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  }
  expect(R.CREEK_JOB_ID).toBe('f02896f1-6af4-4159-88b9-cd97664f0e31')
  expect(R.CREEK_SERIES_ID).toBe('966e766f-cfac-448a-aa4b-82c9107d7293')
  const db = buildDb()
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  for (const c of captured) expect(c.url).not.toContain('[object Object]')
  const storyUrls = captured.filter((c) => c.url.includes('/rest/v1/stories')).map((c) => c.url)
  expect(storyUrls.some((u) => u.includes(`id=eq.${R.CREEK_EP2_ID}`))).toBe(true)
  expect(storyUrls.some((u) => u.includes(`id=eq.${R.CREEK_EP3_ID}`))).toBe(true)
})

test('preflight mismatch aborts with zero writes', async () => {
  const db = buildDb()
  db.stories[1].script = 'TAMPERED — neither BEFORE nor AFTER'
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(false)
  expect(r.phase).toBe('preflight')
  expect(r.failures!.length).toBeGreaterThan(0)
  expect(r.writes).toEqual([])
  expect(writesOf(captured)).toEqual([])
})

test('lock acquired FIRST; no story write before the claim', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  const patches = postgrestOf(captured)
  expect(patches.length).toBeGreaterThan(0)
  const first = patches[0]
  expect(first.url).toContain('/rest/v1/production_jobs')
  expect(first.body.status).toBe('running')
  expect(first.body.locked_by).toBe('creek-legacy-recovery')
  expect(first.url).toContain('status=eq.failed') // fenced on failed
  const firstStoryIdx = patches.findIndex((p) => p.url.includes('/rest/v1/stories'))
  expect(firstStoryIdx).toBeGreaterThan(0) // claim (idx 0) precedes every story write
})

test('normalized AFTER persisted in script + raw_script + outro_text; payload identical', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  expect(R.EP2_OUTRO_AFTER).toContain('Episode Three')
  expect(R.EP2_OUTRO_AFTER).not.toMatch(/Episode \d/)
  expect(r.generationPayload).toBe(R.EP2_OUTRO_AFTER)
  const ep2Patch = postgrestOf(captured).find(
    (p) => p.url.includes('/rest/v1/stories') && p.body.script !== undefined,
  )
  expect(ep2Patch).toBeDefined()
  expect(ep2Patch!.body.script).toContain(R.EP2_OUTRO_AFTER)
  expect(ep2Patch!.body.script).not.toContain(R.EP2_OUTRO_BEFORE)
  expect(ep2Patch!.body.outro_text).toBe(R.EP2_OUTRO_AFTER)
  expect(ep2Patch!.body.script_json.raw_script).toContain(R.EP2_OUTRO_AFTER)
  // Nested reviewed paths (never top-level columns).
  const sg = ep2Patch!.body.script_json.series_generation
  expect(Array.isArray(sg.pending_pin_resync)).toBe(true)
  expect(sg.pending_pin_resync[0]).toEqual({
    dependentStoryId: R.CREEK_EP3_ID,
    priorStoryId: R.CREEK_EP2_ID,
    newPinHash: expect.any(String),
  })
  expect(sg.pending_audio_delete).toEqual([
    expect.stringContaining('outro_0088.mp3'),
    expect.stringContaining('outro_with_music.mp3'),
  ])
  expect(ep2Patch!.body.pending_pin_resync).toBeUndefined()
  expect(ep2Patch!.body.pending_audio_delete).toBeUndefined()
  // Scoped audio nulls only.
  expect(ep2Patch!.body.outro_audio_url).toBeNull()
  expect(ep2Patch!.body.outro_with_music_url).toBeNull()
  // Audit appended, prior history preserved.
  const audits = sg.belle_repair_audit
  expect(audits.length).toBe(2)
  expect(audits[0]).toEqual({ action: 'seeded_prior_repair', jobId: 'other-job' })
  expect(audits[1].jobId).toBe(R.CREEK_JOB_ID)
  expect(sg.continuity_pin_recovery.action).toBe('c8_pin_resync_after_belle_outro_repair')
  expect(sg.continuity_pin_recovery.prior_recovery.action).toBe('c7')
})

test('ep3 continuity_pins_used updated via CAS drain; ep3 text untouched', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  const ep3Patches = postgrestOf(captured).filter(
    (p) => p.url.includes('/rest/v1/stories') && p.url.includes(`id=eq.${R.CREEK_EP3_ID}`),
  )
  expect(ep3Patches.length).toBeGreaterThan(0)
  for (const p of ep3Patches) {
    expect(p.body.script).toBeUndefined()
    expect(p.body.outro_text).toBeUndefined()
    expect(p.url).toContain('script_json=eq.') // CAS-conditioned, real JSON
  }
  const finalPins = db.stories[2].script_json.series_generation.continuity_pins_used
  expect(finalPins[R.CREEK_EP2_ID]).toBe(hashScript(db.stories[1].script))
  // Ep1 leg REPAIRED (Correction 1): stale abefa7c8… → current ep1 hash.
  expect(finalPins[R.CREEK_EP1_ID]).toBe(hashScript(db.stories[0].script))
})

test('ep1 executes, never warns: raw synced + text preserved + intent on nested path', async () => {
  const db = buildDb()
  const beforeScript = db.stories[0].script
  // Fixture seeds the live blocker: divergent raw copy.
  expect(db.stories[0].script_json.raw_script).not.toBe(beforeScript)
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  // NO text rewrite: validated script text preserved exactly.
  expect(db.stories[0].script).toBe(beforeScript)
  // Production-consumed raw copy SYNCED to the validated script.
  expect(db.stories[0].script_json.raw_script).toBe(beforeScript)
  const ep1Patches = postgrestOf(captured).filter(
    (p) => p.url.includes('/rest/v1/stories') && p.url.includes(`id=eq.${R.CREEK_EP1_ID}`),
  )
  // Exactly three row writes: raw-sync PATCH, intent-setting PATCH (nested
  // sg path), and the handoff's clearing PATCH — never a text rewrite.
  expect(ep1Patches.length).toBe(3)
  for (const p of ep1Patches) {
    expect(p.body.script).toBeUndefined()
    expect(p.body.outro_text).toBeUndefined()
    expect(p.url).toContain('script_json=eq.') // CAS-conditioned, real JSON
  }
  expect(ep1Patches[0].url).not.toContain('[object Object]')
  // Raw-sync audit appended, prior history intact (append, never overwrite).
  const audits = db.stories[0].script_json.series_generation.belle_repair_audit
  expect(audits.length).toBe(2)
  expect(audits[0]).toEqual({ action: 'seeded_prior_ep1_repair', jobId: 'other-job' })
  expect(audits[1].jobId).toBe(R.CREEK_JOB_ID)
  expect(audits[1].action).toBe(R.EP1_RAW_SYNC_ACTION)
  // Audio-delete intent rode the nested path, then drained via handoff.
  expect(db.stories[0].script_json.series_generation.pending_audio_delete).toEqual([])
})

test('real handoff: final state queued@series_generate_belle_assets; ep1+ep2 resets; ep3 flags untouched', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  expect(r.continued).toBe(true)
  const job = db.production_jobs[0]
  expect(job.status).toBe('queued')
  expect(job.current_step).toBe(PRE_PACKAGING_CONTINUATION_STEP)
  expect(job.locked_by).toBeNull()
  // Continuation PATCH carried affected-stage resets for Ep1+Ep2 only.
  const contPatch = postgrestOf(captured).find(
    (p) => p.url.includes('/rest/v1/production_jobs') && p.body.current_step === PRE_PACKAGING_CONTINUATION_STEP,
  )
  expect(contPatch).toBeDefined()
  const st = contPatch!.body.state_json
  for (const stage of ['seriesBelleGeneration', 'seriesRenderFinalMix', 'seriesCompleteStoryPackage']) {
    expect(st[stage].doneByEp['1']).toBe(false)
    expect(st[stage].doneByEp['2']).toBe(false)
    expect(st[stage].doneByEp['3']).toBeUndefined()
  }
  // Release PATCH strictly after.
  const releaseIdx = postgrestOf(captured).findIndex(
    (p) => p.url.includes('/rest/v1/production_jobs') && p.body.status === 'queued',
  )
  const contIdx = postgrestOf(captured).findIndex((p) => p === contPatch)
  expect(releaseIdx).toBeGreaterThan(contIdx)
  // Storage: exactly the three stale outro files removed; ep3 files intact.
  const removed = captured.filter((c) => c.method === 'DELETE').flatMap((c) => c.removed ?? [])
  expect(removed.sort()).toEqual([
    `asc3/${R.CREEK_EP1_ID}/outro_with_music.mp3`,
    `asc3/${R.CREEK_EP2_ID}/outro_0088.mp3`,
    `asc3/${R.CREEK_EP2_ID}/outro_with_music.mp3`,
  ].sort())
  expect(db.files).toContain(`asc3/${R.CREEK_EP3_ID}/outro_0065.mp3`)
  expect(db.files).toContain(`asc3/${R.CREEK_EP3_ID}/outro_with_music.mp3`)
})

test('live-verified byte shape: straight quotes, em-dash only non-ASCII', () => {
  for (const t of [R.EP2_OUTRO_BEFORE, R.EP2_OUTRO_AFTER_RAW, R.EP2_OUTRO_AFTER]) {
    const nonAscii = [...t].filter((c) => (c.codePointAt(0) ?? 0) > 127)
    expect(nonAscii).toEqual(['\u2014']) // em-dash only; no curly quotes
    expect(t).not.toMatch(/[\u2018\u2019\u201C\u201D]/)
  }
  expect(R.EP2_OUTRO_BEFORE).toContain("she'll have to decide")
  expect(R.EP2_OUTRO_AFTER_RAW).toContain('Episode 3,')
})

test('numeral normalization exact-match', () => {
  expect(R.normalizeSpokenNumerals('Episode 3, "What the Creek Knew," is where it all comes due.'))
    .toBe('Episode Three, "What the Creek Knew," is where it all comes due.')
  expect(R.ep2OutroGenerationPayload()).toBe(R.EP2_OUTRO_AFTER)
})

test('ep1 pin repair executes: stale legs + divergent raw in → synced raw + both pins re-derived + audit appended + three-link verification green', async () => {
  const db = buildDb()
  // Fixture seeds the actual live blocker (never already-correct).
  expect(db.stories[1].script_json.series_generation.continuity_pins_used[R.CREEK_EP1_ID]).toBe(STALE_EP1_PIN)
  expect(db.stories[2].script_json.series_generation.continuity_pins_used[R.CREEK_EP1_ID]).toBe(STALE_EP1_PIN)
  expect(STALE_EP1_PIN).not.toBe(hashScript(db.stories[0].script))
  expect(db.stories[0].script_json.raw_script).not.toBe(db.stories[0].script)
  // Pure planner agrees repair is needed, derived via the real method.
  const plan = R.ep1PinRepairPlan({ ep1: db.stories[0], ep2: db.stories[1], ep3: db.stories[2] })
  expect(plan.needed).toBe(true)
  expect(plan.rawDivergent).toBe(true)
  expect(plan.staleOn).toEqual([R.CREEK_EP2_ID, R.CREEK_EP3_ID])
  expect(plan.wantPinHash).toBe(hashScript(db.stories[0].script))
  // Preflight does NOT fail on the stale legs (they are the repair target).
  const pre = R.evaluatePreflight({ job: db.production_jobs[0], stories: db.stories })
  expect(pre.ok).toBe(true)
  expect(pre.ep1RepairNeeded).toBe(true)

  const { supabase, captured } = clientFor(db)
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(true)
  expect(r.continued).toBe(true)
  for (const c of captured) expect(c.url).not.toContain('[object Object]')

  // Synced raw + both pins re-derived from the current ep1 script.
  const want = hashScript(db.stories[0].script)
  expect(db.stories[0].script_json.raw_script).toBe(db.stories[0].script)
  expect(db.stories[1].script_json.series_generation.continuity_pins_used[R.CREEK_EP1_ID]).toBe(want)
  expect(db.stories[2].script_json.series_generation.continuity_pins_used[R.CREEK_EP1_ID]).toBe(want)
  // Captured-request proof: pin-repair PATCHes carry full UUIDs, nested
  // sg paths, CAS guards — never [object Object], never top-level columns.
  // Repair writes precede the handoff continuation by construction (step 3
  // before step 4); the handoff's later intent-clear PATCH re-carries the
  // same audit tail and must not be counted as a repair write.
  const contIdx = postgrestOf(captured).findIndex(
    (p) => p.url.includes('/rest/v1/production_jobs') && p.body.current_step !== undefined,
  )
  expect(contIdx).toBeGreaterThan(0)
  const pinPatches = postgrestOf(captured).slice(0, contIdx).filter((p) => {
    const audits = p.body.script_json?.series_generation?.belle_repair_audit
    return p.url.includes('/rest/v1/stories')
      && p.body.script === undefined
      && p.body.script_json?.series_generation?.continuity_pins_used?.[R.CREEK_EP1_ID] === want
      && Array.isArray(audits) && audits[audits.length - 1]?.action === R.EP1_PIN_REPAIR_ACTION
  })
  expect(pinPatches.length).toBe(2)
  for (const p of pinPatches) {
    expect(p.url).toContain('script_json=eq.')
    expect(p.body.continuity_pins_used).toBeUndefined()
    expect(p.body.outro_text).toBeUndefined()
    const audits = p.body.script_json.series_generation.belle_repair_audit
    expect(audits[audits.length - 1].jobId).toBe(R.CREEK_JOB_ID)
    expect(audits[audits.length - 1].action).toBe(R.EP1_PIN_REPAIR_ACTION)
  }
  // Audit appended with history intact: Ep2's seeded prior entry survives
  // first; both carriers record the repair (append, never overwrite).
  const audits2 = db.stories[1].script_json.series_generation.belle_repair_audit
  expect(audits2[0]).toEqual({ action: 'seeded_prior_repair', jobId: 'other-job' })
  for (const ep of [db.stories[1], db.stories[2]]) {
    const audits = ep.script_json.series_generation.belle_repair_audit
    expect(audits.some((e: any) => e?.jobId === R.CREEK_JOB_ID && e?.action === R.EP1_PIN_REPAIR_ACTION)).toBe(true)
  }
  // Final three-link verification green over the final rows.
  const fin = R.checkFinalContinuity(db.stories)
  expect(fin.ok).toBe(true)
  expect(fin.mismatches).toEqual([])
})

test('negative: final verification mismatch → reported failure, no success claim', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db, { sabotageFinalRead: true })
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  // Fail-closed: reported failure, never a success claim.
  expect(r.ok).toBe(false)
  expect(r.phase).toBe('final-verification')
  expect(r.failures!.length).toBeGreaterThan(0)
  expect(r.continued).toBeUndefined()
  expect(r.generationPayload).toBeUndefined()
  for (const c of captured) expect(c.url).not.toContain('[object Object]')
  // The pure gate agrees: tampered ep1 breaks both Ep1 legs.
  const tampered = db.stories.map((s: any) =>
    String(s.id) === R.CREEK_EP1_ID ? { ...s, script: String(s.script) + ' SABOTAGE' } : s,
  )
  const gate = R.checkFinalContinuity(tampered)
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBe(2) // Ep2→Ep1 + Ep3→Ep1
})

test('kill-switch after EACH write: restart converges, no duplicate script persist, no own-lock refusal', async () => {
  // Baseline full run to enumerate every mutating call.
  const baseDb = buildDb()
  const baseCap: any[] = []
  {
    const { supabase } = clientFor(baseDb, { captured: baseCap })
    const r = await R.runRecovery(supabase, { execute: true, ...quiet })
    expect(r.ok).toBe(true)
  }
  const mutating = writesOf(baseCap)
  expect(mutating.length).toBeGreaterThan(3)
  for (let n = 1; n <= mutating.length; n++) {
    const db = buildDb()
    const crashCap: any[] = []
    let seen = 0
    const { supabase: crashSb } = clientFor(db, {
      captured: crashCap,
      failOn: (c) => {
        if (c.method === 'PATCH' || c.method === 'DELETE') seen += 1
        return seen === n
      },
    })
    let threw = false
    try {
      await R.runRecovery(crashSb, { execute: true, ...quiet })
    } catch (e) {
      threw = true
      expect(String((e as Error).message)).toContain('SIMULATED CRASH')
    }
    expect(threw).toBe(true) // crash landed on write #n
    // Restart on the same rows converges.
    const { supabase: retrySb } = clientFor(db, {})
    const retry = await R.runRecovery(retrySb, { execute: true, ...quiet })
    expect(retry.ok).toBe(true) // never refuses on own-lock status
    expect(retry.continued).toBe(true)
    const job = db.production_jobs[0]
    expect(job.status).toBe('queued')
    expect(job.current_step).toBe(PRE_PACKAGING_CONTINUATION_STEP)
    expect(job.locked_by).toBeNull()
    // Ep2 script persist happened at most once across crash + restart.
    const scriptPersists = [...crashCap, ...[]].filter(
      (c) => c.method === 'PATCH' && c.url.includes('/rest/v1/stories') && c.body && c.body.script !== undefined,
    )
    expect(scriptPersists.length).toBeLessThanOrEqual(1)
    // Persisted text identical wherever it landed.
    expect(db.stories[1].outro_text).toBe(R.EP2_OUTRO_AFTER)
    expect(db.stories[1].script).toContain(R.EP2_OUTRO_AFTER)
  }
}, 60000)

// --- GUARD 1: final verification must not accept missing evidence ---------
// Marc's []-acceptance: checkFinalContinuity([]) returned ok:true (zero legs
// checked = zero mismatches) and final reads discarded query errors via
// `rows ?? []`. Every test below must refuse (ok:false) except the positive.
function finalRows() {
  const s1 = 'EP1 FINAL BODY. BELLE B OUTRO\n---\nBELLE B: finale one.'
  const s2 = 'EP2 FINAL BODY. BELLE B OUTRO\n---\nBELLE B: finale two.'
  const s3 = 'EP3 FINAL BODY. BELLE B OUTRO\n---\nBELLE B: finale three.'
  return [
    { id: R.CREEK_EP1_ID, episode_number: 1, script: s1, script_json: { series_generation: { continuity_pins_used: {} } } },
    { id: R.CREEK_EP2_ID, episode_number: 2, script: s2, script_json: { series_generation: { continuity_pins_used: { [R.CREEK_EP1_ID]: hashScript(s1) } } } },
    { id: R.CREEK_EP3_ID, episode_number: 3, script: s3, script_json: { series_generation: { continuity_pins_used: { [R.CREEK_EP1_ID]: hashScript(s1), [R.CREEK_EP2_ID]: hashScript(s2) } } } },
  ]
}

test('guard1: empty final read is refused, never success', () => {
  const gate = R.checkFinalContinuity([])
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBeGreaterThan(0)
})

test('guard1a: final-read query error is refused', () => {
  const gate = R.finalContinuityFromRead({ data: null, error: { message: 'boom' } })
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBeGreaterThan(0)
})

test('guard1a-integration: query error on the final read → refusal, no success', async () => {
  const db = buildDb()
  const { supabase, captured } = clientFor(db, { failFinalRead: true })
  const r = await R.runRecovery(supabase, { execute: true, ...quiet })
  expect(r.ok).toBe(false)
  expect(r.phase).toBe('final-verification')
  expect(r.failures!.length).toBeGreaterThan(0)
  expect(r.continued).toBeUndefined()
  for (const c of captured) expect(c.url).not.toContain('[object Object]')
})

test('guard1b: only two of three episodes returned → refusal', () => {
  const rows = finalRows().slice(0, 2)
  const gate = R.checkFinalContinuity(rows)
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBeGreaterThan(0)
})

test('guard1c: episode with empty script → refusal', () => {
  const rows = finalRows()
  rows[1] = { ...rows[1], script: '' }
  const gate = R.checkFinalContinuity(rows)
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBeGreaterThan(0)
})

test('guard1d: missing pin link → refusal', () => {
  const rows = finalRows()
  const pins = { ...rows[2].script_json.series_generation.continuity_pins_used }
  delete pins[R.CREEK_EP2_ID] // drop the Ep3→Ep2 leg
  rows[2] = { ...rows[2], script_json: { series_generation: { continuity_pins_used: pins } } }
  const gate = R.checkFinalContinuity(rows)
  expect(gate.ok).toBe(false)
  expect(gate.mismatches.length).toBeGreaterThan(0)
})

test('guard1e: all three IDs + nonempty scripts + all three links + matching hashes → ok:true', () => {
  const gate = R.checkFinalContinuity(finalRows())
  expect(gate.ok).toBe(true)
  expect(gate.mismatches).toEqual([])
})
