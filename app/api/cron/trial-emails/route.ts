import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

// ── Email templates ────────────────────────────────────────────────────────

function emailDay3(name: string): { subject: string; html: string } {
  return {
    subject: `${name}, what are you listening to? 🎧`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><h1 style="color:#fff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">3 days in, ${name}!</h1><p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">You have 11 days left in your free trial. Have you found a story you love yet? Mystery, western, sci-fi, drama — we have something for every mile.</p><div style="text-align:center;margin-bottom:24px;"><a href="https://app.endless-tales.com/library" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;">Browse Stories</a></div><p style="color:rgba(255,255,255,0.5);font-size:13px;text-align:center;margin:0;">After your trial it is just $7.99/month. Cancel anytime before day 14.</p></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.</p></div></body></html>`
  }
}

function emailDay10(name: string): { subject: string; html: string } {
  return {
    subject: `4 days left in your Endless Tales trial`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><h1 style="color:#fff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Your trial ends in 4 days</h1><p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">Hey ${name} — you are on day 10 of your free trial. Keep listening at $7.99/month, or cancel before day 14 and you will not be charged a thing.</p><div style="text-align:center;margin-bottom:16px;"><a href="https://app.endless-tales.com/home" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;">Keep Listening</a></div><div style="text-align:center;margin-bottom:24px;"><a href="https://app.endless-tales.com/manage-subscription" style="display:inline-block;background:transparent;color:rgba(255,255,255,0.4);text-decoration:none;padding:10px 24px;border-radius:10px;font-size:13px;border:1px solid rgba(255,255,255,0.15);">Manage Subscription</a></div><p style="color:rgba(255,255,255,0.5);font-size:13px;text-align:center;margin:0;">No action needed to continue — your subscription starts automatically on day 14.</p></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.</p></div></body></html>`
  }
}

function emailDay13(name: string): { subject: string; html: string } {
  return {
    subject: `Last day of your free trial, ${name}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><h1 style="color:#fff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Today is your last free day</h1><p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">Hi ${name} — your 14-day trial ends tomorrow. Your subscription will start automatically at $7.99/month unless you cancel today.</p><div style="text-align:center;margin-bottom:16px;"><a href="https://app.endless-tales.com/home" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:800;">Keep My Subscription</a></div><div style="text-align:center;margin-bottom:24px;"><a href="https://app.endless-tales.com/manage-subscription" style="display:inline-block;background:transparent;color:rgba(255,255,255,0.4);text-decoration:none;padding:10px 24px;border-radius:10px;font-size:13px;border:1px solid rgba(255,255,255,0.15);">Cancel Before Charge</a></div><p style="color:rgba(255,255,255,0.5);font-size:13px;text-align:center;margin:0;">If you cancel today you will not be charged. We hope you stay.</p></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.</p></div></body></html>`
  }
}

// ── Cron handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel cron (or Marc in testing)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = { day3: 0, day10: 0, day13: 0, errors: 0 }

  // Fetch all trialing users with subscription_start set
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, first_name, display_name, subscription_start, subscription_type')
    .eq('subscription_type', 'active')
    .not('subscription_start', 'is', null)

  if (error || !users) {
    console.error('[trial-emails] Failed to fetch users:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  for (const user of users) {
    try {
      const start = new Date(user.subscription_start)
      const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const name = user.first_name || user.display_name || 'there'
      const email = user.email
      if (!email) continue

      let template: { subject: string; html: string } | null = null

      if (daysSinceStart === 3) {
        template = emailDay3(name)
        results.day3++
      } else if (daysSinceStart === 10) {
        template = emailDay10(name)
        results.day10++
      } else if (daysSinceStart === 13) {
        template = emailDay13(name)
        results.day13++
      }

      if (template) {
        await resend.emails.send({
          from: 'Endless Tales <hello@endless-tales.com>',
          to: email,
          subject: template.subject,
          html: template.html,
        })
        console.log(`[trial-emails] Day ${daysSinceStart} email sent to ${email}`)
      }
    } catch (err) {
      console.error('[trial-emails] Error for user', user.id, err)
      results.errors++
    }
  }

  console.log('[trial-emails] Done:', results)
  return NextResponse.json({ success: true, results })
}
