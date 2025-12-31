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
  basic: 10,
  premium: 30,
  unlimited: -1, // -1 means unlimited
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

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const plan = session.metadata?.plan || 'premium'
      
      if (userId) {
        // Update user subscription
        await supabase
          .from('users')
          .update({
            subscription_status: 'active',
            subscription_plan: plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            credits: planCredits[plan] || 30,
            subscription_start: new Date().toISOString(),
          })
          .eq('id', userId)
      }
      break
    }

    case 'invoice.paid': {
      // Monthly renewal - add credits
      const invoice = event.data.object as Stripe.Invoice
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = subscription.metadata?.userId
      const plan = subscription.metadata?.plan || 'premium'
      
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
      const userId = subscription.metadata?.userId
      
      if (userId) {
        await supabase
          .from('users')
          .update({
            subscription_status: 'cancelled',
            credits: 0,
          })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated': {
      // Subscription changed (upgrade/downgrade)
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId
      const plan = subscription.metadata?.plan
      
      if (userId && plan) {
        await supabase
          .from('users')
          .update({
            subscription_plan: plan,
            credits: planCredits[plan] || 30,
          })
          .eq('id', userId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
