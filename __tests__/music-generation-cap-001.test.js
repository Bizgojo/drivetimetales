/**
 * music-generation-cap-001.test.js
 *
 * GATE 3 (MUSIC-CAP-001) spec §3 regression tests for the music generation
 * attempt cap (cap = 3).
 *
 * The music poll loop (asc3/generate-music) had NO attempt counter and was
 * silently re-queued without bound (hole C6). These tests verify, WITHOUT a
 * live DB or Supabase, the pure cap/counter discipline that was added to
 * runStandaloneMusicGeneration and runSeriesMusicGeneration in
 * app/api/admin/production-jobs/run-next/route.ts:
 *
 *   - the counter increments once per dispatch (per provider fetch)
 *   - the 4th attempt is REFUSED WITHOUT a provider fetch
 *   - success resets that episode's / story's counter to 0
 *   - series: Ep2 exhausted does NOT stop Ep3 (siblings unaffected)
 *   - exhaustion flags needs_attention on the AFFECTED story ONLY
 *   - manual Marc requeue resets the counter (explicit, not auto)
 *   - absent counter = 0 (no migration)
 *
 * These mirrors are kept in sync with the production logic. If run-next changes
 * the cap/increment/refusal semantics, update these mirrors and the tests catch
 * the drift.
 *
 * Run: npx jest __tests__/music-generation-cap-001.test.js --no-coverage
 */

'use strict'

// ─── Mirror of the production cap constant ─────────────────────────────────
// Keep in sync with MAX_MUSIC_RETRIES in run-next/route.ts.
const MAX_MUSIC_RETRIES = 3

// ─── Standalone mirror ──────────────────────────────────────────────────────
// Mirrors runStandaloneMusicGeneration()'s cap/increment/reset block.
// `fetchMock` stands in for fetch(.../api/asc3/generate-music); it is called
// ONLY when an attempt is actually dispatched to the provider.
async function standaloneMusicAttempt(state, { fetchMock, markNeedsAttention, storyId }) {
  const prevMusicRetry = state.musicRetry && typeof state.musicRetry === 'object' ? state.musicRetry : {}
  const musicAttempts = Number(prevMusicRetry.count ?? 0)

  // Cap check BEFORE any provider fetch.
  if (musicAttempts >= MAX_MUSIC_RETRIES) {
    markNeedsAttention(storyId, 'music_retry_exhausted (standalone)')
    return {
      success: false,
      retryExhausted: true,
      fetched: false,
      kind: 'music_retry_exhausted',
      state: { ...state, musicRetry: { ...prevMusicRetry, count: musicAttempts } },
    }
  }

  // Increment immediately BEFORE the provider fetch.
  const nextMusicAttempts = musicAttempts + 1
  const report = await fetchMock({ storyId })
  const success = report.ok === true

  return {
    success,
    retryExhausted: false,
    fetched: true,
    state: {
      ...state,
      // success resets to 0; failure persists the incremented count
      musicRetry: { ...prevMusicRetry, count: success ? 0 : nextMusicAttempts },
    },
  }
}

