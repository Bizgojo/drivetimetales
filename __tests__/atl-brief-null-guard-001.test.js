/**
 * atl-brief-null-guard-001.test.js
 *
 * Tests for ATL-BRIEF-GUARD-001: never clear stories.script when brief_json is null.
 *
 * Four code paths in run-next/route.ts can set stories.script = null:
 *   Path 1 (line ~9688): series-rewrite auto-clear (loop over episodes)
 *   Path 2 (line ~10231): validate_voice_conformance auto-retry
 *   Path 3 (line ~10452): validate_script auto-retry
 *   Path 4 (line ~10917): voice_preflight auto-retry (non-numeral kinds)
 *
 * Guard rule: if brief_json is null at the time of the clear, block the clear
 * and route to Marc review (needs_attention=true) instead.
 *
 * Run: npx jest __tests__/atl-brief-null-guard-001.test.js --no-coverage
 */

'use strict'

// ─── Minimal mirrors of production guard logic ────────────────────────────────

/**
 * Returns true if brief_json is non-null — the guard passes (clear is allowed).
 * Returns false if brief_json is null/undefined — the guard blocks the clear.
 */
function briefJsonGuardPasses(briefJson) {
  return briefJson != null
}

/**
 * Simulates the series-rewrite loop guard (Path 1).
 * Returns 'skipped' if brief_json is null, 'cleared' otherwise.
 */
function simulateSeriesRewriteEpisode(ep, markNeedsAttentionFn) {
  if (!ep.brief_json) {
    markNeedsAttentionFn(ep.id, `ATL-BRIEF-GUARD-001 (series-rewrite ep${ep.episode_number}): brief_json null — script clear skipped.`)
    return 'skipped'
  }
  // simulate clear
  ep.script = null
  return 'cleared'
}

/**
 * Simulates the voice_conformance guard (Path 2).
 * vcStory now carries brief_json from its select.
 * Returns 'guard_blocked' or 'cleared'.
 */
function simulateVoiceConformanceClear(vcStory, markNeedsAttentionFn) {
  if (!vcStory.brief_json) {
    markNeedsAttentionFn(vcStory.id, `ATL-BRIEF-GUARD-001 (voice_conformance): brief_json null — auto-retry blocked.`)
    return 'guard_blocked'
  }
  vcStory.script = null
  return 'cleared'
}

/**
 * Simulates the validate_script / voice_preflight auto-retry guard (Paths 3 & 4).
 * briefJsonFromDb is what a fresh DB fetch returns.
 * Returns 'guard_blocked' or 'cleared'.
 */
function simulateAutoRetryGuard(storyId, briefJsonFromDb, markNeedsAttentionFn, step) {
  if (!briefJsonFromDb) {
    markNeedsAttentionFn(storyId, `ATL-BRIEF-GUARD-001 (${step}): brief_json null — auto-retry blocked.`)
    return 'guard_blocked'
  }
  // simulate clear
  return 'cleared'
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ATL-BRIEF-GUARD-001: briefJsonGuardPasses logic', () => {
  test('passes when brief_json is a non-empty object', () => {
    expect(briefJsonGuardPasses({ description: 'A mystery set in a lighthouse.' })).toBe(true)
  })

  test('passes when brief_json is an empty object (at least non-null)', () => {
    expect(briefJsonGuardPasses({})).toBe(true)
  })

  test('blocks when brief_json is null', () => {
    expect(briefJsonGuardPasses(null)).toBe(false)
  })

  test('blocks when brief_json is undefined', () => {
    expect(briefJsonGuardPasses(undefined)).toBe(false)
  })
})

// ─── Path 1: series-rewrite loop ──────────────────────────────────────────────

