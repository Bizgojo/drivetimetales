/**
 * GET /api/subscription/price
 * Returns current pricing info — founding member vs standard.
 * Used by landing page to show live counter and correct price.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const FOUNDING_LIMIT = parseInt(process.env.ET_FOUNDING_MEMBER_LIMIT || '500')
const FOUNDING_PRICE_ID = process.env.STRIPE_PRICE_FOUNDING_MEMBER!
const STANDARD_PRICE_ID = process.env.STRIPE_PRICE_STANDARD!
const FOUNDING_AMOUNT = parseInt(process.env.ET_FOUNDING_MEMBER_PRICE || '299')
const STANDARD_AMOUNT = 799

// Cache for 60 seconds to avoid hammering Stripe
let cache: { count: number; ts: number } | null = null

async function getFoundingMemberCount(): Promise<number> {
  if (cache && Date.now() - cache.ts < 60_000) return cache.count

  let count = 0
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const subs: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
      price: FOUNDING_PRICE_ID,
      status: 'active',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    })
    count += subs.data.length
    hasMore = subs.has_more
    if (subs.data.length > 0) startingAfter = subs.data[subs.data.length - 1].id
  }

  cache = { count, ts: Date.now() }
  return count
}

export async function GET() {
  try {
    // ATL-FM-RETIRE-001 (2026-07-10): FM program retired — report unavailable
    // regardless of subscriber count so no caller can advertise $2.99.
    // Response shape preserved for any legacy consumer.
    const foundingCount = await getFoundingMemberCount()
    const spotsRemaining = 0
    const isFoundingAvailable = false

    const response = NextResponse.json({
      isFoundingAvailable,
      foundingCount,
      spotsRemaining,
      foundingLimit: FOUNDING_LIMIT,
      currentPrice: isFoundingAvailable ? FOUNDING_AMOUNT : STANDARD_AMOUNT,
      currentPriceId: isFoundingAvailable ? FOUNDING_PRICE_ID : STANDARD_PRICE_ID,
      foundingPriceId: FOUNDING_PRICE_ID,
      standardPriceId: STANDARD_PRICE_ID,
      foundingAmount: FOUNDING_AMOUNT,
      standardAmount: STANDARD_AMOUNT,
    })
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Cache-Control', 'public, max-age=60')
    return response
  } catch (error: any) {
    console.error('[subscription/price] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
