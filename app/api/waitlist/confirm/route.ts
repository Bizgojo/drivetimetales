/**
 * POST /api/waitlist/confirm
 * Sends a warm confirmation email to a new waitlist signup.
 * Called from the landing page immediately after Supabase insert succeeds.
 *
 * Body: { email: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { email } = await req.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const { error } = await resend.emails.send({
      from: 'Endless Tales <hello@endless-tales.com>',
      to: email,
      subject: "You're in — we'll see you on launch day 🎧",
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

            <!-- Logo / Brand -->
            <div style="text-align:center;margin-bottom:32px;">
              <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Endless Tales</div>
              <div style="font-size:13px;color:#f97316;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">Audio Stories</div>
            </div>

            <!-- Main card -->
            <div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);">
              <div style="font-size:32px;text-align:center;margin-bottom:16px;">🎧</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">You're officially in.</h1>
              <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">
                Thanks for signing up for Endless Tales. We're putting the finishing touches on something special — original audio dramas made for people on the move.
              </p>
              <div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:20px;">
                <div style="color:#f97316;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Launch Day</div>
                <div style="color:#ffffff;font-size:24px;font-weight:900;">April 17, 2026</div>
                <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px;">We'll send you a link the moment we go live</div>
              </div>
              <p style="color:rgba(255,255,255,0.65);font-size:14px;line-height:1.6;margin:0;text-align:center;">
                Your 14-day free trial will be waiting. No credit card needed to start — just great stories.
              </p>
            </div>

            <!-- Footer -->
            <div style="text-align:center;margin-top:28px;">
              <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;line-height:1.6;">
                You're receiving this because you signed up at endless-tales.com.<br>
                Questions? Reply to this email — we actually read them.
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Confirm email error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
