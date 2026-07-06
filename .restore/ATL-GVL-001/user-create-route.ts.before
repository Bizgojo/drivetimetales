import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { ensureNamePoolForUser } from '@/lib/personalization/ensureNamePool';

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
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, exists: true });
    }

    // Insert into users table
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        id,
        email,
        first_name: firstName,
        display_name: displayName,
        credits: 0,
        plan: 'free',
      })
      .select()
      .single();

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
      await resend.emails.send({
        from: 'Endless Tales <hello@endless-tales.com>',
        to: email,
        subject: 'Welcome to Endless Tales 🎧',
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
              <div style="text-align:center;margin-bottom:32px;">
                <img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;object-fit:contain;display:inline-block;" />
                <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div>
              </div>
              <div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);">
                <div style="font-size:32px;text-align:center;margin-bottom:16px;">🎧</div>
                <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Welcome${displayName && displayName !== 'Friend' ? `, ${displayName}` : ''}!</h1>
                <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">
                  Your 14-day free trial has started. Dive in and discover original audio dramas made for people on the move.
                </p>
                <div style="text-align:center;margin-bottom:24px;">
                  <a href="https://app.endless-tales.com/home" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;letter-spacing:0.01em;">Start Listening →</a>
                </div>
                <div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
                  <div style="color:#f97316;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your trial includes</div>
                  <div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.8;">
                    ✓ Full access to all audio stories<br>
                    ✓ New stories added weekly<br>
                    ✓ Listen anywhere — commute, gym, road trip<br>
                    ✓ Cancel anytime before day 14 — no charge
                  </div>
                </div>
                <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0;text-align:center;">
                  After your trial, it's just $7.99/month. Questions? Reply to this email.
                </p>
              </div>
              <div style="text-align:center;margin-top:28px;">
                <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;line-height:1.6;">
                  You're receiving this because you created an account at endless-tales.com.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
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
