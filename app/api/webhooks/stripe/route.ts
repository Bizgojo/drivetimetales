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

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const MONTHLY_CREDITS = 10;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('Webhook event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) {
          console.error('No user ID in session metadata');
          break;
        }

        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('credits')
          .eq('id', userId)
          .single();

        const currentCredits = userData?.credits || 0;
        const newCredits = currentCredits === -1 ? -1 : currentCredits + MONTHLY_CREDITS;

        await supabaseAdmin
          .from('users')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_type: 'test_driver',
            subscription_status: 'active',
            credits: newCredits,
          })
          .eq('id', userId);

        console.log(`Added ${MONTHLY_CREDITS} credits to user ${userId}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        if (invoice.billing_reason === 'subscription_create') break;

        const customerId = invoice.customer as string;

        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id, credits')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!userData) break;

        const newCredits = userData.credits === -1 ? -1 : (userData.credits || 0) + MONTHLY_CREDITS;

        await supabaseAdmin
          .from('users')
          .update({ credits: newCredits })
          .eq('id', userData.id);

        console.log(`Renewed: added ${MONTHLY_CREDITS} credits to user ${userData.id}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          await supabaseAdmin
            .from('users')
            .update({ subscription_status: 'canceled', stripe_subscription_id: null })
            .eq('id', userData.id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          await supabaseAdmin
            .from('users')
            .update({ subscription_status: subscription.status })
            .eq('id', userData.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          await supabaseAdmin
            .from('users')
            .update({ subscription_status: 'past_due' })
            .eq('id', userData.id);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
