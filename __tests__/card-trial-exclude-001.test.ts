/**
 * CARD-TRIAL-EXCLUDE-001 (2026-11-04) — card trials skip no-card cron copy.
 *
 * Scope: filter + test only. Smallest sufficient change per FINITE PROJECT rule.
 *
 * 1. cron trial-emails day2 / ends-in-two-days / ends-tomorrow query filters
 *    stripe_subscription_id IS NULL (card trials skip no-card copy).
 * 1b. reach-reminder cohort query filters stripe_subscription_id IS NULL too
 *    (2026-11-04 item 3 — same "No card, nothing to cancel" posture).
 * 2. welcome (checkout webhook) / day-1 install block / Stripe trial_will_end
 *    webhook are untouched.
 * 3. $0 — no sends, no network, no prod writes in this test (static source read).
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('CARD-TRIAL-EXCLUDE-001 filter', () => {
  const cronSrc = read('app/api/cron/trial-emails/route.ts')

  test('trial day2/5/6 cohort query filters stripe_subscription_id IS NULL', () => {
    // DB-level filter on the trialing-users query (day2/day5/day6 block).
    expect(cronSrc).toContain(".is('stripe_subscription_id', null)")
  })

  test('filter sits on the trial + reach cohort queries, not elsewhere', () => {
    const occurrences = cronSrc.split(".is('stripe_subscription_id', null)").length - 1
    // Exactly two filters: the trial day2/5/6 cohort AND the reach-reminder
    // cohort. Day-1 install must NOT gain this filter (day-1 applies
    // regardless of plan).
    expect(occurrences).toBe(2)
  })

  test('reach-reminder cohort query filters stripe_subscription_id IS NULL', () => {
    // CARD-TRIAL-EXCLUDE-001 item 3: card trials skip the no-card reach copy
    // ("No card, nothing to cancel") — same posture as day2/5/6.
    // The reach block selects last_reach_reminder_at; the filter must sit in
    // that same chained query.
    const reachIdx = cronSrc.indexOf('reachCohort')
    expect(reachIdx).toBeGreaterThan(-1)
    const reachBlock = cronSrc.slice(reachIdx, reachIdx + 1200)
    expect(reachBlock).toContain(".is('stripe_subscription_id', null)")
    expect(reachBlock).toContain('last_reach_reminder_at')
  })

  test('no-card copy preserved on day2/5/6 templates', () => {
    expect(cronSrc).toContain('No card, nothing to cancel')
    expect(cronSrc).toContain('Nothing will be charged')
  })

  test('day-1 install block untouched (still plan-agnostic, no card filter)', () => {
    // Day-1 block header comment intact.
    expect(cronSrc).toContain('Day-1 home-screen install email (RETENTION-PATH-001)')
    // Day-1 query must NOT filter on stripe_subscription_id (verified by
    // two-occurrence test above: trial cohort + reach cohort only), and still stamps day1_email_sent_at.
    expect(cronSrc).toContain('day1_email_sent_at')
  })

  test('Stripe trial_will_end webhook path untouched (card-trial counterpart)', () => {
    const webhookSrc = read('app/api/webhook/route.ts')
    expect(webhookSrc).toContain("case 'customer.subscription.trial_will_end'")
    expect(webhookSrc).toContain('renderTrialEndingReminderEmail')
    // Webhook still sets stripe_subscription_id on checkout (card-trial marker).
    expect(webhookSrc).toContain('stripe_subscription_id: session.subscription as string')
  })

  test('welcome email path untouched', () => {
    const webhookSrc = read('app/api/webhook/route.ts')
    // Checkout-completed welcome send still present.
    expect(webhookSrc).toContain('checkout completed')
  })
})
