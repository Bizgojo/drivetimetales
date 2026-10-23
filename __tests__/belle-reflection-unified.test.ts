/**
 * REFLECTION-RULE-UNIFICATION-001 (Marc 2026-10-22 22:45 EDT, PERMANENT):
 * the reflection check is one pipeline-wide rule, not a one-story patch.
 * Generation, validation, AND repair paths must share the single definition
 * in lib/belleValidation.ts — this test pins that contract:
 *
 *  1. VALIDATION PATH — every shared valid example (the Harbor Light outro
 *     + paraphrases) passes hasEmotionalResidueOrReflection; every shared
 *     plot-only recap fails it.
 *  2. FRAGMENT INTEGRITY — the prompt fragment is built from those same
 *     arrays, so prompt prose and validator acceptance cannot drift.
 *  3. REPAIR PATH — the series repair builder and both Belle quality-loop
 *     prompts reference the shared fragment (not a restated copy).
 *  4. GENERATION PATH — the series + standalone script prompts reference
 *     the shared fragment (not a restated copy).
 *  5. ANTI-DIVERGENCE — no second copy of the marker regexes lives outside
 *     lib/belleValidation.ts.
 */
import fs from 'fs'
import path from 'path'
import {
  hasEmotionalResidueOrReflection,
  REFLECTION_VALID_EXAMPLES,
  REFLECTION_INVALID_EXAMPLES,
  REFLECTION_RULE_PROMPT_FRAGMENT,
} from '@/lib/belleValidation'

const runNextRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'),
  'utf8'
)
const seriesPackageRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/v2/series-package/generate-scripts/route.ts'),
  'utf8'
)
const generateScriptRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/v2/generate-script/route.ts'),
  'utf8'
)

describe('REFLECTION-RULE-UNIFICATION-001: validation path accepts the shared rule', () => {
  test('the Harbor Light quoted outro passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        "That's a lot to carry — a failing joint, a demolition order, and now him. Sit with that for a second..."
      )
    ).toBe(true)
  })

  test('every shared valid example (outro + paraphrases) passes', () => {
    expect(REFLECTION_VALID_EXAMPLES.length).toBeGreaterThanOrEqual(9)
    for (const ex of REFLECTION_VALID_EXAMPLES) {
      expect(hasEmotionalResidueOrReflection(ex)).toBe(true)
    }
  })

  test('every shared plot-only recap fails', () => {
    expect(REFLECTION_INVALID_EXAMPLES.length).toBeGreaterThanOrEqual(8)
    for (const ex of REFLECTION_INVALID_EXAMPLES) {
      expect(hasEmotionalResidueOrReflection(ex)).toBe(false)
    }
  })
})

describe('REFLECTION-RULE-UNIFICATION-001: fragment is built from the shared examples', () => {
  test('fragment contains every valid example verbatim', () => {
    for (const ex of REFLECTION_VALID_EXAMPLES) {
      expect(REFLECTION_RULE_PROMPT_FRAGMENT).toContain(ex)
    }
  })

  test('fragment contains every invalid example verbatim', () => {
    for (const ex of REFLECTION_INVALID_EXAMPLES) {
      expect(REFLECTION_RULE_PROMPT_FRAGMENT).toContain(ex)
    }
  })

  test('fragment states the rule (not plot summary only)', () => {
    expect(REFLECTION_RULE_PROMPT_FRAGMENT).toMatch(/NOT plot summary only/)
    expect(REFLECTION_RULE_PROMPT_FRAGMENT).toMatch(/felt experience/)
  })
})

describe('REFLECTION-RULE-UNIFICATION-001: repair path uses the shared fragment', () => {
  // Bounded-span assertions: each prompt block is sliced from its start
  // anchor to its end anchor (both INSIDE the same template literal), and
  // the span must contain EXACTLY ONE real interpolation after the block's
  // own outro anchor. A bare import, a stray comment, or an interpolation
  // moved outside the prompt cannot satisfy these.
  const INTERP = '${REFLECTION_RULE_PROMPT_FRAGMENT}'
  const countInterps = (span: string) => span.split(INTERP).length - 1

  test('series repair prompt interpolates the fragment after its outro anchor', () => {
    const start = runNextRoute.indexOf('Repair only the Belle intro/outro copy')
    const end = runNextRoute.indexOf('VALIDATION ISSUES TO FIX:')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const span = runNextRoute.slice(start, end)
    const anchor = span.indexOf('Non-finale outro must tease or point toward the next episode.')
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(span.indexOf(INTERP)).toBeGreaterThan(anchor)
    expect(countInterps(span)).toBe(1)
  })

  test('quality validator prompt interpolates the fragment after its outro anchor', () => {
    const start = runNextRoute.indexOf('BELLE_QUALITY_VALIDATOR_PROMPT')
    const end = runNextRoute.indexOf('BELLE_QUALITY_REPAIR_PROMPT')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const span = runNextRoute.slice(start, end)
    const anchor = span.indexOf('Only fail a series non-finale outro')
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(span.indexOf(INTERP)).toBeGreaterThan(anchor)
    expect(countInterps(span)).toBe(1)
  })

  test('quality repair prompt interpolates the fragment after its outro anchor', () => {
    const start = runNextRoute.indexOf('BELLE_QUALITY_REPAIR_PROMPT')
    const end = runNextRoute.indexOf('function parseJsonObject')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const span = runNextRoute.slice(start, end)
    const anchor = span.indexOf('emotionally land and feel companion-like')
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(span.indexOf(INTERP)).toBeGreaterThan(anchor)
    expect(countInterps(span)).toBe(1)
  })
})

describe('REFLECTION-RULE-UNIFICATION-001: generation path uses the shared fragment', () => {
  test('series script generation interpolates the fragment in the outro template', () => {
    const INTERP = '${REFLECTION_RULE_PROMPT_FRAGMENT}'
    const start = seriesPackageRoute.indexOf('const belleOutroTemplate')
    const end = seriesPackageRoute.indexOf('return `You are the Endless Tales Stage 2')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const span = seriesPackageRoute.slice(start, end)
    const anchor = span.indexOf('reflective cliffhanger tease')
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(span.indexOf(INTERP)).toBeGreaterThan(anchor)
    // Exactly one interpolation in the template block (duplication guard).
    expect(span.split(INTERP).length - 1).toBe(1)
  })

  test('standalone/series script generation interpolates the fragment in the outro template', () => {
    const INTERP = '${REFLECTION_RULE_PROMPT_FRAGMENT}'
    const start = generateScriptRoute.indexOf('BELLE B OUTRO')
    const end = generateScriptRoute.indexOf('Production-format hard rules:')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const span = generateScriptRoute.slice(start, end)
    const anchor = span.indexOf('hold the cliffhanger emotion with a reflective beat')
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(span.indexOf(INTERP)).toBeGreaterThan(anchor)
    // Exactly one interpolation in the template block (duplication guard).
    expect(span.split(INTERP).length - 1).toBe(1)
  })
})

describe('REFLECTION-RULE-UNIFICATION-001: no divergent copies', () => {
  test('marker regexes are defined only in lib/belleValidation.ts', () => {
    for (const [name, src] of [
      ['run-next', runNextRoute],
      ['series-package', seriesPackageRoute],
      ['generate-script', generateScriptRoute],
    ] as Array<[string, string]>) {
      expect(src).not.toMatch(/reflectionInvitationMarkers/)
      expect(src).not.toMatch(/const emotionalMarkers\s*=/)
      expect(src).not.toMatch(/const reflectionMarkers\s*=/)
    }
  })
})
