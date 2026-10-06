/**
 * ATLAS-GARBLE-VERDICT-001 (Marc word 2026-10-06):
 * Fix GARBLE-001 so it never crashes without a verdict.
 *
 * - Gate always writes a JSON report, even on infrastructure failure
 *   (missing Whisper, bad path, internal error).
 * - Gate-broken (unavailable / internal_error) is a structured verdict:
 *   soft-pass with needsAttention=true — render may proceed. Never exit 1
 *   with no report.
 * - True garble (summary.fail > 0) stays fail-closed; gate-broken vs
 *   story-garbled is distinguishable via gateStatus.
 *
 * No DB writes, no network, no Whisper. All pure/file-local.
 */

import { outcomeFromReport, unavailableOutcome } from '@/lib/garbleGate'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require('../garble-detection-gate.js')

describe('VERDICT-001: gate-broken report builders (garble-detection-gate.js)', () => {
  test('buildUnavailableReport is a soft-pass with needsAttention', () => {
    const r = gate.buildUnavailableReport('story-1', 'unavailable', 'Whisper binary not found')
    expect(r.storyId).toBe('story-1')
    expect(r.gateStatus).toBe('unavailable')
    expect(r.gatePassed).toBe(true)
    expect(r.needsAttention).toBe(true)
    expect(r.summary.fail).toBe(0)
    expect(r.summary.total).toBe(0)
    expect(r.results).toEqual([])
    expect(r.error.code).toBe('GATE_UNAVAILABLE')
    expect(r.error.message).toContain('Whisper')
  })

  test('internal_error status is preserved and distinct from unavailable', () => {
    const r = gate.buildUnavailableReport('story-2', 'internal_error', 'boom')
    expect(r.gateStatus).toBe('internal_error')
    expect(r.gatePassed).toBe(true)
    expect(r.needsAttention).toBe(true)
    expect(r.error.code).toBe('GATE_INTERNAL_ERROR')
  })

  test('classifyGateError: missing Whisper / DB / network → unavailable', () => {
    const binMissing = new Error('Whisper binary not found (WHISPER_BIN=whisper)')
    binMissing.code = 'WHISPER_BIN_MISSING'
    expect(gate.classifyGateError(binMissing)).toBe('unavailable')

    const db = Object.assign(new Error('Cannot fetch story x: fetch failed'), { code: 'GATE_DB_UNAVAILABLE' })
    expect(gate.classifyGateError(db)).toBe('unavailable')
    expect(gate.classifyGateError(new Error('TypeError: fetch failed'))).toBe('unavailable')
  })

  test('classifyGateError: unexpected exceptions → internal_error', () => {
    expect(gate.classifyGateError(new Error('weird null deref'))).toBe('internal_error')
    expect(gate.classifyGateError(null)).toBe('internal_error')
    expect(gate.classifyGateError(undefined)).toBe('internal_error')
  })

  test('writeGateReport always writes a file and returns its path', () => {
    const r = gate.buildUnavailableReport('story-3', 'unavailable', 'test write')
    const p = gate.writeGateReport('story-3', r)
    expect(typeof p).toBe('string')
    expect(p.endsWith('.json')).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    expect(parsed.gateStatus).toBe('unavailable')
    expect(parsed.needsAttention).toBe(true)
    fs.unlinkSync(p)
  })
})

describe('VERDICT-001: outcome mapping (lib/garbleGate.ts)', () => {
  test('unavailableOutcome never blocks: passed=true + needsAttention', () => {
    const o = unavailableOutcome('Gate process error: boom', 'story-9')
    expect(o.passed).toBe(true)
    expect(o.gateStatus).toBe('unavailable')
    expect(o.needsAttention).toBe(true)
    expect(o.failures).toEqual([])
    expect(o.gateError).toContain('boom')
  })

  test('true garble stays fail-closed via outcomeFromReport', () => {
    const o = outcomeFromReport({
      storyId: 's', storyTitle: 't', runAt: '', model: 'base.en',
      thresholds: { warn: 0.2, fail: 0.4 },
      gatePassed: false, gateStatus: 'garbled', needsAttention: true, error: null,
      summary: { ok: 0, warn: 0, fail: 1, skipped: 0, missing: 0, total: 1 },
      results: [{ segNum: 1, segName: 'segment_0001', status: 'fail', wer: 0.9, expectedText: 'a', whisperText: 'b' }],
    } as never)
    expect(o.passed).toBe(false)
    expect(o.gateStatus).toBe('garbled')
    expect(o.failures.length).toBe(1)
  })

  test('gate-broken report maps to soft-pass with needsAttention', () => {
    const report = gate.buildUnavailableReport('s', 'unavailable', 'no whisper')
    const o = outcomeFromReport(report as never, '/tmp/x.json')
    expect(o.passed).toBe(true)
    expect(o.gateStatus).toBe('unavailable')
    expect(o.needsAttention).toBe(true)
    expect(o.gateError).toContain('GATE_UNAVAILABLE')
  })

  test('pre-001 reports without gateStatus still infer garbled vs ok', () => {
    const garbled = outcomeFromReport({
      storyId: 's', storyTitle: '', runAt: '', model: '',
      thresholds: { warn: 0.2, fail: 0.4 }, gatePassed: false,
      summary: { ok: 0, warn: 0, fail: 2, skipped: 0, missing: 0, total: 2 },
      results: [
        { segNum: 1, segName: 'segment_0001', status: 'fail', wer: 0.8, expectedText: 'a', whisperText: 'b' },
        { segNum: 2, segName: 'segment_0002', status: 'fail', wer: null, expectedText: 'c', whisperText: '[whisper error]' },
      ],
    } as never)
    expect(garbled.passed).toBe(false)
    expect(garbled.gateStatus).toBe('garbled')

    const clean = outcomeFromReport({
      storyId: 's', storyTitle: '', runAt: '', model: '',
      thresholds: { warn: 0.2, fail: 0.4 }, gatePassed: true,
      summary: { ok: 1, warn: 1, fail: 0, skipped: 0, missing: 0, total: 2 },
      results: [
        { segNum: 0, segName: 'segment_0000', status: 'ok', wer: 0.02, expectedText: 'a', whisperText: 'a' },
        { segNum: 1, segName: 'segment_0001', status: 'warn', wer: 0.25, expectedText: 'b', whisperText: 'c' },
      ],
    } as never)
    expect(clean.passed).toBe(true)
    expect(clean.gateStatus).toBe('ok')
  })

  test('null-WER ok/warn promotion still fails closed', () => {
    const o = outcomeFromReport({
      storyId: 's', storyTitle: '', runAt: '', model: '',
      thresholds: { warn: 0.2, fail: 0.4 }, gatePassed: true,
      summary: { ok: 1, warn: 0, fail: 0, skipped: 0, missing: 0, total: 1 },
      results: [{ segNum: 0, segName: 'segment_0000', status: 'ok', wer: null, expectedText: 'a', whisperText: '' }],
    } as never)
    expect(o.passed).toBe(false)
    expect(o.gateStatus).toBe('garbled')
  })
})

describe('VERDICT-001: failClosedVerdict unchanged (P3 regression)', () => {
  test('null report still fails closed', () => {
    expect(gate.failClosedVerdict(null).passed).toBe(false)
  })
  test('true garble still fails closed', () => {
    expect(gate.failClosedVerdict({ results: [{ status: 'fail', wer: 0.9 }] }).passed).toBe(false)
  })
  test('clean report still passes', () => {
    expect(gate.failClosedVerdict({ results: [{ status: 'ok', wer: 0.01 }] }).passed).toBe(true)
  })
})
