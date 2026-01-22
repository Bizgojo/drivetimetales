import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credit amounts for different products
const CREDITS_MAP: Record<string, number> = {
  // Subscriptions (monthly credits)
  [process.env.STRIPE_PRICE_TEST_DRIVER_MONTHLY!]: 10,
  [process.env.STRIPE_PRICE_COMMUTER_MONTHLY!]: 30,
  [process.env.STRIPE_PRICE_ROAD_WARRIOR_MONTHLY!]: -1, // unlimited
  // Credit packs (one-time)
  [process.env.STRIPE_PRICE_PACK_SMALL!]: 5,
  [process.env.STRIPE_PRICE_PACK_MEDIUM!]: 15,
  [process.env.STRIPE_PRICE_PACK_LARGE!]: 30,
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('Stripe webhook event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId || session.metadata?.user_id

        if (!userId) {
          console.error('No userId in session metadata')
          break
        }

        // Handle subscription
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          const priceId = subscription.items.data[0]?.price.id
          const credits = CREDITS_MAP[priceId] || 10

          await supabase
            .from('users')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscription.id,
              subscription_status: 'active',
              subscription_type: getSubscriptionType(priceId),
              credits: credits,
              subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', userId)

          console.log(`User ${userId} subscribed, set ${credits} credits`)
        }

        // Handle one-time credit pack purchase
        if (session.mode === 'payment') {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id)
          const priceId = lineItems.data[0]?.price?.id
          const creditsToAdd = priceId ? (CREDITS_MAP[priceId] || 0) : 0

          if (creditsToAdd > 0) {
            // Get current credits first
            const { data: user } = await supabase
              .from('users')
              .select('credits')
              .eq('id', userId)
              .single()

            const currentCredits = user?.credits || 0
            // Don't add to unlimited (-1)
            const newCredits = currentCredits === -1 ? -1 : currentCredits + creditsToAdd

            await supabase
              .from('users')
              .update({
                credits: newCredits,
                stripe_customer_id: session.customer as string
              })
              .eq('id', userId)

            console.log(`User ${userId} bought ${creditsToAdd} credits, now has ${newCredits}`)
          }
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
          const { data: user } = await supabase
            .from('users')
            .select('id, credits, subscription_type')
            .eq('stripe_subscription_id', subscriptionId)
            .single()

          if (user) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            const priceId = subscription.items.data[0]?.price.id
            const monthlyCredits = CREDITS_MAP[priceId] || 10

            // For unlimited, keep -1. Otherwise add monthly credits
            const newCredits = user.credits === -1 ? -1 : (user.credits || 0) + monthlyCredits

            await supabase
              .from('users')
              .update({
                credits: newCredits,
                subscription_status: 'active'
              })
              .eq('id', user.id)

            console.log(`User ${user.id} renewed, added ${monthlyCredits} credits`)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription

        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (user) {
          const status = subscription.status === 'active' || subscription.status === 'trialing'
            ? 'active'
            : subscription.status

          await supabase
            .from('users')
            .update({
              subscription_status: status,
              subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', user.id)

          console.log(`User ${user.id} subscription updated: ${status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (user) {
          await supabase
            .from('users')
            .update({
              subscription_status: 'canceled',
              stripe_subscription_id: null,
              subscription_type: null
            })
            .eq('id', user.id)

          console.log(`User ${user.id} subscription canceled`)
        }
        break
      }

      default:
        console.log(`Unhandled event: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}

function getSubscriptionType(priceId: string): string {
  if (priceId === process.env.STRIPE_PRICE_TEST_DRIVER_MONTHLY) return 'test_driver'
  if (priceId === process.env.STRIPE_PRICE_COMMUTER_MONTHLY) return 'commuter'
  if (priceId === process.env.STRIPE_PRICE_ROAD_WARRIOR_MONTHLY) return 'road_warrior'
  return 'test_driver'
}
