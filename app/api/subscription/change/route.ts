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

// Plan configurations
const PLANS: { [key: string]: { monthlyPriceId: string; yearlyPriceId: string; credits: number } } = {
  test_driver: {
    monthlyPriceId: 'price_1SjSWGG3QDdai0ZhIluFz2T3',
    yearlyPriceId: 'price_1SjSc8G3QDdai0ZhzV24N11l',
    credits: 10,
  },
  commuter: {
    monthlyPriceId: 'price_1SjShgG3QDdai0ZhpLpMLBig',
    yearlyPriceId: 'price_1SjSj1G3QDdai0ZhSETd2rcS',
    credits: 25,
  },
  road_warrior: {
    monthlyPriceId: 'price_1SjSkJG3QDdai0ZhEqPaFOmU',
    yearlyPriceId: 'price_1SjSlRG3QDdai0ZhD10RJ0sl',
    credits: 100,
  },
}

export async function POST(request: NextRequest) {
  try {
    const { userId, newPlanId, isUpgrade, billingInterval } = await request.json()

    if (!userId || !newPlanId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's current subscription info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id, stripe_subscription_id, plan')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { stripe_customer_id, stripe_subscription_id, plan: currentPlan } = userData
    const newPlan = PLANS[newPlanId]

    if (!newPlan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const newPriceId = billingInterval === 'year' ? newPlan.yearlyPriceId : newPlan.monthlyPriceId

    // If user has no subscription, redirect to checkout
    if (!stripe_subscription_id) {
      // Create a new checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripe_customer_id || undefined,
        payment_method_types: ['card'],
        line_items: [{ price: newPriceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app'}/manage-subscription?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app'}/manage-subscription?canceled=true`,
        metadata: {
          userId,
          plan: newPlanId,
        },
      })

      return NextResponse.json({ url: session.url })
    }

    // Get the current subscription
    const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id)
    const subscriptionItemId = subscription.items.data[0]?.id

    if (!subscriptionItemId) {
      return NextResponse.json({ error: 'Subscription item not found' }, { status: 400 })
    }

    if (isUpgrade) {
      // UPGRADE: Immediate change with proration
      await stripe.subscriptions.update(stripe_subscription_id, {
        items: [{ id: subscriptionItemId, price: newPriceId }],
        proration_behavior: 'create_prorations',
        metadata: {
          userId,
          plan: newPlanId,
        },
      })

      // Update user's plan and RESET credits to new plan amount (no rollover)
      await supabase
        .from('users')
        .update({
          plan: newPlanId,
          credits: newPlan.credits,
        })
        .eq('id', userId)

      console.log(`Upgraded user ${userId} from ${currentPlan} to ${newPlanId}, credits reset to ${newPlan.credits}`)

      return NextResponse.json({ 
        success: true, 
        message: `Upgraded to ${newPlanId}. Credits reset to ${newPlan.credits}.` 
      })
    } else {
      // DOWNGRADE: Change at end of billing period
      await stripe.subscriptions.update(stripe_subscription_id, {
        items: [{ id: subscriptionItemId, price: newPriceId }],
        proration_behavior: 'none',
        metadata: {
          userId,
          plan: newPlanId,
        },
      })

      // Update the plan in database (credits will reset on next invoice.paid webhook)
      await supabase
        .from('users')
        .update({
          plan: newPlanId,
          // Don't change credits now - they'll reset on renewal
        })
        .eq('id', userId)

      console.log(`Downgraded user ${userId} from ${currentPlan} to ${newPlanId} (effective at renewal)`)

      return NextResponse.json({ 
        success: true, 
        message: `Downgraded to ${newPlanId}. Change takes effect at next billing date.` 
      })
    }
  } catch (error: any) {
    console.error('Subscription change error:', error)
    return NextResponse.json({ error: error.message || 'Failed to change subscription' }, { status: 500 })
  }
}
