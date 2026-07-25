/**
 * HOOK-GATE-STALE-001 — Unit tests for the audio consistency check
 *
 * Tests the pure checkAudioConsistency() function exported from hookGate.ts.
 * No Supabase or network calls are made — this is a pure logic test.
 *
 * Coverage:
 *   ✓ pass: segments_generated_at >= script_updated_at
 *   ✓ fail: script_updated_at > segments_generated_at (stale audio)
 *   ✓ warn: both timestamps null (schema gap / migration not applied)
 *   ✓ warn: script_updated_at null (schema gap)
 *   ✓ warn: segments_generated_at null (never generated or pre-migration)
 *   ✓ na:   no script present
 *   ✓ staleByMs is the exact delta in milliseconds
 *   ✓ fail detail includes the key remediation instruction
 */

// checkAudioConsistency is a pure function — no Supabase initialization occurs
// when importing it directly via the named export.
// We must mock @supabase/supabase-js to prevent the module-level createClient
// call in hookGate.ts from throwing.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import { checkAudioConsistency } from '../lib/hookGate'

describe('HOOK-GATE-STALE-001: checkAudioConsistency (pure function)', () => {
  // ── pass cases ─────────────────────────────────────────────────────────────

  test('pass — segments_generated_at is exactly equal to script_updated_at', () => {
    const ts = '2026-07-07T10:00:00.000Z'
    const result = checkAudioConsistency(ts, ts, true)
    expect(result.status).toBe('pass')
    expect(result.staleByMs).toBe(0)
    expect(result.detail).toMatch(/PASS/)
  })

  test('pass — segments_generated_at is AFTER script_updated_at (current audio)', () => {
    const scriptTs = '2026-07-05T08:00:00.000Z'
    const segTs    = '2026-07-07T10:00:00.000Z'  // 2 days after script edit
    const result = checkAudioConsistency(scriptTs, segTs, true)
    expect(result.status).toBe('pass')
    expect(result.staleByMs).toBe(0)
    expect(result.scriptUpdatedAt).toBe(scriptTs)
    expect(result.segmentsGeneratedAt).toBe(segTs)
  })

  // ── fail cases ─────────────────────────────────────────────────────────────

  test('fail — script_updated_at is NEWER than segments_generated_at (stale audio)', () => {
    const segTs    = '2026-07-05T08:00:00.000Z'  // audio generated July 5
    const scriptTs = '2026-07-07T10:00:00.000Z'  // script fixed July 7
    const result = checkAudioConsistency(scriptTs, segTs, true)
    expect(result.status).toBe('fail')
    expect(result.staleByMs).toBeGreaterThan(0)
    expect(result.detail).toMatch(/STALE AUDIO/)
    expect(result.detail).toMatch(/Re-run generate_voices/)
    expect(result.detail).toMatch(/FAIL/)
  })

  test('fail — staleByMs equals exact millisecond delta', () => {
    const segTs    = '2026-07-05T08:00:00.000Z'
    const scriptTs = '2026-07-07T10:00:00.000Z'
    const expectedDeltaMs =
      new Date(scriptTs).getTime() - new Date(segTs).getTime()
    const result = checkAudioConsistency(scriptTs, segTs, true)
    expect(result.staleByMs).toBe(expectedDeltaMs)
  })

  test('fail — reproduces Check-In incident (July 5 audio, July 7 script fix)', () => {
    // Check-In (92e66f84): audio generated ~July 5, hook fix on July 7.
    // Gate must fail in this scenario.
    const audioGenerated = '2026-07-05T12:00:00.000Z'
    const scriptFixed    = '2026-07-07T09:30:00.000Z'
    const result = checkAudioConsistency(scriptFixed, audioGenerated, true)
    expect(result.status).toBe('fail')
    expect(result.staleByMs).toBeGreaterThan(0)
  })

  // ── warn cases ─────────────────────────────────────────────────────────────

  test('warn — both timestamps null (schema gap / migration not applied)', () => {
    const result = checkAudioConsistency(null, null, true)
    expect(result.status).toBe('warn')
    expect(result.detail).toMatch(/schema gap/)
    expect(result.staleByMs).toBeNull()
  })

  test('warn — script_updated_at null only', () => {
    const result = checkAudioConsistency(null, '2026-07-05T08:00:00.000Z', true)
    expect(result.status).toBe('warn')
    expect(result.detail).toMatch(/script_updated_at is NULL/)
  })

  test('warn — segments_generated_at null only', () => {
    const result = checkAudioConsistency('2026-07-07T10:00:00.000Z', null, true)
    expect(result.status).toBe('warn')
    expect(result.detail).toMatch(/segments_generated_at is NULL/)
  })

  // ── na case ────────────────────────────────────────────────────────────────

  test('na — no script present (hasScript=false)', () => {
    const result = checkAudioConsistency('2026-07-07T10:00:00.000Z', '2026-07-05T08:00:00.000Z', false)
    expect(result.status).toBe('na')
    expect(result.staleByMs).toBeNull()
  })

  test('na — empty string script (hasScript=false)', () => {
    const result = checkAudioConsistency(null, null, false)
    expect(result.status).toBe('na')
  })

  // ── field completeness ─────────────────────────────────────────────────────

  test('result always has required fields', () => {
    const result = checkAudioConsistency('2026-07-07T10:00:00.000Z', '2026-07-07T10:00:00.000Z', true)
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('scriptUpdatedAt')
    expect(result).toHaveProperty('segmentsGeneratedAt')
    expect(result).toHaveProperty('staleByMs')
    expect(result).toHaveProperty('detail')
    expect(typeof result.detail).toBe('string')
    expect(result.detail.length).toBeGreaterThan(0)
  })
})
