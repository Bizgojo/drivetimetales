import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { renderDay1InstallEmail, renderReachEp2Email, shell, ctaButton } from '@/lib/emails/retentionTemplates'
import { unsubscribeUrl } from '@/lib/emails/unsubscribe'
import { MONTHLY_PRICE_DISPLAY, TRIAL_DAYS } from '@/lib/pricing'

// Reminder days, counted from trial start (see schedule note in GET).
const ENDS_IN_TWO_DAYS = TRIAL_DAYS - 2
const ENDS_TOMORROW = TRIAL_DAYS - 1

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

// ── Library URL constant (mirrors APP_HOME_URL pattern in retentionTemplates) ──
const APP_LIBRARY_URL = 'https://app.endless-tales.com/library'
const APP_PLAYER_BASE_URL = 'https://app.endless-tales.com/player'
// BELL-DAY1-LINK-001: Bell-invitation users seeded with EP2; day-1 email links
// directly to the EP2 player so bounced signups have a one-tap path back.
const BELL_EP2_STORY_ID = '759dc525-185c-450f-b249-17e4a525ba60'
const BELL_EP2_PLAYER_URL = `${APP_PLAYER_BASE_URL}/${BELL_EP2_STORY_ID}`

// ── REACH-REMINDERS-001 constants ──────────────────────────────────────────
// Day-offsets from trial_started_at on which a reach reminder may fire. Only
// these three days fire, so a user receives at most 3 reach emails, ever.
const REACH_REMINDER_DAYS = new Set([1, 3, 6])
// "Reached EP2" tie-breaker: user_library.progress (seconds) at/above this is
// treated as a genuine EP2 play even when play_events is thin (autoplay starts
// were historically under-recorded — see scope R1).
const REACH_PROGRESS_THRESHOLD = 30
// play_events rows to exclude from the "reached" signal (diagnostics only).
const DIAGNOSTIC_BEACON_ORIGIN = 'diagnostic_beacon'
const SPURIOUS_ENDED_STOP_REASON = 'spurious_ended_recovered'
const EP2_CARD_WALL_SHOWN_STOP_REASON = 'ep2_card_wall_shown' // #290 instrumentation marker

// ── Shared text styles for trial-retention email bodies ───────────────────
const P = 'color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 16px;'
const P_SIG = 'color:rgba(255,255,255,0.6);font-size:15px;font-style:italic;margin:20px 0 0;'

// ── Email templates ────────────────────────────────────────────────────────

/**
 * Day-2 trial email.
 * @param safeTitle   Most-recent in-progress story title (trimmed, non-empty), or null.
 * @param safeStoryId Most-recent in-progress story_id, or null.
 */
