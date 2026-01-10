import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, cancelSubscription } from '@/lib/stripe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/user/cancel-subscription - Cancel user's subscription
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's Stripe customer ID
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, stripe_subscription_id, subscription_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userData.subscription_type === 'free') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    if (!userData.stripe_subscription_id) {
      // Try to find subscription from Stripe
      if (userData.stripe_customer_id) {
        const subscriptions = await stripe.subscriptions.list({
          customer: userData.stripe_customer_id,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length === 0) {
          return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
        }

        // Cancel the subscription
        await cancelSubscription(subscriptions.data[0].id);
      } else {
        return NextResponse.json({ error: 'No subscription to cancel' }, { status: 400 });
      }
    } else {
      // Cancel using stored subscription ID
      await cancelSubscription(userData.stripe_subscription_id);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Subscription will be canceled at the end of the billing period' 
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
