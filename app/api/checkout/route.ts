import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ATL-FM-RETIRE-001 (2026-07-10, Marc decision from GVL rehearsal finding #2):
// The Founding Member program is RETIRED. Every monthly signup gets STANDARD
// ($7.99/mo); annual gets ANNUAL. The FM Stripe prices are archived — do not
// reintroduce a selection path without an explicit pricing decision from Marc.
const STANDARD_PRICE_ID = process.env.STRIPE_PRICE_STANDARD!
const ANNUAL_PRICE_ID = process.env.STRIPE_PRICE_ANNUAL!
const DEFAULT_SUCCESS_PATH = '/home?welcome=true'

type AttributionPayload = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_captured_at?: string | null
  promo_code?: string | null
}

function metadataValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizePromoCode(code: unknown) {
  if (typeof code !== 'string') return ''
  return code.trim().toUpperCase().replace(/\s+/g, '').replace(/\+/g, '')
}

function attributionMetadata(attribution: AttributionPayload | undefined, heardAbout: unknown) {
  const promoCode = normalizePromoCode(attribution?.promo_code)
  return {
    utm_source: metadataValue(attribution?.utm_source),
    utm_medium: metadataValue(attribution?.utm_medium),
    utm_campaign: metadataValue(attribution?.utm_campaign),
    utm_captured_at: metadataValue(attribution?.utm_captured_at),
    promo_code: promoCode,
    heard_about_us: metadataValue(heardAbout),
  }
}

function compactMetadata(metadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== '')
  )
}

function safeReturnTo(returnTo: unknown) {
  if (typeof returnTo !== 'string') return DEFAULT_SUCCESS_PATH
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('://')) {
    return DEFAULT_SUCCESS_PATH
  }
  return returnTo
}

export async function POST(req: NextRequest) {
  try {
    const { userId, email, priceId: clientPriceId, referralCode, trialDays: trialDaysParam, billingCycle, returnTo, attribution, heardAbout } = await req.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const campaignMetadata = attributionMetadata(attribution, heardAbout)

    // Server-selected price (client-supplied priceId is ignored).
    // FM program retired — standard monthly or standard annual only.
    let priceId: string
    let priceLabel: string
    if (billingCycle === 'annual') {
      if (!ANNUAL_PRICE_ID) {
        console.error('[checkout] STRIPE_PRICE_ANNUAL env var is not set')
        return NextResponse.json({ error: 'Annual plan not available' }, { status: 500 })
      }
      priceId = ANNUAL_PRICE_ID
      priceLabel = 'annual $59.99'
    } else {
      priceId = STANDARD_PRICE_ID
      priceLabel = 'standard $7.99/mo'
    }
    console.log(`[checkout] Assigned price: ${priceLabel}`)

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
        metadata: { userId, ...compactMetadata(campaignMetadata) }
      })
      customerId = customer.id

      // Save customer ID to user
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    } else {
      await stripe.customers.update(customerId, {
        metadata: { userId, ...compactMetadata(campaignMetadata) }
      })
    }

    // Use trial days from client (A/B assigned), referrals always get at least 14
    let trialDays = trialDaysParam || 7
    if (referralCode) {
      const { data: referrer } = await supabase.from('users').select('id').eq('referral_code', referralCode).single()
      if (referrer) trialDays = Math.max(trialDays, 14)
    }
    if (campaignMetadata.promo_code) {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('code, is_active, max_uses, uses_count, subscription_days')
        .eq('code', campaignMetadata.promo_code)
        .single()
      if (promo?.is_active && (promo.max_uses === null || promo.uses_count < promo.max_uses)) {
        trialDays = Math.max(trialDays, Number(promo.subscription_days || 14))
      }
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
        metadata: { 
          userId, 
          isFoundingMember: 'false',
          billingCycle: billingCycle || 'monthly',
          fmAnnualApplied: 'false',
          ...compactMetadata(campaignMetadata),
        },
        trial_period_days: trialDays > 0 ? trialDays : undefined
      },
      success_url: `${baseUrl}${safeSuccessPath}`,
      cancel_url: `${baseUrl}${cancelPath}`,
      metadata: { userId, referralCode: referralCode || '', ...compactMetadata(campaignMetadata) }
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
