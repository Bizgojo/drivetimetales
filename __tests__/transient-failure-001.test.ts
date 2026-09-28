/**
 * TRANSIENT-FAILURE-001 (Marc GO 2026-09-28)
 *
 * Outside failures (bad key, no credits, rate limit, outage, lost runner) must
 * not trip the failure circuit / retry cap or park a story. Real story
 * defects must keep behaving exactly as before.
 *
 * Regression source: Sep 25-26, 2026 — a bad ElevenLabs key and an empty
 * Anthropic balance failed 3 Origin 2.0 jobs in 2h; the circuit parked all 18
 * unproduced episodes in repair_queue.
 */

import {
  ACCOUNT_WIDE_CAUSES,
  classifyTransientFailure,
  isTransientJobRow,
  stripQuotedScriptText,
  transientErrorFields,
} from '@/lib/transientFailure'
import {
  TRANSIENT_BACKOFF_MS,
  TRANSIENT_HOLD_THRESHOLD,
  TRANSIENT_HOLD_WINDOW_MS,
  TRANSIENT_ESCALATE_THRESHOLD,
  countRecentFailures,
  countRetryCapFailures,
  failureCircuitOpen,
  permanentFailuresOnly,
  transientDispatchHold,
  transientEscalation,
} from '@/lib/dispatchGuards'

const NOW = Date.parse('2026-09-26T18:30:00Z')
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

const permanent = (minutesAgo: number) => ({
  status: 'failed',
  updated_at: iso(minutesAgo),
  error_json: { kind: 'unknown_step', message: 'Belle quality repair attempt limit reached', marc_required: true },
})
const transient = (minutesAgo: number) => ({
  status: 'failed',
  updated_at: iso(minutesAgo),
  error_json: { kind: 'unknown_step', message: 'x', ...transientErrorFields('elevenlabs_auth_or_quota') },
})
const legacyNoErrorJson = (minutesAgo: number) => ({ status: 'failed', updated_at: iso(minutesAgo) })

describe('classifyTransientFailure — real error text from production', () => {
  test('Sep 26 Anthropic empty balance → transient', () => {
    const msg =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    expect(classifyTransientFailure(msg)).toBe('anthropic_auth_or_credit')
  })

  test('ElevenLabs bad key (generate-voices shape) → transient', () => {
    expect(
      classifyTransientFailure('ElevenLabs error 401: {"detail":{"status":"invalid_api_key","message":"Invalid API key"}}'),
    ).toBe('elevenlabs_auth_or_quota')
  })

  test('ElevenLabs provider shapes (TTS failed (429), API error: 402) → transient', () => {
    expect(classifyTransientFailure('ElevenLabs TTS failed (429): too many concurrent requests')).toBe('elevenlabs_auth_or_quota')
    expect(classifyTransientFailure('ElevenLabs API error: 402')).toBe('elevenlabs_auth_or_quota')
    expect(classifyTransientFailure('{"detail":{"status":"quota_exceeded"}}')).toBe('elevenlabs_auth_or_quota')
  })

  test('nested report objects are searched', () => {
    const report = { failures: [{ segment: 'segment_0001.mp3', error: 'ElevenLabs error 401: unauthorized' }] }
    expect(classifyTransientFailure('Voice generation hard failure at segment 1', report)).toBe('elevenlabs_auth_or_quota')
  })

  test('rate limit / overloaded / OpenAI quota / network → transient', () => {
    expect(classifyTransientFailure('429 {"type":"error","error":{"type":"rate_limit_error"}}')).toBe('provider_rate_limit')
    expect(classifyTransientFailure('529 {"type":"error","error":{"type":"overloaded_error"}}')).toBe('provider_overloaded')
    expect(classifyTransientFailure('OpenAI 429: insufficient_quota')).toBe('openai_quota')
    expect(classifyTransientFailure('TypeError: fetch failed')).toBe('network')
    expect(classifyTransientFailure('connect ECONNRESET 1.2.3.4:443')).toBe('network')
  })

  test('real story defects stay PERMANENT', () => {
    for (const msg of [
      'Belle quality repair attempt limit reached',
      'NARRATOR not found for author — narrator mismatch',
      'TRANSCRIPT_AMBIGUOUS: expected "Where is it?" partial output "Where is it"',
      'Series create_story_row is not implemented in this first run-next slice',
      'Segment 401 transcript mismatch: expected "the bell" partial output "the belt"',
      'ElevenLabs voice for Pierce produced silence at segment 429',
      'SILENCE_BUFFER exceeded threshold',
      '',
    ]) {
      expect(classifyTransientFailure(msg)).toBeNull()
    }
  })
})

