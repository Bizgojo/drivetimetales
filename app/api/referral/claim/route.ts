/** Record an invitation at signup. Both rewards wait for the first non-zero paid invoice. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeReferralCode } from '@/lib/referral'
import { loadReferralByReferred } from '@/lib/referralPayout'

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

  const referral = await loadReferralByReferred(supabaseAdmin, user.id)
  if (!referral) return NextResponse.json({ success: false, error: 'record_pending', retry: true }, { status: 409 })
  return NextResponse.json({ success: true, referralId: referral.id, rewardPending: true })
}
