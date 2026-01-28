import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get user's Stripe customer ID
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.stripe_customer_id) {
      return NextResponse.json({ payments: [], message: 'No Stripe customer found' });
    }

    // Get all payment intents for this customer
    const paymentIntents = await stripe.paymentIntents.list({
      customer: user.stripe_customer_id,
      limit: 50,
    });

    // Get all charges (for more detailed info including refunds)
    const charges = await stripe.charges.list({
      customer: user.stripe_customer_id,
      limit: 50,
    });

    // Format payments with refund info
    const payments = charges.data
      .filter(charge => charge.status === 'succeeded')
      .map(charge => ({
        id: charge.id,
        paymentIntentId: charge.payment_intent,
        amount: charge.amount,
        amountRefunded: charge.amount_refunded,
        refundable: charge.amount - charge.amount_refunded,
        currency: charge.currency,
        description: charge.description || 'Subscription payment',
        date: new Date(charge.created * 1000).toISOString(),
        refunded: charge.refunded,
        receiptUrl: charge.receipt_url,
      }));

    return NextResponse.json({ 
      payments,
      customerEmail: user.email,
      customerId: user.stripe_customer_id
    });

  } catch (error) {
    console.error('[Payments] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
