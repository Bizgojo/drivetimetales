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

    if (!user.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No payment method on file. Please complete a purchase first.' },
        { status: 400 }
      );
    }

    // Get customer's default payment method
    const customer = await stripe.customers.retrieve(user.stripe_customer_id) as Stripe.Customer;
    
    if (!customer.invoice_settings?.default_payment_method && !customer.default_source) {
      // Try to get any payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripe_customer_id,
        type: 'card',
        limit: 1,
      });

      if (paymentMethods.data.length === 0) {
        return NextResponse.json(
          { error: 'No payment method on file. Please add a card first.' },
          { status: 400 }
        );
      }

      // Use the first available payment method
      const paymentMethodId = paymentMethods.data[0].id;

      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: pack.price,
        currency: 'usd',
        customer: user.stripe_customer_id,
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
        return NextResponse.json(
          { error: 'Payment failed. Please try again.' },
          { status: 400 }
        );
      }
    } else {
      // Use default payment method
      const paymentMethodId = (customer.invoice_settings?.default_payment_method || customer.default_source) as string;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: pack.price,
        currency: 'usd',
        customer: user.stripe_customer_id,
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
        return NextResponse.json(
          { error: 'Payment failed. Please try again.' },
          { status: 400 }
        );
      }
    }

    // Payment successful - add credits to user
    const newCredits = user.credits === -1 ? -1 : (user.credits || 0) + pack.credits;
    
    await supabaseAdmin
      .from('users')
      .update({ credits: newCredits })
      .eq('id', userId);

    // Record the purchase in payment history (if table exists)
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
      // Table might not exist, that's okay
      console.log('Could not record payment history:', e);
    }

    return NextResponse.json({ 
      success: true, 
      credits: newCredits,
      message: `Successfully purchased ${pack.credits} credits!`
    });

  } catch (error: any) {
    console.error('Quick purchase error:', error);
    
    // Handle specific Stripe errors
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
