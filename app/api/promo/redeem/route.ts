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

    const upper = code.trim().toUpperCase()

    // Fetch the promo code
    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', upper)
      .single()

    if (promoError || !promo) return NextResponse.json({ error: 'Invalid code' }, { status: 404 })
    if (!promo.is_active) return NextResponse.json({ error: 'This code is no longer active' }, { status: 400 })
    if (promo.is_redeemed) return NextResponse.json({ error: 'This code has already been used' }, { status: 400 })

    // Check if this user already redeemed this code
    if (promo.redeemed_by_email === email) {
      return NextResponse.json({ error: 'You have already used this code' }, { status: 400 })
    }

    // Calculate new subscription_ends_at
    const now = new Date()
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_ends_at, subscription_type')
      .eq('id', userId)
      .single()

    // Start from existing end date if active, otherwise from today
    const base = userData?.subscription_ends_at && new Date(userData.subscription_ends_at) > now
      ? new Date(userData.subscription_ends_at)
      : now
    const newEndsAt = new Date(base.getTime() + promo.subscription_days * 24 * 60 * 60 * 1000)

    // Update user subscription
    await supabase.from('users').update({
      subscription_type: 'active',
      subscription_ends_at: newEndsAt.toISOString(),
      plan: userData?.subscription_type === 'active' ? undefined : 'standard',
    }).eq('id', userId)

    // Mark code as redeemed
    await supabase.from('promo_codes').update({
      is_redeemed: true,
      redeemed_at: now.toISOString(),
      redeemed_by_email: email,
    }).eq('id', promo.id)

    console.log(`[promo] Code ${upper} redeemed by ${email} — ${promo.subscription_days} days granted`)
    return NextResponse.json({ success: true, daysGranted: promo.subscription_days, newEndsAt: newEndsAt.toISOString() })
  } catch (err) {
    console.error('[promo] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
