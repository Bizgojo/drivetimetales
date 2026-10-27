import { createHash } from 'crypto'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { grantFreeDays } from '@/lib/freeDays'

/** Keep earned days in Stripe too, so renewal events cannot erase them. */
export async function grantReferralSubscriptionDays(admin: SupabaseClient, stripe: Stripe, userId: string, days: number, rewardKey: string) {
  const { data: user, error } = await admin.from('users').select('stripe_subscription_id').eq('id', userId).single()
  if (error) throw error
  if (!user.stripe_subscription_id) return grantFreeDays(admin, userId, days)
  const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id)
  if (!['active', 'trialing'].includes(subscription.status)) return grantFreeDays(admin, userId, days)
  const key = `reward_${createHash('sha256').update(rewardKey).digest('hex').slice(0, 24)}`
  // Marker and billing-date change are one Stripe update. It is safe to retry
  // after Stripe succeeds but the local account update fails.
  let rewarded = subscription
  if (!subscription.metadata[key]) {
    const base = Math.max(Math.floor(Date.now() / 1000), subscription.current_period_end || 0, subscription.trial_end || 0)
    const trialEnd = base + days * 86400
    rewarded = await stripe.subscriptions.update(subscription.id, {
      trial_end: trialEnd, proration_behavior: 'none', metadata: { [key]: String(trialEnd) },
      ...(subscription.cancel_at_period_end ? { cancel_at: trialEnd, cancel_at_period_end: false } : {}),
    }, { idempotencyKey: `et-referral-${rewardKey}` })
  }
  const end = Number(rewarded.metadata[key])
  if (!end) throw new Error('Referral billing extension missing')
  const { error: saveError } = await admin.from('users').update({ subscription_type: 'active', subscription_ends_at: new Date(end * 1000).toISOString() }).eq('id', userId)
  if (saveError) throw saveError
}
