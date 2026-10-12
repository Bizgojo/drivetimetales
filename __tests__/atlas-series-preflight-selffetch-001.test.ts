/**
 * ATLAS-SERIES-PREFLIGHT-SELFFETCH-001 (2026-10-11, Class A)
 *
 * Regression source: The Extraction EP1, 2026-10-11 23:30–23:33 UTC —
 * three series_voice_preflight jobs (e910b19d, 0b44e30b, df24aaa1) died on
 * a bare `fetch failed` self-fetch to /api/admin/generate-voices. The errno
 * was discarded, nothing retried, and the failure was stored WITHOUT a
 * transient tag — so dispatch minted a new job every cycle until the
 * failure circuit parked all episodes in repair_queue for an infra blip.
 *
 * No DB writes, no network. Sleep is injected.
 */

import {
  serializeSelfFetchCause,
  selfFetchHaystack,
  classifySelfFetchTransportError,
  isConnectionKindFetchError,
  fetchWithConnectionRetry,
} from '@/lib/preflightSelfFetch'
import { classifyTransientFailure, stripQuotedScriptText } from '@/lib/transientFailure'
import { countRecentFailures, failureCircuitOpen } from '@/lib/dispatchGuards'

const NOW = Date.parse('2026-10-11T23:35:00Z')
const iso = (s: string) => s

// The exact production error shape: undici throws TypeError("fetch failed")
// with a nested errno cause. The route previously kept only err.message.
function productionFetchFailed() {
  const errno = new Error('read ECONNRESET') as Error & { code?: string }
  errno.code = 'ECONNRESET'
  const inner = new TypeError('fetch failed') as TypeError & { cause?: unknown; code?: string }
  ;(inner as { cause?: unknown }).cause = errno
  return inner
}

describe('cause-chain forensics', () => {
  test('errno survives serialization through nested causes', () => {
    const frames = serializeSelfFetchCause(productionFetchFailed())
    expect(frames[0]).toMatchObject({ name: 'TypeError', message: 'fetch failed' })
    const codes = frames.map((f) => f.code).filter(Boolean)
    expect(codes).toContain('ECONNRESET')
  })

  test('haystack uses colon form so anchored patterns match raw errors', () => {
    expect(selfFetchHaystack(productionFetchFailed())).toContain('TypeError: fetch failed')
  })

  test('composed route message does NOT match the anchored pattern (why raw-error classification is required)', () => {
    expect(
      classifyTransientFailure('generate-voices preflight request failed: fetch failed'),
    ).toBeNull()
  })
})

describe('transport classification', () => {
  test('raw production error classifies as network transient', () => {
    expect(classifySelfFetchTransportError(productionFetchFailed())).toBe('network')
  })

  test('ENOTFOUND / EAI_AGAIN DNS failures classify as network', () => {
    const dns = new TypeError('fetch failed') as TypeError & { cause?: unknown }
    const cause = new Error('getaddrinfo ENOTFOUND app.endless-tales.com') as Error & { code?: string }
    cause.code = 'ENOTFOUND'
    ;(dns as { cause?: unknown }).cause = cause
    expect(classifySelfFetchTransportError(dns)).toBe('network')
    expect(isConnectionKindFetchError(dns)).toBe(true)
  })

  test('abort/timeout is NOT connection-kind (server may still be working)', () => {
    const abort = new DOMException('This operation was aborted', 'AbortError')
    expect(isConnectionKindFetchError(abort)).toBe(false)
  })

  test('story dialogue stays PERMANENT — "the fetch failed" never matches', () => {
    const qcMessage =
      'expected "The fetch failed." partial output "he said the fetch failed twice"'
    expect(classifyTransientFailure(stripQuotedScriptText(qcMessage))).toBeNull()
    expect(classifySelfFetchTransportError(new Error(qcMessage))).toBeNull()
  })

  test('genuine story defects stay PERMANENT', () => {
    expect(classifySelfFetchTransportError(new Error('Belle quality repair attempt limit reached'))).toBeNull()
  })
})

describe('connection retry', () => {
  test('retries connection-kind throws then recovers', async () => {
    let calls = 0
    const sleeps: number[] = []
    const { value, attempts, failures } = await fetchWithConnectionRetry(
      () => {
        calls++
        if (calls < 3) return Promise.reject(productionFetchFailed())
        return Promise.resolve('ok')
      },
      { attempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitterMs: 0, sleepFn: async (ms) => { sleeps.push(ms) } },
    )
    expect(value).toBe('ok')
    expect(attempts).toBe(3)
    expect(calls).toBe(3)
    expect(failures).toHaveLength(2)
    expect(sleeps).toEqual([10, 20])
  })

  test('exhausts attempts and throws the last error with full forensics', async () => {
    const sleepFn = async () => {}
    await expect(
      fetchWithConnectionRetry(() => Promise.reject(productionFetchFailed()), {
        attempts: 2, baseDelayMs: 1, jitterMs: 0, sleepFn,
      }),
    ).rejects.toThrow('fetch failed')
  })

  test('HTTP responses (even 500) are returned, never retried', async () => {
    let calls = 0
    const { value, attempts } = await fetchWithConnectionRetry(
      () => { calls++; return Promise.resolve({ status: 500 }) },
      { attempts: 3, sleepFn: async () => {} },
    )
    expect(value).toEqual({ status: 500 })
    expect(attempts).toBe(1)
    expect(calls).toBe(1)
  })

  test('abort errors are never retried', async () => {
    let calls = 0
    await expect(
      fetchWithConnectionRetry(
        () => { calls++; return Promise.reject(new DOMException('aborted', 'AbortError')) },
        { attempts: 3, sleepFn: async () => {} },
      ),
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })
})

describe('dispatch honors the transient tag (no duplicate storm, no repair_queue parking)', () => {
  // Three transport-tagged failures inside 2h must NOT open the circuit.
  const transportTagged = [18, 16, 14].map((minutesAgo) => ({
    status: 'failed',
    updated_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    error_json: {
      step: 'series_voice_preflight',
      transient: true,
      transient_cause: 'network',
      marc_required: false,
      preflightReport: {
        success: false,
        blockingReasons: ['generate-voices preflight request failed: fetch failed'],
        fetchErrorCause: [{ name: 'TypeError', message: 'fetch failed' }],
      },
      at: iso('2026-10-11T23:33:46.923Z'),
    },
  }))

  test('transient-tagged preflight failures do not count toward the circuit', () => {
    expect(countRecentFailures(transportTagged, NOW)).toBe(0)
    expect(failureCircuitOpen(transportTagged, NOW)).toBe(false)
  })

  test('the same three failures WITHOUT the tag DO open the circuit (Oct 11 behavior)', () => {
    const untagged = transportTagged.map((j) => ({
      ...j,
      error_json: { step: 'series_voice_preflight', at: j.error_json.at },
    }))
    expect(countRecentFailures(untagged, NOW)).toBe(3)
    expect(failureCircuitOpen(untagged, NOW)).toBe(true)
  })
})
