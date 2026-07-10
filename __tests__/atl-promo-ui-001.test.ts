// ATL-PROMO-UI-001: signup page must show the real trial length for a valid
// promo code. These tests pin lib/promo.ts helpers to the EXACT semantics of
// app/api/checkout/route.ts (~lines 160-167):
//
//   if (promo?.is_active && (promo.max_uses === null || promo.uses_count < promo.max_uses)) {
//     trialDays = Math.max(trialDays, Number(promo.subscription_days || 14))
//   }
//
// GVLMETA reference row: free_trial, subscription_days=14, is_active=true,
// max_uses=null.

import {
  BASE_TRIAL_DAYS,
  isPromoUsable,
  promoGrantedDays,
  applyPromoTrialDays,
  evaluatePromo,
} from '@/lib/promo'

describe('ATL-PROMO-UI-001: isPromoUsable (checkout validity criteria)', () => {
  test('GVLMETA shape: active, max_uses null → usable', () => {
    expect(isPromoUsable({ code: 'GVLMETA', is_active: true, max_uses: null, uses_count: 42, subscription_days: 14 })).toBe(true)
  })

  test('active with uses remaining → usable', () => {
    expect(isPromoUsable({ is_active: true, max_uses: 100, uses_count: 99 })).toBe(true)
  })

  test('active but exhausted (uses_count === max_uses) → not usable', () => {
    expect(isPromoUsable({ is_active: true, max_uses: 100, uses_count: 100 })).toBe(false)
  })

  test('active but over-exhausted (uses_count > max_uses) → not usable', () => {
    expect(isPromoUsable({ is_active: true, max_uses: 10, uses_count: 11 })).toBe(false)
  })

  test('inactive → not usable even with unlimited uses', () => {
    expect(isPromoUsable({ is_active: false, max_uses: null, uses_count: 0 })).toBe(false)
  })

  test('missing row (null/undefined) → not usable', () => {
    expect(isPromoUsable(null)).toBe(false)
    expect(isPromoUsable(undefined)).toBe(false)
  })

  test('null uses_count coerces to 0 (matches JS null < n in checkout)', () => {
    expect(isPromoUsable({ is_active: true, max_uses: 1, uses_count: null })).toBe(true)
  })

  test('max_uses 0 with uses_count 0 → not usable (0 < 0 is false, same as checkout)', () => {
    expect(isPromoUsable({ is_active: true, max_uses: 0, uses_count: 0 })).toBe(false)
  })
})

describe('ATL-PROMO-UI-001: promoGrantedDays (Number(subscription_days || 14))', () => {
  test('explicit days pass through', () => {
    expect(promoGrantedDays(14)).toBe(14)
    expect(promoGrantedDays(30)).toBe(30)
    expect(promoGrantedDays(3)).toBe(3)
  })

  test('null/undefined/0 → 14 fallback (matches || 14)', () => {
    expect(promoGrantedDays(null)).toBe(14)
    expect(promoGrantedDays(undefined)).toBe(14)
    expect(promoGrantedDays(0)).toBe(14)
  })

  test('garbage values → 14 fallback, never NaN', () => {
    expect(promoGrantedDays('abc')).toBe(14)
    expect(promoGrantedDays(NaN)).toBe(14)
    expect(promoGrantedDays(-5)).toBe(14)
  })

  test('numeric string coerces like Number() in checkout', () => {
    expect(promoGrantedDays('21')).toBe(21)
  })
})

describe('ATL-PROMO-UI-001: applyPromoTrialDays (max(base, granted), req #5 display parity)', () => {
  test('GVLMETA case: base 7, promo 14 → 14', () => {
    expect(applyPromoTrialDays(BASE_TRIAL_DAYS, 14)).toBe(14)
  })

  test('promo shorter than base never lowers the trial (max semantics)', () => {
    expect(applyPromoTrialDays(7, 3)).toBe(7)
    expect(applyPromoTrialDays(14, 7)).toBe(14)
  })

  test('promo days missing → max(base, 14) fallback, same as checkout', () => {
    expect(applyPromoTrialDays(7, null)).toBe(14)
    expect(applyPromoTrialDays(7, undefined)).toBe(14)
    expect(applyPromoTrialDays(21, null)).toBe(21)
  })

  test('BASE_TRIAL_DAYS is 7 (page + checkout default)', () => {
    expect(BASE_TRIAL_DAYS).toBe(7)
  })
})

describe('ATL-PROMO-UI-001: evaluatePromo (validate endpoint contract)', () => {
  test('GVLMETA row → { valid: true, days: 14 }', () => {
    expect(evaluatePromo({ code: 'GVLMETA', is_active: true, max_uses: null, uses_count: 7, subscription_days: 14 }))
      .toEqual({ valid: true, days: 14 })
  })

  test('usable promo with null subscription_days → days 14 (checkout fallback)', () => {
    expect(evaluatePromo({ is_active: true, max_uses: null, uses_count: 0, subscription_days: null }))
      .toEqual({ valid: true, days: 14 })
  })

  test('usable promo with custom days → those days', () => {
    expect(evaluatePromo({ is_active: true, max_uses: 50, uses_count: 10, subscription_days: 30 }))
      .toEqual({ valid: true, days: 30 })
  })

  test('inactive → { valid: false, days: null }', () => {
    expect(evaluatePromo({ is_active: false, max_uses: null, uses_count: 0, subscription_days: 14 }))
      .toEqual({ valid: false, days: null })
  })

  test('exhausted → { valid: false, days: null }', () => {
    expect(evaluatePromo({ is_active: true, max_uses: 5, uses_count: 5, subscription_days: 14 }))
      .toEqual({ valid: false, days: null })
  })

  test('missing row → { valid: false, days: null } (unknown code path)', () => {
    expect(evaluatePromo(null)).toEqual({ valid: false, days: null })
    expect(evaluatePromo(undefined)).toEqual({ valid: false, days: null })
  })
})

describe('ATL-PROMO-UI-001: end-to-end display parity with checkout math', () => {
  // Simulates: page base 7 → endpoint evaluates row → page applies max().
  // The displayed number must equal what checkout computes from the same row.
  function checkoutTrialDays(base: number, promo: any): number {
    let trialDays = base
    if (promo?.is_active && (promo.max_uses === null || promo.uses_count < promo.max_uses)) {
      trialDays = Math.max(trialDays, Number(promo.subscription_days || 14))
    }
    return trialDays
  }

  const rows = [
    { code: 'GVLMETA', is_active: true, max_uses: null, uses_count: 0, subscription_days: 14 },
    { code: 'LONGTRIAL', is_active: true, max_uses: null, uses_count: 0, subscription_days: 30 },
    { code: 'SHORTY', is_active: true, max_uses: null, uses_count: 0, subscription_days: 3 },
    { code: 'NODAYS', is_active: true, max_uses: null, uses_count: 0, subscription_days: null },
    { code: 'DEAD', is_active: false, max_uses: null, uses_count: 0, subscription_days: 14 },
    { code: 'MAXED', is_active: true, max_uses: 10, uses_count: 10, subscription_days: 14 },
    { code: 'ALMOST', is_active: true, max_uses: 10, uses_count: 9, subscription_days: 14 },
  ]

  test.each(rows)('display matches checkout grant for $code', (row) => {
    const { valid, days } = evaluatePromo(row)
    const displayed = valid ? applyPromoTrialDays(BASE_TRIAL_DAYS, days) : BASE_TRIAL_DAYS
    expect(displayed).toBe(checkoutTrialDays(BASE_TRIAL_DAYS, row))
  })
})
