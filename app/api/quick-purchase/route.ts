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

// Credit pack prices (in cents)
const CREDIT_PACKS = {
  small: { price: 499, credits: 10, name: 'Small Pack' },
  medium: { price: 999, credits: 25, name: 'Medium Pack' },
  large: { price: 1999, credits: 60, name: 'Large Pack' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId, userId } = body;

    console.log('Quick purchase request:', { packId, userId });

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

    // Get user data including Stripe customer ID
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

    // User must have a Stripe customer ID (from their subscription)
    if (!user.stripe_customer_id) {
      console.error('User has no Stripe customer ID');
      return NextResponse.json(
        { error: 'No payment method on file. Please subscribe first.' },
        { status: 400 }
      );
    }

    // Get the customer's default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: 'card',
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      console.error('No payment methods found for customer');
      return NextResponse.json(
        { error: 'No payment method on file. Please add a card to your account.' },
        { status: 400 }
      );
    }

    const paymentMethodId = paymentMethods.data[0].id;
    console.log('Using payment method:', paymentMethodId);

    // Create and confirm the payment intent in one step
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.price,
      currency: 'usd',
      customer: user.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Drive Time Tales - ${pack.name} (${pack.credits} credits)`,
      metadata: {
        user_id: userId,
        pack_id: packId,
        credits: pack.credits.toString(),
      },
    });

    console.log('Payment intent status:', paymentIntent.status);

    // Check if payment succeeded
    if (paymentIntent.status === 'succeeded') {
      // Payment successful - add credits to user
      const newCredits = user.credits === -1 ? -1 : (user.credits || 0) + pack.credits;
      
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ credits: newCredits })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating credits:', updateError);
        // Payment succeeded but credits failed - this is bad, log it
        return NextResponse.json(
          { error: 'Payment succeeded but failed to add credits. Please contact support.' },
          { status: 500 }
        );
      }

      console.log(`Credits updated: ${user.credits} -> ${newCredits}`);

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
            stripe_payment_intent_id: paymentIntent.id,
          });
      } catch (e) {
        console.log('Could not record payment history:', e);
        // Non-critical, continue
      }

      return NextResponse.json({ 
        success: true, 
        credits: newCredits,
        message: `Successfully purchased ${pack.credits} credits!`
      });
    } 
    else if (paymentIntent.status === 'requires_action') {
      // Card requires 3D Secure authentication
      return NextResponse.json(
        { error: 'Your card requires additional authentication. Please update your payment method.' },
        { status: 400 }
      );
    }
    else {
      // Payment failed for some other reason
      console.error('Payment failed with status:', paymentIntent.status);
      return NextResponse.json(
        { error: 'Payment failed. Please try again or update your payment method.' },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('Quick purchase error:', error.message, error.code);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card declined. Please update your payment method.' },
        { status: 400 }
      );
    }
    
    if (error.code === 'authentication_required') {
      return NextResponse.json(
        { error: 'Your card requires authentication. Please update your payment method.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Purchase failed: ${error.message}` },
      { status: 500 }
    );
  }
}
