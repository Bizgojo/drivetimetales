import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { renderDay1InstallEmail } from '@/lib/emails/retentionTemplates'

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
  const results = { day1: 0, day3: 0, day10: 0, day13: 0, errors: 0 }

  // ── Day-1 home-screen install email (RETENTION-PATH-001) ─────────────────
  // All users created 24-48h ago who haven't received it yet, regardless of
  // plan — the retention risk applies to anyone who signed up and may never
  // find the app again without a home-screen icon.
  // Requires migration 20260709170000_day1_email_sent_at.sql; if the column
  // is missing this block logs and skips without breaking day-3/10/13 sends.
  try {
    const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: day1Users, error: day1Error } = await supabase
      .from('users')
      .select('id, email, first_name, display_name, created_at, day1_email_sent_at')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .is('day1_email_sent_at', null)

    if (day1Error) {
      console.error('[trial-emails] Day-1 query failed (migration applied?):', day1Error.message)
    } else {
      for (const user of day1Users || []) {
        if (!user.email) continue
        try {
          const name = user.first_name || user.display_name || 'there'
          const template = renderDay1InstallEmail(name)
          await resend.emails.send({
            from: 'Endless Tales <hello@endless-tales.com>',
            to: user.email,
            subject: template.subject,
            html: template.html,
          })
          // Stamp AFTER a successful send; if the send throws we retry tomorrow
          // (user still inside the 24-48h window on the next daily run is rare,
          // but a missed stamp only risks one duplicate, never a silent skip).
          const { error: stampError } = await supabase
            .from('users')
            .update({ day1_email_sent_at: new Date().toISOString() })
            .eq('id', user.id)
          if (stampError) console.error('[trial-emails] Day-1 stamp failed for', user.id, stampError.message)
          results.day1++
          console.log(`[trial-emails] Day-1 install email sent to ${user.email}`)
        } catch (err) {
          console.error('[trial-emails] Day-1 send error for user', user.id, err)
          results.errors++
        }
      }
    }
  } catch (err) {
    console.error('[trial-emails] Day-1 block error:', err)
    results.errors++
  }

  // Fetch all trialing users with subscription_start set
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, first_name, display_name, plan, subscription_ends_at')
    .not('plan', 'is', null)
    .neq('plan', 'free')
    .not('subscription_ends_at', 'is', null)

  if (error || !users) {
    console.error('[trial-emails] Failed to fetch users:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  for (const user of users) {
    try {
      const trialEnd = new Date(user.subscription_ends_at)
      const start = new Date(trialEnd.getTime() - 14 * 24 * 60 * 60 * 1000)
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
