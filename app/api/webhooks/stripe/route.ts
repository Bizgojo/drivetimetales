import { NextRequest, NextResponse } from 'next/server';
import { stripe, verifyWebhookSignature, PRODUCTS } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Server-side Supabase client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = verifyWebhookSignature(body, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const metadata = session.metadata || {};

  // Get user by Stripe customer ID
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, credits')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error || !user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  if (metadata.type === 'credit_pack') {
    // Add credits for credit pack purchase
    const creditsToAdd = parseInt(metadata.credits || '0', 10);
    
    await supabaseAdmin
      .from('users')
      .update({ credits: user.credits + creditsToAdd })
      .eq('id', user.id);

    // Record the purchase
    await supabaseAdmin.from('purchases').insert({
      user_id: user.id,
      type: 'credit_pack',
      product_id: metadata.product_id || 'unknown',
      amount_cents: session.amount_total || 0,
      credits_added: creditsToAdd,
      stripe_payment_id: session.payment_intent as string,
    });

    console.log(`Added ${creditsToAdd} credits to user ${user.id}`);
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Determine subscription type from price ID
  let subscriptionType: 'free' | 'test_driver' | 'commuter' | 'road_warrior' = 'free';
  let monthlyCredits = 0;

  // Check which product this price belongs to
  for (const [key, product] of Object.entries(PRODUCTS.subscriptions)) {
    if (product.priceId === priceId) {
      if (key.includes('test_driver')) {
        subscriptionType = 'test_driver';
        monthlyCredits = 12;
      } else if (key.includes('commuter')) {
        subscriptionType = 'commuter';
        monthlyCredits = 45;
      } else if (key.includes('road_warrior')) {
        subscriptionType = 'road_warrior';
        monthlyCredits = -1; // Unlimited
      }
      break;
    }
  }

  // Get user by Stripe customer ID
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, credits')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error || !user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update user subscription
  await supabaseAdmin
    .from('users')
    .update({
      subscription_type: subscriptionType,
      subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('id', user.id);

  console.log(`Updated subscription for user ${user.id} to ${subscriptionType}`);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Get user by Stripe customer ID
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error || !user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Downgrade to free
  await supabaseAdmin
    .from('users')
    .update({
      subscription_type: 'free',
      subscription_ends_at: null,
    })
    .eq('id', user.id);

  console.log(`Canceled subscription for user ${user.id}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // This fires when subscription renews
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  // Get the subscription to find the price
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;

  // Determine credits to add
  let creditsToAdd = 0;
  for (const [key, product] of Object.entries(PRODUCTS.subscriptions)) {
    if (product.priceId === priceId) {
      creditsToAdd = product.credits;
      break;
    }
  }

  if (creditsToAdd <= 0) return; // Unlimited or unknown

  // Get user and add credits
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, credits')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error || !user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  await supabaseAdmin
    .from('users')
    .update({ credits: user.credits + creditsToAdd })
    .eq('id', user.id);

  // Record the purchase
  await supabaseAdmin.from('purchases').insert({
    user_id: user.id,
    type: 'subscription',
    product_id: subscriptionId,
    amount_cents: invoice.amount_paid,
    credits_added: creditsToAdd,
    stripe_payment_id: invoice.payment_intent as string,
  });

  console.log(`Added ${creditsToAdd} monthly credits to user ${user.id}`);
}
