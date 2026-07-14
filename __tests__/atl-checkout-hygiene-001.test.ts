// ATL-CHECKOUT-HYGIENE-001: signup/checkout hygiene defects.
// Defect 1: Stripe customer name never set (covered by route logic; the
//           name-source precedence is asserted here via the same expression).
// Defect 2: email normalization at entry points.
// Defect 3: attribution payload builder must exactly match the migrated
//           users columns — one unknown column fails the WHOLE PostgREST
//           update, silently nulling attribution for every signup.

import { normalizeEmail } from '@/lib/email'
import {
  buildAttributionUpdatePayload,
  SIGNUP_ATTRIBUTION_COLUMNS,
  SignupAttribution,
} from '@/lib/utm'

describe('ATL-CHECKOUT-HYGIENE-001 defect 2: normalizeEmail', () => {
  test('trims and lowercases', () => {
    expect(normalizeEmail('  M.Postlewaite+Test2@Gmail.COM  ')).toBe('m.postlewaite+test2@gmail.com')
  })

  test('already-normalized email is unchanged', () => {
    expect(normalizeEmail('m.postlewaite@gmail.com')).toBe('m.postlewaite@gmail.com')
  })

  test('preserves plus-addressing (distinct addresses stay distinct)', () => {
    expect(normalizeEmail('A+test2@x.com')).not.toBe(normalizeEmail('A@x.com'))
  })

  test('non-string / empty inputs return empty string (checkout 400s on it)', () => {
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(42)).toBe('')
    expect(normalizeEmail('   ')).toBe('')
  })

  test('the two rehearsal Stripe customers would now collide only if same mailbox', () => {
    // These are genuinely different addresses — normalization must NOT merge them.
    expect(normalizeEmail('M.postlewaite+test2@gmail.com')).toBe('m.postlewaite+test2@gmail.com')
    expect(normalizeEmail('m.postlewaite@gmail.com')).toBe('m.postlewaite@gmail.com')
  })
})

describe('ATL-CHECKOUT-HYGIENE-001 defect 3: attribution payload builder', () => {
  const fullAttribution: SignupAttribution = {
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: 'gvl-test-001',
    utm_term: 'gvl-broad-202607',
    utm_content: 'falls-park-murder-v1',
    utm_captured_at: '2026-07-10T12:00:00.000Z',
    promo_code: 'GVLMETA',
  }

  test('payload keys EXACTLY match the migrated column list (schema contract)', () => {
    const payload = buildAttributionUpdatePayload(fullAttribution, 'Facebook/Instagram')
    // If someone adds a key to the payload without adding it to
    // SIGNUP_ATTRIBUTION_COLUMNS (and the migration), this fails in CI
    // instead of silently nulling attribution in production.
    expect(Object.keys(payload).sort()).toEqual([...SIGNUP_ATTRIBUTION_COLUMNS].sort())
  })

  test('column list matches migrations 20260710120000 + 20260714170000 (utm_term/utm_content, ADMIN-MKT-001)', () => {
    expect([...SIGNUP_ATTRIBUTION_COLUMNS].sort()).toEqual([
      'heard_about_us',
      'signup_promo_code',
      'utm_campaign',
      'utm_captured_at',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ])
  })

  test('maps attribution fields onto DB columns', () => {
    const payload = buildAttributionUpdatePayload(fullAttribution, 'TikTok')
    expect(payload).toEqual({
      utm_source: 'meta',
      utm_medium: 'paid_social',
      utm_campaign: 'gvl-test-001',
      utm_term: 'gvl-broad-202607',
      utm_content: 'falls-park-murder-v1',
      utm_captured_at: '2026-07-10T12:00:00.000Z',
      signup_promo_code: 'GVLMETA',
      heard_about_us: 'TikTok',
    })
  })

  test('empty attribution yields all-null payload (never undefined keys)', () => {
    const payload = buildAttributionUpdatePayload(
      { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null, utm_captured_at: null, promo_code: null },
      ''
    )
    for (const col of SIGNUP_ATTRIBUTION_COLUMNS) {
      expect(payload[col]).toBeNull()
    }
  })

  test('heard_about_us is trimmed; whitespace-only becomes null', () => {
    expect(buildAttributionUpdatePayload(fullAttribution, '  Reddit  ').heard_about_us).toBe('Reddit')
    expect(buildAttributionUpdatePayload(fullAttribution, '   ').heard_about_us).toBeNull()
    expect(buildAttributionUpdatePayload(fullAttribution, undefined).heard_about_us).toBeNull()
  })
})

describe('ATL-CHECKOUT-HYGIENE-001 defect 1: customer name source precedence', () => {
  // Mirrors the expression in app/api/checkout/route.ts — DB first_name wins,
  // request firstName is fallback, empty/whitespace never sets a name.
  function resolveCustomerName(dbFirstName: unknown, requestFirstName: unknown): string {
    const db = typeof dbFirstName === 'string' ? dbFirstName.trim() : ''
    return db || (typeof requestFirstName === 'string' ? requestFirstName.trim() : '')
  }

  test('DB first_name wins over request payload', () => {
    expect(resolveCustomerName('Marc', 'Other')).toBe('Marc')
  })

  test('falls back to request firstName when DB row has none', () => {
    expect(resolveCustomerName(null, 'Marc')).toBe('Marc')
    expect(resolveCustomerName('   ', 'Marc')).toBe('Marc')
  })

  test('no name available → empty string (route omits name field entirely)', () => {
    expect(resolveCustomerName(null, undefined)).toBe('')
    expect(resolveCustomerName('', '  ')).toBe('')
  })
})