function emailDay2(name: string, safeTitle: string | null, safeStoryId: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Still with ${safeTitle}?`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">You started <strong style="color:#ffffff;">${safeTitle}</strong> — it's still there, right where you left off.</p>
        <p style="${P}">Your free trial is running, and it covers everything: every series, every standalone. No card, nothing to cancel.</p>
        <p style="${P}">Come back when you've got a quiet half hour.</p>
        ${ctaButton('Pick up where you left off', safeStoryId !== null ? `${APP_PLAYER_BASE_URL}/${safeStoryId}` : APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Your free trial is running, ${name}`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">The whole library is open to you for your whole trial — every series, every standalone. No card, nothing to cancel.</p>
      <p style="${P}">Most people find their favourite in the first couple of days. If you haven't started anything yet, have a wander.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

/**
 * Day-5 trial email.
 * @param safeTitle   Most-recent in-progress story title (trimmed, non-empty), or null.
 * @param safeStoryId Most-recent in-progress story_id, or null.
 */
function emailDay5(name: string, safeTitle: string | null, safeStoryId: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Two days left to finish ${safeTitle}`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">You're partway through <strong style="color:#ffffff;">${safeTitle}</strong>, and your free trial ends in two days.</p>
        <p style="${P}">Nothing will be charged and there's nothing to cancel — your access just ends, and the story stays exactly where you left it.</p>
        <p style="${P}">If you'd like to keep going, it's ${MONTHLY_PRICE_DISPLAY} a month and the whole library stays open.</p>
        ${ctaButton(`Finish ${safeTitle}`, safeStoryId !== null ? `${APP_PLAYER_BASE_URL}/${safeStoryId}` : APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Two days left, ${name}`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">Your free trial ends in two days, and there's still time to find something.</p>
      <p style="${P}">Nothing will be charged and there's nothing to cancel — your access simply ends.</p>
      <p style="${P}">If you'd like to keep the library open, it's ${MONTHLY_PRICE_DISPLAY} a month.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

/**
 * Day-6 trial email.
 * @param safeTitle   Most-recent in-progress story title (trimmed, non-empty), or null.
 * @param safeStoryId Most-recent in-progress story_id, or null.
 */
function emailDay6(name: string, safeTitle: string | null, safeStoryId: string | null): { subject: string; html: string } {
  if (safeTitle !== null) {
    // with-story variant
    return {
      subject: `Last day with ${safeTitle}`,
      html: shell(`
        <p style="${P}">Hi ${name}, it's Belle.</p>
        <p style="${P}">Your free trial ends tomorrow, and <strong style="color:#ffffff;">${safeTitle}</strong> is still waiting.</p>
        <p style="${P}">You won't be charged for anything — you just won't be able to keep listening. If you come back, the story will be where you left it.</p>
        <p style="${P}">${MONTHLY_PRICE_DISPLAY} a month keeps it all open.</p>
        ${ctaButton(`Finish ${safeTitle}`, safeStoryId !== null ? `${APP_PLAYER_BASE_URL}/${safeStoryId}` : APP_LIBRARY_URL)}
        <p style="${P_SIG}">— Belle</p>
      `)
    }
  }
  // no-story variant
  return {
    subject: `Last day of your free trial`,
    html: shell(`
      <p style="${P}">Hi ${name}, it's Belle.</p>
      <p style="${P}">Your free trial ends tomorrow.</p>
      <p style="${P}">You won't be charged for anything — you simply won't be able to keep listening after that.</p>
      <p style="${P}">${MONTHLY_PRICE_DISPLAY} a month keeps the whole library open.</p>
      ${ctaButton('Browse the library', APP_LIBRARY_URL)}
      <p style="${P_SIG}">— Belle</p>
    `)
  }
}

// ── REACH-REMINDERS-001 helpers ─────────────────────────────────────────────

/**
 * Pre-DDL-safe opt-out fetch. Returns the set of user ids with
 * email_opt_out = true, OR null if the column does not exist yet (migration
 * not applied). A null result means "cannot determine opt-out" — callers then
 * behave EXACTLY as the pre-REACH code did (suppress nobody on the opt-out
 * axis), so live trial/day-1 sends never break while the migration lags.
 */
async function fetchOptedOutUserIds(): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email_opt_out', true)
    if (error) {
      // 42703 = undefined_column (column does not exist yet).
      console.warn('[trial-emails] email_opt_out unavailable (migration pending?):', error.message)
      return null
    }
    return new Set((data || []).map((r) => r.id as string))
  } catch (err) {
    console.warn('[trial-emails] opt-out fetch threw:', err)
    return null
  }
}

/**
 * Decide a Bell user's EP2 reach segment at send time.
 *  - returns 'never'   → no genuine EP2 play (press-play copy)
 *  - returns 'partway' → opened EP2 but did not finish (finish-it copy)
 *  - returns null      → finished EP2, or signal says reached+done → SUPPRESS
 *
 * "Reached" = a non-diagnostic play_events row on EP2 OR user_library.progress
 * >= REACH_PROGRESS_THRESHOLD (the autoplay-under-recording tie-breaker, R1).
 * "Finished" = a 'completed' play_event on EP2 OR user_library.completed.
 * Recomputed every run, so a user who finished since the last send drops out.
 */
