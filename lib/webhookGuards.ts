// WEBHOOK-REPLAY-001 (2026-07-11, Marc GO)
//
// Two invariants for Stripe webhook write paths, kept as pure functions so
// they are unit-testable without mocking Stripe or Supabase:
//
// 1. Replay safety: a replayed/late-arriving `checkout.session.completed`
//    event must never re-activate a user whose subscription is no longer
//    live in Stripe. Incident 2026-07-11: a checkout replay delivered 4 min
//    after a `customer.subscription.deleted` event re-activated a cancelled
//    test user (plan=founding_member/active written over plan=free/cancelled).
//    The handler already retrieves the subscription from Stripe at processing
//    time — the retrieved `status` is current truth, so gating on it makes
//    replays idempotent-by-truth rather than by event ordering.
//
// 2. Plan/flag consistency: `users.plan` and `users.is_founding_member` must
//    be written together from the same metadata read. Incident 2026-07-11:
//    plan='founding_member' with is_founding_member=false, because activation
//    writes set `plan` but never wrote the flag column.

/** Subscription statuses that justify activating (or keeping active) access. */
export function isActivatableStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing'
}

/**
 * Single source of truth for plan naming. Spread the result into every
 * activation write so plan and is_founding_member can never diverge.
 */
export function planFields(isFoundingMember: boolean): {
  plan: 'founding_member' | 'standard'
  is_founding_member: boolean
} {
  return {
    plan: isFoundingMember ? 'founding_member' : 'standard',
    is_founding_member: isFoundingMember,
  }
}
