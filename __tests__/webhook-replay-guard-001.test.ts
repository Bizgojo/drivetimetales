/**
 * WEBHOOK-REPLAY-001 — checkout replay guard + plan/is_founding_member consistency.
 *
 * Incident (2026-07-11, +gvltest): customer.subscription.deleted delivered
 * 11:23 EDT set plan=free/cancelled_at; a checkout.session.completed REPLAY
 * delivered 11:27 EDT re-activated the row even though Stripe's current truth
 * for the subscription was status=canceled. Separately, activation writes set
 * plan='founding_member' while never writing is_founding_member (stayed false).
 */
import { isActivatableStatus, planFields } from '../lib/webhookGuards'

describe('isActivatableStatus (checkout replay guard)', () => {
  it('allows live subscription statuses', () => {
    expect(isActivatableStatus('active')).toBe(true)
    expect(isActivatableStatus('trialing')).toBe(true)
  })

  it('blocks every non-live status (incident: canceled)', () => {
    for (const status of [
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'unpaid',
      'paused',
    ]) {
      expect(isActivatableStatus(status)).toBe(false)
    }
  })

  it('blocks missing/garbage status', () => {
    expect(isActivatableStatus(null)).toBe(false)
    expect(isActivatableStatus(undefined)).toBe(false)
    expect(isActivatableStatus('')).toBe(false)
    expect(isActivatableStatus('ACTIVE')).toBe(false) // Stripe statuses are lowercase
  })
})

describe('planFields (plan/flag consistency)', () => {
  it('founding member: plan and flag move together', () => {
    expect(planFields(true)).toEqual({ plan: 'founding_member', is_founding_member: true })
  })

  it('standard: plan and flag move together', () => {
    expect(planFields(false)).toEqual({ plan: 'standard', is_founding_member: false })
  })
})

describe('incident regression: cancel then checkout replay', () => {
  // Minimal model of the two webhook write paths, using the same pure
  // functions the route now uses. Locks the incident sequence.
  type UserRow = {
    plan: string
    subscription_type: string | null
    stripe_subscription_id: string | null
    subscription_ends_at: string | null
    cancelled_at: string | null
    is_founding_member: boolean
  }

  function applyCancel(row: UserRow, at: string): UserRow {
    return {
      ...row,
      plan: 'free',
      subscription_type: null,
      stripe_subscription_id: null,
      subscription_ends_at: null,
      cancelled_at: at,
    }
  }

  function applyCheckout(
    row: UserRow,
    stripeStatusNow: string,
    isFoundingMember: boolean,
    subId: string,
    periodEnd: string
  ): UserRow {
    if (!isActivatableStatus(stripeStatusNow)) return row // guard: replay ignored
    return {
      ...row,
      ...planFields(isFoundingMember),
      subscription_type: 'active',
      stripe_subscription_id: subId,
      subscription_ends_at: periodEnd,
      cancelled_at: null,
    }
  }

  const base: UserRow = {
    plan: 'free',
    subscription_type: null,
    stripe_subscription_id: null,
    subscription_ends_at: null,
    cancelled_at: null,
    is_founding_member: false,
  }

  it('replay after cancel leaves the row cancelled (the 11:23/11:27 sequence)', () => {
    const cancelled = applyCancel(base, '2026-07-11T15:23:09.855Z')
    // Stripe truth at replay time: canceled → write must be skipped entirely
    const afterReplay = applyCheckout(
      cancelled,
      'canceled',
      true,
      'sub_1Trgp8G3QDdai0ZhWx4GGoiT',
      '2026-07-24T15:58:46Z'
    )
    expect(afterReplay).toEqual(cancelled)
    expect(afterReplay.plan).toBe('free')
    expect(afterReplay.cancelled_at).toBe('2026-07-11T15:23:09.855Z')
  })

  it('genuine new checkout activates consistently and clears the stale cancel stamp', () => {
    const cancelled = applyCancel(base, '2026-07-11T15:23:09.855Z')
    const reactivated = applyCheckout(cancelled, 'active', true, 'sub_new', '2026-08-11T00:00:00Z')
    expect(reactivated.plan).toBe('founding_member')
    expect(reactivated.is_founding_member).toBe(true) // flag moves with plan now
    expect(reactivated.subscription_type).toBe('active')
    expect(reactivated.cancelled_at).toBeNull()
  })
})
