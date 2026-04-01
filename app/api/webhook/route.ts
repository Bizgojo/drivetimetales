import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

function getPlanName(isFoundingMember: boolean): string {
  return isFoundingMember ? 'founding_member' : 'standard'
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  console.log('Webhook event received:', event.type)

  switch (event.type) {

    // ─── Checkout completed ───────────────────────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId || session.metadata?.user_id

      if (!userId) {
        console.error('No userId in session metadata')
        break
      }

      if (session.mode === 'subscription' && session.subscription) {
        // Retrieve subscription to get isFoundingMember from metadata
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        const isFoundingMember = subscription.metadata?.isFoundingMember === 'true'
        const planName = getPlanName(isFoundingMember)
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null

        console.log(`[webhook] checkout completed — user ${userId}, plan: ${planName}`)

        const { error } = await supabase.from('users').update({
          plan: planName,
          subscription_type: 'active',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_start: new Date().toISOString(),
          subscription_ends_at: periodEnd,
        }).eq('id', userId)

        if (error) console.error('Error updating user after checkout:', error)
        else console.log(`[webhook] User ${userId} activated as ${planName}`)
      }
      break
    }

    // ─── Invoice paid (renewal) ───────────────────────────────────────────────
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break

      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      if (!userId) break

      const isFoundingMember = subscription.metadata?.isFoundingMember === 'true'
      const planName = getPlanName(isFoundingMember)
      const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

      console.log(`[webhook] invoice paid — user ${userId}, plan: ${planName}, renews until ${periodEnd}`)

      const { error } = await supabase.from('users').update({
        plan: planName,
        subscription_type: 'active',
        subscription_ends_at: periodEnd,
      }).eq('id', userId)

      if (error) console.error('Error updating subscription on invoice paid:', error)
      break
    }

    // ─── Subscription deleted (cancelled) ────────────────────────────────────
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      if (!userId) break

      console.log(`[webhook] subscription cancelled — user ${userId}`)

      const { error } = await supabase.from('users').update({
        plan: 'free',
        subscription_type: null,
        stripe_subscription_id: null,
        subscription_ends_at: null,
      }).eq('id', userId)

      if (error) console.error('Error cancelling subscription:', error)
      break
    }

    // ─── Subscription updated (e.g. trial ended, plan changed) ───────────────
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      if (!userId) break

      const isFoundingMember = subscription.metadata?.isFoundingMember === 'true'
      const planName = getPlanName(isFoundingMember)
      const status = subscription.status // active, trialing, past_due, canceled, etc.
      const isActive = status === 'active' || status === 'trialing'
      const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

      console.log(`[webhook] subscription updated — user ${userId}, status: ${status}, plan: ${planName}`)

      const { error } = await supabase.from('users').update({
        plan: isActive ? planName : 'free',
        subscription_type: isActive ? 'active' : null,
        subscription_ends_at: isActive ? periodEnd : null,
      }).eq('id', userId)

      if (error) console.error('Error updating subscription:', error)
      break
    }

    // ─── Payment failed ───────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break

      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id
      if (!userId) break

      console.log(`[webhook] payment failed — user ${userId}`)
      // Don't cut off access immediately — Stripe will retry and send customer.subscription.updated
      // when it moves to past_due. Just log for now.
      break
    }

    default:
      console.log(`[webhook] unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