async function computeReachSegment(userId: string): Promise<'never' | 'partway' | null> {
  let reached = false
  let finished = false

  // play_events signal (authenticated player), diagnostics excluded.
  try {
    const { data: pe } = await supabase
      .from('play_events')
      .select('stop_reason, origin')
      .eq('user_id', userId)
      .eq('story_id', BELL_EP2_STORY_ID)
    for (const row of pe || []) {
      const origin = (row as { origin: string | null }).origin
      const stop = (row as { stop_reason: string | null }).stop_reason
      if (origin === DIAGNOSTIC_BEACON_ORIGIN) continue
      if (stop === SPURIOUS_ENDED_STOP_REASON) continue
      if (stop === EP2_CARD_WALL_SHOWN_STOP_REASON) continue // view marker, not a play
      reached = true
      if (stop === 'completed') finished = true
    }
  } catch (err) {
    console.warn('[trial-emails] reach play_events lookup failed for', userId, err)
  }

  // user_library fallback / tie-breaker.
  try {
    const { data: lib } = await supabase
      .from('user_library')
      .select('progress, completed')
      .eq('user_id', userId)
      .eq('story_id', BELL_EP2_STORY_ID)
      .maybeSingle()
    if (lib) {
      const progress = Number((lib as { progress: number | null }).progress ?? 0)
      const completed = Boolean((lib as { completed: boolean | null }).completed)
      if (progress >= REACH_PROGRESS_THRESHOLD) reached = true
      if (completed) finished = true
    }
  } catch (err) {
    console.warn('[trial-emails] reach user_library lookup failed for', userId, err)
  }

  if (finished) return null        // reached the goal → never email again
  return reached ? 'partway' : 'never'
}

