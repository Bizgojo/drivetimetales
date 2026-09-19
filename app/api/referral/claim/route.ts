/**
 * /api/referral/claim — REFERRAL-SIGNUP-001 (2026-09-19)
 *
 * Records a "help a friend" referral for the signed-in user and pays out the
 * reward: FREE DAYS for BOTH sides (the app no longer uses credits).
 *
 *  1. process_referral() (DB) only RECORDS the referral: referrals row
 *     (status 'completed', offer_id), users.referred_by, referrer's
 *     referral_count. No payout in SQL.
 *  2. This route pays out, using the offer on the referrals row
 *     (referral_offers: offer_type 'free_days', referrer_reward /
 *     referred_reward days — default "2 Weeks Free" = 14/14), via the same
 *     free-days mechanism promo codes use (lib/freeDays.ts →
 *     users.subscription_type/subscription_ends_at/plan).
 *
 * Exactly-once payout: each side is claimed by atomically flipping
 * referrals.referrer_credited / referred_credited false→true BEFORE granting
 * (reverted if the grant fails). A retry after a partial failure lands in the
 * "already referred" branch and finishes whichever side is still unpaid.
 *
 * Called by lib/referral.ts claimStoredReferral() — from ReferralCapture once
 * a session exists (password, Google OAuth, magic-link signups) and from the
 * signup page before the Stripe handoff.
 *
 * Security:
 *  - The referred user is ALWAYS the bearer-token user, never a body param.
 *  - Only brand-new accounts may claim (CLAIM_WINDOW_MS).
 *  - Service role only; process_referral EXECUTE is revoked from anon/authenticated.
 *
 * Response contract: { success, error?, retry? }. retry:true → client keeps
 * the stored code and tries again later.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeReferralCode } from '@/lib/referral'
import { grantFreeDays } from '@/lib/freeDays'

const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ReferralOffer { id: string; offer_type: string; referrer_reward: number | null; referred_reward: number | null }
interface ReferralRow {
  id: string
  referrer_id: string
  referred_id: string
  offer_id: string | null
  referrer_credited: boolean | null
  referred_credited: boolean | null
}

async function loadDefaultOffer(): Promise<ReferralOffer | null> {
  const { data } = await supabaseAdmin
    .from('referral_offers')
    .select('id, offer_type, referrer_reward, referred_reward')
    .eq('is_default', true)
    .eq('is_active', true)
    .eq('offer_type', 'free_days')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// Offer recorded on the referral (set by process_referral); falls back to the
// default active free_days offer and backfills referrals.offer_id.
async function resolveOffer(referral: ReferralRow): Promise<ReferralOffer | null> {
  if (referral.offer_id) {
    const { data } = await supabaseAdmin
      .from('referral_offers')
      .select('id, offer_type, referrer_reward, referred_reward')
      .eq('id', referral.offer_id)
      .maybeSingle()
    if (data?.offer_type === 'free_days') return data
  }
  const fallback = await loadDefaultOffer()
  if (fallback && fallback.id !== referral.offer_id) {
    await supabaseAdmin.from('referrals').update({ offer_id: fallback.id }).eq('id', referral.id)
  }
  return fallback
}

type Side = 'referrer' | 'referred'

// Atomically claim one side's payout, then grant. Returns days granted (0 if
// already paid / nothing to pay). Throws if the grant fails (flag reverted).
async function payOut(referral: ReferralRow, offer: ReferralOffer, side: Side): Promise<number> {
  const flag = side === 'referrer' ? 'referrer_credited' : 'referred_credited'
  const days = Number(side === 'referrer' ? offer.referrer_reward : offer.referred_reward) || 0
  if (days <= 0) return 0
  const userId = side === 'referrer' ? referral.referrer_id : referral.referred_id

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('referrals')
    .update({ [flag]: true })
    .eq('id', referral.id)
    .eq(flag, false)
    .select('id')
  if (claimError) throw new Error(`claim ${flag}: ${claimError.message}`)
  if (!claimed?.length) return 0 // already paid (or concurrently being paid)

  try {
    await grantFreeDays(supabaseAdmin, userId, days)
    return days
  } catch (err) {
    await supabaseAdmin.from('referrals').update({ [flag]: false }).eq('id', referral.id)
    throw err
  }
}

async function completePayout(referredUserId: string) {
  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .select('id, referrer_id, referred_id, offer_id, referrer_credited, referred_credited')
    .eq('referred_id', referredUserId)
    .maybeSingle()
  if (error) throw new Error(`load referral: ${error.message}`)
  if (!referral) return null

  const offer = await resolveOffer(referral)
  if (!offer) {
    // Referral stays recorded (offer_id NULL, *_credited false) so it can be
    // reconciled once an active default free_days offer exists.
    console.error(`[ReferralClaim] NO active default free_days referral_offers row — referral ${referral.id} recorded, NOT rewarded`)
    return { referralId: referral.id, offerId: null, referredDays: 0, referrerDays: 0 }
  }
  const referredDays = await payOut(referral, offer, 'referred')
  const referrerDays = await payOut(referral, offer, 'referrer')
  return { referralId: referral.id, offerId: offer.id, referredDays, referrerDays }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ success: false, error: 'not_authenticated', retry: true }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'not_authenticated', retry: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const code = normalizeReferralCode(body?.code)
  if (!code) {
    return NextResponse.json({ success: false, error: 'invalid_code' }, { status: 400 })
  }

  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0
  if (!createdAt || Date.now() - createdAt > CLAIM_WINDOW_MS) {
    return NextResponse.json({ success: false, error: 'not_new_user' }, { status: 403 })
  }

  // process_referral needs the users row (FK + referred_by UPDATE). After
  // Google/magic-link signup that row is created by a non-blocking
  // /api/user/create call from /auth/callback — tell the client to retry.
  const { data: dbUser, error: dbUserError } = await supabaseAdmin
    .from('users')
    .select('id, referred_by')
    .eq('id', user.id)
    .maybeSingle()
  if (dbUserError) {
    console.error('[ReferralClaim] users lookup failed:', dbUserError.message)
    return NextResponse.json({ success: false, error: 'lookup_failed', retry: true }, { status: 503 })
  }
  if (!dbUser) {
    return NextResponse.json({ success: false, error: 'user_row_pending', retry: true }, { status: 409 })
  }

  // Record the referral unless it already exists (a retry after a partial
  // payout lands here with referred_by set — skip straight to payout).
  let alreadyRecorded = Boolean(dbUser.referred_by)
  if (!alreadyRecorded) {
    const { data, error } = await supabaseAdmin.rpc('process_referral', {
      p_referrer_code: code,
      p_referred_user_id: user.id,
    })
    if (error) {
      // 23505 = UNIQUE(referrals.referred_id): a concurrent claim won the race.
      if (error.code !== '23505') {
        console.error('[ReferralClaim] process_referral failed:', error.code, error.message)
        return NextResponse.json({ success: false, error: 'rpc_failed', retry: true }, { status: 500 })
      }
      alreadyRecorded = true
    } else {
      const result = (data || {}) as { success?: boolean; error?: string }
      if (!result.success) {
        if (!/already referred/i.test(result.error || '')) {
          // Invalid code / self-referral — permanent, don't retry.
          console.warn(`[ReferralClaim] rejected for ${user.id.slice(0, 8)} code=${code}: ${result.error}`)
          return NextResponse.json({ success: false, error: result.error || 'rejected' }, { status: 422 })
        }
        alreadyRecorded = true
      }
    }
  }

  try {
    const payout = await completePayout(user.id)
    if (!payout) {
      return NextResponse.json({ success: false, error: 'already_referred' }, { status: 409 })
    }
    console.log(
      `[ReferralClaim] ok user=${user.id.slice(0, 8)} code=${code} referral=${payout.referralId} ` +
      `offer=${payout.offerId} +${payout.referredDays}d referred +${payout.referrerDays}d referrer` +
      (alreadyRecorded ? ' (resumed)' : '')
    )
    return NextResponse.json({ success: true, ...payout })
  } catch (err) {
    console.error('[ReferralClaim] payout failed (will retry):', err)
    return NextResponse.json({ success: false, error: 'payout_failed', retry: true }, { status: 500 })
  }
}
