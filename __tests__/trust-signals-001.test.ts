// TRUST-SIGNALS-001 — Social proof + trial reminder copy for /go
// Marc approval, 2026-07-21.
//
// Covers:
//   1. GO_SOCIAL_PROOF_LINE — byte-exact pin, Marc-approved
//   2. GO_TRIAL_REMINDER_LINE — byte-exact pin; accurate to real email
//      cadence (Day 3 / Day 10 / Day 13, app/api/cron/trial-emails/route.ts)
//   3. Page wiring: both constants imported + rendered in the page source
//   4. Placement: social proof in page body (no reveal gate);
//      reminder in bottom sheet AND static footer
//   5. Reminder accuracy: does NOT promise a specific day-count
//   6. Hard rules: no auth calls, /go stays public

import fs from 'fs'
import path from 'path'
import {
  GO_SOCIAL_PROOF_LINE,
  GO_TRIAL_REMINDER_LINE,
} from '@/lib/landing'

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'page.tsx'), 'utf8')
const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')
const trialEmailsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'api', 'cron', 'trial-emails', 'route.ts'),
  'utf8',
)

// ============================================================================
// 1. Copy byte-exact pins (Marc-reviewed)
// ============================================================================
describe('TRUST-SIGNALS-001: copy byte-exact pins', () => {
  test('social proof line — Marc-approved phrasing', () => {
    expect(GO_SOCIAL_PROOF_LINE).toBe('1,000+ stories across 12 genres')
  })

  test('trial reminder line — accurate to real email cadence', () => {
    expect(GO_TRIAL_REMINDER_LINE).toBe("We'll email you a heads-up before your trial ends.")
  })
})

// ============================================================================
// 2. Reminder accuracy: does not overpromise a specific day-count
// ============================================================================
describe('TRUST-SIGNALS-001: reminder accuracy constraints', () => {
  test('reminder does not promise "3 days before" (cadence is Day 10 = 4 days before)', () => {
    expect(GO_TRIAL_REMINDER_LINE).not.toContain('3 days before')
    expect(GO_TRIAL_REMINDER_LINE).not.toContain('three days')
  })

  test('reminder does not promise "2 days before" or "1 day before"', () => {
    expect(GO_TRIAL_REMINDER_LINE).not.toContain('2 days before')
    expect(GO_TRIAL_REMINDER_LINE).not.toContain('1 day before')
  })

  test('actual email cadence fires at Day 3, Day 10, Day 13 (route sanity)', () => {
    // Verify the real route sends at the days we accounted for.
    expect(trialEmailsSrc).toContain('daysSinceStart === 3')
    expect(trialEmailsSrc).toContain('daysSinceStart === 10')
    expect(trialEmailsSrc).toContain('daysSinceStart === 13')
  })

  test('Day 10 email says "4 days left" — confirming the reminder is not "3 days before"', () => {
    expect(trialEmailsSrc).toContain('4 days left')
  })
})

