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

    // Get user's Stripe subscription ID
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
    }

    // Cancel the subscription at period end (user keeps access until billing period ends)
    const subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update user in database
    await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'cancelling',
        subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
      })
      .eq('id', userId);

    console.log('[Cancel] Subscription cancelled for user:', userId);

    return NextResponse.json({ 
      success: true,
      endsAt: subscription.current_period_end 
    });

  } catch (error) {
    console.error('[Cancel] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
