/**
 * POST /api/waitlist/broadcast
 * Sends the April 17 launch day email to all waitlist subscribers.
 * Protected by BROADCAST_SECRET env var.
 *
 * Body: { secret: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LAUNCH_EMAIL_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Endless Tales</div>
      <div style="font-size:13px;color:#f97316;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">Audio Stories</div>
    </div>

    <div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);">
      <div style="font-size:36px;text-align:center;margin-bottom:16px;">🚀</div>
      <h1 style="color:#ffffff;font-size:24px;font-weight:800;text-align:center;margin:0 0 16px;">We're live. Your free trial is ready.</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 24px;text-align:center;">
        Today is the day. Endless Tales is officially open — and your 14-day free trial is waiting for you right now.
      </p>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://endless-tales.com/welcome" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:800;letter-spacing:0.01em;">Start your free trial →</a>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;margin-top:4px;">
        <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.7;margin:0;text-align:center;">
          Mystery. Thriller. Romance. Drama. Horror.<br>
          New stories every week. Zero ads. Cancel anytime.<br><br>
          <strong style="color:#f97316;">$7.99/month after your trial — no credit card needed to start.</strong>
        </p>
      </div>
    </div>

    <div style="text-align:center;margin-top:28px;">
      <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;line-height:1.6;">
        You signed up for early access at endless-tales.com.<br>
        Questions? Reply to this email — we actually read them.
      </p>
    </div>

  </div>
</body>
</html>
`

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json()

    if (secret !== process.env.BROADCAST_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all waitlist emails
    const { data: waitlist, error: fetchErr } = await supabase
      .from('waitlist')
      .select('email')
      .order('created_at', { ascending: true })

    if (fetchErr) throw new Error(`Supabase error: ${fetchErr.message}`)
    if (!waitlist || waitlist.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No waitlist entries found' })
    }

    const emails = waitlist.map(r => r.email).filter(Boolean)
    console.log(`📧 Broadcasting to ${emails.length} waitlist subscribers...`)

    // Send in batches of 50 (Resend batch limit)
    const BATCH_SIZE = 50
    let sent = 0
    let failed = 0

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE)
      const batchEmails = batch.map(email => ({
        from: 'Endless Tales <hello@endless-tales.com>',
        to: email,
        subject: "🚀 We're live — your free trial is ready",
        html: LAUNCH_EMAIL_HTML,
      }))

      try {
        const { error } = await resend.batch.send(batchEmails)
        if (error) {
          console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error)
          failed += batch.length
        } else {
          sent += batch.length
          console.log(`✅ Batch ${i / BATCH_SIZE + 1}: ${sent}/${emails.length} sent`)
        }
      } catch (err) {
        console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err)
        failed += batch.length
      }

      // Small delay between batches
      if (i + BATCH_SIZE < emails.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return NextResponse.json({
      success: true,
      total: emails.length,
      sent,
      failed,
      message: `Broadcast complete: ${sent} sent, ${failed} failed`,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Broadcast error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
