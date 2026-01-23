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

// Credit amounts per plan
const planCredits: { [key: string]: number } = {
  free: 2,
  test_driver: 10,
  commuter: 25,
  road_warrior: -1,
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id || session.metadata?.userId
      const packId = session.metadata?.pack_id
      const creditsToAdd = session.metadata?.credits ? parseInt(session.metadata.credits) : null
      const plan = session.metadata?.plan || 'commuter'
      
      console.log('Checkout completed:', { userId, packId, creditsToAdd, plan, mode: session.mode })
      
      if (!userId) {
        console.error('No user ID in session metadata')
        break
      }

      if (session.mode === 'payment' && creditsToAdd) {
        console.log(`Adding ${creditsToAdd} credits to user ${userId}`)
        
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
      else if (session.mode === 'subscription') {
        console.log(`Setting up subscription ${plan} for user ${userId}`)
        
        const { error: updateError } = await supabase
          .from('users')
          .update({
            plan: plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            credits: planCredits[plan] || 25,
          })
          .eq('id', userId)
        
        if (updateError) {
          console.error('Error updating subscription:', updateError)
        } else {
          console.log(`Successfully set up ${plan} subscription with ${planCredits[plan]} credits`)
        }
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      const plan = subscription.metadata?.plan || 'commuter'
      
      console.log('Invoice paid - monthly renewal:', { userId, plan })
      
      if (userId) {
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', userId)
          .single()
        
        const currentCredits = userData?.credits || 0
        const newCredits = planCredits[plan] === -1 ? -1 : currentCredits + planCredits[plan]
        
        const { error: updateError } = await supabase
          .from('users')
          .update({ credits: newCredits })
          .eq('id', userId)
        
        if (updateError) {
          console.error('Error adding monthly credits:', updateError)
        } else {
          console.log(`Monthly credits added: ${currentCredits} -> ${newCredits}`)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      
      console.log('Subscription cancelled:', { userId })
      
      if (userId) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            plan: 'free',
            credits: 0,
          })
          .eq('id', userId)
        
        if (updateError) {
          console.error('Error cancelling subscription:', updateError)
        } else {
          console.log('Subscription cancelled, user set to free plan')
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      const plan = subscription.metadata?.plan
      
      console.log('Subscription updated:', { userId, plan })
      
      if (userId && plan) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            plan: plan,
            credits: planCredits[plan] || 25,
          })
          .eq('id', userId)
        
        if (updateError) {
          console.error('Error updating subscription:', updateError)
        } else {
          console.log(`Subscription updated to ${plan} with ${planCredits[plan]} credits`)
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
