import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { renderDay1InstallEmail, shell, ctaButton } from '@/lib/emails/retentionTemplates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

// ── Library URL constant (mirrors APP_HOME_URL pattern in retentionTemplates) ──
const APP_LIBRARY_URL = 'https://app.endless-tales.com/library'

// ── Shared text styles for trial-retention email bodies ───────────────────
const P = 'color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 16px;'
const P_SIG = 'color:rgba(255,255,255,0.6);font-size:15px;font-style:italic;margin:20px 0 0;'

// ── Email templates ────────────────────────────────────────────────────────

/**
 * Day-2 trial email.
 * @param safeTitle  Most-recent in-progress story title (trimmed, non-empty), or null.
 */
function emailDay2(name: string, safeTitle: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Still with ${safeTitle}?`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">You started <strong style="color:#ffffff;">${safeTitle}</strong> — it's still there, right where you left off.</p>
        <p style="${P}">Your free week is running, and it covers everything: every series, every standalone. No card, nothing to cancel.</p>
        <p style="${P}">Come back when you've got a quiet half hour.</p>
        ${ctaButton('Pick up where you left off', APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Your free week is running, ${name}`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">The whole library is open to you this week — every series, every standalone. No card, nothing to cancel.</p>
      <p style="${P}">Most people find their favourite in the first couple of days. If you haven't started anything yet, have a wander.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

/**
 * Day-5 trial email.
 * @param safeTitle  Most-recent in-progress story title (trimmed, non-empty), or null.
 */
function emailDay5(name: string, safeTitle: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Two days left to finish ${safeTitle}`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">You're partway through <strong style="color:#ffffff;">${safeTitle}</strong>, and your free week ends in two days.</p>
        <p style="${P}">Nothing will be charged and there's nothing to cancel — your access just ends, and the story stays exactly where you left it.</p>
        <p style="${P}">If you'd like to keep going, it's $7.99 a month and the whole library stays open.</p>
        ${ctaButton(`Finish ${safeTitle}`, APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Two days left, ${name}`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">Your free week ends in two days, and there's still time to find something.</p>
      <p style="${P}">Nothing will be charged and there's nothing to cancel — your access simply ends.</p>
      <p style="${P}">If you'd like to keep the library open, it's $7.99 a month.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

/**
 * Day-6 trial email.
 * @param safeTitle  Most-recent in-progress story title (trimmed, non-empty), or null.
 */
function emailDay6(name: string, safeTitle: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Last day with ${safeTitle}`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">Your free week ends tomorrow, and <strong style="color:#ffffff;">${safeTitle}</strong> is still waiting.</p>
        <p style="${P}">You won't be charged for anything — you just won't be able to keep listening. If you come back, the story will be where you left it.</p>
        <p style="${P}">$7.99 a month keeps it all open.</p>
        ${ctaButton(`Finish ${safeTitle}`, APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Last day of your free week`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">Your free week ends tomorrow.</p>
      <p style="${P}">You won't be charged for anything — you simply won't be able to keep listening after that.</p>
      <p style="${P}">$7.99 a month keeps the whole library open.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

// ── Cron handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // DISABLED — email copy is placeholder. Remove this block after Marc supplies real copy.
  const EMAIL_COPY_READY = false;
  if (!EMAIL_COPY_READY) {
    console.log('[trial-emails] Cron skipped — email copy is placeholder. Set EMAIL_COPY_READY = true after copy lands.');
    return NextResponse.json({ skipped: true, reason: 'email_copy_placeholder' });
  }

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

      // ── Story lookup for variant selection ───────────────────────────────────
      // Only query when this user is actually in a send window.
      let safeTitle: string | null = null
      if (daysSinceStart === 2 || daysSinceStart === 5 || daysSinceStart === 6) {
        try {
          const { data: libraryRow } = await supabase
            .from('user_library')
            .select('story_id, last_played, stories(title)')
            .eq('user_id', user.id)
            .eq('completed', false)
            .order('last_played', { ascending: false })
            .limit(1)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const storyTitle: string | null = (libraryRow as any)?.stories?.title ?? null
          safeTitle = (typeof storyTitle === 'string' && storyTitle.trim().length > 0) ? storyTitle.trim() : null
        } catch {
          safeTitle = null
        }
        if (safeTitle === null) {
          console.warn('[trial-emails] No in-progress story for user', user.id, '— sending no-story variant')
        }
      }

      let template: { subject: string; html: string } | null = null

      if (daysSinceStart === 2) {
        template = emailDay2(name, safeTitle)
        results.day2++
      } else if (daysSinceStart === 5) {
        template = emailDay5(name, safeTitle)
        results.day5++
      } else if (daysSinceStart === 6) {
        template = emailDay6(name, safeTitle)
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
