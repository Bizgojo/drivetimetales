// app/api/referral/route.ts
// API endpoints for referral system

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Get user's referral info
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const code = searchParams.get('code');

  // Validate a referral code
  if (code) {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, display_name, referral_code')
      .eq('referral_code', code.toUpperCase())
      .single();

    if (error || !user) {
      return NextResponse.json({ valid: false, error: 'Invalid referral code' });
    }

    return NextResponse.json({ 
      valid: true, 
      referrer_name: user.display_name || 'A friend',
      code: user.referral_code
    });
  }

  // Get user's referral stats
  if (userId) {
    try {
      // Get user's referral info
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('referral_code, referral_count, referral_tier, referral_credits_earned')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Get user's referrals list
      const { data: referrals, error: refError } = await supabase
        .from('referrals')
        .select(`
          id,
          status,
          created_at,
          completed_at,
          referred:referred_id (
            display_name,
            email,
            created_at
          )
        `)
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false });

      if (refError) throw refError;

      // Get tier info
      const { data: tiers } = await supabase
        .from('referral_tiers')
        .select('*')
        .order('min_referrals', { ascending: true });

      // Calculate next tier
      const currentTier = tiers?.find(t => t.tier_name === user.referral_tier);
      const nextTier = tiers?.find(t => t.min_referrals > (user.referral_count || 0));

      return NextResponse.json({
        referral_code: user.referral_code,
        referral_count: user.referral_count || 0,
        referral_tier: user.referral_tier || 'starter',
        credits_earned: user.referral_credits_earned || 0,
        referrals: referrals || [],
        current_tier: currentTier,
        next_tier: nextTier,
        tiers: tiers
      });
    } catch (error) {
      console.error('Error fetching referral data:', error);
      return NextResponse.json({ error: 'Failed to fetch referral data' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Missing userId or code parameter' }, { status: 400 });
}

// POST - Process a referral
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referral_code, referred_user_id } = body;

    if (!referral_code || !referred_user_id) {
      return NextResponse.json(
        { error: 'Missing referral_code or referred_user_id' },
        { status: 400 }
      );
    }

    // Call the database function to process the referral
    const { data, error } = await supabase.rpc('process_referral', {
      p_referrer_code: referral_code.toUpperCase(),
      p_referred_user_id: referred_user_id
    });

    if (error) {
      console.error('Error processing referral:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in referral POST:', error);
    return NextResponse.json({ error: 'Failed to process referral' }, { status: 500 });
  }
}
