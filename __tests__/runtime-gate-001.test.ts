/**
 * RUNTIME-GATE-001 tests — runtime-vs-brief tolerance check.
 *
 * Decisions: gap2-runtime-tolerance-oct11-1408 (±10%, between HOOK-GATE-001
 * and QUALITY-GATE-001, fail → job failed + error_json.kind =
 * 'runtime_brief_mismatch'), gap2-fail-closed-oct11-1408 (fail-closed
 * posture; unmeasured inputs get a persistent skipped marker, never a
 * silent skip — Lyra Gap-2 micro-note).
 *
 * Pure-logic tests for lib/runtimeGate.ts (no DB, no network).
 * Route wiring (gate placement, fail routing, park writes) is documented
 * in drafts/ATLAS-GAP2-QC-20261011-1408.md § tests.
 *
 * Run: npx jest __tests__/runtime-gate-001.test.ts --no-coverage
 */

import {
  RUNTIME_GATE,
  RUNTIME_GATE_ID,
  checkRuntimeVsBrief,
  parseBriefRuntimeToSecs,
} from '../lib/runtimeGate'

describe('RUNTIME-GATE-001 constants', () => {
  test('gate id is stable', () => {
    expect(RUNTIME_GATE_ID).toBe('RUNTIME-GATE-001')
  })

  test('tolerance is ±10% in one constants block', () => {
    expect(RUNTIME_GATE.TOLERANCE).toBe(0.10)
  })

  test('mismatch kind matches Marc decision', () => {
    expect(RUNTIME_GATE.MISMATCH_KIND).toBe('runtime_brief_mismatch')
  })
})

describe('parseBriefRuntimeToSecs', () => {
  test('prefers numeric duration_mins', () => {
    expect(parseBriefRuntimeToSecs(15, '20 min')).toBe(900)
  })

  test('falls back to parsing brief_json.runtime string', () => {
    expect(parseBriefRuntimeToSecs(null, '15 min')).toBe(900)
  })

  test('parses duration_label fallback', () => {
    expect(parseBriefRuntimeToSecs(undefined, '20 min')).toBe(1200)
  })

  test('returns null when both sources empty', () => {
    expect(parseBriefRuntimeToSecs(null, null)).toBeNull()
    expect(parseBriefRuntimeToSecs(0, '')).toBeNull()
    expect(parseBriefRuntimeToSecs(-5, 'n/a')).toBeNull()
  })
})

describe('checkRuntimeVsBrief', () => {
  test('exact match passes', () => {
    const r = checkRuntimeVsBrief(900, 900)
    expect(r.pass).toBe(true)
    expect(r.skipped).toBe(false)
    expect(r.deviationPct).toBe(0)
  })

  test('within ±10% passes (both directions)', () => {
    expect(checkRuntimeVsBrief(990, 900).pass).toBe(true) // +10%
    expect(checkRuntimeVsBrief(810, 900).pass).toBe(true) // -10%
    expect(checkRuntimeVsBrief(945, 900).pass).toBe(true) // +5%
  })

  test('outside ±10% fails with signed deviation', () => {
    const over = checkRuntimeVsBrief(1008, 900) // +12%
    expect(over.pass).toBe(false)
    expect(over.skipped).toBe(false)
    expect(over.deviationPct).toBeCloseTo(0.12, 5)

    const under = checkRuntimeVsBrief(792, 900) // -12%
    expect(under.pass).toBe(false)
    expect(under.deviationPct).toBeCloseTo(-0.12, 5)
  })

  test('null actual → skipped with persistent reason (never silent, never block)', () => {
    const r = checkRuntimeVsBrief(null, 900)
    expect(r.skipped).toBe(true)
    expect(r.pass).toBe(false)
    expect(typeof r.skipReason).toBe('string')
    expect((r.skipReason as string).length).toBeGreaterThan(0)
  })

  test('null brief → skipped with persistent reason', () => {
    const r = checkRuntimeVsBrief(900, null)
    expect(r.skipped).toBe(true)
    expect(typeof r.skipReason).toBe('string')
  })

  test('both null → skipped, reason names both sides', () => {
    const r = checkRuntimeVsBrief(null, null)
    expect(r.skipped).toBe(true)
    expect(r.skipReason).toMatch(/both/)
  })

  test('zero/negative inputs treated as unmeasured, not as zero-length pass', () => {
    expect(checkRuntimeVsBrief(0, 900).skipped).toBe(true)
    expect(checkRuntimeVsBrief(900, 0).skipped).toBe(true)
  })

  test('custom tolerance respected', () => {
    expect(checkRuntimeVsBrief(1008, 900, 0.15).pass).toBe(true)
    expect(checkRuntimeVsBrief(1008, 900, 0.05).pass).toBe(false)
  })
})