// ── Cron handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel cron (or Marc in testing)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = { day1: 0, day2: 0, day5: 0, day6: 0, reach: 0, errors: 0 }

  // REACH-REMINDERS-001: enforce ONE Belle email per user per run. Any user id
  // added here by a higher-priority block is skipped by lower-priority blocks.
  // Priority (Marc, 2026-10-05): trial-ending (day 2/5/6) > reach > install(day-1).
  const emailedThisRun = new Set<string>()

  // REACH-REMINDERS-001 (CAN-SPAM): opt-out suppression, applied to EVERY send
  // path below (trial, reach, install). Pre-DDL-safe: null = column absent =
  // suppress nobody on this axis (identical to pre-REACH behavior).
  const optedOut = await fetchOptedOutUserIds()
  const isOptedOut = (id: string): boolean => (optedOut ? optedOut.has(id) : false)

  // ── Day-1 home-screen install email (RETENTION-PATH-001) ─────────────────
  // All users created 24-48h ago who haven't received it yet, regardless of
  // plan — the retention risk applies to anyone who signed up and may never
  // find the app again without a home-screen icon.
  // Requires migration 20260709170000_day1_email_sent_at.sql; if the column
  // is missing this block logs and skips without breaking day-3/10/13 sends.
  //
  // REACH-REMINDERS-001: this is now the LOWEST-priority block. It is defined
  // here but CALLED last (after the trial and reach blocks) so that a user who
  // already received a higher-priority Belle email this run is skipped, and so
  // opted-out users are suppressed.
  const runDay1InstallBlock = async (): Promise<void> => {
  try {
    const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: day1Users, error: day1Error } = await supabase
      .from('users')
      .select('id, email, first_name, display_name, created_at, day1_email_sent_at, signup_source')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .is('day1_email_sent_at', null)
      .not('is_test_account', 'is', true)

    if (day1Error) {
      console.error('[trial-emails] Day-1 query failed (migration applied?):', day1Error.message)
    } else {
      for (const user of day1Users || []) {
        if (!user.email) continue
        // REACH-REMINDERS-001: skip if already emailed this run (higher priority)
        // or opted out.
        if (emailedThisRun.has(user.id)) continue
        if (isOptedOut(user.id)) continue
        try {
          const name = user.first_name || user.display_name || 'there'
          // BELL-DAY1-LINK-001: bell-invitation signups get a direct EP2 link;
          // standard signups keep the /home link.
          const day1CtaUrl = user.signup_source === 'bell-invitation'
            ? BELL_EP2_PLAYER_URL
            : undefined
          const template = renderDay1InstallEmail(name, day1CtaUrl)
          await resend.emails.send({
            from: 'Belle at Endless Tales <hello@endless-tales.com>',
            replyTo: 'hello.endlesstales@gmail.com',
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
          emailedThisRun.add(user.id)
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
  }

  // Fetch all trialing users with subscription_start set
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, first_name, display_name, plan, subscription_ends_at, trial_started_at')
    .not('plan', 'is', null)
    .neq('plan', 'free')
    .not('subscription_ends_at', 'is', null)
    .not('is_test_account', 'is', true)

  if (error || !users) {
    console.error('[trial-emails] Failed to fetch users:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  for (const user of users) {
    try {
      const trialEnd = new Date(user.subscription_ends_at)
      // Trial length = TRIAL_DAYS (lib/pricing.ts). ATL-GATE-002 schedule,
      // anchored to the trial END so the copy stays true for any length:
      // day 2 "trial is running", TRIAL_DAYS-2 "ends in two days",
      // TRIAL_DAYS-1 "ends tomorrow" (= 2/5/6 for 7 days, 2/12/13 for 14).
      const start = user.trial_started_at
        ? new Date(user.trial_started_at)
        : new Date(trialEnd.getTime() - TRIAL_DAYS * 24 * 60 * 60 * 1000)
      const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const name = user.first_name || user.display_name || 'there'
      const email = user.email
      if (!email) continue
      // REACH-REMINDERS-001 (CAN-SPAM): opted-out users are suppressed from the
      // existing trial sends too (not just reach). Pre-DDL-safe (see isOptedOut).
      if (isOptedOut(user.id)) continue

      // ── Story lookup for variant selection ───────────────────────────────────
      // Only query when this user is actually in a send window.
      let safeTitle: string | null = null
      let safeStoryId: string | null = null
      if (daysSinceStart === 2 || daysSinceStart === ENDS_IN_TWO_DAYS || daysSinceStart === ENDS_TOMORROW) {
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const storyId: string | null = (libraryRow as any)?.story_id ?? null
          safeStoryId = (typeof storyId === 'string' && storyId.trim().length > 0) ? storyId.trim() : null
        } catch {
          safeTitle = null
        }
        if (safeTitle === null) {
          console.warn('[trial-emails] No in-progress story for user', user.id, '— sending no-story variant')
        }
      }

      let template: { subject: string; html: string } | null = null
      let kind: 'day2' | 'day5' | 'day6' | null = null

      if (daysSinceStart === 2) {
        template = emailDay2(name, safeTitle, safeStoryId)
        kind = 'day2'
      } else if (daysSinceStart === ENDS_IN_TWO_DAYS) {
        template = emailDay5(name, safeTitle, safeStoryId)
        kind = 'day5'
      } else if (daysSinceStart === ENDS_TOMORROW) {
        template = emailDay6(name, safeTitle, safeStoryId)
        kind = 'day6'
      }

      if (template && kind) {
        await resend.emails.send({
          from: 'Belle at Endless Tales <hello@endless-tales.com>',
          replyTo: 'hello.endlesstales@gmail.com',
          to: email,
          subject: template.subject,
          html: template.html,
        })
        // REACH-REMINDERS-001: trial-ending is top priority — mark the user so the
        // reach and day-1 blocks skip them this run (one Belle email per run).
        // Count AFTER a successful send (prevents counting a throwing send).
        emailedThisRun.add(user.id)
        results[kind]++
        console.log(`[trial-emails] Day ${daysSinceStart} email sent to ${email}`)
      }
    } catch (err) {
      console.error('[trial-emails] Error for user', user.id, err)
      results.errors++
    }
  }

  // ── REACH-REMINDERS-001: EP2-reach reminder block (SECOND priority) ───────
  // Bell signups in an active no-card trial who have NOT finished EP2, nudged
  // back to the EP2 player on day-offsets +1/+3/+6 from trial_started_at
  // (max 3 ever). Runs AFTER the trial block (so trial-ending wins) and BEFORE
  // the day-1 install block (so reach wins over install).
  //
  // PRE-DDL-SAFE: the cohort query selects last_reach_reminder_at. If that
  // column is absent (migration pending), the SELECT errors — we detect it,
  // log, and SKIP the entire reach block, leaving all existing sends intact.
  try {
    const { data: reachCohort, error: reachError } = await supabase
      .from('users')
      .select('id, email, first_name, display_name, trial_started_at, last_reach_reminder_at')
      .eq('signup_source', 'bell-invitation')
      .eq('subscription_type', 'trial')
      .gt('subscription_ends_at', now.toISOString())
      .not('is_test_account', 'is', true)
      .not('email', 'is', null)

    if (reachError) {
      // 42703 undefined_column (last_reach_reminder_at / subscription_type) or
      // any other error → skip the reach block entirely, never break the run.
      console.warn('[trial-emails] reach cohort query failed (migration pending?):', reachError.message)
    } else {
      // Re-send guard window: a same-day cron retry must not double-send. A send
      // stamps last_reach_reminder_at; within 20h we treat the user as already
      // reminded this cycle.
      const resendGuardMs = 20 * 60 * 60 * 1000
      for (const user of reachCohort || []) {
        try {
          if (!user.email) continue
          if (emailedThisRun.has(user.id)) continue          // trial-ending already won
          if (isOptedOut(user.id)) continue                  // CAN-SPAM suppression
          if (!user.trial_started_at) continue

          const start = new Date(user.trial_started_at)
          const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          if (!REACH_REMINDER_DAYS.has(daysSinceStart)) continue  // only +1/+3/+6 fire (max 3)

          // Re-send guard: stamped within the last 20h → skip (retry safety).
          if (user.last_reach_reminder_at) {
            const last = new Date(user.last_reach_reminder_at).getTime()
            if (Number.isFinite(last) && now.getTime() - last < resendGuardMs) continue
          }

          // Segment recomputed at send time; null = finished EP2 → suppress.
          const segment = await computeReachSegment(user.id)
          if (segment === null) continue

          const name = user.first_name || user.display_name || 'there'
          const template = renderReachEp2Email(name, segment, BELL_EP2_PLAYER_URL, unsubscribeUrl(user.id))
          await resend.emails.send({
            from: 'Belle at Endless Tales <hello@endless-tales.com>',
            replyTo: 'hello.endlesstales@gmail.com',
            to: user.email,
            subject: template.subject,
            html: template.html,
          })
          // Stamp AFTER a successful send (same posture as day-1); a missed
          // stamp risks at most one duplicate, never a silent skip.
          const { error: stampError } = await supabase
            .from('users')
            .update({ last_reach_reminder_at: new Date().toISOString() })
            .eq('id', user.id)
          if (stampError) console.error('[trial-emails] reach stamp failed for', user.id, stampError.message)
          emailedThisRun.add(user.id)
          results.reach++
          console.log(`[reach-reminder] sent seg=${segment} day=${daysSinceStart} user=${user.id}`)
        } catch (err) {
          console.error('[trial-emails] reach send error for user', user.id, err)
          results.errors++
        }
      }
    }
  } catch (err) {
    console.error('[trial-emails] reach block error:', err)
    results.errors++
  }

  // ── Day-1 install (LOWEST priority) — runs last so trial + reach win ──────
  await runDay1InstallBlock()

  console.log('[trial-emails] Done:', results)
  return NextResponse.json({ success: true, results })
}
