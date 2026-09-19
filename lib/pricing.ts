// lib/pricing.ts — PRICING-TRIAL-001 (2026-09-19): SINGLE SOURCE for the
// subscription price and free-trial length shown AND granted across the app.
//
// Must match what Stripe actually charges: the prices these amounts describe
// are the Stripe price objects configured in the production env
// (STRIPE_PRICE_STANDARD → $9.99/month, STRIPE_PRICE_ANNUAL → $79.99/year).
// If the Stripe prices change, change these numbers in the same release.
//
// Trial: flat 14 days on every signup path (checkout default, /go, /subscribe,
// and the no-card /listen + /go-invitation trials). No A/B variant yet.

export const MONTHLY_PRICE_USD = 9.99
export const ANNUAL_PRICE_USD = 79.99
export const TRIAL_DAYS = 14

const usd = (n: number) => `$${n.toFixed(2)}`

export const MONTHLY_PRICE_DISPLAY = usd(MONTHLY_PRICE_USD)          // "$9.99"
export const ANNUAL_PRICE_DISPLAY = usd(ANNUAL_PRICE_USD)            // "$79.99"
/** Annual price per month, rounded to the cent ("$6.67"). */
export const ANNUAL_MONTHLY_EQUIVALENT_USD = Math.round((ANNUAL_PRICE_USD / 12) * 100) / 100
export const ANNUAL_MONTHLY_EQUIVALENT_DISPLAY = usd(ANNUAL_MONTHLY_EQUIVALENT_USD)
/** Annual vs 12× monthly, rounded down so we never over-state it (33). */
export const ANNUAL_SAVINGS_PERCENT = Math.floor((1 - ANNUAL_PRICE_USD / (MONTHLY_PRICE_USD * 12)) * 100)

export const MONTHLY_PRICE_LABEL = `${MONTHLY_PRICE_DISPLAY}/month`   // "$9.99/month"
export const ANNUAL_PRICE_LABEL = `${ANNUAL_PRICE_DISPLAY}/year`      // "$79.99/year"
export const TRIAL_LABEL = `${TRIAL_DAYS}-day free trial`             // "14-day free trial"
