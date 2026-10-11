/**
 * ATLAS-SERIES-RETRY-CAP-001 (2026-10-11)
 *
 * The standalone dispatch path has a 5-in-7d RETRY_CAP; the series path had
 * only the 2h failure circuit + transient escalation/hold. A series failing
 * with the same story/content defect once per cycle — spaced wider than 2h,
 * or re-queued by a repair flow after the circuit parked it — minted a new
 * production_jobs row every cycle, forever.
 *
 * Fix: series long-window cap (parity with standalone) + identical-signature
 * cap that parks even earlier when the SAME failure repeats. Transient/infra
 * rows never count (own 48h escalation path); only story/content defects
 * consume this budget. Parking is flag-only (needs_attention + audit reason);
 * clearing the flag stamps dispatch_failure_reset_at which floors the window.
 *
 * No DB writes, no network. Pure helpers from lib/dispatchGuards.ts.
 */

import {
  RETRY_CAP,
  RETRY_CAP_WINDOW_MS,
  SERIES_IDENTICAL_FAILURE_CAP,
  SERIES_RETRY_CAP,
  SERIES_RETRY_CAP_WINDOW_MS,
  capEligibleFailures,
  retryCapWindowStartMs,
  seriesFailureSignature,
  topFailureSignature,
} from '@/lib/dispatchGuards'

const NOW = Date.parse('2026-10-11T23:35:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function defect(hours: number, message = 'QC similarity 81.7% < 85% at segment_0043', step = 'series_generate_voices', kind = 'transcript_qc_fail') {
  return {
    status: 'failed',
    updated_at: hoursAgo(hours),
    current_step: step,
    error_json: { kind, step, message, at: hoursAgo(hours) },
  }
}

function transientRow(hours: number) {
  return {
    status: 'failed',
    updated_at: hoursAgo(hours),
    current_step: 'series_voice_preflight',
    error_json: {
      kind: 'unknown_step',
      step: 'series_voice_preflight',
      message: 'generate-voices preflight request failed: TypeError: fetch failed',
      transient: true,
      transient_cause: 'network',
    },
  }
}

