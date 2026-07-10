// lib/promo.ts — ATL-PROMO-UI-001
// Pure promo-code trial helpers shared by the signup page (display) and
// GET /api/promo/validate (server truth).
//
// CRITICAL: the validity criteria and trial-day math here MUST stay in
// lockstep with app/api/checkout/route.ts (~lines 160-167), which is the
// source of truth for what Stripe actually grants:
//
//   if (promo?.is_active && (promo.max_uses === null || promo.uses_count < promo.max_uses)) {
//     trialDays = Math.max(trialDays, Number(promo.subscription_days || 14))
//   }
//
// If checkout's rules change, change these helpers too (and vice versa).

export interface PromoCodeRow {
  code?: string | null
  is_active?: boolean | null
  max_uses?: number | null
  uses_count?: number | null
  subscription_days?: number | null
}

/** Default base trial shown/granted when no promo/referral applies. */
export const BASE_TRIAL_DAYS = 7

/**
 * Exact same usability criteria as checkout:
 * is_active && (max_uses === null || uses_count < max_uses).
 * A missing row (null/undefined) is not usable.
 */
export function isPromoUsable(promo: PromoCodeRow | null | undefined): boolean {
  if (!promo) return false
  if (!promo.is_active) return false
  if (promo.max_uses === null || promo.max_uses === undefined) return true
  // Checkout compares uses_count < max_uses directly; null coerces to 0 in JS,
  // so mirror that with ?? 0 (identical result, type-safe).
  return (promo.uses_count ?? 0) < promo.max_uses
}

/**
 * Days a usable promo grants, before the max() with the base trial.
 * Mirrors checkout's Number(promo.subscription_days || 14): null, undefined,
 * 0, NaN, and '' all fall back to 14.
 */
export function promoGrantedDays(subscriptionDays: unknown): number {
  const n = Number(subscriptionDays)
  return Number.isFinite(n) && n > 0 ? n : 14
}

/**
 * The trial length checkout will actually grant given a base trial and a
 * promo's granted days. Mirrors checkout's Math.max(trialDays, grantedDays).
 */
export function applyPromoTrialDays(baseDays: number, grantedDays: unknown): number {
  return Math.max(baseDays, promoGrantedDays(grantedDays))
}

/**
 * Full evaluation of a promo row for the validate endpoint.
 * valid=false → days=null (caller keeps its default display).
 * valid=true  → days = the promo's granted days (pre-max; callers apply
 *               applyPromoTrialDays against their own base).
 */
export function evaluatePromo(promo: PromoCodeRow | null | undefined): { valid: boolean; days: number | null } {
  if (!isPromoUsable(promo)) return { valid: false, days: null }
  return { valid: true, days: promoGrantedDays(promo!.subscription_days) }
}
