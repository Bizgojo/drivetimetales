/**
 * /api/referral/claim — REFERRAL-SIGNUP-001 (2026-09-19)
 *
 * Records a "help a friend" referral for the signed-in user by calling the
 * process_referral() DB function (creates the referrals row, sets
 * users.referred_by, credits both sides, handles tiers).
 *
 * Called by lib/referral.ts claimStoredReferral() — from ReferralCapture once
 * a session exists (covers password, Google OAuth and magic-link signups) and
 * from the signup page before the Stripe handoff.
 *
 * Security:
 *  - The referred user is ALWAYS the bearer-token user, never a body param.
 *  - Only brand-new accounts may claim (CLAIM_WINDOW_MS) — an existing user
 *    who later opens a friend's link must not mint credits for either side.
 *  - Runs with the service role; process_referral is not exposed to anon.
 *
 * Response contract: { success, error?, retry? }. retry:true means the
 * client should keep the stored code and try again later (e.g. the users row
 * from /api/user/create hasn't landed yet after an OAuth callback).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeReferralCode } from '@/lib/referral'

const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  // process_referral needs the users row (FK + referred_by/credits UPDATEs).
  // After Google/magic-link signup that row is created by a non-blocking
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
  if (dbUser.referred_by) {
    return NextResponse.json({ success: false, error: 'already_referred' }, { status: 409 })
  }

  const { data, error } = await supabaseAdmin.rpc('process_referral', {
    p_referrer_code: code,
    p_referred_user_id: user.id,
  })

  if (error) {
    // 23505 = UNIQUE(referrals.referred_id): a concurrent claim won the race.
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: 'already_referred' }, { status: 409 })
    }
    console.error('[ReferralClaim] process_referral failed:', error.code, error.message)
    return NextResponse.json({ success: false, error: 'rpc_failed', retry: true }, { status: 500 })
  }

  const result = (data || {}) as { success?: boolean; error?: string; referral_id?: string }
  if (!result.success) {
    // Invalid code / self-referral / already referred — permanent, don't retry.
    console.warn(`[ReferralClaim] rejected for ${user.id.slice(0, 8)} code=${code}: ${result.error}`)
    return NextResponse.json({ success: false, error: result.error || 'rejected' }, { status: 422 })
  }

  console.log(`[ReferralClaim] ok user=${user.id.slice(0, 8)} code=${code} referral=${result.referral_id}`)
  return NextResponse.json({ success: true, referralId: result.referral_id })
}
