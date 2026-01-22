import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

export async function POST(request: NextRequest) {
  try {
    const { userId, email, priceId } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing user info' }, { status: 400 })
    }

    // Use the price ID from env or the one passed in
    const stripePriceId = priceId || process.env.STRIPE_PRICE_TEST_DRIVER_MONTHLY

    if (!stripePriceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 })
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1
        }
      ],
      metadata: {
        userId: userId,
        user_id: userId  // Include both for webhook compatibility
      },
      subscription_data: {
        metadata: {
          userId: userId,
          user_id: userId
        }
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/library?welcome=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/signup?canceled=true`
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
