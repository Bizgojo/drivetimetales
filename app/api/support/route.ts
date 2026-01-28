import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .insert({
        user_id: userId || null,
        name,
        email,
        subject,
        message,
        status: 'new'
      })
      .select()
      .single();

    if (error) {
      console.error('[Support] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to submit message' },
        { status: 500 }
      );
    }

    console.log('[Support] Message saved:', data.id);
    return NextResponse.json({ success: true, id: data.id });

  } catch (error) {
    console.error('[Support] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit message' },
      { status: 500 }
    );
  }
}
