// SUS/ATL-LANDING-001: /go campaign landing page.
// Covers:
//   1. buildCampaignSignupHref — promo + full utm_* set carried to /signup,
//      ?code= alias precedence, no params → plain /signup.
//   2. middleware.ts — '/go' present in PUBLIC_ROUTES (source assertion).
//   3. getTrialDisplay — valid 14-day promo copy + applied badge;
//      invalid/missing → 7-day default, no badge.

import fs from 'fs'
import path from 'path'
import { buildCampaignSignupHref, buildSignupCtaHref, UTM_PARAM_KEYS } from '@/lib/utm'
import { getTrialDisplay } from '@/lib/landing'

const FULL_UTM = {
  utm_source: 'facebook',
  utm_medium: 'paid-social',
  utm_campaign: 'gvl-launch',
  utm_content: 'video-a',
  utm_term: 'commute',
}

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj)
}

describe('SUS/ATL-LANDING-001: buildCampaignSignupHref', () => {
  test('no params → plain /signup', () => {
    expect(buildCampaignSignupHref(new URLSearchParams())).toBe('/signup')
    expect(buildCampaignSignupHref(null)).toBe('/signup')
    expect(buildCampaignSignupHref(undefined)).toBe('/signup')
  })

  test('promo + full utm set all carried to /signup', () => {
    const href = buildCampaignSignupHref(params({ promo: 'GVLMETA', ...FULL_UTM }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(href.startsWith('/signup?')).toBe(true)
    expect(qs.get('promo')).toBe('GVLMETA')
    for (const key of UTM_PARAM_KEYS) {
      expect(qs.get(key)).toBe(FULL_UTM[key as keyof typeof FULL_UTM])
    }
  })

  test('utm params only (no promo) → carried without promo key', () => {
    const href = buildCampaignSignupHref(params(FULL_UTM))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('promo')).toBeNull()
    expect(qs.get('utm_source')).toBe('facebook')
    expect(qs.get('utm_term')).toBe('commute')
  })

  test('?code= works as promo alias', () => {
    const href = buildCampaignSignupHref(params({ code: 'gvlmeta' }))
    expect(href).toBe('/signup?promo=GVLMETA')
  })

  test('?promo= wins over ?code= (same precedence as app/signup/page.tsx)', () => {
    const href = buildCampaignSignupHref(params({ promo: 'GVLMETA', code: 'OTHER' }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('promo')).toBe('GVLMETA')
  })

  test('promo is normalized like the signup page (trim, uppercase, strip spaces/plus)', () => {
    expect(buildCampaignSignupHref(params({ promo: '  gvl meta ' }))).toBe('/signup?promo=GVLMETA')
    expect(buildCampaignSignupHref(params({ promo: 'gvl+meta' }))).toBe('/signup?promo=GVLMETA')
  })

  test('empty/whitespace promo treated as absent', () => {
    expect(buildCampaignSignupHref(params({ promo: '   ' }))).toBe('/signup')
  })

  test('utm values are URL-encoded', () => {
    const href = buildCampaignSignupHref(params({ utm_content: 'a b&c' }))
    expect(href).toBe(`/signup?utm_content=${encodeURIComponent('a b&c')}`)
  })

  test('unrelated params are NOT carried', () => {
    const href = buildCampaignSignupHref(params({ utm_source: 'fb', fbclid: 'xyz', ref: 'abc' }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('fbclid')).toBeNull()
    expect(qs.get('ref')).toBeNull()
    expect(qs.get('utm_source')).toBe('fb')
  })

  test('buildSignupCtaHref remains backward-compatible (untouched legacy behavior)', () => {
    expect(buildSignupCtaHref(null, null)).toBe('/signup')
    expect(buildSignupCtaHref('joes-diner', 'gvlmeta')).toBe('/signup?partner=joes-diner&promo=GVLMETA')
  })
})

describe('SUS/ATL-LANDING-001: middleware PUBLIC_ROUTES', () => {
  test("'/go' is present in middleware.ts PUBLIC_ROUTES", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')
    const match = src.match(/const PUBLIC_ROUTES = new Set\(\[([\s\S]*?)\]\)/)
    expect(match).not.toBeNull()
    const routes = Array.from(match![1].matchAll(/'([^']+)'/g)).map(m => m[1])
    expect(routes).toContain('/go')
  })
})

describe('SUS/ATL-LANDING-001: getTrialDisplay', () => {
  test('valid promo with 14 days → 14-day copy + applied badge', () => {
    const d = getTrialDisplay('GVLMETA', 'valid', 14)
    expect(d.days).toBe(14)
    expect(d.ctaLabel).toBe('Start Your 14-Day Free Trial')
    expect(d.subtext).toContain('14 days')
    expect(d.appliedBadge).toBe('Code GVLMETA applied ✓')
  })

  test('no promo → 7-day default, no badge', () => {
    const d = getTrialDisplay(null, 'none', null)
    expect(d.days).toBe(7)
    expect(d.ctaLabel).toBe('Start Your 7-Day Free Trial')
    expect(d.appliedBadge).toBeNull()
  })

  test('invalid promo → quiet 7-day default, no badge', () => {
    const d = getTrialDisplay('BOGUS', 'invalid', null)
    expect(d.days).toBe(7)
    expect(d.ctaLabel).toBe('Start Your 7-Day Free Trial')
    expect(d.appliedBadge).toBeNull()
  })

  test('valid promo with null days → falls back to 14 (same as checkout math)', () => {
    // Mirrors lib/promo.ts promoGrantedDays: null/0/'' → 14.
    const d = getTrialDisplay('GVLMETA', 'valid', null)
    expect(d.days).toBe(14)
    expect(d.appliedBadge).toBe('Code GVLMETA applied ✓')
  })

  test('valid promo with days below base → base 7 wins (max math)', () => {
    const d = getTrialDisplay('SHORT3', 'valid', 3)
    expect(d.days).toBe(7)
    expect(d.ctaLabel).toBe('Start Your 7-Day Free Trial')
    // Still validated → badge shows even though days clamp to base.
    expect(d.appliedBadge).toBe('Code SHORT3 applied ✓')
  })
})
