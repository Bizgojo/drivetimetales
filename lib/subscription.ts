/**
 * Subscription utility — Endless Tales
 * Single source of truth for "does this user have access?"
 *
 * Active access = subscription_type is 'active' AND subscription_ends_at is in the future.
 * This covers both paying subscribers and users in a 14-day trial
 * (Stripe sets subscription_type='active' for trialing subs too).
 *
 * plan values:  'free' | 'standard' | 'founding_member'
 * subscription_type values: 'active' | null
 */

export interface SubscriptionUser {
  plan?: string | null
  subscription_type?: string | null
  subscription_ends_at?: string | null
}

/**
 * Returns true if the user currently has active access to paid content.
 * Safe to call with a partial user object — returns false if data is missing.
 */
export function hasActiveSubscription(user: SubscriptionUser | null | undefined): boolean {
  if (!user) return false
  if (user.subscription_type !== 'active') return false
  if (!user.subscription_ends_at) return false
  return new Date(user.subscription_ends_at) > new Date()
}

/**
 * Returns true if the user is on the free plan (never subscribed or cancelled).
 */
export function isFreeUser(user: SubscriptionUser | null | undefined): boolean {
  if (!user) return true
  return user.plan === 'free' || !user.plan
}

/**
 * Returns a human-readable status string for display.
 */
export function subscriptionStatus(user: SubscriptionUser | null | undefined): string {
  if (!user) return 'Not signed in'
  if (hasActiveSubscription(user)) {
    if (user.plan === 'founding_member') return 'Founding Member'
    return 'Active'
  }
  if (user.plan === 'free') return 'Free'
  return 'Expired'
}
