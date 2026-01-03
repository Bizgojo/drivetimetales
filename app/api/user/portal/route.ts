import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get user ID from query params or auth header
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      // Redirect to login if no user ID
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Get user's Stripe customer ID
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !user?.stripe_customer_id) {
      return NextResponse.redirect(new URL('/account/billing?error=no_customer', request.url));
    }

    // Create a Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://drivetimetales.vercel.app'}/account/billing`,
    });

    // Redirect to the Stripe portal
    return NextResponse.redirect(portalSession.url);
  } catch (error) {
    console.error('Error creating portal session:', error);
    return NextResponse.redirect(new URL('/account/billing?error=portal_failed', request.url));
  }
}
