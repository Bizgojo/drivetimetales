// lib/landing.ts — SUS/ATL-LANDING-001
// Pure display logic for the /go campaign landing page's trial copy.
// Extracted from the page so it is unit-testable (__tests__/landing-go-001).
//
// Mirrors the signup page's ATL-PROMO-UI-001 pattern: a promo only changes
// the DISPLAYED trial length after server-truth validation via
// GET /api/promo/validate. Missing/invalid/endpoint-error all fall back to
// the default 7-day copy — quietly, never blocking the page.

import { BASE_TRIAL_DAYS, applyPromoTrialDays } from './promo'

export type PromoStatus = 'none' | 'valid' | 'invalid'

export interface TrialDisplay {
  days: number
  ctaLabel: string
  subtext: string
  appliedBadge: string | null
}

export function getTrialDisplay(
  promoCode: string | null,
  promoStatus: PromoStatus,
  validatedDays: number | null | undefined
): TrialDisplay {
  // Same max(base, promoDays) math as checkout (lib/promo.ts), so the number
  // shown matches what Stripe will actually grant at signup.
  const days = promoStatus === 'valid'
    ? applyPromoTrialDays(BASE_TRIAL_DAYS, validatedDays)
    : BASE_TRIAL_DAYS
  return {
    days,
    ctaLabel: `Start Your ${days}-Day Free Trial`,
    subtext: `Free for ${days} days. Cancel anytime — you won't be charged before your trial ends.`,
    appliedBadge: promoStatus === 'valid' && promoCode ? `Code ${promoCode} applied ✓` : null,
  }
}
