import { classifyTransientFailure } from '@/lib/transientFailure'
import { transientResumeDecision, isSelfFetchFailure } from '@/lib/transientResume'

const seen = [
  'WRITER-SELF-CHECK-001: episode 6 writer call failed: 503 status code (no body)',
  'WRITER-SELF-CHECK-001: episode 3 writer call failed: 503 credential validation failed',
  '529 status code (no body)',
]

describe('RETRY-5XX-001', () => {
  test('the Nov 13 provider errors are transient, so they never use up the writer cap or flag the story', () => {
    for (const m of seen) expect(classifyTransientFailure(m)).toBe('provider_overloaded')
  })
  test('they are auto-resumed at the same step after the back-off', () => {
    for (const m of seen) expect(isSelfFetchFailure(m)).toBe(true)
    const failedAt = Date.parse('2026-11-13T10:17:00Z')
    const job = { status: 'failed', current_step: 'generate_episode_script', job_type: 'series', updated_at: '2026-11-13T10:17:00Z', error_json: { message: seen[0], transient: true, transient_cause: 'provider_overloaded' }, state_json: {} }
    expect(transientResumeDecision(job, failedAt + 60_000)?.action).toBe('wait')
    expect(transientResumeDecision(job, failedAt + 3 * 60_000)).toEqual({ action: 'resume', attempt: 1, step: 'generate_episode_script' })
  })
  test('story text and ordinary numbers never match', () => {
    expect(classifyTransientFailure('NARRATOR: Suite 503 was quiet.')).toBeNull()
    expect(classifyTransientFailure('RUNTIME-SERIES-MAX: 3034 spoken words')).toBeNull()
    expect(isSelfFetchFailure('CALEB: I counted 503 boxes.')).toBe(false)
  })
})
