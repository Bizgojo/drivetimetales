// SINCE-LAUNCH-FILTER-20261031: since-launch (2026-11-06) date filter coverage.
jest.mock('server-only', () => ({}), { virtual: true })
import { resolvePeriod, SINCE_LAUNCH_ISO } from '@/app/api/admin/center/story-performance/route'
import { countNewSinceLaunch } from '@/app/api/admin/center/customer-summary/route'
import { periodMetrics } from '@/lib/admin-center/story-performance'

const LAUNCH = '2026-11-06T00:00:00.000Z'

describe('since-launch constants', () => {
  it('pins the launch cutoff to 2026-11-06 UTC', () => {
    expect(SINCE_LAUNCH_ISO).toBe(LAUNCH)
  })
})

describe('resolvePeriod (story-performance)', () => {
  it('resolves ?since= to since-mode with days=-1', () => {
    const r = resolvePeriod(new URLSearchParams({ since: LAUNCH }))
    expect(r).toEqual({ ok: true, days: -1, since: LAUNCH })
  })
  it('normalises a date-only since value to ISO midnight UTC', () => {
    const r = resolvePeriod(new URLSearchParams({ since: '2026-11-06' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.since).toBe(LAUNCH)
  })
  it('rejects an invalid since value', () => {
    expect(resolvePeriod(new URLSearchParams({ since: 'not-a-date' }))).toEqual({
      ok: false,
      error: 'Invalid since date',
    })
  })
  it('preserves every existing rolling period', () => {
    for (const days of ['0', '7', '30', '90', '365']) {
      const r = resolvePeriod(new URLSearchParams({ days }))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.days).toBe(Number(days))
    }
  })
  it('still rejects out-of-list days values', () => {
    expect(resolvePeriod(new URLSearchParams({ days: '14' }))).toEqual({
      ok: false,
      error: 'Invalid reporting period',
    })
  })
})

describe('countNewSinceLaunch (customer-summary)', () => {
  const rows = [
    { created_at: '2026-11-06T00:00:00.000Z' }, // boundary counts
    { created_at: '2026-11-07T12:00:00.000Z' },
    { created_at: '2026-11-05T23:59:59.000Z' }, // day before launch excluded
    { created_at: '2026-08-01T00:00:00.000Z' },
  ]
  it('counts only rows created on/after the cutoff', () => {
    expect(countNewSinceLaunch(rows, LAUNCH)).toBe(2)
  })
  it('accepts a ?since= override cutoff', () => {
    expect(countNewSinceLaunch(rows, '2026-08-01T00:00:00.000Z')).toBe(4)
  })
  it('throws on an invalid cutoff', () => {
    expect(() => countNewSinceLaunch(rows, 'nope')).toThrow('Invalid since date')
  })
})

describe('periodMetrics honours the since-launch boundary', () => {
  const events = [
    { story_id: 's1', session_id: 'pre', user_id: 'u1', started_at: '2026-11-05T00:00:00Z', ended_at: '2026-11-05T00:05:00Z', progress_pct: 100, stop_reason: 'completed' },
    { story_id: 's1', session_id: 'post', user_id: 'u2', started_at: '2026-11-06T01:00:00Z', ended_at: '2026-11-06T01:05:00Z', progress_pct: 100, stop_reason: 'completed' },
  ]
  it('excludes pre-launch sessions when since=launch', () => {
    const m = periodMetrics(events as any, [], LAUNCH)
    expect(m['s1'].starts).toBe(1)
    expect(m['s1'].finishes).toBe(1)
  })
})
