/**
 * FIX-1 §10 policy helpers — unit tests (pure, zero I/O).
 * Run: npx jest __tests__/fix1-section10-001.test.ts
 */
import {
  RETENTION_GRACE_DAYS,
  RETENTION_ARCHIVE_DAYS,
  MS_PER_DAY,
  daysBetween,
  decideRetention,
  lastWriteWins,
  sbwoFatalError,
  canonicalKeyFor,
} from '@/lib/storage/section10'

describe('fix1 §10 policy helpers', () => {
  test('retention windows are 14d grace / 90d archive', () => {
    expect(RETENTION_GRACE_DAYS).toBe(14)
    expect(RETENTION_ARCHIVE_DAYS).toBe(90)
  })
  test('decideRetention: grace → retain', () => {
    const now = Date.now()
    expect(decideRetention(now - 13 * MS_PER_DAY, now)).toBe('retain')
  })
  test('decideRetention: 14d → archive_candidate (never hard-delete)', () => {
    const now = Date.now()
    expect(decideRetention(now - 14 * MS_PER_DAY, now)).toBe('archive_candidate')
    expect(decideRetention(now - 89 * MS_PER_DAY, now)).toBe('archive_candidate')
  })
  test('decideRetention: 90d → purge_candidate', () => {
    const now = Date.now()
    expect(decideRetention(now - 90 * MS_PER_DAY, now)).toBe('purge_candidate')
  })
  test('daysBetween math', () => {
    expect(daysBetween(0, MS_PER_DAY)).toBe(1)
  })
  test('lastWriteWins: newer timestamp wins, tie keeps existing', () => {
    expect(lastWriteWins(100, 200)).toBe('b')
    expect(lastWriteWins(200, 100)).toBe('a')
    expect(lastWriteWins(100, 100)).toBe('tie')
  })
  test('sbwoFatalError carries FATAL marker', () => {
    const e = sbwoFatalError('boom')
    expect(e.message).toMatch(/FIX1_SBWO_FATAL/)
    expect(e.message).toMatch(/boom/)
  })
  test('canonicalKeyFor: corrected wins only when verified', () => {
    expect(canonicalKeyFor('live.mp3', 'corr.mp3', true)).toBe('corr.mp3')
    expect(canonicalKeyFor('live.mp3', 'corr.mp3', false)).toBe('live.mp3')
    expect(canonicalKeyFor('live.mp3', null, false)).toBe('live.mp3')
  })
})
