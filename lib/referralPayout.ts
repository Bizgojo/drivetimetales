// lib/referralPayout.ts — REFERRAL-SIGNUP-001 referral rewards (server-only).
//
// Reward = FREE DAYS (lib/freeDays.ts), amounts from the referral's
// referral_offers row (default "2 Weeks Free": free_days, 14/14).
//
// Timing (Option A — closes the throwaway-signup farming hole and matches the
// "after their first payment clears" copy):
//   - REFERRED friend: paid at signup by /api/referral/claim.
//   - REFERRER: paid only after the friend's FIRST successful (non-zero)
//     payment, from the Stripe webhook's invoice.paid handler.
//
// Exactly-once per side: atomically flip referrals.referred_credited /
// referrer_credited false→true BEFORE granting; revert the flag if the grant
// fails so a later attempt can retry.

import type { SupabaseClient } from '@supabase/supabase-js'
import { grantFreeDays } from '@/lib/freeDays'

export interface ReferralOffer { id: string; offer_type: string; referrer_reward: number | null; referred_reward: number | null }
export interface ReferralRow {
  id: string
  referrer_id: string
  referred_id: string
  offer_id: string | null
  referrer_credited: boolean | null
  referred_credited: boolean | null
}
export type ReferralSide = 'referrer' | 'referred'

const OFFER_COLUMNS = 'id, offer_type, referrer_reward, referred_reward'
const REFERRAL_COLUMNS = 'id, referrer_id, referred_id, offer_id, referrer_credited, referred_credited'

export async function loadReferralByReferred(admin: SupabaseClient, referredUserId: string): Promise<ReferralRow | null> {
  const { data, error } = await admin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .eq('referred_id', referredUserId)
    .maybeSingle()
  if (error) throw new Error(`load referral: ${error.message}`)
  return data
}

// Offer recorded on the referral (set by process_referral); falls back to the
// default active free_days offer and backfills referrals.offer_id.
export async function resolveReferralOffer(admin: SupabaseClient, referral: ReferralRow): Promise<ReferralOffer | null> {
  if (referral.offer_id) {
    const { data } = await admin.from('referral_offers').select(OFFER_COLUMNS).eq('id', referral.offer_id).maybeSingle()
    if (data?.offer_type === 'free_days') return data
  }
  const { data: fallback } = await admin
    .from('referral_offers')
    .select(OFFER_COLUMNS)
    .eq('is_default', true)
    .eq('is_active', true)
    .eq('offer_type', 'free_days')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fallback && fallback.id !== referral.offer_id) {
    await admin.from('referrals').update({ offer_id: fallback.id }).eq('id', referral.id)
  }
  return fallback
}

// Returns days granted (0 if already paid / zero reward). Throws if the grant
// fails (flag reverted).
export async function payReferralSide(admin: SupabaseClient, referral: ReferralRow, offer: ReferralOffer, side: ReferralSide): Promise<number> {
  const flag = side === 'referrer' ? 'referrer_credited' : 'referred_credited'
  const days = Number(side === 'referrer' ? offer.referrer_reward : offer.referred_reward) || 0
  if (days <= 0) return 0
  const userId = side === 'referrer' ? referral.referrer_id : referral.referred_id

  const { data: claimed, error: claimError } = await admin
    .from('referrals')
    .update({ [flag]: true })
    .eq('id', referral.id)
    .eq(flag, false)
    .select('id')
  if (claimError) throw new Error(`claim ${flag}: ${claimError.message}`)
  if (!claimed?.length) return 0 // already paid (or concurrently being paid)

  try {
    await grantFreeDays(admin, userId, days)
    return days
  } catch (err) {
    await admin.from('referrals').update({ [flag]: false }).eq('id', referral.id)
    throw err
  }
}

/**
 * Stripe webhook hook: the referred user just made a successful NON-ZERO
 * payment. Pays the referrer once. No-op if the user wasn't referred, the
 * referrer is already credited, or there is no usable offer.
 */
export async function payReferrerAfterFirstPayment(admin: SupabaseClient, referredUserId: string) {
  const referral = await loadReferralByReferred(admin, referredUserId)
  if (!referral || referral.referrer_credited) return null
  const offer = await resolveReferralOffer(admin, referral)
  if (!offer) {
    console.error(`[referral] NO active default free_days offer — referrer of referral ${referral.id} NOT rewarded`)
    return { referralId: referral.id, referrerId: referral.referrer_id, days: 0 }
  }
  const days = await payReferralSide(admin, referral, offer, 'referrer')
  return { referralId: referral.id, referrerId: referral.referrer_id, days }
}