describe('isTransientJobRow', () => {
  test('flagged rows and zombie_stalled rows are transient; others are not', () => {
    expect(isTransientJobRow(transient(5))).toBe(true)
    expect(isTransientJobRow({ error_json: { kind: 'zombie_stalled' } })).toBe(true)
    expect(isTransientJobRow(permanent(5))).toBe(false)
    expect(isTransientJobRow(legacyNoErrorJson(5))).toBe(false)
    expect(isTransientJobRow(null)).toBe(false)
  })

  test('transient error fields never require Marc', () => {
    expect(transientErrorFields('network').marc_required).toBe(false)
  })
})

describe('failure circuit ignores transient failures (the Sep 25-26 incident)', () => {
  test('3 transient failures in 2h do NOT open the circuit', () => {
    const jobs = [transient(10), transient(30), transient(60)]
    expect(countRecentFailures(jobs, NOW)).toBe(0)
    expect(failureCircuitOpen(jobs, NOW)).toBe(false)
  })

  test('3 real defects in 2h still open the circuit (unchanged behavior)', () => {
    expect(failureCircuitOpen([permanent(10), permanent(30), permanent(60)], NOW)).toBe(true)
  })

  test('legacy failed rows without error_json still count (unchanged behavior)', () => {
    expect(failureCircuitOpen([legacyNoErrorJson(10), legacyNoErrorJson(30), legacyNoErrorJson(60)], NOW)).toBe(true)
  })

  test('mixed: 2 defects + 3 transient stays closed', () => {
    const jobs = [permanent(10), transient(20), permanent(30), transient(40), transient(50)]
    expect(countRecentFailures(jobs, NOW)).toBe(2)
    expect(failureCircuitOpen(jobs, NOW)).toBe(false)
    expect(permanentFailuresOnly(jobs)).toHaveLength(2)
  })

  test('7-day retry cap ignores transient failures', () => {
    const jobs = [transient(60), transient(120), transient(600), permanent(700), permanent(800)]
    expect(countRetryCapFailures(jobs, NOW)).toBe(2)
  })
})

describe('transientDispatchHold — back off instead of parking', () => {
  test('no transient failures → dispatch proceeds', () => {
    expect(transientDispatchHold([], NOW)).toBeNull()
    expect(transientDispatchHold([permanent(5)], NOW)).toBeNull()
  })

  test('one transient failure 10 min ago → wait until 30 min after it', () => {
    const hold = transientDispatchHold([transient(10)], NOW)
    expect(hold?.reason).toBe('transient_backoff')
    expect(hold?.retryAfterIso).toBe(new Date(NOW - 10 * 60_000 + TRANSIENT_BACKOFF_MS).toISOString())
  })

  test('newest transient failure older than the back-off → dispatch proceeds', () => {
    expect(transientDispatchHold([transient(45), transient(200)], NOW)).toBeNull()
  })

  test(`${TRANSIENT_HOLD_THRESHOLD} transient failures in 12h → hold until the oldest counted one ages out`, () => {
    const jobs = [transient(60), transient(180), transient(300), transient(420)]
    const hold = transientDispatchHold(jobs, NOW)
    expect(hold?.reason).toBe('transient_hold')
    expect(hold?.transientFailures).toBe(4)
    expect(hold?.retryAfterIso).toBe(new Date(NOW - 420 * 60_000 + TRANSIENT_HOLD_WINDOW_MS).toISOString())
  })

  test('failures older than 12h do not count toward the hold', () => {
    const jobs = [transient(60), transient(180), transient(300), transient(13 * 60)]
    expect(transientDispatchHold(jobs, NOW)).toBeNull()
  })

  test('a human reset (floor) releases the hold immediately', () => {
    const jobs = [transient(60), transient(180), transient(300), transient(420)]
    const resetMs = NOW - 5 * 60_000 // cleared 5 minutes ago
    expect(transientDispatchHold(jobs, NOW, resetMs)).toBeNull()
  })

  test('worst case on a dead key: at most 8 attempts per day', () => {
    // Simulate a dispatch loop that retries as soon as the hold allows.
    let t = NOW
    const history: Array<{ status: string; updated_at: string; error_json: unknown }> = []
    let attempts = 0
    for (let minute = 0; minute < 24 * 60; minute++) {
      const nowMs = t + minute * 60_000
      if (transientDispatchHold(history, nowMs) === null) {
        attempts += 1
        history.push({ status: 'failed', updated_at: new Date(nowMs).toISOString(), error_json: { transient: true } })
      }
    }
    expect(attempts).toBeLessThanOrEqual(8)
    expect(attempts).toBeGreaterThanOrEqual(6)
  })
})

