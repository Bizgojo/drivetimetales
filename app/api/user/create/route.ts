import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.userId || body.id;
    const email = body.email;
    const firstName = body.firstName || body.first_name || '';
    const displayName = firstName || email?.split('@')[0] || 'Friend';

    if (!id || !email) {
      return NextResponse.json({ error: 'userId and email are required' }, { status: 400 });
    }

    // Check if already exists in "User" base table
    const { data: existing } = await supabaseAdmin
      .from('User')
      .select('id')
      .eq('id', id)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, exists: true });
    }

    // Insert into base "User" table using correct camelCase columns
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('User')
      .insert({
        id,
        email,
        firstName,
        name: displayName,
        subscriptionTier: 'free',
        creditsRemaining: 2,
        createdAt: now,
        updatedAt: now,
        state: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('[User Create] Insert error:', error);
      throw error;
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error('[User Create] Error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
