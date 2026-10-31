// TEST-ACCOUNTS-AUDIT-20261031: unit tests for excludeTestUserEvents.
import { excludeTestUserEvents, periodMetrics } from '@/lib/admin-center/story-performance'

const testIds = new Set(['test-user-1', 'test-user-2'])
const events = [
  { story_id: 's1', session_id: 'a', user_id: 'test-user-1', started_at: '2026-10-01T00:00:00Z', ended_at: '2026-10-01T00:05:00Z', progress_pct: 100, stop_reason: 'completed' },
  { story_id: 's1', session_id: 'b', user_id: 'real-user-9', started_at: '2026-10-01T00:00:00Z', ended_at: '2026-10-01T00:05:00Z', progress_pct: 100, stop_reason: 'completed' },
  { story_id: 's1', session_id: 'c', user_id: null, started_at: '2026-10-01T00:00:00Z', ended_at: null, progress_pct: 10, stop_reason: 'navigated_away' },
]

describe('excludeTestUserEvents', () => {
  it('removes rows attributed to test accounts, keeps real + anonymous rows', () => {
    const out = excludeTestUserEvents(events, testIds)
    expect(out.map(e => e.session_id).sort()).toEqual(['b', 'c'])
  })
  it('returns input untouched when the test set is empty', () => {
    expect(excludeTestUserEvents(events, new Set())).toHaveLength(3)
  })
  it('excluded test rows no longer count as starts/finishes', () => {
    const m = periodMetrics(excludeTestUserEvents(events, testIds), [], '2026-09-01T00:00:00Z')
    expect(m['s1'].starts).toBe(2)
    expect(m['s1'].finishes).toBe(1)
  })
})