describe('review fixes — dialogue can never look like an outage', () => {
  test('plain-English "fetch failed" / "socket hang up" in dialogue stays PERMANENT', () => {
    expect(classifyTransientFailure('Transcript mismatch at segment 12: the fetch failed to load')).toBeNull()
    expect(classifyTransientFailure('Belle intro line: "Then the socket hang up happened"')).toBeNull()
  })

  test('quoted script text is stripped before classifying', () => {
    const qc = 'QC mismatch: expected "Your credit balance is too low, Marcus." partial output "Your credit"'
    expect(stripQuotedScriptText(qc)).toBe('QC mismatch: expected "…" partial output "…"')
    expect(classifyTransientFailure(stripQuotedScriptText(qc))).toBeNull()
  })

  test('provider error bodies survive stripping', () => {
    const el = 'ElevenLabs error 401: {"detail":{"status":"invalid_api_key"}}'
    expect(classifyTransientFailure(stripQuotedScriptText(el))).toBe('elevenlabs_auth_or_quota')
    const anthropic = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
    expect(classifyTransientFailure(stripQuotedScriptText(anthropic))).toBe('anthropic_auth_or_credit')
  })

  test('account-wide causes pause dispatch globally; network blips do not', () => {
    expect(ACCOUNT_WIDE_CAUSES.has('elevenlabs_auth_or_quota')).toBe(true)
    expect(ACCOUNT_WIDE_CAUSES.has('anthropic_auth_or_credit')).toBe(true)
    expect(ACCOUNT_WIDE_CAUSES.has('network')).toBe(false)
    expect(ACCOUNT_WIDE_CAUSES.has('zombie_stalled')).toBe(false)
  })
})

describe('review fixes — an unfixed outside cause is escalated to a human', () => {
  const withCause = (minutesAgo: number) => ({
    status: 'failed',
    updated_at: iso(minutesAgo),
    error_json: { transient: true, transient_cause: 'elevenlabs_auth_or_quota' },
  })

  test(`below ${TRANSIENT_ESCALATE_THRESHOLD} transient failures in 48h → no escalation`, () => {
    const jobs = Array.from({ length: TRANSIENT_ESCALATE_THRESHOLD - 1 }, (_, i) => withCause(i * 180))
    expect(transientEscalation(jobs, NOW)).toBeNull()
  })

  test(`${TRANSIENT_ESCALATE_THRESHOLD} in 48h → escalate with the cause`, () => {
    const jobs = Array.from({ length: TRANSIENT_ESCALATE_THRESHOLD }, (_, i) => withCause(i * 180))
    expect(transientEscalation(jobs, NOW)).toEqual({ transientFailures: TRANSIENT_ESCALATE_THRESHOLD, cause: 'elevenlabs_auth_or_quota' })
  })

  test('a human clear (floor) resets the escalation count', () => {
    const jobs = Array.from({ length: TRANSIENT_ESCALATE_THRESHOLD }, (_, i) => withCause(i * 180 + 10))
    expect(transientEscalation(jobs, NOW, NOW - 5 * 60_000)).toBeNull()
  })

  test('real defects never count toward escalation', () => {
    const jobs = Array.from({ length: 20 }, (_, i) => permanent(i * 60))
    expect(transientEscalation(jobs, NOW)).toBeNull()
  })
})
