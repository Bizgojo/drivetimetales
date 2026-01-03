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
    // Get user ID from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get user's Stripe customer ID
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !user?.stripe_customer_id) {
      return NextResponse.json({ invoices: [], total_spent: 0 });
    }

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: user.stripe_customer_id,
      limit: 20,
      status: 'paid',
    });

    // Format invoices for the frontend
    const formattedInvoices = invoices.data.map((invoice) => {
      // Determine the type and description
      let type: 'subscription' | 'credit_pack' = 'subscription';
      let description = 'Subscription';
      let credits = 0;

      // Check line items for details
      if (invoice.lines.data.length > 0) {
        const lineItem = invoice.lines.data[0];
        const productName = lineItem.description || '';
        
        if (productName.toLowerCase().includes('test driver')) {
          description = 'Test Driver Monthly';
          credits = 10;
        } else if (productName.toLowerCase().includes('commuter')) {
          description = 'Commuter Monthly';
          credits = 30;
        } else if (productName.toLowerCase().includes('road warrior')) {
          description = 'Road Warrior Monthly';
          credits = -1; // Unlimited
        } else if (productName.toLowerCase().includes('small pack')) {
          type = 'credit_pack';
          description = 'Small Pack';
          credits = 10;
        } else if (productName.toLowerCase().includes('medium pack')) {
          type = 'credit_pack';
          description = 'Medium Pack';
          credits = 25;
        } else if (productName.toLowerCase().includes('large pack')) {
          type = 'credit_pack';
          description = 'Large Pack';
          credits = 60;
        } else {
          description = productName || 'Purchase';
        }
      }

      return {
        id: invoice.id,
        date: new Date(invoice.created * 1000).toISOString().split('T')[0],
        description,
        amount: (invoice.amount_paid || 0) / 100, // Convert cents to dollars
        credits,
        type,
        invoice_url: invoice.hosted_invoice_url,
        receipt_url: invoice.invoice_pdf,
      };
    });

    // Calculate totals
    const totalSpent = formattedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalCredits = formattedInvoices.reduce((sum, inv) => {
      if (inv.credits > 0) return sum + inv.credits;
      return sum;
    }, 0);

    return NextResponse.json({
      invoices: formattedInvoices,
      total_spent: totalSpent,
      total_credits: totalCredits,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
