// lib/cancelState.ts — CANCEL-STATE-001 (2026-09-19)
//
// A subscription cancelled in-app keeps access until the period ends, so
// Stripe reports status 'trialing'/'active' with cancel_at_period_end=true
// until that moment. The app used to record nothing at that point
// (users.cancelled_at was only written by customer.subscription.deleted, at
// the very end), so a PENDING CANCELLATION looked exactly like a healthy
// active trial.
//
// Two features read users.cancelled_at and need the difference:
//   - the offline-download licence (lib/offline/license.ts): a cancelled
//     subscriber gets NO grace days past subscription_ends_at
//   - the referral payout guard (referrer rewards / anti-farming)
//
// Rule: cancelled_at is set while a cancellation is pending or done, and
// cleared when the user resubscribes (cancel_at_period_end back to false).
// subscription_type stays 'active' until the period actually ends — access
// is unchanged by this module.

export interface CancelStateSubscription {
  cancel_at_period_end?: boolean | null
  /** Stripe's own timestamp for when cancellation was requested (seconds). */
  canceled_at?: number | null
}

/**
 * The value to write to users.cancelled_at for this subscription.
 * Returns null when no cancellation is pending (including a resubscribe,
 * which must clear a previously stored timestamp).
 */
export function resolveCancelledAt(
  subscription: CancelStateSubscription | null | undefined,
  now: Date = new Date()
): string | null {
  if (!subscription?.cancel_at_period_end) return null
  const requested = subscription.canceled_at
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return new Date(requested * 1000).toISOString()
  }
  return now.toISOString()
}
