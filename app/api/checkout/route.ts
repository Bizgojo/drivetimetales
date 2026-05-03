import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FOUNDING_LIMIT = parseInt(process.env.ET_FOUNDING_MEMBER_LIMIT || '500')
const FOUNDING_PRICE_ID = process.env.STRIPE_PRICE_FOUNDING_MEMBER!
const STANDARD_PRICE_ID = process.env.STRIPE_PRICE_STANDARD!
const ANNUAL_PRICE_ID = process.env.STRIPE_PRICE_ANNUAL!
const DEFAULT_SUCCESS_PATH = '/home?welcome=true'

function safeReturnTo(returnTo: unknown) {
  if (typeof returnTo !== 'string') return DEFAULT_SUCCESS_PATH
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('://')) {
    return DEFAULT_SUCCESS_PATH
  }
  return returnTo
}

async function resolvePrice(): Promise<{ priceId: string; isFoundingMember: boolean }> {
  try {
    let count = 0
    let hasMore = true
    let startingAfter: string | undefined
    while (hasMore) {
      const subs = await stripe.subscriptions.list({
        price: FOUNDING_PRICE_ID,
        status: 'active',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {})
      })
      count += subs.data.length
      hasMore = subs.has_more
      if (subs.data.length > 0) startingAfter = subs.data[subs.data.length - 1].id
      if (count >= FOUNDING_LIMIT) break
    }
    const isFoundingMember = count < FOUNDING_LIMIT
    return { priceId: isFoundingMember ? FOUNDING_PRICE_ID : STANDARD_PRICE_ID, isFoundingMember }
  } catch {
    // Fallback to standard if Stripe query fails
    return { priceId: STANDARD_PRICE_ID, isFoundingMember: false }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, email, priceId: clientPriceId, referralCode, trialDays: trialDaysParam, billingCycle, returnTo } = await req.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Auto-select founding member or standard price (ignore client-supplied priceId)
    const { priceId: resolvedPrice, isFoundingMember } = await resolvePrice()
    // Override with annual price if selected (annual not eligible for founding member rate)
    if (billingCycle === 'annual' && !ANNUAL_PRICE_ID) {
      console.error('[checkout] STRIPE_PRICE_ANNUAL env var is not set')
      return NextResponse.json({ error: 'Annual plan not available' }, { status: 500 })
    }
    const priceId = billingCycle === 'annual' ? ANNUAL_PRICE_ID : resolvedPrice
    console.log(`[checkout] Assigned price: ${billingCycle === 'annual' ? 'annual $59.99' : isFoundingMember ? 'founding member $7.99 locked' : 'standard $7.99'}`)

    // Check if user already has a Stripe customer
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    let customerId = userData?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: { userId }
      })
      customerId = customer.id

      // Save customer ID to user
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // Use trial days from client (A/B assigned), referrals always get at least 14
    let trialDays = trialDaysParam || 14
    if (referralCode) {
      const { data: referrer } = await supabase.from('users').select('id').eq('referral_code', referralCode).single()
      if (referrer) trialDays = Math.max(trialDays, 14)
    }

    // Create checkout session
    const host = req.headers.get('host') || 'drivetimetales.vercel.app'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`
    const safeSuccessPath = safeReturnTo(returnTo)
    const cancelPath = safeSuccessPath === DEFAULT_SUCCESS_PATH
      ? '/signup?canceled=true'
      : `/signup?canceled=true&returnTo=${encodeURIComponent(safeSuccessPath)}`
    console.log('[checkout] baseUrl:', baseUrl)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: { userId, isFoundingMember: isFoundingMember ? 'true' : 'false' },
        trial_period_days: trialDays > 0 ? trialDays : undefined
      },
      success_url: `${baseUrl}${safeSuccessPath}`,
      cancel_url: `${baseUrl}${cancelPath}`,
      metadata: { userId, referralCode: referralCode || '' }
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