describe('cap constants (parity with standalone)', () => {
  test('series cap reuses the standalone budget: 5 in 7 days', () => {
    expect(SERIES_RETRY_CAP).toBe(RETRY_CAP)
    expect(SERIES_RETRY_CAP).toBe(5)
    expect(SERIES_RETRY_CAP_WINDOW_MS).toBe(RETRY_CAP_WINDOW_MS)
    expect(SERIES_RETRY_CAP_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test('identical-signature cap parks earlier than the volume cap', () => {
    expect(SERIES_IDENTICAL_FAILURE_CAP).toBe(3)
    expect(SERIES_IDENTICAL_FAILURE_CAP).toBeLessThan(SERIES_RETRY_CAP)
  })
})

describe('seriesFailureSignature', () => {
  test('step + kind + normalized message', () => {
    expect(seriesFailureSignature(defect(1))).toBe(
      'series_generate_voices :: transcript_qc_fail :: qc similarity 81.7% < 85% at segment_0043',
    )
  })

  test('whitespace/case drift does not split a signature', () => {
    const a = defect(1, 'QC  similarity   81.7% < 85%')
    const b = defect(2, 'qc similarity 81.7% < 85%')
    expect(seriesFailureSignature(a)).toBe(seriesFailureSignature(b))
  })

  test('different segment numbers are different signatures (numbers kept)', () => {
    const a = seriesFailureSignature(defect(1, 'fail at segment_0043'))
    const b = seriesFailureSignature(defect(2, 'fail at segment_0044'))
    expect(a).not.toBe(b)
  })

  test('falls back to current_step, marks missing cause unclassified', () => {
    const row = { status: 'failed', updated_at: hoursAgo(1), current_step: 'series_render_final_mix', error_json: {} }
    expect(seriesFailureSignature(row)).toBe('series_render_final_mix :: unclassified :: ')
  })
})

describe('capEligibleFailures — transient/infra never counts', () => {
  test('counts non-transient defects inside the window', () => {
    const rows = [defect(1), defect(5), defect(30)]
    expect(capEligibleFailures(rows, NOW)).toHaveLength(3)
  })

  test('excludes transient rows and zombie rows', () => {
    const zombie = { status: 'failed', updated_at: hoursAgo(1), error_json: { kind: 'zombie_stalled' } }
    const rows = [defect(1), transientRow(2), transientRow(3), zombie]
    expect(capEligibleFailures(rows, NOW)).toHaveLength(1)
  })

  test('excludes non-failed statuses and rows outside the window', () => {
    const rows = [
      defect(1),
      { ...defect(2), status: 'complete' },
      { ...defect(3), status: 'queued' },
      { ...defect(1), updated_at: daysAgo(8) },
    ]
    expect(capEligibleFailures(rows, NOW)).toHaveLength(1)
  })

  test('human reset floors the window (already-diagnosed history ignored)', () => {
    const rows = [defect(50), defect(60), defect(70)]
    const resetAtIso = hoursAgo(49) // cleared 49h ago; all 3 failures predate it
    expect(capEligibleFailures(rows, NOW, { resetAtIso })).toHaveLength(0)
    // ...but failures AFTER the reset still count
    const rows2 = [...rows, defect(1)]
    expect(capEligibleFailures(rows2, NOW, { resetAtIso })).toHaveLength(1)
  })
})

describe('topFailureSignature', () => {
  test('null when nothing eligible', () => {
    expect(topFailureSignature([], NOW)).toBeNull()
    expect(topFailureSignature([transientRow(1)], NOW)).toBeNull()
  })

  test('most frequent signature wins with its count', () => {
    const rows = [
      defect(1, 'QC fail seg A'),
      defect(2, 'QC fail seg A'),
      defect(3, 'render OOM'),
    ]
    const top = topFailureSignature(rows, NOW)
    expect(top?.count).toBe(2)
    expect(top?.signature).toContain('qc fail seg a')
  })

  test('tie resolves to the most recent signature (recency-biased)', () => {
    const rows = [defect(5, 'older defect'), defect(1, 'live defect')]
    expect(topFailureSignature(rows, NOW)?.signature).toContain('live defect')
  })
})

describe('cap trip conditions (what the cron checks)', () => {
  const opts = { windowMs: SERIES_RETRY_CAP_WINDOW_MS }

  test('3 IDENTICAL defects trip the signature cap while volume cap stays quiet', () => {
    const rows = [defect(10), defect(20), defect(30)] // same default message
    const eligible = capEligibleFailures(rows, NOW, opts)
    const top = topFailureSignature(rows, NOW, opts)
    expect(eligible.length).toBeLessThan(SERIES_RETRY_CAP)
    expect(top?.count).toBeGreaterThanOrEqual(SERIES_IDENTICAL_FAILURE_CAP)
  })

  test('5 MIXED defects trip the volume cap without tripping the signature cap', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => defect(i, `distinct defect number ${i}`))
    const eligible = capEligibleFailures(rows, NOW, opts)
    const top = topFailureSignature(rows, NOW, opts)
    expect(eligible.length).toBeGreaterThanOrEqual(SERIES_RETRY_CAP)
    expect(top?.count).toBeLessThan(SERIES_IDENTICAL_FAILURE_CAP)
  })

  test('a transient storm trips NEITHER cap (infra has its own escalation path)', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((i) => transientRow(i))
    expect(capEligibleFailures(rows, NOW, opts)).toHaveLength(0)
    expect(topFailureSignature(rows, NOW, opts)).toBeNull()
  })

  test('retryCapWindowStartMs honors reset + global floor (shared with standalone)', () => {
    const resetAtIso = hoursAgo(10)
    const ignoreBeforeIso = hoursAgo(20)
    expect(retryCapWindowStartMs(NOW, { resetAtIso, ignoreBeforeIso })).toBe(Date.parse(resetAtIso))
  })
})
