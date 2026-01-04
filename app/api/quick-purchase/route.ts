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

// Credit pack prices (in cents) and Stripe Price IDs
const CREDIT_PACKS = {
  small: { price: 499, credits: 10, name: 'Small Pack', priceId: 'price_1SjSxEG3QDdai0Zhi0BbuzED' },
  medium: { price: 999, credits: 25, name: 'Medium Pack', priceId: 'price_1SjSydG3QDdai0ZhUIYLwgzw' },
  large: { price: 1999, credits: 60, name: 'Large Pack', priceId: 'price_1SjT2LG3QDdai0ZhyG3JTuGY' },
};

// Helper function to create checkout session
async function createCheckoutSession(
  customerId: string, 
  userId: string, 
  pack: typeof CREDIT_PACKS['small'], 
  packId: string,
  returnUrl?: string
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://drivetimetales.vercel.app';
  const successUrl = returnUrl 
    ? `${baseUrl}/purchase-success?returnUrl=${encodeURIComponent(returnUrl)}&credits=${pack.credits}`
    : `${baseUrl}/library?purchased=${pack.credits}`;
  const cancelUrl = returnUrl || `${baseUrl}/pricing`;

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
    payment_intent_data: {
      setup_future_usage: 'off_session',
    },
  });

  return session.url!;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId, userId, returnUrl } = body;

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
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Ensure user has a Stripe customer ID
    let customerId = user.stripe_customer_id;
    
    if (!customerId) {
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

    // Check if user has a payment method
    let hasPaymentMethod = false;
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });
      hasPaymentMethod = paymentMethods.data.length > 0;
    } catch (e) {
      console.log('Error checking payment methods:', e);
      hasPaymentMethod = false;
    }

    // If no payment method, redirect to Stripe Checkout
    if (!hasPaymentMethod) {
      const checkoutUrl = await createCheckoutSession(customerId, userId, pack, packId, returnUrl);
      return NextResponse.json({ 
        needsCheckout: true, 
        checkoutUrl 
      });
    }

    // User has payment method - try to charge directly
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });
      
      const paymentMethodId = paymentMethods.data[0].id;

      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: pack.price,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `${pack.name} - ${pack.credits} credits`,
        metadata: {
          user_id: userId,
          pack_id: packId,
          credits: pack.credits.toString(),
        },
      });

      if (paymentIntent.status !== 'succeeded') {
        // Payment requires action - redirect to checkout
        console.log('Payment status:', paymentIntent.status);
        const checkoutUrl = await createCheckoutSession(customerId, userId, pack, packId, returnUrl);
        return NextResponse.json({ 
          needsCheckout: true, 
          checkoutUrl 
        });
      }

      // Payment successful - add credits to user
      const newCredits = user.credits === -1 ? -1 : (user.credits || 0) + pack.credits;
      
      await supabaseAdmin
        .from('users')
        .update({ credits: newCredits })
        .eq('id', userId);

      // Record the purchase in payment history
      try {
        await supabaseAdmin
          .from('payment_history')
          .insert({
            user_id: userId,
            amount: pack.price,
            credits: pack.credits,
            description: pack.name,
            status: 'completed',
          });
      } catch (e) {
        console.log('Could not record payment history:', e);
      }

      return NextResponse.json({ 
        success: true, 
        credits: newCredits,
        message: `Successfully purchased ${pack.credits} credits!`
      });
      
    } catch (stripeError: any) {
      console.error('Stripe charge error:', stripeError.message);
      
      // If card requires authentication or fails, redirect to checkout
      if (stripeError.code === 'authentication_required' || 
          stripeError.code === 'card_declined' ||
          stripeError.type === 'StripeCardError') {
        const checkoutUrl = await createCheckoutSession(customerId, userId, pack, packId, returnUrl);
        return NextResponse.json({ 
          needsCheckout: true, 
          checkoutUrl 
        });
      }
      
      throw stripeError;
    }

  } catch (error: any) {
    console.error('Quick purchase error:', error);
    
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card declined. Please update your payment method.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Purchase failed. Please try again.' },
      { status: 500 }
    );
  }
}