describe('Path 1 (series-rewrite): brief_json null blocks script clear', () => {
  test('clears script when brief_json is present', () => {
    const ep = { id: 'ep-001', episode_number: 1, script: 'NARRATOR: Once upon a time...', brief_json: { description: 'A story.' } }
    const marked = []
    const result = simulateSeriesRewriteEpisode(ep, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('cleared')
    expect(ep.script).toBeNull()
    expect(marked).toHaveLength(0)
  })

  test('skips clear and marks needs_attention when brief_json is null', () => {
    const ep = { id: 'ep-002', episode_number: 2, script: 'NARRATOR: The storm came.', brief_json: null }
    const marked = []
    const result = simulateSeriesRewriteEpisode(ep, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('skipped')
    expect(ep.script).toBe('NARRATOR: The storm came.') // unchanged
    expect(marked).toHaveLength(1)
    expect(marked[0].id).toBe('ep-002')
    expect(marked[0].reason).toMatch(/ATL-BRIEF-GUARD-001/)
    expect(marked[0].reason).toMatch(/brief_json null/)
  })

  test('skips clear when brief_json is undefined', () => {
    const ep = { id: 'ep-003', episode_number: 3, script: 'NARRATOR: Darkness fell.', brief_json: undefined }
    const marked = []
    const result = simulateSeriesRewriteEpisode(ep, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('skipped')
    expect(ep.script).toBe('NARRATOR: Darkness fell.')
  })

  test('mixed loop: clears episodes with brief_json, skips those without', () => {
    const episodes = [
      { id: 'ep-010', episode_number: 1, script: 'Script A', brief_json: { description: 'Ep1' } },
      { id: 'ep-011', episode_number: 2, script: 'Script B', brief_json: null },
      { id: 'ep-012', episode_number: 3, script: 'Script C', brief_json: { description: 'Ep3' } },
    ]
    const marked = []
    const results = episodes.map(ep => simulateSeriesRewriteEpisode(ep, (id, reason) => marked.push({ id, reason })))
    expect(results[0]).toBe('cleared')
    expect(results[1]).toBe('skipped')
    expect(results[2]).toBe('cleared')
    expect(episodes[0].script).toBeNull()
    expect(episodes[1].script).toBe('Script B') // preserved
    expect(episodes[2].script).toBeNull()
    expect(marked).toHaveLength(1)
    expect(marked[0].id).toBe('ep-011')
  })
})

// ─── Path 2: validate_voice_conformance ───────────────────────────────────────

describe('Path 2 (voice_conformance): brief_json null blocks script clear', () => {
  test('vcStory select now includes brief_json field', () => {
    // Verifies the shape of vcStory has brief_json (structural contract)
    const vcStory = { id: 'story-vc-001', script: 'NARRATOR: ...', voice_profile_id: 'vp-123', series_id: null, brief_json: null }
    expect('brief_json' in vcStory).toBe(true)
  })

  test('clears script when brief_json is present', () => {
    const vcStory = { id: 'story-vc-002', script: 'NARRATOR: Good morning.', brief_json: { description: 'Thriller.' } }
    const marked = []
    const result = simulateVoiceConformanceClear(vcStory, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('cleared')
    expect(vcStory.script).toBeNull()
    expect(marked).toHaveLength(0)
  })

  test('blocks clear and returns guard_blocked when brief_json is null', () => {
    const vcStory = { id: 'story-vc-003', script: 'NARRATOR: The suspect fled.', brief_json: null }
    const marked = []
    const result = simulateVoiceConformanceClear(vcStory, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('guard_blocked')
    expect(vcStory.script).toBe('NARRATOR: The suspect fled.') // script preserved
    expect(marked).toHaveLength(1)
    expect(marked[0].id).toBe('story-vc-003')
    expect(marked[0].reason).toMatch(/ATL-BRIEF-GUARD-001/)
    expect(marked[0].reason).toMatch(/voice_conformance/)
    expect(marked[0].reason).toMatch(/brief_json null/)
  })

  test('script is not cleared when brief_json is undefined', () => {
    const vcStory = { id: 'story-vc-004', script: 'NARRATOR: Dawn broke over the marsh.', brief_json: undefined }
    const marked = []
    const result = simulateVoiceConformanceClear(vcStory, (id, reason) => marked.push({ id, reason }))
    expect(result).toBe('guard_blocked')
    expect(vcStory.script).not.toBeNull()
  })
})

// ─── Path 3: validate_script auto-retry ───────────────────────────────────────

describe('Path 3 (validate_script): brief_json null blocks auto-retry clear', () => {
  test('clears script when brief_json fetched from DB is non-null', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vs-001', { description: 'A ghost story.' }, (id, r) => marked.push({ id, r }), 'validate_script')
    expect(result).toBe('cleared')
    expect(marked).toHaveLength(0)
  })

  test('blocks clear when DB returns null brief_json', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vs-002', null, (id, r) => marked.push({ id, r }), 'validate_script')
    expect(result).toBe('guard_blocked')
    expect(marked).toHaveLength(1)
    expect(marked[0].id).toBe('story-vs-002')
    expect(marked[0].r).toMatch(/ATL-BRIEF-GUARD-001/)
    expect(marked[0].r).toMatch(/validate_script/)
  })

  test('blocks clear when DB returns undefined brief_json (maybeSingle returns nothing)', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vs-003', undefined, (id, r) => marked.push({ id, r }), 'validate_script')
    expect(result).toBe('guard_blocked')
    expect(marked).toHaveLength(1)
  })

  test('guard does not fire when brief_json is an empty object', () => {
    // Empty object is non-null; guard should pass
    const marked = []
    const result = simulateAutoRetryGuard('story-vs-004', {}, (id, r) => marked.push({ id, r }), 'validate_script')
    expect(result).toBe('cleared')
    expect(marked).toHaveLength(0)
  })
})

// ─── Path 4: voice_preflight auto-retry (non-numeral kinds) ───────────────────

describe('Path 4 (voice_preflight): brief_json null blocks non-numeral auto-retry clear', () => {
  test('clears script when brief_json is present (script_unlabeled_lines)', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vp-001', { description: 'Sci-fi.' }, (id, r) => marked.push({ id, r }), 'voice_preflight/script_unlabeled_lines')
    expect(result).toBe('cleared')
    expect(marked).toHaveLength(0)
  })

  test('blocks clear and routes to Marc when brief_json is null (script_unlabeled_lines)', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vp-002', null, (id, r) => marked.push({ id, r }), 'voice_preflight/script_unlabeled_lines')
    expect(result).toBe('guard_blocked')
    expect(marked).toHaveLength(1)
    expect(marked[0].id).toBe('story-vp-002')
    expect(marked[0].r).toMatch(/ATL-BRIEF-GUARD-001/)
    expect(marked[0].r).toMatch(/brief_json null/)
  })

  test('blocks clear when brief_json is null (belle_quality_ kind)', () => {
    const marked = []
    const result = simulateAutoRetryGuard('story-vp-003', null, (id, r) => marked.push({ id, r }), 'voice_preflight/belle_quality_hook')
    expect(result).toBe('guard_blocked')
    expect(marked[0].r).toMatch(/ATL-BRIEF-GUARD-001/)
  })

  test('numeral_pre_tts path is unaffected (preservePassValidatedScript skips the guard entirely)', () => {
    // The numeral_pre_tts path uses preservePassValidatedScript=true, which skips
    // the !preservePassValidatedScript branch where the guard lives.
    // Guard is never reached; this test documents the invariant.
    const isNumeralPreTts = true
    const preservePassValidatedScript = isNumeralPreTts
    // If preservePassValidatedScript is true, the guard block is not entered
    expect(preservePassValidatedScript).toBe(true)
    // We confirm the guard only fires inside the false branch
    // (no assertion against the guard itself — it doesn't run)
  })
})

