// PRICING-TRIAL-001: single source for price + trial; granted trial is 14 on every path.
import * as pricing from '@/lib/pricing'
import { BASE_TRIAL_DAYS } from '@/lib/promo'
import { GO_BASE_TRIAL_DAYS, GO_MONTHLY_PRICE_DISPLAY } from '@/lib/landing'
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('lib/pricing.ts', () => {
  it('matches the Stripe prices and the flat 14-day trial', () => {
    expect(pricing.MONTHLY_PRICE_USD).toBe(9.99)
    expect(pricing.ANNUAL_PRICE_USD).toBe(79.99)
    expect(pricing.TRIAL_DAYS).toBe(14)
  })
  it('derived display values', () => {
    expect(pricing.MONTHLY_PRICE_DISPLAY).toBe('$9.99')
    expect(pricing.ANNUAL_PRICE_DISPLAY).toBe('$79.99')
    expect(pricing.ANNUAL_MONTHLY_EQUIVALENT_DISPLAY).toBe('$6.67')
    expect(pricing.ANNUAL_SAVINGS_PERCENT).toBe(33)
    expect(pricing.MONTHLY_PRICE_LABEL).toBe('$9.99/month')
    expect(pricing.ANNUAL_PRICE_LABEL).toBe('$79.99/year')
    expect(pricing.TRIAL_LABEL).toBe('14-day free trial')
  })
})

describe('granted trial = 14 on every path', () => {
  it('shared constants', () => {
    expect(BASE_TRIAL_DAYS).toBe(14)
    expect(GO_BASE_TRIAL_DAYS).toBe(14)
    expect(GO_MONTHLY_PRICE_DISPLAY).toBe('$9.99')
  })
  it('checkout: default + floor are TRIAL_DAYS', () => {
    const src = read('app/api/checkout/route.ts')
    expect(src).toContain('      trialDays = TRIAL_DAYS\n')
    expect(src).toContain('trialDays = Math.max(trialDays, TRIAL_DAYS)')
    expect(src).not.toMatch(/trialDays = 7\b/)
  })
  it('signup getTrialVariant + initial state use TRIAL_DAYS (no variant logic)', () => {
    const src = read('app/signup/page.tsx')
    expect(src).toContain("return { days: TRIAL_DAYS, variant: 'A' }")
    expect(src).toContain('useState(TRIAL_DAYS)')
  })
  it('no-card trials (/listen, /go invitation) import TRIAL_DAYS', () => {
    for (const f of ['app/api/listen/signup/route.ts', 'app/api/go/invite-signup/route.ts']) {
      const src = read(f)
      expect(src).toContain("import { TRIAL_DAYS } from '@/lib/pricing'")
      expect(src).not.toMatch(/const TRIAL_DAYS = \d/)
    }
  })
})

describe('no stale price/trial strings on customer-facing surfaces', () => {
  const surfaces = [
    'app/page.tsx', 'app/signup/page.tsx', 'app/subscribe/page.tsx', 'app/guest/page.tsx', 'app/terms/page.tsx',
    'components/GuestSignupPrompt.tsx', 'components/player/CanonicalPlayer.tsx', 'app/go/GoInvitationContent.tsx',
    'app/listen/EavesdropClient.tsx', 'app/manage-subscription/page.tsx', 'lib/landing.ts', 'lib/emails/retentionTemplates.ts',
    'app/api/cron/trial-emails/route.ts', 'app/api/webhook/route.ts', 'app/api/waitlist/broadcast/route.ts',
    'app/api/waitlist/confirm/route.ts', 'app/api/webhooks/waitlist-signup/route.ts', 'app/api/cron/snapshot-calculate/route.ts',
    'app/api/cron/stress-test/route.ts',
  ]
  it.each(surfaces)('%s', f => {
    const src = read(f).replace(/\/\/.*$/gm, '') // ignore comments (history notes)
    expect(src).not.toMatch(/\$7\.99|\$59\.99|\b7\.99\b|\b59\.99\b|Save 37%|\$5\/mo|7-day free|free week/)
  })
  it('trial-email reminders are anchored to the trial end', () => {
    const src = read('app/api/cron/trial-emails/route.ts')
    expect(src).toContain('const ENDS_IN_TWO_DAYS = TRIAL_DAYS - 2')
    expect(src).toContain('const ENDS_TOMORROW = TRIAL_DAYS - 1')
  })
})
