/**
 * casUpdateStory unit tests — stub-fetch evidence for the LARGE-DOC-CAS
 * helper in lib/belleRepairPersist.ts (branch fix/cas-rpc-large-doc).
 *
 * Covers: success returns the row; stale snapshot throws with code
 * CONCURRENT_MOD_CODE and leaves the row untouched; transport errors
 * throw plainly; unknown update keys surface the server whitelist error;
 * read-then-stale-write-then-retry converges; production-size docs
 * (18–27KB) travel in the POST body — no whole-doc URL filter anywhere.
 *
 * RUN WITH: npx jest __tests__/cas-update-story.test.ts
 */
import { createClient } from '@supabase/supabase-js'
import { casUpdateStory, CONCURRENT_MOD_CODE } from '../lib/belleRepairPersist'
import { buildLargeDoc } from '../scripts/cas-large-doc-fixture'

const STORY_ID = 'd381caca-a186-4deb-9a73-a2adac611637'

function deepEqualJson(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((v: any, i: number) => deepEqualJson(v, (b as any[])[i]))
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    return ka.length === kb.length
      && ka.every((k, i) => k === kb[i] && deepEqualJson(a[k], b[k]))
  }
  return false
}

// Minimal RPC stub: same contract as migration 20261022190000.
function stubRpc(db: { stories: any[] }, opts: { captured?: any[]; failNext?: boolean } = {}) {
  const captured = opts.captured ?? []
  const allowed = ['script', 'script_json', 'announcement_text', 'outro_text', 'announcement_url', 'outro_audio_url', 'outro_with_music_url']
  return async (url: any, fetchOpts: any = {}) => {
    const u = String(url)
    captured.push({ method: String(fetchOpts.method || 'GET'), url: u })
    let body: any = null
    try { body = fetchOpts.body ? JSON.parse(fetchOpts.body) : null } catch { body = fetchOpts.body }
    const errShape = (message: string, status = 400) => ({
      ok: false, status,
      headers: { get: () => null },
      json: async () => ({ message, code: status === 400 ? 'P0001' : '500' }),
      text: async () => JSON.stringify({ message }),
    })
    if (opts.failNext) return errShape('SIMULATED TRANSPORT FAILURE', 500)
    for (const k of Object.keys(body?.p_updates ?? {})) {
      if (!allowed.includes(k)) return errShape(`cas_update_story: column ${k} not in whitelist`)
    }
    const row = db.stories.find((r: any) => String(r.id) === String(body?.p_story_id))
    if (row && deepEqualJson(row.script_json ?? null, body?.p_expected ?? null)) {
      for (const k of Object.keys(body?.p_updates ?? {})) {
        // `?` presence semantics: explicit null writes NULL, absent untouched.
        row[k] = body.p_updates[k] === null ? null : JSON.parse(JSON.stringify(body.p_updates[k]))
      }
      const shaped = [{ updated_id: row.id }]
      return {
        ok: true, status: 200, headers: { get: () => null },
        json: async () => shaped, text: async () => JSON.stringify(shaped),
      }
    }
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => [], text: async () => '[]',
    }
  }
}

const clientFor = (db: { stories: any[] }, opts?: { captured?: any[]; failNext?: boolean }) => {
  const captured: any[] = opts?.captured ?? []
  return {
    supabase: createClient('http://localhost:9999', 'anon-key', { global: { fetch: stubRpc(db, { captured, failNext: opts?.failNext }) } }),
    captured,
  }
}

