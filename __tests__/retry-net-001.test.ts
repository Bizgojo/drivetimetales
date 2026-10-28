import { transientResumeDecision, isSelfFetchFailure, MAX_TRANSIENT_RESUMES } from '@/lib/transientResume'

const NOW = Date.parse('2026-10-28T22:00:00.000Z')
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

const job = (over: Record<string, unknown> = {}) => ({
  status: 'failed',
  job_type: 'series',
  current_step: 'series_generate_voices',
  updated_at: minsAgo(3),
  error_json: { message: 'Non-JSON response from /api/admin/generate-voices' },
  state_json: {},
  ...over,
})

describe('RETRY-NET-001 transient self-fetch resume', () => {
  test.each([
    'TypeError: fetch failed',
    'fetch failed',
    'Non-JSON response from /api/admin/generate-voices',
    'Empty response from /api/asc3/render-final-mix',
    'Series voice segment fetch failed for Ep3 seg41: no response after 3 retries',
    'connect ECONNREFUSED 127.0.0.1:3000',
    '502 Bad Gateway',
  ])('recognises %s', (msg) => {
    expect(isSelfFetchFailure(msg)).toBe(true)
  })

  test.each([
    'VOICE-001: 17 segment(s) using the wrong voice_id. Blocked before render_final_mix.',
    'DESCRIPTION validator: protagonist mismatch',
    'He said the fetch failed us all',
  ])('ignores story defects: %s', (msg) => {
    expect(isSelfFetchFailure(msg)).toBe(false)
  })

  test('resumes at the same step after back-off', () => {
    expect(transientResumeDecision(job(), NOW)).toEqual({ action: 'resume', attempt: 1, step: 'series_generate_voices' })
  })

  test('waits inside the back-off window', () => {
    const d = transientResumeDecision(job({ updated_at: minsAgo(1) }), NOW)
    expect(d?.action).toBe('wait')
  })

  test('back-off grows with each resume', () => {
    const d = transientResumeDecision(job({ updated_at: minsAgo(5), state_json: { transientResumeCount: 2 } }), NOW)
    expect(d?.action).toBe('wait') // third resume needs 8 minutes
    expect(transientResumeDecision(job({ updated_at: minsAgo(9), state_json: { transientResumeCount: 2 } }), NOW)?.action).toBe('resume')
  })

  test('stops after the resume budget', () => {
    const d = transientResumeDecision(job({ updated_at: minsAgo(60), state_json: { transientResumeCount: MAX_TRANSIENT_RESUMES } }), NOW)
    expect(d).toEqual({ action: 'exhausted', attempt: MAX_TRANSIENT_RESUMES })
    expect(transientResumeDecision(job({ error_json: { message: 'fetch failed', exhausted: true } }), NOW)).toBeNull()
  })

  test('never resumes account-wide failures, story defects, test jobs or non-failed jobs', () => {
    expect(transientResumeDecision(job({ error_json: { message: 'fetch failed', transient_cause: 'elevenlabs_auth_or_quota' } }), NOW)).toBeNull()
    expect(transientResumeDecision(job({ error_json: { message: 'VOICE-001: wrong voice_id' } }), NOW)).toBeNull()
    expect(transientResumeDecision(job({ job_type: 'TEST_series' }), NOW)).toBeNull()
    expect(transientResumeDecision(job({ status: 'queued' }), NOW)).toBeNull()
  })
})
