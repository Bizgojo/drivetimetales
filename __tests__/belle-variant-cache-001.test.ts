// ATL-BELLE-CACHE-001 — Belle variant cache unit tests.
//
// The generate-belle-variants route decides "reuse vs regenerate" with
// computeBelleVariantCacheKey + isBelleVariantCacheHit. These tests exercise
// that decision flow with a fake store and a fake LLM so we can assert:
//   1. cache HIT  → LLM generation is skipped, stored variants are reused
//   2. cache MISS → LLM generation runs and rows are stored with the hash
//   3. script change → hash changes → stale variants are invalidated

import {
  BELLE_VARIANT_PROMPT_VERSION,
  computeBelleVariantCacheKey,
  isBelleVariantCacheHit,
  type BelleVariantCacheRow,
} from '@/lib/belleVariantCache'

const MODEL = 'claude-haiku-4-5'
const EXPECTED_KEYS = [
  'intro:session_first',
  'intro:session_continue',
  'intro:returning_listener',
  'intro:simple',
  'outro:simple',
  'outro:reflective',
  'outro:series_continue',
]

function buildPrompt(script: string, templateNote = 'template-v1') {
  // Stand-in for the real route prompt: embeds script text + template rules.
  return `Generate story-specific intro/outro copy for Belle.\n[${templateNote}]\nScript excerpt:\n${script}`
}

function storedRows(scriptHash: string | null): BelleVariantCacheRow[] {
  return EXPECTED_KEYS.map((key) => {
    const [kind, variant_key] = key.split(':')
    return { kind, variant_key, script_hash: scriptHash }
  })
}

/**
 * Minimal replica of the route's cache decision flow:
 * look up stored rows → hit? reuse : generate via LLM and store with hash.
 */
function runVariantStep(opts: {
  store: BelleVariantCacheRow[]
  prompt: string
  generate: () => BelleVariantCacheRow[]
}) {
  const scriptHash = computeBelleVariantCacheKey({ model: MODEL, prompt: opts.prompt })
  if (isBelleVariantCacheHit(opts.store, EXPECTED_KEYS, scriptHash)) {
    return { cached: true, scriptHash, variants: opts.store, store: opts.store }
  }
  const generated = opts.generate().map((row) => ({ ...row, script_hash: scriptHash }))
  return { cached: false, scriptHash, variants: generated, store: generated }
}

