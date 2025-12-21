import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Product configurations
const PRODUCTS = {
  // Subscriptions
  commuter_monthly: {
    name: 'DTT Commuter - Monthly',
    price: 799, // cents
    mode: 'subscription' as const,
    interval: 'month' as const,
  },
  commuter_annual: {
    name: 'DTT Commuter - Annual',
    price: 5999,
    mode: 'subscription' as const,
    interval: 'year' as const,
  },
  road_warrior_monthly: {
    name: 'DTT Road Warrior - Monthly',
    price: 1299,
    mode: 'subscription' as const,
    interval: 'month' as const,
  },
  road_warrior_annual: {
    name: 'DTT Road Warrior - Annual',
    price: 9999,
    mode: 'subscription' as const,
    interval: 'year' as const,
  },
  // Credit Packs
  credits_small: {
    name: 'Credit Pack - Small (10 credits)',
    price: 399,
    mode: 'payment' as const,
    credits: 10,
  },
  credits_medium: {
    name: 'Credit Pack - Medium (25 credits)',
    price: 899,
    mode: 'payment' as const,
    credits: 25,
  },
  credits_large: {
    name: 'Credit Pack - Large (50 credits)',
    price: 1499,
    mode: 'payment' as const,
    credits: 50,
  },
  // Individual stories by duration
  story_15: {
    name: 'Story Purchase - 15 min',
    price: 69,
    mode: 'payment' as const,
  },
  story_30: {
    name: 'Story Purchase - 30 min',
    price: 129,
    mode: 'payment' as const,
  },
  story_60: {
    name: 'Story Purchase - 1 hour',
    price: 249,
    mode: 'payment' as const,
  },
  story_180: {
    name: 'Story Purchase - 3 hours',
    price: 699,
    mode: 'payment' as const,
  },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, userEmail, userName, storyId, storyTitle } = body

    const product = PRODUCTS[productId as keyof typeof PRODUCTS]
    if (!product) {
      return NextResponse.json({ error: 'Invalid product' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    
    // Build line item based on product type
    let lineItem: Stripe.Checkout.SessionCreateParams.LineItem
    
    if (product.mode === 'subscription') {
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: productId.includes('road_warrior') 
              ? 'Unlimited streaming + downloads + early access + exclusive content'
              : 'Unlimited ad-free streaming',
          },
          unit_amount: product.price,
          recurring: {
            interval: (product as any).interval,
          },
        },
        quantity: 1,
      }
    } else {
      // One-time payment (credit pack or story)
      const description = storyTitle 
        ? `Own "${storyTitle}" forever with download`
        : (product as any).credits 
          ? `${(product as any).credits} credits (${(product as any).credits * 15} minutes of streaming)`
          : product.name
      
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: storyTitle ? `DTT Story: ${storyTitle}` : product.name,
            description,
          },
          unit_amount: product.price,
        },
        quantity: 1,
      }
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode: product.mode,
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        productId,
        storyId: storyId || '',
        userName: userName || '',
      },
    }

    // Add customer email if provided
    if (userEmail) {
      sessionParams.customer_email = userEmail
    }

    // For subscriptions, allow promotion codes
    if (product.mode === 'subscription') {
      sessionParams.allow_promotion_codes = true
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
