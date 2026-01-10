import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Credit amounts per plan - matches subscription_type values in DB
const planCredits: { [key: string]: number } = {
  free: 2,
  test_driver: 10,
  commuter: 25,
  road_warrior: -1, // -1 means unlimited
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  console.log('Webhook event received:', event.type)

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      
      // Check for user_id (one-time purchase) or userId (subscription)
      const userId = session.metadata?.user_id || session.metadata?.userId
      const packId = session.metadata?.pack_id
      const creditsToAdd = session.metadata?.credits ? parseInt(session.metadata.credits) : null
      const plan = session.metadata?.plan || 'commuter'
      
      console.log('Checkout completed:', { userId, packId, creditsToAdd, plan, mode: session.mode })
      
      if (!userId) {
        console.error('No user ID in session metadata')
        break
      }

      // ONE-TIME PURCHASE (Freedom Packs)
      if (session.mode === 'payment' && creditsToAdd) {
        console.log(`Adding ${creditsToAdd} credits to user ${userId}`)
        
        // Get current credits
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('credits')
          .eq('id', userId)
          .single()
        
        if (fetchError) {
          console.error('Error fetching user:', fetchError)
          break
        }
        
        const currentCredits = userData?.credits || 0
        const newCredits = currentCredits === -1 ? -1 : currentCredits + creditsToAdd
        
        const { error: updateError } = await supabase
          .from('users')
          .update({
            credits: newCredits,
            stripe_customer_id: session.customer as string,
          })
          .eq('id', userId)
        
        if (updateError) {
          console.error('Error updating credits:', updateError)
        } else {
          console.log(`Successfully updated credits: ${currentCredits} -> ${newCredits}`)
        }
      }
      // SUBSCRIPTION
      else if (session.mode === 'subscription') {
        console.log(`Setting up subscription ${plan} for user ${userId}`)
        
        await supabase
          .from('users')
          .update({
            subscription_type: plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            credits: planCredits[plan] || 25,
          })
          .eq('id', userId)
      }
      break
    }

    case 'invoice.paid': {
      // Monthly renewal - add credits
      const invoice = event.data.object as Stripe.Invoice
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      const plan = subscription.metadata?.plan || 'commuter'
      
      if (userId) {
        // Add monthly credits
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', userId)
          .single()
        
        const currentCredits = userData?.credits || 0
        const newCredits = planCredits[plan] === -1 ? -1 : currentCredits + planCredits[plan]
        
        await supabase
          .from('users')
          .update({ credits: newCredits })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      // Subscription cancelled
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      
      if (userId) {
        await supabase
          .from('users')
          .update({
            subscription_type: 'free',
            credits: 0,
          })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated': {
      // Subscription changed (upgrade/downgrade)
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      const plan = subscription.metadata?.plan
      
      if (userId && plan) {
        await supabase
          .from('users')
          .update({
            subscription_type: plan,
            credits: planCredits[plan] || 25,
          })
          .eq('id', userId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
