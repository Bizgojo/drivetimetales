// lib/subscribeFunnel.ts — ORION-RESUB-FUNNEL-001
// Pure helpers for the resubscribe funnel fix (signed-in but non-entitled
// user clicking an ad → /signup → /home → /subscribe was dropping promo/utm
// params at every hop, and /subscribe's CTA bounced authed users back to
// /signup in an infinite loop).
//
// Extracted here so the param-carry and checkout-payload logic is
// unit-testable (see __tests__/orion-resub-funnel-001.test.ts).

import { normalizePromoCode, type SignupAttribution } from '@/lib/utm'

// Params that must NOT be carried when an authed user is bounced from
// /signup to /home: 'canceled' is Stripe's checkout-cancel marker (stale
// outside /signup), 'returnTo' is hop-specific routing state — carrying it
// would let an old returnTo override middleware's fresh one.
export const AUTHED_REDIRECT_EXCLUDED_PARAMS = ['canceled', 'returnTo'] as const

/**
 * Rebuilds a query string carrying every param except the excluded keys.
 * Input accepts either 'a=1&b=2' or '?a=1&b=2'. Returns '?a=1&b=2' (leading
 * '?') or '' when nothing survives, so callers can append directly to a path
 * or assign to URL.search.
 */
export function carryQueryString(search: string, exclude: readonly string[] = []): string {
  const source = new URLSearchParams(search)
  const out = new URLSearchParams()
  source.forEach((value, key) => {
    if (!exclude.includes(key)) out.append(key, value)
  })
  const qs = out.toString()
  return qs ? `?${qs}` : ''
}

/**
 * /subscribe → /signup path for ANONYMOUS visitors. Previously only
 * returnTo was carried, so an anon ad-click with ?promo= lost the code on
 * this hop. Promo is normalized exactly like the signup page reads it.
 */
export function buildSubscribeSignupPath(
  promoCode: string | null | undefined,
  returnTo: string | null | undefined
): string {
  const params = new URLSearchParams()
  const promo = normalizePromoCode(promoCode)
  if (promo) params.set('promo', promo)
  if (returnTo) params.set('returnTo', returnTo)
  const qs = params.toString()
  return qs ? `/signup?${qs}` : '/signup'
}

export interface SubscribeCheckoutPayload {
  userId: string
  email: string | undefined
  firstName: string | undefined
  trialDays: number
  billingCycle: 'monthly'
  returnTo: string | undefined
  attribution: SignupAttribution
}

/**
 * Body for POST /api/checkout when a SIGNED-IN, non-entitled user starts
 * checkout directly from /subscribe (the loop fix: no more bouncing them to
 * /signup, which redirected right back). Shape mirrors the signup page's
 * checkout call; the server re-validates the promo in `attribution` and sets
 * the real trial days (app/api/checkout/route.ts is untouched).
 */
export function buildSubscribeCheckoutPayload(args: {
  userId: string
  email: string | null | undefined
  firstName?: string | null
  trialDays: number
  returnTo?: string | null
  attribution: SignupAttribution
}): SubscribeCheckoutPayload {
  return {
    userId: args.userId,
    email: args.email || undefined,
    firstName: args.firstName || undefined,
    trialDays: args.trialDays,
    billingCycle: 'monthly',
    returnTo: args.returnTo || undefined,
    attribution: args.attribution,
  }
}
