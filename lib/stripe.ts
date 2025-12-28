import Stripe from 'stripe';

// Server-side Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Product IDs - these should match your Stripe dashboard
export const PRODUCTS = {
  // Subscriptions
  subscriptions: {
    test_driver_monthly: {
      priceId: process.env.STRIPE_PRICE_TEST_DRIVER_MONTHLY!,
      name: 'Test Driver',
      credits: 12,
      interval: 'month' as const,
    },
    test_driver_annual: {
      priceId: process.env.STRIPE_PRICE_TEST_DRIVER_ANNUAL!,
      name: 'Test Driver (Annual)',
      credits: 12,
      interval: 'year' as const,
    },
    commuter_monthly: {
      priceId: process.env.STRIPE_PRICE_COMMUTER_MONTHLY!,
      name: 'Commuter',
      credits: 45,
      interval: 'month' as const,
    },
    commuter_annual: {
      priceId: process.env.STRIPE_PRICE_COMMUTER_ANNUAL!,
      name: 'Commuter (Annual)',
      credits: 45,
      interval: 'year' as const,
    },
    road_warrior_monthly: {
      priceId: process.env.STRIPE_PRICE_ROAD_WARRIOR_MONTHLY!,
      name: 'Road Warrior',
      credits: -1, // Unlimited
      interval: 'month' as const,
    },
    road_warrior_annual: {
      priceId: process.env.STRIPE_PRICE_ROAD_WARRIOR_ANNUAL!,
      name: 'Road Warrior (Annual)',
      credits: -1, // Unlimited
      interval: 'year' as const,
    },
  },
  // One-time credit packs
  creditPacks: {
    small: {
      priceId: process.env.STRIPE_PRICE_PACK_SMALL!,
      name: 'Small Pack',
      credits: 10,
      price: 499, // cents
    },
    medium: {
      priceId: process.env.STRIPE_PRICE_PACK_MEDIUM!,
      name: 'Medium Pack',
      credits: 25,
      price: 999,
    },
    large: {
      priceId: process.env.STRIPE_PRICE_PACK_LARGE!,
      name: 'Large Pack',
      credits: 60,
      price: 1999,
    },
  },
};

// Create a checkout session for subscriptions
export async function createSubscriptionCheckout(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'subscription',
    },
  });

  return session;
}

// Create a checkout session for credit packs
export async function createCreditPackCheckout(
  customerId: string,
  priceId: string,
  credits: number,
  successUrl: string,
  cancelUrl: string
) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'credit_pack',
      credits: credits.toString(),
    },
  });

  return session;
}

// Create or get Stripe customer
export async function getOrCreateStripeCustomer(
  email: string,
  userId: string,
  existingCustomerId?: string
) {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: {
      supabase_user_id: userId,
    },
  });

  return customer.id;
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
  return subscription;
}

// Get customer's active subscription
export async function getActiveSubscription(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  return subscriptions.data[0] || null;
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
