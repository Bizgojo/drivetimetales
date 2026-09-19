// lib/freeDays.ts — shared "grant N free days of access" mechanism.
//
// Extracted verbatim from app/api/promo/redeem/route.ts (promo codes) so
// referral rewards (REFERRAL-SIGNUP-001) grant time EXACTLY the same way.
// Access is represented by users.subscription_type + users.subscription_ends_at
// (+ a non-free plan for middleware.ts). All three access checks honor it:
//   - middleware.ts hasActiveSubscription: plan !== 'free' OR type 'active', ends_at future
//   - lib/entitlement.ts isEntitled:       type === 'active', ends_at null or future
//   - lib/subscription.ts:                 type === 'active', ends_at future
//
// Days stack: if the user already has future access, the grant extends it
// from the current end; otherwise it starts now.
//
// NOTE: the Stripe webhook (app/api/webhook/route.ts) rewrites
// subscription_ends_at to Stripe's current_period_end on checkout / renewal /
// subscription updates, so for a Stripe-billed user a DB-only extension lasts
// only until the next Stripe event — same limitation promo codes have today.

import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 24 * 60 * 60 * 1000

export interface FreeDaysUserState {
  subscription_ends_at?: string | null
  plan?: string | null
}

export interface FreeDaysUpdate {
  subscription_type: 'active'
  subscription_ends_at: string
  plan: string
}

export function buildFreeDaysGrant(user: FreeDaysUserState | null | undefined, days: number, now: Date = new Date()): FreeDaysUpdate {
  const base = user?.subscription_ends_at && new Date(user.subscription_ends_at) > now
    ? new Date(user.subscription_ends_at)
    : now
  const newEndsAt = new Date(base.getTime() + days * DAY_MS)
  return {
    subscription_type: 'active',
    subscription_ends_at: newEndsAt.toISOString(),
    plan: user?.plan && user.plan !== 'free' ? user.plan : 'standard',
  }
}

/** Server-only (service-role client): read → extend → write. Throws on DB error. */
export async function grantFreeDays(admin: SupabaseClient, userId: string, days: number): Promise<FreeDaysUpdate> {
  const { data: user, error: readError } = await admin
    .from('users')
    .select('subscription_ends_at, plan')
    .eq('id', userId)
    .single()
  if (readError) throw new Error(`grantFreeDays read ${userId}: ${readError.message}`)
  const update = buildFreeDaysGrant(user, days)
  const { error: writeError } = await admin.from('users').update(update).eq('id', userId)
  if (writeError) throw new Error(`grantFreeDays write ${userId}: ${writeError.message}`)
  return update
}
