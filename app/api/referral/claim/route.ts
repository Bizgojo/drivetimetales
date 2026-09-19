/**
 * /api/referral/claim — REFERRAL-SIGNUP-001 (2026-09-19)
 *
 * Records a "help a friend" referral for the signed-in user and pays the
 * REFERRED friend's reward: FREE DAYS (the app no longer uses credits).
 *
 *  1. process_referral() (DB) only RECORDS the referral: referrals row
 *     (status 'completed', offer_id), users.referred_by, referrer's
 *     referral_count. No payout in SQL.
 *  2. This route grants the friend offer.referred_reward days (default
 *     "2 Weeks Free" = 14) via lib/referralPayout → lib/freeDays, the same
 *     mechanism promo codes use (users.subscription_type/_ends_at/plan).
 *  3. The REFERRER is NOT paid here (referrer_credited stays false). They are
 *     paid by the Stripe webhook after the friend's first successful non-zero
 *     payment (Option A) — throwaway signups earn the referrer nothing.
 *
 * Exactly-once: referred_credited is flipped false→true before granting
 * (reverted on failure); a retry lands in the "already referred" branch and
 * finishes the payout if it didn't complete.
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
import { loadReferralByReferred, payReferralSide, resolveReferralOffer } from '@/lib/referralPayout'

const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function payReferredSide(referredUserId: string) {
  const referral = await loadReferralByReferred(supabaseAdmin, referredUserId)
  if (!referral) return null
  const offer = await resolveReferralOffer(supabaseAdmin, referral)
  if (!offer) {
    // Referral stays recorded (offer_id NULL, *_credited false) so it can be
    // reconciled once an active default free_days offer exists.
    console.error(`[ReferralClaim] NO active default free_days referral_offers row — referral ${referral.id} recorded, NOT rewarded`)
    return { referralId: referral.id, offerId: null, referredDays: 0 }
  }
  const referredDays = await payReferralSide(supabaseAdmin, referral, offer, 'referred')
  return { referralId: referral.id, offerId: offer.id, referredDays }
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
    const payout = await payReferredSide(user.id)
    if (!payout) {
      return NextResponse.json({ success: false, error: 'already_referred' }, { status: 409 })
    }
    console.log(
      `[ReferralClaim] ok user=${user.id.slice(0, 8)} code=${code} referral=${payout.referralId} ` +
      `offer=${payout.offerId} +${payout.referredDays}d referred (referrer paid after first payment)` +
      (alreadyRecorded ? ' (resumed)' : '')
    )
    return NextResponse.json({ success: true, ...payout })
  } catch (err) {
    console.error('[ReferralClaim] payout failed (will retry):', err)
    return NextResponse.json({ success: false, error: 'payout_failed', retry: true }, { status: 500 })
  }
}
