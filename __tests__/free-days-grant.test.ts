// REFERRAL-SIGNUP-001: shared free-days grant (promo codes + referral rewards).
import { buildFreeDaysGrant } from '@/lib/freeDays'
import { isEntitled } from '@/lib/entitlement'
import { hasActiveSubscription } from '@/lib/subscription'

const now = new Date('2026-09-19T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('buildFreeDaysGrant', () => {
  it('starts from now for a user with no / expired access and upgrades free plan', () => {
    for (const ends of [null, '2026-01-01T00:00:00.000Z']) {
      const g = buildFreeDaysGrant({ subscription_ends_at: ends, plan: 'free' }, 14, now)
      expect(g).toEqual({
        subscription_type: 'active',
        subscription_ends_at: new Date(now.getTime() + 14 * DAY).toISOString(),
        plan: 'standard',
      })
    }
  })

  it('stacks onto existing future access and keeps a paid plan', () => {
    const current = new Date(now.getTime() + 10 * DAY).toISOString()
    const g = buildFreeDaysGrant({ subscription_ends_at: current, plan: 'founding_member' }, 14, now)
    expect(g.subscription_ends_at).toBe(new Date(now.getTime() + 24 * DAY).toISOString())
    expect(g.plan).toBe('founding_member')
  })

  it('handles a missing users row like promo redeem did (null → now, standard)', () => {
    const g = buildFreeDaysGrant(null, 14, now)
    expect(g.plan).toBe('standard')
    expect(g.subscription_ends_at).toBe(new Date(now.getTime() + 14 * DAY).toISOString())
  })

  it('is honored by the app access checks', () => {
    const g = buildFreeDaysGrant({ plan: 'free' }, 14, now)
    const later = new Date(now.getTime() + 13 * DAY)
    expect(isEntitled(g.subscription_type, g.subscription_ends_at, later)).toBe(true)
    expect(isEntitled(g.subscription_type, g.subscription_ends_at, new Date(now.getTime() + 15 * DAY))).toBe(false)
    expect(hasActiveSubscription(g)).toBe(true)
  })
})
