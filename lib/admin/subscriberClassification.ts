export type SubscriberStatus = 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due' | 'unknown'

export function normalizePlan(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
}

export function isFoundingPlan(plan: string) {
  return ['founding_member', 'founding', 'founder'].includes(normalizePlan(plan))
}

export function isLaunchStandardPlan(plan: string, isFoundingMember = false) {
  const normalized = normalizePlan(plan)
  return normalized === 'standard' || isFoundingMember || isFoundingPlan(normalized)
}

export function normalizeSubscriptionStatus(value: unknown): SubscriberStatus {
  const status = normalizePlan(value)
  if (['active'].includes(status)) return 'active'
  if (['trialing', 'trial'].includes(status)) return 'trialing'
  if (['canceled', 'cancelled', 'cancelling'].includes(status)) return 'canceled'
  if (['expired', 'incomplete_expired', 'unpaid', 'inactive'].includes(status)) return 'expired'
  if (['past_due', 'pastdue'].includes(status)) return 'past_due'
  return 'unknown'
}

export function recommendedCleanupAction(plan: string, hasStripe: boolean, hasListeningHistory: boolean, isInternal = false) {
  const normalized = normalizePlan(plan)
  if (isInternal || ['internal', 'admin', 'staff'].includes(normalized)) return 'mark internal/test and hide from subscriber dashboard'
  if (['free', 'test_driver', 'trial', 'test'].includes(normalized)) return 'hide from subscriber dashboard; mark internal/test if not a real customer'
  if (!normalized || normalized === 'unknown') return hasStripe || hasListeningHistory
    ? 'hide from subscriber dashboard; review before archive'
    : 'safe to archive later after auth check'
  if (hasStripe) return 'hide from subscriber dashboard; preserve Stripe-linked record'
  if (hasListeningHistory) return 'hide from subscriber dashboard; preserve listening history'
  return 'safe to delete later after Marc review'
}
