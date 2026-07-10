/**
 * Entitlement predicate — ATL-POST-SUB-LOOP-001 (Marc rehearsal finding #4)
 *
 * Single source of truth for "is this user a live subscriber?" used by every
 * client surface that decides whether to show subscribe/trial CTAs.
 *
 * Semantics (matches what the Stripe webhook at app/api/webhook/route.ts writes):
 *   - subscribe / renewal / trialing        → subscription_type = 'active'
 *     (Stripe status 'trialing' is mapped to 'active' by the webhook — a
 *     trialing user IS entitled and must never see subscribe CTAs)
 *   - cancel / non-active Stripe status     → subscription_type = null
 *   - subscription_ends_at holds the current period end while active, null
 *     after cancellation. It may legitimately be null while active (e.g.
 *     invite/magic-link setup) — middleware.ts allows that, and so do we.
 *
 * isEntitled(type, endsAt) === true  ⇔  type === 'active' AND
 *   (endsAt is null/undefined OR endsAt parses to a future date).
 *
 * Expiry is checked strictly against `now` (no grace window) so this predicate
 * agrees with the server-side check in middleware.ts — client and middleware
 * must never disagree, or entitled users could bounce between /home and
 * /subscribe in a redirect loop.
 */

export function isEntitled(
  subscriptionType: string | null | undefined,
  subscriptionEndsAt?: string | null,
  now: Date = new Date()
): boolean {
  if (subscriptionType !== 'active') return false
  if (!subscriptionEndsAt) return true
  const ends = new Date(subscriptionEndsAt)
  if (Number.isNaN(ends.getTime())) return false // unparseable date → treat as expired (fail closed)
  return ends.getTime() > now.getTime()
}

/** Convenience overload for AuthContext-shaped user objects (or null while signed out). */
export function isEntitledUser(
  user: { subscription_type?: string | null; subscription_ends_at?: string | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!user) return false
  return isEntitled(user.subscription_type, user.subscription_ends_at, now)
}
