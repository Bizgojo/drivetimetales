/**
 * TMP-SPACE-LOW-001 (Marc GO 2026-10-06)
 *
 * Runner /tmp exhaustion (TMP_SPACE_LOW / ENOSPC / "no space left on device")
 * is infra-transient, never a story defect: it must not trip the failure
 * circuit or the retry cap, and dispatch must back off on an escalating
 * 5m → 15m → 45m (+jitter) schedule with the attempt count preserved.
 *
 * Mix serialization: only one mix job per series runs at a time.
 */

import {
  classifyTransientFailure,
  isTransientJobRow,
  stripQuotedScriptText,
  transientErrorFields,
} from '@/lib/transientFailure'
import {
  TMP_FULL_RETRY_DELAYS_MS,
  countRecentFailures,
  countRetryCapFailures,
  failureCircuitOpen,
  hasActiveMixJob,
  isActiveMixJob,
  tmpFullRetryDelayMs,
  transientDispatchHold,
} from '@/lib/dispatchGuards'
import {
  TMP_ABORT_MIN_BYTES,
  TMP_WARN_BYTES,
  RENDER_DOWNLOAD_CONCURRENCY,
  assertTmpSpaceOrThrow,
  etMixPrefix,
  limitedParallel,
} from '@/lib/tmpSpace'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
const tmpFull = (minutesAgo: number) => ({
  status: 'failed',
  updated_at: iso(minutesAgo),
  error_json: { transient: true as const, transient_cause: 'runner_tmp_full' as const },
})

describe('classifyTransientFailure — tmp-space patterns', () => {
  test('TMP_SPACE_LOW marker → runner_tmp_full', () => {
    expect(classifyTransientFailure('TMP_SPACE_LOW: free 12.3 MB < required 50.0 MB at stage "post-download"')).toBe(
      'runner_tmp_full',
    )
  })

  test('ENOSPC errno → runner_tmp_full', () => {
    expect(classifyTransientFailure('ffmpeg [concat]: Error writing trailer: No space left on device (ENOSPC)')).toBe(
      'runner_tmp_full',
    )
    expect(classifyTransientFailure('write failed: ENOSPC')).toBe('runner_tmp_full')
  })

  test('full strerror "no space left on device" → runner_tmp_full', () => {
    expect(classifyTransientFailure('Segment download failed: No space left on device')).toBe('runner_tmp_full')
  })

  test('bare "no space left" without the device suffix stays PERMANENT', () => {
    expect(classifyTransientFailure('Belle outro line: "there was no space left on the shelf"')).toBeNull()
  })

  test('quoted script text naming disk errors stays PERMANENT after stripping', () => {
    const qc = 'QC mismatch: expected "No space left on device, captain." partial output "No space"'
    expect(classifyTransientFailure(stripQuotedScriptText(qc))).toBeNull()
  })

  test('runner_tmp_full error fields never require Marc', () => {
    const fields = transientErrorFields('runner_tmp_full')
    expect(fields.transient).toBe(true)
    expect(fields.transient_cause).toBe('runner_tmp_full')
    expect(fields.marc_required).toBe(false)
  })

  test('runner_tmp_full rows are transient; circuit and cap ignore them', () => {
    expect(isTransientJobRow(tmpFull(5))).toBe(true)
    const jobs = [tmpFull(10), tmpFull(30), tmpFull(60)]
    expect(countRecentFailures(jobs, NOW)).toBe(0)
    expect(failureCircuitOpen(jobs, NOW)).toBe(false)
    expect(countRetryCapFailures(jobs, NOW)).toBe(0)
  })
})

describe('mix serialization — one mix job per series at a time', () => {
  test('non-terminal job in series_render_final_mix blocks', () => {
    expect(isActiveMixJob({ status: 'running', current_step: 'series_render_final_mix' })).toBe(true)
    expect(isActiveMixJob({ status: 'queued', current_step: 'render_final_mix' })).toBe(true)
    expect(
      hasActiveMixJob([
        { status: 'running', current_step: 'generate_voices' },
        { status: 'running', current_step: 'series_render_final_mix' },
      ]),
    ).toBe(true)
  })

  test('terminal mix jobs and non-mix steps do not block', () => {
    expect(isActiveMixJob({ status: 'failed', current_step: 'series_render_final_mix' })).toBe(false)
    expect(isActiveMixJob({ status: 'complete', current_step: 'render_final_mix' })).toBe(false)
    expect(isActiveMixJob({ status: 'running', current_step: 'generate_voices' })).toBe(false)
    expect(isActiveMixJob({ status: 'running' })).toBe(false)
    expect(hasActiveMixJob([{ status: 'running', current_step: 'generate_voices' }])).toBe(false)
    expect(hasActiveMixJob([])).toBe(false)
  })
})

