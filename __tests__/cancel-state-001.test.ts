// CANCEL-STATE-001: a pending cancellation must be distinguishable from an
// active trial (users.cancelled_at), without changing access.
import fs from 'fs'
import path from 'path'
import { resolveCancelledAt } from '@/lib/cancelState'
import { computeOfflineLicense } from '@/lib/offline/license'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
const now = new Date('2026-09-19T21:00:00.000Z')
// The real pending cancellation seen in Stripe (sub_1UHUvM…): cancelled during
// the trial, access until the trial ends.
const PENDING = { cancel_at_period_end: true, canceled_at: Math.floor(Date.parse('2026-09-19T20:34:44.000Z') / 1000) }

describe('resolveCancelledAt', () => {
  it('pending cancellation → Stripe\'s own canceled_at timestamp', () => {
    expect(resolveCancelledAt(PENDING, now)).toBe('2026-09-19T20:34:44.000Z')
  })
  it('pending cancellation with no timestamp → now', () => {
    expect(resolveCancelledAt({ cancel_at_period_end: true }, now)).toBe(now.toISOString())
    expect(resolveCancelledAt({ cancel_at_period_end: true, canceled_at: null }, now)).toBe(now.toISOString())
  })
  it('active subscription → null', () => {
    expect(resolveCancelledAt({ cancel_at_period_end: false, canceled_at: null }, now)).toBeNull()
  })
  it('resubscribe clears a stored timestamp (flag false, old canceled_at present)', () => {
    expect(resolveCancelledAt({ cancel_at_period_end: false, canceled_at: PENDING.canceled_at }, now)).toBeNull()
  })
  it('missing/!malformed subscription → null (never guesses a cancellation)', () => {
    expect(resolveCancelledAt(null, now)).toBeNull()
    expect(resolveCancelledAt(undefined, now)).toBeNull()
    expect(resolveCancelledAt({}, now)).toBeNull()
  })
})

describe('call sites', () => {
  it('cancel route records cancelled_at and keeps access (no subscription_type change)', () => {
    const src = read('app/api/user/cancel-subscription/route.ts')
    expect(src).toContain("import { resolveCancelledAt } from '@/lib/cancelState'")
    expect(src).toContain('const cancelledAt = resolveCancelledAt(subscription)')
    expect(src).toContain('cancelled_at: cancelledAt,')
    expect(src).toContain('subscription_ends_at:')
    expect(src).not.toMatch(/subscription_type:/) // access untouched until period end
  })
  it('webhook subscription.updated writes cancelled_at from the same helper', () => {
    const src = read('app/api/webhook/route.ts')
    expect(src).toContain("import { resolveCancelledAt } from '@/lib/cancelState'")
    expect(src).toContain('const cancelledAtSu = resolveCancelledAt(subscription)')
    expect(src).toContain('cancelled_at: cancelledAtSu,')
    // Still active until the period ends.
    expect(src).toContain("subscription_type: isActive ? 'active' : null,")
  })
  it('a fresh activation still clears cancelled_at', () => {
    expect(read('app/api/webhook/route.ts')).toContain('cancelled_at: null,')
  })
})

describe('why it matters', () => {
  const endsAt = '2026-10-03T20:31:51.000Z'
  it('offline licence: a pending cancellation gets no grace past the end date', () => {
    const cancelledAt = resolveCancelledAt(PENDING, now)
    const cancelled = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: endsAt, cancelledAt, now })
    const active = computeOfflineLicense({ userId: 'u', entitled: true, subscriptionEndsAt: endsAt, cancelledAt: null, now })
    expect(cancelled.validUntil).toBe(endsAt)                       // 0 grace days
    expect(cancelled.cancelled).toBe(true)
    expect(new Date(active.validUntil!).getTime()).toBeGreaterThan(new Date(endsAt).getTime()) // 3-day grace
  })
})
