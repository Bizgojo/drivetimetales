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

// CARD-ON-FILE-001 (2026-10-05, Marc GO — LENIENT dunning):
// When card-on-file is the standard, a failed renewal moves the subscription to
// 'past_due' while Stripe's Smart Retries run. Marc's decision: KEEP ACCESS
// during past_due (warmer experience; a transient card decline shouldn't lock a
// paying customer out mid-retry). Only TRULY TERMINAL states ('canceled',
// 'unpaid', 'incomplete_expired') drop a user to free — those fire via
// customer.subscription.updated after retries are exhausted (or via
// customer.subscription.deleted).
//
// NOTE: isActivatableStatus is intentionally LEFT UNCHANGED — it still gates the
// checkout.session.completed replay-safety check (WEBHOOK-REPLAY-001), where
// 'past_due' must NOT re-activate a stale checkout replay. Access preservation on
// renewal failure is a separate concern, handled by this helper.
export function isAccessPreservingStatus(status: string | null | undefined): boolean {
  return isActivatableStatus(status) || status === 'past_due'
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