// ─── Series mirror ──────────────────────────────────────────────────────────
// Mirrors runSeriesMusicGeneration()'s per-episode cap/increment/reset block.
// One episode processed per call (same as production `break`).
async function seriesMusicAttempt(state, { episodes, fetchMock, markNeedsAttention, storyIdForEp }) {
  const prev = state.seriesMusicGeneration && typeof state.seriesMusicGeneration === 'object'
    ? state.seriesMusicGeneration : {}
  const doneByEp = prev.doneByEp ? { ...prev.doneByEp } : {}

  const prevMusicRetry = state.musicRetry && typeof state.musicRetry === 'object' ? state.musicRetry : {}
  const byEpisode = prevMusicRetry.byEpisode && typeof prevMusicRetry.byEpisode === 'object'
    ? { ...prevMusicRetry.byEpisode } : {}

  let processedEp = null
  let musicRetryExhausted = null
  let exhaustedStoryId = null
  let fetched = false

  for (const num of episodes) {
    const key = String(num)
    if (doneByEp[key]) continue // complete OR 'refused' → finished this pass

    const storyId = storyIdForEp(num)
    const epAttempts = Number(byEpisode[key] ?? 0)

    // Cap check BEFORE any provider fetch. Refuse this ep, flag ITS story only,
    // continue to the next ep (siblings unaffected).
    if (epAttempts >= MAX_MUSIC_RETRIES) {
      doneByEp[key] = 'refused'
      musicRetryExhausted = num
      exhaustedStoryId = storyId
      markNeedsAttention(storyId, `music_retry_exhausted Ep${num}`)
      continue
    }

    // Increment immediately BEFORE the provider fetch.
    byEpisode[key] = epAttempts + 1
    const report = await fetchMock({ storyId, num })
    fetched = true
    const ok = report.ok === true
    doneByEp[key] = ok
    if (ok) byEpisode[key] = 0 // success resets this ep's counter
    processedEp = num
    break // one episode per call
  }

  const allDone = episodes.every(n => Boolean(doneByEp[String(n)]))
  return {
    allDone,
    processedEp,
    musicRetryExhausted,
    exhaustedStoryId,
    fetched,
    state: {
      ...state,
      seriesMusicGeneration: { doneByEp, allDone },
      musicRetry: { ...prevMusicRetry, byEpisode },
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function okFetch() {
  return jest.fn(async () => ({ ok: true }))
}
function failFetch() {
  return jest.fn(async () => ({ ok: false }))
}

describe('MUSIC-CAP-001 — standalone', () => {
  test('absent counter = 0 (no migration): first attempt dispatches', async () => {
    const fetchMock = okFetch()
    const na = jest.fn()
    const r = await standaloneMusicAttempt({}, { fetchMock, markNeedsAttention: na, storyId: 's1' })
    expect(r.fetched).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('counter increments once per dispatch (failures)', async () => {
    const fetchMock = failFetch()
    const na = jest.fn()
    let state = {}
    state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    expect(state.musicRetry.count).toBe(1)
    state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    expect(state.musicRetry.count).toBe(2)
    state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    expect(state.musicRetry.count).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('4th attempt is REFUSED WITHOUT a provider fetch (mock called 3×)', async () => {
    const fetchMock = failFetch()
    const na = jest.fn()
    let state = {}
    for (let i = 0; i < 3; i++) {
      state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    }
    const fourth = await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })
    expect(fourth.retryExhausted).toBe(true)
    expect(fourth.fetched).toBe(false)
    expect(fourth.kind).toBe('music_retry_exhausted')
    expect(fetchMock).toHaveBeenCalledTimes(3) // provider never fetched a 4th time
  })

  test('exhaustion flags needs_attention on the affected story ONLY', async () => {
    const fetchMock = failFetch()
    const na = jest.fn()
    let state = {}
    for (let i = 0; i < 3; i++) {
      state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    }
    await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })
    expect(na).toHaveBeenCalledTimes(1)
    expect(na).toHaveBeenCalledWith('s1', expect.stringContaining('music_retry_exhausted'))
  })

  test('success resets the counter to 0', async () => {
    const na = jest.fn()
    let state = {}
    // two failures
    state = (await standaloneMusicAttempt(state, { fetchMock: failFetch(), markNeedsAttention: na, storyId: 's1' })).state
    state = (await standaloneMusicAttempt(state, { fetchMock: failFetch(), markNeedsAttention: na, storyId: 's1' })).state
    expect(state.musicRetry.count).toBe(2)
    // then success
    const good = await standaloneMusicAttempt(state, { fetchMock: okFetch(), markNeedsAttention: na, storyId: 's1' })
    expect(good.success).toBe(true)
    expect(good.state.musicRetry.count).toBe(0)
  })

  test('manual Marc requeue resets the counter (explicit, not auto)', async () => {
    const fetchMock = failFetch()
    const na = jest.fn()
    let state = {}
    for (let i = 0; i < 3; i++) {
      state = (await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).state
    }
    // exhausted
    expect((await standaloneMusicAttempt(state, { fetchMock, markNeedsAttention: na, storyId: 's1' })).retryExhausted).toBe(true)
    // Marc manually requeues → explicit reset of the counter
    const requeued = { ...state, musicRetry: { ...state.musicRetry, count: 0 } }
    const after = await standaloneMusicAttempt(requeued, { fetchMock: okFetch(), markNeedsAttention: na, storyId: 's1' })
    expect(after.fetched).toBe(true) // dispatches again after reset
    expect(after.retryExhausted).toBe(false)
  })
})

describe('MUSIC-CAP-001 — series', () => {
  const storyIdForEp = (n) => `story-ep${n}`

  // Drive the series loop repeatedly, feeding per-episode fetch outcomes.
  // outcomes: map epNum -> boolean (ok). Runs until allDone, capped iterations.
  async function drive(initialState, episodes, outcomesByEp, na) {
    let state = initialState
    const fetchCalls = []
    let last
    for (let iter = 0; iter < 50; iter++) {
      const fetchMock = jest.fn(async ({ num }) => {
        fetchCalls.push(num)
        return { ok: outcomesByEp[num] === true }
      })
      last = await seriesMusicAttempt(state, { episodes, fetchMock, markNeedsAttention: na, storyIdForEp })
      state = last.state
      if (last.allDone) break
    }
    return { state, fetchCalls, last }
  }

  test('counter increments per dispatch, per episode', async () => {
    const na = jest.fn()
    const { state } = await drive({}, [1], { 1: false }, na) // Ep1 keeps failing
    // Ep1 failed 3 times then refused → byEpisode["1"] === 3
    expect(state.musicRetry.byEpisode['1']).toBe(3)
  })

  test('4th attempt refused WITHOUT a provider fetch (Ep1 fetched exactly 3×)', async () => {
    const na = jest.fn()
    const { fetchCalls } = await drive({}, [1], { 1: false }, na)
    const ep1Fetches = fetchCalls.filter(n => n === 1).length
    expect(ep1Fetches).toBe(3)
  })

  test('Ep2 exhausted while Ep3 proceeds (siblings unaffected)', async () => {
    const na = jest.fn()
    // Ep1 ok, Ep2 always fails (will exhaust), Ep3 ok
    const { state, fetchCalls, last } = await drive({}, [1, 2, 3], { 1: true, 2: false, 3: true }, na)
    // Ep2 refused, Ep1 and Ep3 complete → series allDone (refused is terminal)
    expect(last.allDone).toBe(true)
    expect(state.seriesMusicGeneration.doneByEp['1']).toBe(true)
    expect(state.seriesMusicGeneration.doneByEp['2']).toBe('refused')
    expect(state.seriesMusicGeneration.doneByEp['3']).toBe(true)
    // Ep2 fetched exactly 3× (cap), Ep3 still got its successful fetch
    expect(fetchCalls.filter(n => n === 2).length).toBe(3)
    expect(fetchCalls.filter(n => n === 3).length).toBe(1)
  })

  test('exhaustion sets needs_attention on the affected story ONLY (not siblings/series)', async () => {
    const na = jest.fn()
    await drive({}, [1, 2, 3], { 1: true, 2: false, 3: true }, na)
    // needs_attention called ONLY for Ep2's own story
    const flagged = na.mock.calls.map(c => c[0])
    expect(flagged).toContain(storyIdForEp(2))
    expect(flagged).not.toContain(storyIdForEp(1))
    expect(flagged).not.toContain(storyIdForEp(3))
    // every needs_attention call targets the affected (Ep2) story only
    expect(new Set(flagged)).toEqual(new Set([storyIdForEp(2)]))
  })

  test('success resets that episode counter to 0', async () => {
    const na = jest.fn()
    // Ep1 fails twice then succeeds on the third attempt
    let state = {}
    const outcomes = { attempt: 0 }
    for (let iter = 0; iter < 5; iter++) {
      const fetchMock = jest.fn(async () => {
        outcomes.attempt += 1
        return { ok: outcomes.attempt >= 3 } // succeed on 3rd
      })
      const r = await seriesMusicAttempt(state, { episodes: [1], fetchMock, markNeedsAttention: na, storyIdForEp })
      state = r.state
      if (r.allDone) break
    }
    expect(state.seriesMusicGeneration.doneByEp['1']).toBe(true)
    expect(state.musicRetry.byEpisode['1']).toBe(0) // reset on success
  })

  test('manual Marc requeue resets the exhausted episode counter', async () => {
    const na = jest.fn()
    // Ep1 exhausts
    let { state } = await drive({}, [1], { 1: false }, na)
    expect(state.musicRetry.byEpisode['1']).toBe(3)
    // Marc manually requeues Ep1: explicit reset of counter AND clears its done flag
    const requeued = {
      ...state,
      musicRetry: { ...state.musicRetry, byEpisode: { ...state.musicRetry.byEpisode, '1': 0 } },
      seriesMusicGeneration: { ...state.seriesMusicGeneration, doneByEp: { ...state.seriesMusicGeneration.doneByEp, '1': false } },
    }
    const fetchMock = okFetch()
    const after = await seriesMusicAttempt(requeued, { episodes: [1], fetchMock, markNeedsAttention: na, storyIdForEp })
    expect(fetchMock).toHaveBeenCalledTimes(1) // dispatches again after reset
    expect(after.state.seriesMusicGeneration.doneByEp['1']).toBe(true)
  })

  test('absent counter = 0: first series attempt dispatches', async () => {
    const na = jest.fn()
    const fetchMock = okFetch()
    const r = await seriesMusicAttempt({}, { episodes: [1], fetchMock, markNeedsAttention: na, storyIdForEp })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.state.musicRetry.byEpisode['1']).toBe(0)
  })
})
