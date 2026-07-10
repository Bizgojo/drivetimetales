// lib/email.ts
// ATL-CHECKOUT-HYGIENE-001 (defect 2): single email normalization used at
// every entry point that stores or looks up an email (signup, signin,
// checkout → Stripe customer create). Mixed-case/whitespace variants of the
// same address were creating duplicate-looking Stripe customers
// ('M.postlewaite+test2@…' vs 'm.postlewaite@…') and inconsistent users rows.
//
// New-signups-only fix: existing mixed-case rows are NOT migrated.
export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}
