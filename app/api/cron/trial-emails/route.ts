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

function emailDay2(name: string): { subject: string; html: string } {
  return {
    subject: `${name}, what are you listening to? 🎧`,
    html: `[EMAIL BODY PENDING — Marc to supply before this goes live]`
  }
}

function emailDay5(name: string): { subject: string; html: string } {
  return {
    subject: `2 days left in your Endless Tales trial`,
    html: `[EMAIL BODY PENDING — Marc to supply before this goes live]`
  }
}

function emailDay6(name: string): { subject: string; html: string } {
  return {
    subject: `Last day of your free trial, ${name}`,
    html: `[EMAIL BODY PENDING — Marc to supply before this goes live]`
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
  const results = { day1: 0, day2: 0, day5: 0, day6: 0, errors: 0 }

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
            from: 'Belle at Endless Tales <hello@endless-tales.com>',
            reply_to: 'hello@endless-tales.com',
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
      // Gate grants 7-day trial. Thresholds updated to 2/5/6 per ATL-GATE-002.
      const start = new Date(trialEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
      const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const name = user.first_name || user.display_name || 'there'
      const email = user.email
      if (!email) continue

      let template: { subject: string; html: string } | null = null

      if (daysSinceStart === 2) {
        template = emailDay2(name)
        results.day2++
      } else if (daysSinceStart === 5) {
        template = emailDay5(name)
        results.day5++
      } else if (daysSinceStart === 6) {
        template = emailDay6(name)
        results.day6++
      }

      if (template) {
        await resend.emails.send({
          from: 'Belle at Endless Tales <hello@endless-tales.com>',
          reply_to: 'hello@endless-tales.com',
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
