// CARD-ON-FILE-001 (2026-10-05, Marc GO):
// Card-on-file becomes the STANDARD for every signup funnel: hosted Stripe
// Checkout captures a payment method up front (payment_method_collection:
// 'always'), the trial auto-charges at trial end, dunning is LENIENT (past_due
// KEEPS access while Stripe retries), and a warm trial-ending reminder fires
// once from the Stripe webhook.
//
// Test style mirrors the repo: pure-function unit tests for the new guard plus
// source-text assertions that the load-bearing wiring is present (same approach
// as cancel-state-001.test.ts / atl-pixel-001.test.ts).

import fs from 'fs'
import path from 'path'
import { isActivatableStatus, isAccessPreservingStatus } from '@/lib/webhookGuards'
import { renderTrialEndingReminderEmail } from '@/lib/emails/retentionTemplates'
import { hasActiveSubscription } from '@/lib/subscription'
import { MONTHLY_PRICE_LABEL, ANNUAL_PRICE_LABEL } from '@/lib/pricing'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

// ── 1. Checkout always collects a card (payment_method_collection: 'always') ──
describe('CARD-ON-FILE-001: checkout captures a card even with a trial', () => {
  const src = read('app/api/checkout/route.ts')

  it("sets payment_method_collection: 'always' on the Checkout session", () => {
    expect(src).toContain("payment_method_collection: 'always'")
  })

  it('still creates a subscription-mode session with a trial (reused primitives intact)', () => {
    expect(src).toContain("mode: 'subscription'")
    expect(src).toContain('trial_period_days: trialDays > 0 ? trialDays : undefined')
  })

  it('preserves the source=go server-side trial branch and the TRIAL_DAYS floor', () => {
    expect(src).toContain("source === 'go'")
    expect(src).toContain('Math.max(trialDays, TRIAL_DAYS)')
  })

  it('preserves the customer-name backfill (ATL-CHECKOUT-HYGIENE-001) and attribution metadata', () => {
    expect(src).toContain('customerName')
    expect(src).toContain('compactMetadata(campaignMetadata)')
  })
})

// ── 2. Lenient dunning: past_due KEEPS access ─────────────────────────────────
describe('CARD-ON-FILE-001: isAccessPreservingStatus (lenient dunning)', () => {
  it('keeps access for active, trialing AND past_due', () => {
    expect(isAccessPreservingStatus('active')).toBe(true)
    expect(isAccessPreservingStatus('trialing')).toBe(true)
    expect(isAccessPreservingStatus('past_due')).toBe(true)
  })

  it('does NOT keep access for terminal / non-live states', () => {
    expect(isAccessPreservingStatus('canceled')).toBe(false)
    expect(isAccessPreservingStatus('unpaid')).toBe(false)
    expect(isAccessPreservingStatus('incomplete_expired')).toBe(false)
    expect(isAccessPreservingStatus(null)).toBe(false)
    expect(isAccessPreservingStatus(undefined)).toBe(false)
  })

  it('isActivatableStatus is LEFT UNCHANGED (past_due must NOT re-activate a checkout replay)', () => {
    // Replay-safety (WEBHOOK-REPLAY-001) must not loosen: past_due is not activatable.
    expect(isActivatableStatus('active')).toBe(true)
    expect(isActivatableStatus('trialing')).toBe(true)
    expect(isActivatableStatus('past_due')).toBe(false)
    expect(isActivatableStatus('canceled')).toBe(false)
  })
})

describe('CARD-ON-FILE-001: webhook subscription.updated keeps access during past_due', () => {
  const src = read('app/api/webhook/route.ts')

  it('uses isAccessPreservingStatus (not isActivatableStatus) to gate deactivation', () => {
    expect(src).toContain('const keepsAccess = isAccessPreservingStatus(status)')
    // plan + subscription_type now follow keepsAccess, so past_due stays active.
    expect(src).toContain('subscription_type: keepsAccess ? \'active\' : null,')
  })

  it('extends subscription_ends_at into a future grace horizon during past_due', () => {
    // Without this, hasActiveSubscription() would revoke access because Stripe's
    // current_period_end is already in the past on a failed renewal.
    expect(src).toContain('const isPastDue = status === \'past_due\'')
    expect(src).toContain('PAST_DUE_GRACE_DAYS')
    expect(src).toContain('endsAtToWrite')
  })

  it('invoice.payment_failed still does NOT cut off access, and documents the Dashboard retry step', () => {
    expect(src).toContain('Smart Retries')
    expect(src).toContain('DASHBOARD REQUIRED')
  })

  // The exact data contract the webhook relies on: active + future end-date = access.
  it('access logic: active subscription_type with a future ends_at grants access (past_due grace model)', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    expect(hasActiveSubscription({ subscription_type: 'active', subscription_ends_at: future })).toBe(true)
    // A stale (expired) end-date would have revoked access despite active type:
    const past = new Date(Date.now() - 1000).toISOString()
    expect(hasActiveSubscription({ subscription_type: 'active', subscription_ends_at: past })).toBe(false)
  })
})

// ── 3. Warm trial-ending reminder, sent once from the webhook ─────────────────
describe('CARD-ON-FILE-001: trial_will_end warm reminder', () => {
  const webhook = read('app/api/webhook/route.ts')

  it('webhook handles customer.subscription.trial_will_end and sends exactly one email', () => {
    expect(webhook).toContain("case 'customer.subscription.trial_will_end':")
    expect(webhook).toContain('renderTrialEndingReminderEmail')
    // single resend.emails.send inside the case (one email, not a loop)
    const caseStart = webhook.indexOf("case 'customer.subscription.trial_will_end':")
    const caseEnd = webhook.indexOf('default:', caseStart)
    const caseBody = webhook.slice(caseStart, caseEnd)
    const sendCount = (caseBody.match(/resend\.emails\.send/g) || []).length
    expect(sendCount).toBe(1)
  })

  it('email copy is warm, honest about the upcoming charge, and has a cancel path', () => {
    const monthly = renderTrialEndingReminderEmail('Marc', MONTHLY_PRICE_LABEL, 3)
    expect(monthly.subject).toContain('3 days')
    expect(monthly.html).toContain('Marc')
    expect(monthly.html).toContain(MONTHLY_PRICE_LABEL)
    expect(monthly.html.toLowerCase()).toContain('cancel')
    expect(monthly.html).toContain('/account/billing')
  })

  it('respects billing cycle (annual price label) and pluralises days', () => {
    const annual = renderTrialEndingReminderEmail('Sam', ANNUAL_PRICE_LABEL, 1)
    expect(annual.html).toContain(ANNUAL_PRICE_LABEL)
    expect(annual.subject).toContain('1 day')
    expect(annual.subject).not.toContain('1 days')
  })

  it('falls back to a friendly name and a 3-day default', () => {
    const t = renderTrialEndingReminderEmail('')
    expect(t.html).toContain('there')
    expect(t.subject).toContain('3 days')
  })
})
