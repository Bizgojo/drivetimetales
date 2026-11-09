import { publishLengthIssue, briefTargetMinutes } from '@/lib/episodeLength'

describe('EPISODE-LENGTH-001 (decision 4)', () => {
  test('brief target is the upper number of the runtime range', () => {
    expect(briefTargetMinutes({ runtime: '12-15 minutes' })).toBe(15)
    expect(briefTargetMinutes({})).toBeNull()
  })
  test('series: floor 12.5 (duration rounded up, so 12 fails and 13 passes)', () => {
    expect(publishLengthIssue({ durationMins: 12, briefJson: { runtime: '12-15 minutes' }, isSeries: true })).toMatch(/at least 12.5/)
    expect(publishLengthIssue({ durationMins: 13, briefJson: { runtime: '12-15 minutes' }, isSeries: true })).toBeNull()
  })
  test('series: cap 1.35 × brief', () => {
    expect(publishLengthIssue({ durationMins: 21, briefJson: { runtime: '15 minutes' }, isSeries: true })).toBeNull()
    expect(publishLengthIssue({ durationMins: 22, briefJson: { runtime: '15 minutes' }, isSeries: true })).toMatch(/at most 20.3/)
  })
  test('scripts written before Nov 10, 2026 keep the old rule; no date → old rule', () => {
    expect(publishLengthIssue({ durationMins: 12, isSeries: true, scriptUpdatedAt: '2026-11-09T20:00:00Z' })).toBeNull()
    expect(publishLengthIssue({ durationMins: 12, isSeries: true, scriptUpdatedAt: null })).toBeNull()
    expect(publishLengthIssue({ durationMins: 12, isSeries: true, scriptUpdatedAt: '2026-11-10T01:00:00Z' })).toMatch(/12.5/)
  })
  test('standalone: within ±10% of brief', () => {
    expect(publishLengthIssue({ durationMins: 20, briefJson: { runtime: '20 minutes' }, isSeries: false })).toBeNull()
    expect(publishLengthIssue({ durationMins: 17, briefJson: { runtime: '20 minutes' }, isSeries: false })).toMatch(/within 10%/)
  })
})
