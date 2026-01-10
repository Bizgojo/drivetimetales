import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRODUCTS, createSubscriptionCheckout, createCreditPackCheckout, getOrCreateStripeCustomer } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productType, productId, userId } = body;

    if (!productType || !productId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user data
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      user.email,
      userId,
      user.stripe_customer_id
    );

    // Update user with Stripe customer ID if new
    if (!user.stripe_customer_id) {
      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';
    const successUrl = `${baseUrl}/account/billing?success=true`;
    const cancelUrl = `${baseUrl}/pricing?canceled=true`;

    let session;

    if (productType === 'subscription') {
      // Handle subscription checkout
      const product = PRODUCTS.subscriptions[productId as keyof typeof PRODUCTS.subscriptions];
      if (!product) {
        return NextResponse.json(
          { error: 'Invalid product' },
          { status: 400 }
        );
      }

      session = await createSubscriptionCheckout(
        customerId,
        product.priceId,
        successUrl,
        cancelUrl
      );
    } else if (productType === 'credit_pack') {
      // Handle credit pack checkout
      const product = PRODUCTS.creditPacks[productId as keyof typeof PRODUCTS.creditPacks];
      if (!product) {
        return NextResponse.json(
          { error: 'Invalid product' },
          { status: 400 }
        );
      }

      session = await createCreditPackCheckout(
        customerId,
        product.priceId,
        product.credits,
        successUrl,
        cancelUrl
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid product type' },
        { status: 400 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
