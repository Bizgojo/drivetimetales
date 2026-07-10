// ATL-PROMO-CARRY-001: homepage ad landings must carry promo code to /signup.
// Covers buildSignupCtaHref (used by app/page.tsx CTA links) and its
// interaction with normalizePromoCode (same normalization as signup page).

import { buildSignupCtaHref, normalizePromoCode } from '@/lib/utm'

describe('ATL-PROMO-CARRY-001: buildSignupCtaHref', () => {
  test('no partner, no promo → plain /signup (legacy behavior)', () => {
    expect(buildSignupCtaHref(null, null)).toBe('/signup')
    expect(buildSignupCtaHref(undefined, undefined)).toBe('/signup')
  })

  test('partner only → exact legacy format preserved', () => {
    expect(buildSignupCtaHref('joes-diner', null)).toBe('/signup?partner=joes-diner')
  })

  test('promo only → promo carried (the Meta ad homepage-landing case)', () => {
    expect(buildSignupCtaHref(null, 'GVLMETA')).toBe('/signup?promo=GVLMETA')
  })

  test('partner + promo → both carried, partner first', () => {
    expect(buildSignupCtaHref('joes-diner', 'GVLMETA')).toBe('/signup?partner=joes-diner&promo=GVLMETA')
  })

  test('promo is normalized like the signup page (trim, uppercase, strip spaces/plus)', () => {
    expect(buildSignupCtaHref(null, '  gvl meta ')).toBe('/signup?promo=GVLMETA')
    expect(buildSignupCtaHref(null, 'gvl+meta')).toBe('/signup?promo=GVLMETA')
  })

  test('empty/whitespace promo → treated as absent', () => {
    expect(buildSignupCtaHref(null, '')).toBe('/signup')
    expect(buildSignupCtaHref(null, '   ')).toBe('/signup')
    expect(buildSignupCtaHref('joes-diner', '')).toBe('/signup?partner=joes-diner')
  })

  test('promo value is URL-encoded after normalization', () => {
    expect(buildSignupCtaHref(null, 'A&B')).toBe(`/signup?promo=${encodeURIComponent('A&B')}`)
  })

  test('round-trip: normalized promo in href parses back to the same code signup would read', () => {
    const href = buildSignupCtaHref('joes-diner', 'gvlmeta')
    const qs = new URLSearchParams(href.split('?')[1])
    // Same read logic as app/signup/page.tsx: promo ?? code, then normalize.
    expect(normalizePromoCode(qs.get('promo') || qs.get('code'))).toBe('GVLMETA')
    expect(qs.get('partner')).toBe('joes-diner')
  })
})
