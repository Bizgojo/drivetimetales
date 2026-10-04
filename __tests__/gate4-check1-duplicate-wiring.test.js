// GATE 4 — CHECK-1 DUPLICATE-SEGMENT DETECTOR WIRING
// Spec: drafts/GATE-GAPS-SPEC-20261004.md §4 (CHECK-1 WIRING)
//
// Context: lib/validation-gate/check1-duplicate-segments.js::checkDuplicateSegments
// existed and worked but was NEVER called by R
// (app/api/admin/production-jobs/run-next/route.ts). This gate wires it in as a
// BLOCKING gate that runs FIRST inside validateStandaloneScript — before the LLM
// validator — on the exact story.script string the validator consumes.
//
// These tests exercise the detector exactly as R imports/calls it
// (`import { checkDuplicateSegments } from '@/lib/validation-gate/check1-duplicate-segments'`)
// and assert the spec's acceptance fixtures:
//   - EP8 v4 TRIPLICATE fixture fails with correct labels
//   - clean script passes
//   - short-line repeats ("No.") pass via MIN_DUPLICATE_LENGTH
//   - announcer lines excluded
// plus the wiring contract (return shape per lib lines 199–240; empty findings = pass;
// BLOCKING on any returned finding since lib pre-filters by MIN_DUPLICATE_LENGTH).

const fs = require('fs')
const path = require('path')
const {
  checkDuplicateSegments,
  MIN_DUPLICATE_LENGTH,
} = require('../lib/validation-gate/check1-duplicate-segments')

const ROUTE_SRC = fs.readFileSync(
  path.join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'),
  'utf8'
)

// Helper: assemble a minimal, parser-valid standalone script body.
function buildScript(bodyLines) {
  return [
    'TITLE: Gate 4 Fixture',
    'DESCRIPTION: A short present-tense description for the card.',
    '[START AUDIO DRAMA SCRIPT]',
    ...bodyLines,
  ].join('\n')
}

