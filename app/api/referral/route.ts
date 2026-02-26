import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    const { data, error } = await supabase.from('referrals').select('*').eq('referrer_id', userId);
    if (error) throw error;
    return NextResponse.json({ success: true, referrals: data || [], count: data?.length || 0 });
  } catch (error) {
    console.error('[Referral API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch referrals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referrerId, referredEmail } = body;
    if (!referrerId || !referredEmail) return NextResponse.json({ error: 'referrerId and referredEmail required' }, { status: 400 });
    const { data, error } = await supabase.from('referrals').insert({ referrer_id: referrerId, referred_email: referredEmail, status: 'pending', created_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, referral: data });
  } catch (error) {
    console.error('[Referral API] Error:', error);
    return NextResponse.json({ error: 'Failed to create referral' }, { status: 500 });
  }
}
