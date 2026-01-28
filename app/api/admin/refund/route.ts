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
    const { chargeId, amount, userId, reason } = await request.json();

    if (!chargeId || !amount || !userId) {
      return NextResponse.json(
        { error: 'Charge ID, amount, and user ID are required' },
        { status: 400 }
      );
    }

    // Validate amount is positive
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Refund amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Get the charge to verify refund amount
    const charge = await stripe.charges.retrieve(chargeId);
    
    if (!charge) {
      return NextResponse.json(
        { error: 'Charge not found' },
        { status: 404 }
      );
    }

    const refundable = charge.amount - charge.amount_refunded;
    
    if (amount > refundable) {
      return NextResponse.json(
        { error: `Cannot refund more than $${(refundable / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    // Process the refund
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: amount, // Amount in cents
      reason: 'requested_by_customer',
      metadata: {
        admin_reason: reason || 'Admin initiated refund',
        user_id: userId,
        refunded_at: new Date().toISOString(),
      },
    });

    // Log the refund in our database
    await supabaseAdmin.from('refund_log').insert({
      user_id: userId,
      stripe_charge_id: chargeId,
      stripe_refund_id: refund.id,
      amount: amount,
      reason: reason || 'Admin initiated refund',
      status: refund.status,
    }).catch(err => {
      // Table might not exist yet, log but don't fail
      console.log('[Refund] Could not log to refund_log table:', err.message);
    });

    console.log('[Refund] Processed:', {
      refundId: refund.id,
      chargeId,
      amount: amount / 100,
      userId,
    });

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: amount,
      status: refund.status,
    });

  } catch (error: any) {
    console.error('[Refund] Error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