// ── Wiring guards: the detector must actually be reachable from R ────────────
// Spec §4 problem statement: detector existed but was NEVER called by R (dead gate).
// These source-level assertions lock the wiring so it cannot silently regress to
// dead code, and confirm the retry/needs_attention routing contract.
describe('GATE 4 — R wiring contract (spec §4)', () => {
  test('single top-level import site (no per-call require)', () => {
    expect(ROUTE_SRC).toContain(
      "import { checkDuplicateSegments } from '@/lib/validation-gate/check1-duplicate-segments'"
    )
    // No per-call require of the module anywhere in R.
    expect(ROUTE_SRC).not.toMatch(/require\(['"].*check1-duplicate-segments/)
  })

  test('detector runs inside validateStandaloneScript before the LLM validator', () => {
    const dupCallIdx = ROUTE_SRC.indexOf('checkDuplicateSegments(story.script)')
    expect(dupCallIdx).toBeGreaterThan(-1)
    // The standalone validator LLM call for this fn is the first anthropic call
    // that follows the duplicate check within validateStandaloneScript.
    const llmIdx = ROUTE_SRC.indexOf('anthropic.messages.create', dupCallIdx)
    expect(llmIdx).toBeGreaterThan(dupCallIdx)
  })

  test('duplicate failure is signalled and routed to duplicate_segments kind', () => {
    expect(ROUTE_SRC).toContain('isDuplicateSegmentFailure: true')
    expect(ROUTE_SRC).toContain(
      'classifyValidateScriptFailure(reportText, isCardCopy, isDuplicateSegments)'
    )
    // classifier returns the blocking, autonomous-retryable kind for duplicates
    expect(ROUTE_SRC).toMatch(/isDuplicate[\s\S]{0,200}kind: 'duplicate_segments'/)
  })

  test('shares the existing validateScriptRetryCount counter (no separate counter)', () => {
    // The duplicate path flows through the same ATL-PIPE-008 branch, which keys off
    // validateScriptRetryCount and MAX_RETRIES; no new counter is introduced.
    expect(ROUTE_SRC).toContain('validateScriptRetryCount')
    expect(ROUTE_SRC).not.toMatch(/duplicateSegmentRetryCount/)
  })

  test('exhaustion marks needs_attention on the affected story only', () => {
    // The shared branch calls markStoryNeedsAttention(result.storyId, ...) on
    // retry exhaustion — scoped to the single affected story.
    expect(ROUTE_SRC).toMatch(/markStoryNeedsAttention\(\s*result\.storyId/)
  })
})

describe('GATE 4 — check-1 duplicate wiring (spec §4)', () => {
  // ── Blocking fixture: EP8 v4 TRIPLICATE (lib header fixture) ───────────────
  test('EP8 v4 TRIPLICATE "He was right on both counts" fails with correct labels', () => {
    const line = 'NARRATOR: He was right on both counts, of course.'
    const script = buildScript([
      line,
      'ALICE: Something completely different happens in this particular segment.',
      line,
      line,
    ])

    const result = checkDuplicateSegments(script)

    expect(result.passed).toBe(false)
    expect(result.findings.length).toBe(1)

    const finding = result.findings[0]
    expect(finding.severity).toBe('TRIPLICATE')
    expect(finding.count).toBe(3)
    expect(finding.originalText).toContain('He was right on both counts')

    // correct segment labels (padded, zero-based parser indices)
    const labels = finding.occurrences.map((o) => o.segmentLabel)
    expect(labels).toEqual(['segment_0000', 'segment_0002', 'segment_0003'])

    // return-shape contract (lib lines 199–240)
    for (const occ of finding.occurrences) {
      expect(typeof occ.segmentIndex).toBe('number')
      expect(typeof occ.segmentLabel).toBe('string')
      expect(typeof occ.speaker).toBe('string')
      expect(typeof occ.rawLineNumber).toBe('number')
    }
    expect(result.summary.triplicateCount).toBe(1)
  })

  // ── DUPLICATE blocks in v1 (no warn bypass) ────────────────────────────────
  test('long-form DUPLICATE blocks (severity DUPLICATE, count 2)', () => {
    const line = "NARRATOR: That's where they gave the made ones their name."
    const script = buildScript([
      line,
      'BOB: An entirely separate sentence to keep this one unique enough.',
      line,
    ])

    const result = checkDuplicateSegments(script)

    expect(result.passed).toBe(false)
    expect(result.findings.length).toBe(1)
    expect(result.findings[0].severity).toBe('DUPLICATE')
    expect(result.findings[0].count).toBe(2)
    expect(result.summary.duplicateCount).toBe(1)
  })

  // ── Clean script passes (empty findings = pass) ────────────────────────────
  test('clean script with all-unique voice lines passes', () => {
    const script = buildScript([
      'NARRATOR: The sun rose over the quiet village square at dawn.',
      'ALICE: I have never seen anything quite like this before today.',
      'BOB: We should leave before the storm arrives this very evening.',
      'NARRATOR: She paused, listening to the distant church bells toll.',
    ])

    const result = checkDuplicateSegments(script)

    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  // ── Short-line repeats pass via MIN_DUPLICATE_LENGTH ───────────────────────
  test('short repeated lines ("No.") pass — below MIN_DUPLICATE_LENGTH', () => {
    expect(MIN_DUPLICATE_LENGTH).toBe(15)
    const script = buildScript([
      'ALICE: No.',
      'BOB: Yes.',
      'ALICE: No.',
      'BOB: Yes.',
      'ALICE: No.',
    ])

    const result = checkDuplicateSegments(script)

    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  // ── Announcer lines excluded ───────────────────────────────────────────────
  test('duplicate announcer (intro/outro) lines are excluded from detection', () => {
    const announcer = 'ANNOUNCER: Welcome to the show, this is the standard intro line.'
    const script = [
      'TITLE: Gate 4 Fixture',
      announcer, // first announcer = intro (not expected)
      '[START AUDIO DRAMA SCRIPT]',
      'NARRATOR: A single unique body line about the bright morning light.',
      announcer, // last announcer = outro (not expected)
    ].join('\n')

    const result = checkDuplicateSegments(script)

    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  // ── Blocking contract: any returned finding is blocking (lib pre-filters) ───
  test('any returned finding is blocking — lib already filters sub-MIN lines', () => {
    const line = 'NARRATOR: A sufficiently long and distinctive repeated sentence here.'
    const script = buildScript([line, 'ALICE: Unique filler line to separate the repeats here.', line])

    const result = checkDuplicateSegments(script)

    // Every finding returned has occurrences whose normalized length is >= MIN.
    expect(result.passed).toBe(false)
    for (const f of result.findings) {
      expect(f.normalizedText.length).toBeGreaterThanOrEqual(MIN_DUPLICATE_LENGTH)
    }
  })
})
