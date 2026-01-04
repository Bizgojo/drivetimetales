import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Credit pack prices and Stripe Price IDs
const CREDIT_PACKS = {
  small: { price: 499, credits: 10, name: 'Small Pack', priceId: 'price_1SjSxEG3QDdai0Zhi0BbuzED' },
  medium: { price: 999, credits: 25, name: 'Medium Pack', priceId: 'price_1SjSydG3QDdai0ZhUIYLwgzw' },
  large: { price: 1999, credits: 60, name: 'Large Pack', priceId: 'price_1SjT2LG3QDdai0ZhyG3JTuGY' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId, userId, returnUrl } = body;

    console.log('Quick purchase request:', { packId, userId, returnUrl });

    if (!packId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const pack = CREDIT_PACKS[packId as keyof typeof CREDIT_PACKS];
    if (!pack) {
      return NextResponse.json(
        { error: 'Invalid pack' },
        { status: 400 }
      );
    }

    // Get user data
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, credits, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Ensure user has a Stripe customer ID
    let customerId = user.stripe_customer_id;
    
    if (!customerId) {
      console.log('Creating new Stripe customer for:', user.email);
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      
      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // Always create a checkout session - this is most reliable
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://drivetimetales.vercel.app';
    const successUrl = returnUrl 
      ? `${baseUrl}/purchase-success?returnUrl=${encodeURIComponent(returnUrl)}&credits=${pack.credits}`
      : `${baseUrl}/library?purchased=${pack.credits}`;
    const cancelUrl = `${baseUrl}/pricing`;

    console.log('Creating checkout session:', { customerId, successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: pack.priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        pack_id: packId,
        credits: pack.credits.toString(),
      },
      // Save card for future purchases
      payment_intent_data: {
        setup_future_usage: 'off_session',
      },
    });

    console.log('Checkout session created:', session.id);

    return NextResponse.json({ 
      needsCheckout: true, 
      checkoutUrl: session.url 
    });

  } catch (error: any) {
    console.error('Quick purchase error:', error.message, error.stack);
    
    return NextResponse.json(
      { error: `Purchase failed: ${error.message}` },
      { status: 500 }
    );
  }
}
