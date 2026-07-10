/**
 * ATL-POST-SUB-LOOP-001 — entitlement predicate tests
 *
 * The Stripe webhook (app/api/webhook/route.ts) writes:
 *   - checkout completed / invoice paid / status active|trialing → subscription_type='active'
 *   - subscription deleted / status past_due|canceled|…          → subscription_type=null
 *   - subscription_ends_at = current period end while active, null after cancel
 *
 * isEntitled must be true exactly for live subscribers (including trialing),
 * and must agree with middleware.ts semantics (null ends_at while active → allowed,
 * strict expiry, no grace) so client and server never disagree.
 */
import { isEntitled, isEntitledUser } from '@/lib/entitlement'

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('isEntitled', () => {
  // ── Entitled ──────────────────────────────────────────────────────────────
  test('active subscription with future period end → entitled', () => {
    expect(isEntitled('active', FUTURE)).toBe(true)
  })

  test('trialing users are entitled: webhook writes subscription_type="active" for trialing', () => {
    // customer.subscription.updated maps status 'trialing' → 'active'; there is
    // no distinct 'trialing' DB value. This test documents that contract.
    expect(isEntitled('active', FUTURE)).toBe(true)
  })

  test('active with null/undefined ends_at → entitled (invite/magic-link setup, matches middleware)', () => {
    expect(isEntitled('active', null)).toBe(true)
    expect(isEntitled('active', undefined)).toBe(true)
    expect(isEntitled('active')).toBe(true)
  })

  // ── Not entitled ─────────────────────────────────────────────────────────
  test('cancelled (webhook writes null) → not entitled', () => {
    expect(isEntitled(null, null)).toBe(false)
    expect(isEntitled(null, FUTURE)).toBe(false) // ends_at alone never grants access
  })

  test('missing/undefined subscription_type → not entitled', () => {
    expect(isEntitled(undefined, FUTURE)).toBe(false)
  })

  test('active but period end in the past → not entitled (strict expiry)', () => {
    expect(isEntitled('active', PAST)).toBe(false)
  })

  test('expiry boundary is strict: ends_at exactly now → not entitled', () => {
    const now = new Date('2026-07-10T12:00:00.000Z')
    expect(isEntitled('active', now.toISOString(), now)).toBe(false)
    expect(isEntitled('active', new Date(now.getTime() + 1000).toISOString(), now)).toBe(true)
  })

  test('unrecognized subscription_type values → not entitled', () => {
    // Only 'active' is ever written by the webhook; anything else fails closed.
    for (const v of ['trialing', 'road_warrior', 'free', 'ACTIVE', '', ' active']) {
      expect(isEntitled(v, FUTURE)).toBe(false)
    }
  })

  test('unparseable ends_at → not entitled (fail closed)', () => {
    expect(isEntitled('active', 'not-a-date')).toBe(false)
  })

  test('respects injected now for deterministic checks', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(isEntitled('active', '2026-06-01T00:00:00.000Z', now)).toBe(true)
    expect(isEntitled('active', '2025-06-01T00:00:00.000Z', now)).toBe(false)
  })
})

describe('isEntitledUser', () => {
  test('null/undefined user (signed out or auth still loading) → not entitled', () => {
    expect(isEntitledUser(null)).toBe(false)
    expect(isEntitledUser(undefined)).toBe(false)
  })

  test('AuthContext-shaped user objects', () => {
    expect(isEntitledUser({ subscription_type: 'active', subscription_ends_at: FUTURE })).toBe(true)
    expect(isEntitledUser({ subscription_type: 'active', subscription_ends_at: null })).toBe(true)
    expect(isEntitledUser({ subscription_type: null, subscription_ends_at: null })).toBe(false)
    expect(isEntitledUser({})).toBe(false) // partial DbUser before profile row loads
  })
})
