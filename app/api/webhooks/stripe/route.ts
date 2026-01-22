import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

// Use service role for webhook operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CREDITS_PER_MONTH = 10

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
        
        if (userId && session.subscription) {
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          
          // Update user with subscription info and add credits
          const { error } = await supabase
            .from('users')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscription.id,
              subscription_status: 'active',
              credits: CREDITS_PER_MONTH,
              subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', userId)

          if (error) {
            console.error('Failed to update user after checkout:', error)
          } else {
            console.log(`User ${userId} subscribed, added ${CREDITS_PER_MONTH} credits`)
          }
        }
        break
      }

      case 'invoice.paid': {
        // Monthly renewal - add credits
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string
        
        if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
          // Find user by subscription ID
          const { data: user, error: findError } = await supabase
            .from('users')
            .select('id, credits')
            .eq('stripe_subscription_id', subscriptionId)
            .single()

          if (user && !findError) {
            // Add monthly credits
            const { error } = await supabase
              .from('users')
              .update({
                credits: (user.credits || 0) + CREDITS_PER_MONTH,
                subscription_status: 'active'
              })
              .eq('id', user.id)

            if (error) {
              console.error('Failed to add renewal credits:', error)
            } else {
              console.log(`User ${user.id} renewed, added ${CREDITS_PER_MONTH} credits`)
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        
        // Find user by subscription ID
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
              subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', user.id)

          console.log(`User ${user.id} subscription updated to: ${status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        
        // Find user by subscription ID
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
              stripe_subscription_id: null
            })
            .eq('id', user.id)

          console.log(`User ${user.id} subscription canceled`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
