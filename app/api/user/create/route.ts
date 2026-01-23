import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client - bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept both naming conventions
    const id = body.userId || body.id;
    const email = body.email;
    const displayName = body.firstName || body.display_name || email?.split('@')[0];

    console.log('[User Create] Request:', { id, email, displayName });

    if (!id || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (existing) {
      console.log('[User Create] User already exists:', id);
      return NextResponse.json({ success: true, exists: true });
    }

    // Create new user with defaults matching DB schema
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        id,
        email,
        display_name: displayName,
        plan: 'free',
        credits: 2,
      })
      .select()
      .single();

    if (error) {
      console.error('[User Create] Insert error:', error);
      throw error;
    }

    console.log('[User Create] Success:', data.id);
    return NextResponse.json({ success: true, user: data });

  } catch (error) {
    console.error('[User Create] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
