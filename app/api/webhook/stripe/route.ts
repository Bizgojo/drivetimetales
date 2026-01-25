import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendNotification(data: {
  referralId: string
  type: string
  referrerEmail: string
  referrerName: string
  referredEmail?: string
  referredName?: string
  rewardText?: string
}) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://drivetimetales.vercel.app'
    await fetch(`${baseUrl}/api/referral/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

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

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = invoice.subscription as string

    if (!subscriptionId) {
      return NextResponse.json({ received: true })
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const userId = subscription.metadata?.userId
    const offerId = subscription.metadata?.offerId

    if (!userId) {
      console.log('No userId in subscription metadata')
      return NextResponse.json({ received: true })
    }

    // Get user info for notifications
    const { data: referredUser } = await supabase
      .from('users')
      .select('email, first_name, display_name')
      .eq('id', userId)
      .single()

    if (invoice.billing_reason === 'subscription_create') {
      console.log('First invoice - subscription created for user:', userId)

      const { data: referral } = await supabase
        .from('referrals')
        .select('id, referrer_id, offer_id')
        .eq('referred_id', userId)
        .eq('status', 'signed_up')
        .single()

      if (referral) {
        await supabase
          .from('referrals')
          .update({ status: 'subscribed', subscribed_at: new Date().toISOString() })
          .eq('id', referral.id)

        // Send notification to referrer
        const { data: referrer } = await supabase
          .from('users')
          .select('email, first_name, display_name')
          .eq('id', referral.referrer_id)
          .single()

        if (referrer) {
          await sendNotification({
            referralId: referral.id,
            type: 'referral_subscribed',
            referrerEmail: referrer.email,
            referrerName: referrer.first_name || referrer.display_name || 'Friend',
            referredName: referredUser?.first_name || referredUser?.display_name || 'Your friend'
          })
        }

        console.log('Referral marked as subscribed, notification sent')
      }
    }

    if (invoice.billing_reason === 'subscription_cycle' || 
        (invoice.billing_reason === 'subscription_create' && invoice.amount_paid > 0)) {
      
      console.log('Processing potential referral reward for user:', userId)

      const { data: referral } = await supabase
        .from('referrals')
        .select('id, referrer_id, offer_id')
        .eq('referred_id', userId)
        .eq('status', 'subscribed')
        .single()

      if (referral) {
        console.log('Found pending referral, processing reward...')

        let offer = null
        const useOfferId = referral.offer_id || offerId

        if (useOfferId) {
          const { data: offerData } = await supabase
            .from('referral_offers')
            .select('*')
            .eq('id', useOfferId)
            .single()
          offer = offerData
        }

        if (!offer) {
          const { data: defaultOffer } = await supabase
            .from('referral_offers')
            .select('*')
            .eq('is_default', true)
            .single()
          offer = defaultOffer
        }

        if (!offer) {
          console.log('No offer found, skipping reward')
          return NextResponse.json({ received: true })
        }

        console.log('Using offer:', offer.name, offer.offer_type, offer.referrer_reward)

        if (offer.offer_type === 'free_days') {
          await processFreeDaysReward(
            referral.referrer_id,
            userId,
            subscription.id,
            offer.referrer_reward,
            offer.referred_reward
          )
        } else if (offer.offer_type === 'credits') {
          await processCreditsReward(
            referral.referrer_id,
            userId,
            offer.referrer_reward,
            offer.referred_reward
          )
        }

        await supabase
          .from('referrals')
          .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
          .eq('id', referral.id)

        // Send reward notification to referrer
        const { data: referrer } = await supabase
          .from('users')
          .select('email, first_name, display_name')
          .eq('id', referral.referrer_id)
          .single()

        if (referrer) {
          const rewardText = offer.offer_type === 'free_days' 
            ? `${offer.referrer_reward} days free` 
            : `${offer.referrer_reward} credits`

          await sendNotification({
            referralId: referral.id,
            type: 'referral_rewarded',
            referrerEmail: referrer.email,
            referrerName: referrer.first_name || referrer.display_name || 'Friend',
            referredName: referredUser?.first_name || referredUser?.display_name || 'Your friend',
            rewardText
          })
        }

        console.log('Referral reward completed, notification sent!')
      }
    }
  }

  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.userId

    if (userId) {
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

async function processFreeDaysReward(
  referrerId: string,
  referredId: string,
  referredSubId: string,
  referrerDays: number,
  referredDays: number
) {
  console.log(`Processing free days reward: referrer=${referrerDays} days, referred=${referredDays} days`)

  const { data: referrerData } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', referrerId)
    .single()

  if (referrerData?.stripe_customer_id) {
    const referrerSubs = await stripe.subscriptions.list({
      customer: referrerData.stripe_customer_id,
      status: 'active',
      limit: 1
    })

    if (referrerSubs.data.length > 0) {
      const referrerSub = referrerSubs.data[0]
      const newEnd = referrerSub.current_period_end + (referrerDays * 24 * 60 * 60)
      
      await stripe.subscriptions.update(referrerSub.id, {
        trial_end: newEnd,
        proration_behavior: 'none'
      })

      console.log(`Extended referrer subscription by ${referrerDays} days`)
    }
  }

  const referredSub = await stripe.subscriptions.retrieve(referredSubId)
  const newEnd = referredSub.current_period_end + (referredDays * 24 * 60 * 60)
  
  await stripe.subscriptions.update(referredSubId, {
    trial_end: newEnd,
    proration_behavior: 'none'
  })

  console.log(`Extended referred user subscription by ${referredDays} days`)
}

async function processCreditsReward(
  referrerId: string,
  referredId: string,
  referrerCredits: number,
  referredCredits: number
) {
  console.log(`Processing credits reward: referrer=${referrerCredits}, referred=${referredCredits}`)

  const { data: referrerData } = await supabase
    .from('users')
    .select('credits')
    .eq('id', referrerId)
    .single()

  if (referrerData) {
    await supabase
      .from('users')
      .update({ credits: (referrerData.credits || 0) + referrerCredits })
      .eq('id', referrerId)

    console.log(`Added ${referrerCredits} credits to referrer`)
  }

  const { data: referredData } = await supabase
    .from('users')
    .select('credits')
    .eq('id', referredId)
    .single()

  if (referredData) {
    await supabase
      .from('users')
      .update({ credits: (referredData.credits || 0) + referredCredits })
      .eq('id', referredId)

    console.log(`Added ${referredCredits} credits to referred user`)
  }
}