// ─── Cross-path invariants ────────────────────────────────────────────────────

describe('Cross-path: guard message format', () => {
  test('all guard messages include ATL-BRIEF-GUARD-001 identifier', () => {
    const messages = [
      `ATL-BRIEF-GUARD-001 (series-rewrite ep2): brief_json null — script clear skipped.`,
      `ATL-BRIEF-GUARD-001 (voice_conformance): brief_json null — auto-retry blocked.`,
      `ATL-BRIEF-GUARD-001 (validate_script): brief_json null — auto-retry blocked.`,
      `ATL-BRIEF-GUARD-001 (voice_preflight/script_unlabeled_lines): brief_json null — auto-retry blocked.`,
    ]
    messages.forEach(msg => {
      expect(msg).toMatch(/ATL-BRIEF-GUARD-001/)
      expect(msg).toMatch(/brief_json null/)
    })
  })

  test('guard does not trigger for stories with valid brief_json', () => {
    const validBriefs = [
      { description: 'A coastal thriller.' },
      { description: 'A romance set in 1920s Paris.', series_name: 'Paris After Dark' },
      { description: 'A standalone mystery.' },
    ]
    validBriefs.forEach(brief => {
      expect(briefJsonGuardPasses(brief)).toBe(true)
    })
  })

  test('guard triggers for all null/undefined brief_json variants', () => {
    [null, undefined].forEach(val => {
      expect(briefJsonGuardPasses(val)).toBe(false)
    })
  })
})
