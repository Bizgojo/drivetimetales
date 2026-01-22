import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

export async function POST(request: NextRequest) {
  try {
    const { userId, email, priceId, mode } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing user info' }, { status: 400 })
    }

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID required' }, { status: 400 })
    }

    // Determine if this is a subscription or one-time payment
    const checkoutMode = mode === 'payment' ? 'payment' : 'subscription'

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: checkoutMode,
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      metadata: {
        userId: userId,
        user_id: userId
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/library?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/library?purchase=canceled`
    }

    // Add subscription-specific metadata
    if (checkoutMode === 'subscription') {
      sessionConfig.subscription_data = {
        metadata: {
          userId: userId,
          user_id: userId
        }
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
