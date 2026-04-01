import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, code, days } = await req.json()
    if (!to || !subject || !body) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    await resend.emails.send({
      from: 'Marc at Endless Tales <hello@endless-tales.com>',
      to,
      subject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><div style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.8;white-space:pre-wrap;">${body}</div><div style="margin-top:24px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:16px 20px;text-align:center;"><div style="color:#f97316;font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Your Access Code</div><div style="color:#fff;font-size:28px;font-weight:900;letter-spacing:0.1em;">${code}</div><div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:4px;">${days} days free access</div></div><div style="text-align:center;margin-top:24px;"><a href="https://app.endless-tales.com/account/promo" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;">Redeem Your Code</a></div></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.</p></div></body></html>`,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[promo/send-code]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
