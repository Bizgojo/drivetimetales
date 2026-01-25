import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('Webhook event:', event.type)

  // Handle successful payment (first real payment after trial/free month)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string
    const subscriptionId = invoice.subscription as string

    // Skip if this is the first invoice (could be $0 trial)
    // We want to reward on the second invoice (first real payment)
    if (invoice.billing_reason === 'subscription_create') {
      console.log('First invoice (subscription create), checking if referral...')
      
      // Get the subscription to find the user
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = subscription.metadata?.userId

      if (userId) {
        // Check if this user was referred
        const { data: referral } = await supabase
          .from('referrals')
          .select('id, referrer_id, status')
          .eq('referred_id', userId)
          .eq('status', 'signed_up')
          .single()

        if (referral) {
          // Update referral status to subscribed
          await supabase
            .from('referrals')
            .update({ status: 'subscribed', subscribed_at: new Date().toISOString() })
            .eq('id', referral.id)

          console.log('Referral marked as subscribed, waiting for first real payment...')
        }
      }
    }

    // This is a real payment (not the first $0 invoice)
    if (invoice.billing_reason === 'subscription_cycle' || 
        (invoice.billing_reason === 'subscription_create' && invoice.amount_paid > 0)) {
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = subscription.metadata?.userId

      if (userId) {
        // Check for pending referral reward
        const { data: referral } = await supabase
          .from('referrals')
          .select('id, referrer_id')
          .eq('referred_id', userId)
          .eq('status', 'subscribed')
          .single()

        if (referral) {
          console.log('Processing referral reward for referrer:', referral.referrer_id)

          // Get referrer's Stripe customer ID
          const { data: referrerData } = await supabase
            .from('users')
            .select('stripe_customer_id')
            .eq('id', referral.referrer_id)
            .single()

          if (referrerData?.stripe_customer_id) {
            // Get referrer's subscription
            const referrerSubs = await stripe.subscriptions.list({
              customer: referrerData.stripe_customer_id,
              status: 'active',
              limit: 1
            })

            if (referrerSubs.data.length > 0) {
              const referrerSub = referrerSubs.data[0]
              
              // Extend referrer's subscription by 30 days
              const currentEnd = referrerSub.current_period_end
              const newEnd = currentEnd + (30 * 24 * 60 * 60) // Add 30 days in seconds

              await stripe.subscriptions.update(referrerSub.id, {
                trial_end: newEnd,
                proration_behavior: 'none'
              })

              console.log('Extended referrer subscription by 30 days')
            }
          }

          // Extend the new subscriber's subscription by 30 days too
          const currentEnd = subscription.current_period_end
          const newEnd = currentEnd + (30 * 24 * 60 * 60)

          await stripe.subscriptions.update(subscriptionId, {
            trial_end: newEnd,
            proration_behavior: 'none'
          })

          console.log('Extended new subscriber subscription by 30 days')

          // Mark referral as rewarded
          await supabase
            .from('referrals')
            .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
            .eq('id', referral.id)

          console.log('Referral reward completed!')
        }
      }
    }
  }

  // Handle subscription created
  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.userId

    if (userId) {
      // Update user's plan
      await supabase
        .from('users')
        .update({ 
          plan: 'test_driver',
          stripe_subscription_id: subscription.id
        })
        .eq('id', userId)

      console.log('User plan updated to test_driver')
    }
  }

  // Handle subscription canceled
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.userId

    if (userId) {
      await supabase
        .from('users')
        .update({ plan: 'free' })
        .eq('id', userId)

      console.log('User plan reverted to free')
    }
  }

  return NextResponse.json({ received: true })
}