describe('ATL-BELLE-CACHE-001: computeBelleVariantCacheKey', () => {
  test('is deterministic for identical inputs', () => {
    const prompt = buildPrompt('The lighthouse keeper found the door open.')
    const a = computeBelleVariantCacheKey({ model: MODEL, prompt })
    const b = computeBelleVariantCacheKey({ model: MODEL, prompt })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  test('changes when the script text changes', () => {
    const a = computeBelleVariantCacheKey({ model: MODEL, prompt: buildPrompt('Script A') })
    const b = computeBelleVariantCacheKey({ model: MODEL, prompt: buildPrompt('Script B') })
    expect(a).not.toBe(b)
  })

  test('changes when the prompt template changes', () => {
    const script = 'Same script text.'
    const a = computeBelleVariantCacheKey({ model: MODEL, prompt: buildPrompt(script, 'template-v1') })
    const b = computeBelleVariantCacheKey({ model: MODEL, prompt: buildPrompt(script, 'template-v2') })
    expect(a).not.toBe(b)
  })

  test('changes when the prompt version is bumped (forced invalidation)', () => {
    const prompt = buildPrompt('Same script.')
    const a = computeBelleVariantCacheKey({ model: MODEL, prompt })
    const b = computeBelleVariantCacheKey({ model: MODEL, prompt, promptVersion: `${BELLE_VARIANT_PROMPT_VERSION}-next` })
    expect(a).not.toBe(b)
  })

  test('changes when the model changes', () => {
    const prompt = buildPrompt('Same script.')
    const a = computeBelleVariantCacheKey({ model: MODEL, prompt })
    const b = computeBelleVariantCacheKey({ model: 'claude-haiku-5', prompt })
    expect(a).not.toBe(b)
  })
})

describe('ATL-BELLE-CACHE-001: isBelleVariantCacheHit', () => {
  const prompt = buildPrompt('The bell rang twice at midnight.')
  const hash = computeBelleVariantCacheKey({ model: MODEL, prompt })

  test('hit when all 7 expected variants exist with the current hash', () => {
    expect(isBelleVariantCacheHit(storedRows(hash), EXPECTED_KEYS, hash)).toBe(true)
  })

  test('miss when no variants are stored', () => {
    expect(isBelleVariantCacheHit([], EXPECTED_KEYS, hash)).toBe(false)
    expect(isBelleVariantCacheHit(null, EXPECTED_KEYS, hash)).toBe(false)
    expect(isBelleVariantCacheHit(undefined, EXPECTED_KEYS, hash)).toBe(false)
  })

  test('miss when a variant is missing from the stored set', () => {
    const partial = storedRows(hash).slice(0, 6)
    expect(isBelleVariantCacheHit(partial, EXPECTED_KEYS, hash)).toBe(false)
  })

  test('miss for pre-migration rows (script_hash NULL)', () => {
    expect(isBelleVariantCacheHit(storedRows(null), EXPECTED_KEYS, hash)).toBe(false)
  })

  test('miss when any single stored row has a stale hash', () => {
    const rows = storedRows(hash)
    rows[3] = { ...rows[3], script_hash: 'stale-hash' }
    expect(isBelleVariantCacheHit(rows, EXPECTED_KEYS, hash)).toBe(false)
  })

  test('miss when the computed hash is empty', () => {
    expect(isBelleVariantCacheHit(storedRows(''), EXPECTED_KEYS, '')).toBe(false)
  })
})

describe('ATL-BELLE-CACHE-001: retry decision flow (route replica)', () => {
  const freshVariants = (): BelleVariantCacheRow[] =>
    EXPECTED_KEYS.map((key) => {
      const [kind, variant_key] = key.split(':')
      return { kind, variant_key }
    })

  test('cache miss: first run generates via LLM and stores the hash', () => {
    const generate = jest.fn(freshVariants)
    const prompt = buildPrompt('Episode 1 script.')

    const result = runVariantStep({ store: [], prompt, generate })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.cached).toBe(false)
    expect(result.store).toHaveLength(7)
    expect(result.store.every((row) => row.script_hash === result.scriptHash)).toBe(true)
  })

  test('cache hit: retry with unchanged script skips LLM generation entirely', () => {
    const generate = jest.fn(freshVariants)
    const prompt = buildPrompt('Episode 1 script.')

    // First run (miss) populates the store; retry re-enters with same inputs.
    const first = runVariantStep({ store: [], prompt, generate })
    const retry = runVariantStep({ store: first.store, prompt, generate })

    expect(generate).toHaveBeenCalledTimes(1) // no second LLM call
    expect(retry.cached).toBe(true)
    expect(retry.scriptHash).toBe(first.scriptHash)
    expect(retry.variants).toBe(first.store) // reused, not regenerated
  })

  test('script change invalidates the cache and regenerates', () => {
    const generate = jest.fn(freshVariants)

    const first = runVariantStep({ store: [], prompt: buildPrompt('Original script.'), generate })
    const changed = runVariantStep({ store: first.store, prompt: buildPrompt('Edited script.'), generate })

    expect(generate).toHaveBeenCalledTimes(2) // regenerated after change
    expect(changed.cached).toBe(false)
    expect(changed.scriptHash).not.toBe(first.scriptHash)
    expect(changed.store.every((row) => row.script_hash === changed.scriptHash)).toBe(true)
  })

  test('template change invalidates the cache and regenerates', () => {
    const generate = jest.fn(freshVariants)
    const script = 'Same script.'

    const first = runVariantStep({ store: [], prompt: buildPrompt(script, 'template-v1'), generate })
    const changed = runVariantStep({ store: first.store, prompt: buildPrompt(script, 'template-v2'), generate })

    expect(generate).toHaveBeenCalledTimes(2)
    expect(changed.cached).toBe(false)
    expect(changed.scriptHash).not.toBe(first.scriptHash)
  })
})