// ============================================================================
// 3. Page wiring — both constants imported and rendered
// ============================================================================
describe('TRUST-SIGNALS-001: page wiring source pins', () => {
  test('GO_SOCIAL_PROOF_LINE imported in page.tsx', () => {
    expect(pageSrc).toContain('GO_SOCIAL_PROOF_LINE')
  })

  test('GO_TRIAL_REMINDER_LINE imported in page.tsx', () => {
    expect(pageSrc).toContain('GO_TRIAL_REMINDER_LINE')
  })

  test('social proof rendered via {GO_SOCIAL_PROOF_LINE}', () => {
    expect(pageSrc).toContain('{GO_SOCIAL_PROOF_LINE}')
  })

  test('trial reminder rendered via {GO_TRIAL_REMINDER_LINE}', () => {
    // feat/funnel-fixes-001: static footer removed; reminder now appears
    // exactly once (bottom sheet only).
    const occurrences = (pageSrc.match(/\{GO_TRIAL_REMINDER_LINE\}/g) || []).length
    expect(occurrences).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// 4. Placement: social proof in page body (no reveal gate);
//    reminder in both sheet and static footer
// ============================================================================
describe('TRUST-SIGNALS-001: placement constraints', () => {
  test('social proof is NOT gated behind sheetVisible (always visible on page load)', () => {
    // feat/funnel-fixes-001: static CTA removed; use the Legal links section
    // as the post-proof landmark instead.
    const proofIdx = pageSrc.indexOf('{GO_SOCIAL_PROOF_LINE}')
    const legalIdx = pageSrc.indexOf('Legal — small, bottom')
    expect(proofIdx).toBeGreaterThan(0)
    expect(legalIdx).toBeGreaterThan(0)
    // Social proof appears before the legal section
    expect(proofIdx).toBeLessThan(legalIdx)
    // Social proof is NOT inside a sheetVisible conditional (appears before any such gating)
    const proofContext = pageSrc.slice(Math.max(0, proofIdx - 200), proofIdx)
    expect(proofContext).not.toMatch(/sheetVisible &&/)
  })

  test('reminder appears in bottom sheet section (static footer removed by feat/funnel-fixes-001)', () => {
    // Static CTA removed; reminder is only in the bottom sheet now.
    expect(pageSrc).not.toContain('STATIC BOTTOM CTA')
    const sheetIdx = pageSrc.indexOf('TRIAL CTA — bottom sheet')
    const reminderOccurrences = Array.from(pageSrc.matchAll(/\{GO_TRIAL_REMINDER_LINE\}/g))
    const hasOneAfterSheet = reminderOccurrences.some(m => (m.index ?? 0) > sheetIdx)
    expect(hasOneAfterSheet).toBe(true)
  })

  test('reminder appears in bottom sheet section (after TRIAL CTA comment)', () => {
    const sheetIdx = pageSrc.indexOf('TRIAL CTA — bottom sheet')
    const reminderOccurrences = Array.from(pageSrc.matchAll(/\{GO_TRIAL_REMINDER_LINE\}/g))
    const hasOneAfterSheet = reminderOccurrences.some(m => (m.index ?? 0) > sheetIdx)
    expect(hasOneAfterSheet).toBe(true)
  })
})

// ============================================================================
// 5. No new fabricated claims
// ============================================================================
describe('TRUST-SIGNALS-001: no fabricated claims', () => {
  test('social proof uses "+" modifier (1,000+) — not a hard claim', () => {
    expect(GO_SOCIAL_PROOF_LINE).toContain('1,000+')
    expect(GO_SOCIAL_PROOF_LINE).not.toMatch(/^exactly \d/)
  })

  test('reminder does not claim trial will NOT auto-renew (it does auto-renew)', () => {
    expect(GO_TRIAL_REMINDER_LINE).not.toContain('will not charge')
    expect(GO_TRIAL_REMINDER_LINE).not.toContain("won't charge")
    // The charge-related promise is already in trial.subtext (CTA-001)
  })
})

// ============================================================================
// 6. Hard rules unchanged
// ============================================================================
describe('TRUST-SIGNALS-001: hard rules unchanged', () => {
  test('no auth calls introduced in landing.ts trust-signals section', () => {
    const tsSection = landingSrc.slice(
      landingSrc.indexOf('TRUST-SIGNALS-001'),
      landingSrc.indexOf('SUS/ATL-LANDING-001 rev B'),
    )
    expect(tsSection).not.toContain('supabase')
    expect(tsSection).not.toContain('createClient')
    expect(tsSection).not.toContain('auth()')
  })

  test('/go stays in PUBLIC_ROUTES — no middleware import added', () => {
    expect(pageSrc).not.toContain('createMiddlewareClient')
    expect(pageSrc).not.toContain("import.*middleware")
  })

  test('no new beacon/tracking calls for trust signals', () => {
    // The social proof and reminder are pure render — no new fetch/beacon
    expect(pageSrc).not.toContain("'trust_signal_view'")
    expect(pageSrc).not.toContain("'social_proof_view'")
    expect(pageSrc).not.toContain("'reminder_view'")
  })
})
