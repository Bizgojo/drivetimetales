import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

function getBillingCycle(subscription: Stripe.Subscription): 'annual' | 'monthly' | null {
  try {
    const interval = subscription.items?.data?.[0]?.price?.recurring?.interval
    if (interval === 'year') return 'annual'
    if (interval === 'month') return 'monthly'
    return null
  } catch {
    return null
  }
}

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

        const billingCycle = getBillingCycle(subscription)
        const { error } = await supabase.from('users').update({
          plan: planName,
          subscription_type: 'active',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_start: new Date().toISOString(),
          subscription_ends_at: periodEnd,
          billing_cycle: billingCycle,
        }).eq('id', userId)

        if (error) console.error('Error updating user after checkout:', error)
        else {
          console.log(`[webhook] User ${userId} activated as ${planName}`)
          try {
            const { data: userData } = await supabase.from('users').select('email, first_name, display_name').eq('id', userId).single()
            if (userData?.email) {
              const resend = new Resend(process.env.RESEND_API_KEY)
              const displayName = userData.first_name || userData.display_name || 'Friend'
              const isAnnual = ((session as any).amount_total || 0) > 1000
              const planLabel = isFoundingMember ? 'Founding Member' : isAnnual ? 'Annual' : 'Monthly'
              const priceLabel = isAnnual
                ? (isFoundingMember ? '$29.99/year' : '$59.99/year')
                : (isFoundingMember ? '$2.99/month' : '$7.99/month')
              await resend.emails.send({
                from: 'Endless Tales <hello@endless-tales.com>',
                to: userData.email,
                subject: `Welcome to Endless Tales, ${displayName}!`,
                html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><h1 style="color:#fff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">You are in, ${displayName}!</h1><p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">Your 14-day free trial has started. After that you are on the <strong style="color:#f97316;">${planLabel} plan</strong> at ${priceLabel}.</p><div style="text-align:center;margin-bottom:24px;"><a href="https://app.endless-tales.com/home" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;">Start Listening</a></div><div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:16px 20px;"><div style="color:#f97316;font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Your trial includes</div><div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.8;">Full access to all audio stories. New stories added weekly. Cancel anytime before day 14 and you will not be charged.${isFoundingMember ? ' Your Founding Member price is locked for life.' : ''}</div></div></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.</p></div></body></html>`,
              })
              console.log(`[webhook] Welcome email sent to ${userData.email} — ${planLabel}`)
            }
          } catch (emailErr) {
            console.error('[webhook] Welcome email failed (non-fatal):', emailErr)
          }
        }
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

      const billingCycleIp = getBillingCycle(subscription)
      const { error } = await supabase.from('users').update({
        plan: planName,
        subscription_type: 'active',
        subscription_ends_at: periodEnd,
        billing_cycle: billingCycleIp,
      }).eq('id', userId)

      if (error) console.error('Error updating subscription on invoice paid:', error)

      // Priority 5: set first_paid_date on the very first paid invoice (trial conversion)
      try {
        const { data: existing } = await supabase
          .from('users')
          .select('first_paid_date')
          .eq('id', userId)
          .single()
        if (existing && !existing.first_paid_date) {
          const { error: fpdErr } = await supabase
            .from('users')
            .update({ first_paid_date: new Date().toISOString() })
            .eq('id', userId)
          if (fpdErr) console.error('[webhook] first_paid_date write failed (non-fatal):', fpdErr)
          else console.log(`[webhook] first_paid_date set for user ${userId}`)
        }
      } catch (fpdCatch) {
        console.error('[webhook] first_paid_date block threw (non-fatal):', fpdCatch)
      }

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
        cancelled_at: new Date().toISOString(),
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

      const billingCycleSu = getBillingCycle(subscription)
      const { error } = await supabase.from('users').update({
        plan: isActive ? planName : 'free',
        subscription_type: isActive ? 'active' : null,
        subscription_ends_at: isActive ? periodEnd : null,
        billing_cycle: isActive ? billingCycleSu : null,
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
