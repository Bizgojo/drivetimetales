import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { ensureNamePoolForUser } from '@/lib/personalization/ensureNamePool';
import { renderWelcomeEmail } from '@/lib/emails/retentionTemplates';

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
    const heardAbout = typeof body.heardAbout === 'string' ? body.heardAbout : null;
    const displayName = firstName || email?.split('@')[0] || 'Friend';

    if (!id || !email) {
      return NextResponse.json({ error: 'userId and email are required' }, { status: 400 });
    }

    // Check if already exists in "User" base table
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, exists: true });
    }

    const insertPayload: Record<string, unknown> = {
      id,
      email,
      first_name: firstName,
      display_name: displayName,
      credits: 0,
      plan: 'free',
    };
    if (heardAbout) insertPayload.heard_about_us = heardAbout;

    // Insert into users table
    let { data, error } = await supabaseAdmin
      .from('users')
      .insert(insertPayload)
      .select()
      .single();

    if (error && /heard_about_us/i.test(error.message || '')) {
      delete insertPayload.heard_about_us;
      const retry = await supabaseAdmin
        .from('users')
        .insert(insertPayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[User Create] Insert error:', error);
      throw error;
    }

    try {
      await ensureNamePoolForUser(id, firstName);
    } catch (nameErr) {
      console.error('[User Create] Name pool keying failed:', nameErr);
    }

    // Send welcome email (non-blocking)
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const welcome = renderWelcomeEmail(displayName)
      await resend.emails.send({
        from: 'Endless Tales <hello@endless-tales.com>',
        to: email,
        subject: welcome.subject,
        html: welcome.html,
      })
    } catch (emailErr) {
      console.error('[User Create] Welcome email failed:', emailErr)
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error('[User Create] Error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
