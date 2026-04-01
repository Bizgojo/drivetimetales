import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { code, userId, email } = await req.json()
    if (!code || !userId) return NextResponse.json({ error: 'Missing code or userId' }, { status: 400 })
    const upper = code.trim().toUpperCase().replace(/\s+/g, '').replace(/\+/g, '')

    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', upper)
      .single()

    if (promoError || !promo) return NextResponse.json({ error: 'Invalid code' }, { status: 404 })
    if (!promo.is_active) return NextResponse.json({ error: 'This code is no longer active' }, { status: 400 })

    // Check max_uses (null = unlimited)
    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
      return NextResponse.json({ error: 'This code has reached its usage limit' }, { status: 400 })
    }

    // Check if this user already redeemed this specific code
    const { data: existing } = await supabase
      .from('promo_redemptions')
      .select('id')
      .eq('code', upper)
      .eq('email', email)
      .single()
    if (existing) return NextResponse.json({ error: 'You have already used this code' }, { status: 400 })

    // Calculate new subscription_ends_at
    const now = new Date()
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_ends_at, subscription_type, plan')
      .eq('id', userId)
      .single()

    const base = userData?.subscription_ends_at && new Date(userData.subscription_ends_at) > now
      ? new Date(userData.subscription_ends_at)
      : now
    const newEndsAt = new Date(base.getTime() + promo.subscription_days * 24 * 60 * 60 * 1000)

    // Update user subscription
    await supabase.from('users').update({
      subscription_type: 'active',
      subscription_ends_at: newEndsAt.toISOString(),
      plan: userData?.plan && userData.plan !== 'free' ? userData.plan : 'standard',
    }).eq('id', userId)

    // Log redemption
    await supabase.from('promo_redemptions').insert({
      promo_code_id: promo.id,
      code: upper,
      user_id: userId,
      email,
      redeemed_at: now.toISOString(),
      days_granted: promo.subscription_days,
      campaign: promo.campaign,
      label: promo.label,
    })

    // Increment uses_count, mark is_redeemed if single-use
    const newCount = (promo.uses_count || 0) + 1
    const isNowRedeemed = promo.max_uses === 1
    await supabase.from('promo_codes').update({
      uses_count: newCount,
      is_redeemed: isNowRedeemed,
      redeemed_at: isNowRedeemed ? now.toISOString() : promo.redeemed_at,
      redeemed_by_email: isNowRedeemed ? email : promo.redeemed_by_email,
    }).eq('id', promo.id)

    console.log(`[promo] ${upper} redeemed by ${email} — ${promo.subscription_days} days, campaign: ${promo.campaign || 'none'}`)
    return NextResponse.json({ success: true, daysGranted: promo.subscription_days, newEndsAt: newEndsAt.toISOString() })
  } catch (err) {
    console.error('[promo] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