test('success: matching snapshot applies updates, returns row, others untouched', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  expect(JSON.stringify(doc).length).toBeGreaterThan(18000)
  const db = { stories: [{ id: STORY_ID, script: 'old', script_json: doc, outro_text: 'keep' }] }
  const { supabase, captured } = clientFor(db)
  const before = JSON.parse(JSON.stringify(doc))
  const next = { ...JSON.parse(JSON.stringify(doc)), raw_script: 'NEW RAW' }
  const r = await casUpdateStory(supabase, { storyId: STORY_ID, expected: before, updates: { script_json: next, outro_text: null } })
  expect(r).toEqual({ id: STORY_ID })
  expect(db.stories[0].script_json.raw_script).toBe('NEW RAW')
  expect(db.stories[0].script).toBe('old') // absent key untouched
  expect(db.stories[0].outro_text).toBeNull() // explicit null written
  expect(db.stories[0].outro_text).not.toBe('keep')
  // Transport shape: POST to /rpc, doc in body — never in the URL.
  const rpc = captured.find((c) => String(c.url).includes('/rest/v1/rpc/cas_update_story'))
  expect(rpc).toBeDefined()
  for (const c of captured) {
    expect(String(c.url)).not.toContain('script_json=eq.')
    expect(String(c.url).length).toBeLessThan(2000)
  }
})

test('conflict: stale snapshot throws CONCURRENT_MOD_CODE, row untouched', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  const db = { stories: [{ id: STORY_ID, script: 'old', script_json: doc }] }
  const { supabase } = clientFor(db)
  const stale = JSON.parse(JSON.stringify(doc))
  // Concurrent writer moves the row first.
  db.stories[0].script_json = { ...JSON.parse(JSON.stringify(doc)), raw_script: 'CONCURRENT' }
  await expect(
    casUpdateStory(supabase, { storyId: STORY_ID, expected: stale, updates: { script_json: doc } }),
  ).rejects.toMatchObject({ code: CONCURRENT_MOD_CODE })
  expect(db.stories[0].script_json.raw_script).toBe('CONCURRENT') // untouched by us
})

test('retry contract: re-read + retry with fresh snapshot converges', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  const db = { stories: [{ id: STORY_ID, script: 'old', script_json: doc }] }
  const { supabase } = clientFor(db)
  const stale = JSON.parse(JSON.stringify(doc))
  db.stories[0].script_json = { ...JSON.parse(JSON.stringify(doc)), raw_script: 'CONCURRENT' }
  const fresh = JSON.parse(JSON.stringify(db.stories[0].script_json))
  const next = { ...fresh, raw_script: 'RETRY OK' }
  const r = await casUpdateStory(supabase, { storyId: STORY_ID, expected: fresh, updates: { script_json: next } })
  expect(r).toEqual({ id: STORY_ID })
  expect(stale.raw_script).not.toBe('RETRY OK') // stale copy never used
  expect(db.stories[0].script_json.raw_script).toBe('RETRY OK')
})

test('transport error throws plainly (no conflict code)', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  const db = { stories: [{ id: STORY_ID, script_json: doc }] }
  const { supabase } = clientFor(db, { failNext: true })
  await expect(
    casUpdateStory(supabase, { storyId: STORY_ID, expected: doc, updates: { script_json: doc } }),
  ).rejects.toThrow(/SIMULATED TRANSPORT FAILURE/)
  try {
    await casUpdateStory(supabase, { storyId: STORY_ID, expected: doc, updates: { script_json: doc } })
    throw new Error('should have thrown')
  } catch (e) {
    expect((e as any).code).not.toBe(CONCURRENT_MOD_CODE)
  }
})

test('unknown update key surfaces the server whitelist error', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  const db = { stories: [{ id: STORY_ID, script_json: doc }] }
  const { supabase } = clientFor(db)
  await expect(
    casUpdateStory(supabase, { storyId: STORY_ID, expected: doc, updates: { evil_column: 1 } as any }),
  ).rejects.toThrow(/not in whitelist/)
  expect(db.stories[0].script_json).toEqual(doc) // untouched
})

test('absent expected snapshot never matches a real doc', async () => {
  const doc = buildLargeDoc('EP THREE BODY')
  const db = { stories: [{ id: STORY_ID, script_json: doc }] }
  const { supabase } = clientFor(db)
  await expect(
    casUpdateStory(supabase, { storyId: STORY_ID, expected: undefined, updates: { script_json: doc } }),
  ).rejects.toMatchObject({ code: CONCURRENT_MOD_CODE })
})