describe('tmpFullRetryDelayMs — 5m/15m/45m + jitter, attempt count preserved', () => {
  test('schedule tiers with deterministic jitter bounds', () => {
    const [d5, d15, d45] = TMP_FULL_RETRY_DELAYS_MS
    expect(d5).toBe(5 * 60_000)
    expect(d15).toBe(15 * 60_000)
    expect(d45).toBe(45 * 60_000)
    // rand=0 → exact base; rand=1 → base + 20%.
    expect(tmpFullRetryDelayMs(1, () => 0)).toBe(d5)
    expect(tmpFullRetryDelayMs(1, () => 1)).toBe(Math.floor(d5 * 1.2))
    expect(tmpFullRetryDelayMs(2, () => 0)).toBe(d15)
    expect(tmpFullRetryDelayMs(3, () => 0)).toBe(d45)
  })

  test('attempt count preserved: attempts beyond the schedule pin to the last tier, never reset', () => {
    expect(tmpFullRetryDelayMs(10, () => 0)).toBe(45 * 60_000)
    expect(tmpFullRetryDelayMs(99, () => 1)).toBe(Math.floor(45 * 60_000 * 1.2))
  })

  test('caps untouched: schedule never exceeds 45m + jitter', () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const d = tmpFullRetryDelayMs(attempt, () => 1)
      expect(d).toBeLessThanOrEqual(Math.floor(45 * 60_000 * 1.2))
    }
  })
})

describe('transientDispatchHold — tmp-full uses the escalating schedule', () => {
  test('one tmp-full failure → back-off inside [5m, 6m]', () => {
    const hold = transientDispatchHold([tmpFull(1)], NOW)
    expect(hold?.reason).toBe('transient_backoff')
    expect(hold?.transientFailures).toBe(1)
    const retryIn = Date.parse(hold!.retryAfterIso) - NOW
    expect(retryIn).toBeGreaterThanOrEqual(5 * 60_000 - 60_000)
    expect(retryIn).toBeLessThanOrEqual(Math.floor(5 * 60_000 * 1.2))
  })

  test('two consecutive tmp-full failures → second tier [15m, 18m]', () => {
    const hold = transientDispatchHold([tmpFull(30), tmpFull(1)], NOW)
    expect(hold?.reason).toBe('transient_backoff')
    expect(hold?.transientFailures).toBe(2)
    const retryIn = Date.parse(hold!.retryAfterIso) - NOW
    expect(retryIn).toBeGreaterThanOrEqual(15 * 60_000 - 60_000)
    expect(retryIn).toBeLessThanOrEqual(Math.floor(15 * 60_000 * 1.2))
  })

  test('non-tmp causes keep the flat 30m back-off (unchanged behavior)', () => {
    const hold = transientDispatchHold(
      [
        {
          status: 'failed',
          updated_at: iso(10),
          error_json: { transient: true, transient_cause: 'elevenlabs_auth_or_quota' },
        },
      ],
      NOW,
    )
    expect(hold?.reason).toBe('transient_backoff')
    expect(hold?.retryAfterIso).toBe(new Date(NOW - 10 * 60_000 + 30 * 60_000).toISOString())
  })
})

describe('tmpSpace helpers', () => {
  test('threshold constants', () => {
    expect(TMP_ABORT_MIN_BYTES).toBe(50 * 1024 * 1024)
    expect(TMP_WARN_BYTES).toBe(200 * 1024 * 1024)
    expect(RENDER_DOWNLOAD_CONCURRENCY).toBe(4)
  })

  test('assertTmpSpaceOrThrow aborts below 50 MB with the transient marker', () => {
    expect(() => assertTmpSpaceOrThrow('test-stage', TMP_ABORT_MIN_BYTES, () => 10 * 1024 * 1024)).toThrow(
      /TMP_SPACE_LOW/,
    )
    expect(() => assertTmpSpaceOrThrow('test-stage', TMP_ABORT_MIN_BYTES, () => 500 * 1024 * 1024)).not.toThrow()
    // Unmeasurable disk never blocks a render.
    expect(() => assertTmpSpaceOrThrow('test-stage', TMP_ABORT_MIN_BYTES, () => null)).not.toThrow()
  })

  test('abort error classifies as runner_tmp_full', () => {
    let msg = ''
    try {
      assertTmpSpaceOrThrow('test-stage', TMP_ABORT_MIN_BYTES, () => 1024)
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err)
    }
    expect(classifyTransientFailure(msg)).toBe('runner_tmp_full')
  })

  test('etMixPrefix is sweeper-safe', () => {
    expect(etMixPrefix('personalized')).toMatch(/et-mix-personalized-$/)
    expect(etMixPrefix('avfm-abc123')).toContain('et-mix-')
  })

  test('limitedParallel caps in-flight work and preserves order', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return i * 2
    })
    const results = await limitedParallel(tasks, 4)
    expect(results).toEqual(Array.from({ length: 10 }, (_, i) => i * 2))
    expect(maxInFlight).toBeLessThanOrEqual(4)
  })
})
