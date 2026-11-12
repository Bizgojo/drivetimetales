import { failureAlertDue, failureAlertKey, failureReason, buildFailureMessage, FAILURE_LOOKBACK_MS, evaluateProgressAlarm } from '@/lib/progressAlarm'
import { readFileSync } from 'fs'
import { join } from 'path'

const now = Date.parse('2026-11-12T17:30:00Z')
const failedAt = '2026-11-12T15:23:50.873Z'

describe('FAILURE-ALERT-001', () => {
  test('a recent failure alerts once', () => {
    expect(failureAlertDue(null, failedAt, now)).toBe(true)
    expect(failureAlertDue(failureAlertKey(failedAt), failedAt, now)).toBe(false)
  })
  test('the same job failing again alerts again', () => {
    expect(failureAlertDue(failureAlertKey(failedAt), '2026-11-12T17:20:00Z', now)).toBe(true)
  })
  test('old failures and missing times never alert', () => {
    expect(failureAlertDue(null, new Date(now - FAILURE_LOOKBACK_MS - 1000).toISOString(), now)).toBe(false)
    expect(failureAlertDue(null, null, now)).toBe(false)
  })
  test('a progress fingerprint from before the failure does not hide it', () => {
    expect(failureAlertDue('[3,"","score_validate_package",0]', failedAt, now)).toBe(true)
  })
  test('a resumed job starts a fresh progress baseline', () => {
    const r = evaluateProgressAlarm({ fingerprint: failureAlertKey(failedAt), lastSavedAt: failedAt, lastAlertAt: failedAt, stuck: false }, { presentCount: 0, audioUrl: null, step: 'score_validate_package', episodeCount: 0 }, now)
    expect(r.decision).toBe('ok')
    expect(r.healthy).toBe(true)
  })
  test('reason comes from the error, and a blank error is called out', () => {
    expect(failureReason({ packageReport: { summary: 'series story read failed (rewrite 1)' }, episodeResult: { episodeNumber: 4 } }))
      .toBe('series story read failed (rewrite 1) — episode 4')
    expect(failureReason(null)).toMatch(/no reason recorded/)
  })
  test('message names the job, step, time and reason', () => {
    const m = buildFailureMessage({ jobId: 'fe4c8778-31d2', step: 'score_validate_package', failedAt, reason: 'series story read failed', marcRequired: true })
    expect(m).toMatch(/FAILED job fe4c8778 at step "score_validate_package" \(2026-11-12 15:23Z\): series story read failed/)
    expect(m).toMatch(/needing Marc/)
  })
  test('scanner checks failed jobs and never writes production_jobs', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/progress-alarm/route.ts'), 'utf8')
    expect(src).toContain(".eq('status', 'failed')")
    expect(src).toContain('failureAlertDue(')
    expect(src).not.toMatch(/from\('production_jobs'\)\s*\.(update|insert|upsert)/)
  })
})
