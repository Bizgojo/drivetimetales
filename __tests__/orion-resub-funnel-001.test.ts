// ORION-RESUB-FUNNEL-001: resubscribe funnel param carry + checkout handoff.
// Covers the pure helpers behind the three-hop fix:
//   A) /signup authed bounce → /home keeps promo/utm, strips canceled/returnTo
//   B) middleware /home → /subscribe redirect keeps the full query
//   C) /subscribe: signed-in checkout payload (promo attribution + trialDays)
//      and anonymous signup path carrying promo + returnTo.

import {
  carryQueryString,
  buildSubscribeSignupPath,
  buildSubscribeCheckoutPayload,
  AUTHED_REDIRECT_EXCLUDED_PARAMS,
} from '@/lib/subscribeFunnel'
import type { SignupAttribution } from '@/lib/utm'

describe('ORION-RESUB-FUNNEL-001: carryQueryString', () => {
  test('preserves promo + full utm set (the Meta ad-click case)', () => {
    const search = 'promo=GVLMETA&utm_source=facebook&utm_medium=paid&utm_campaign=launch&utm_content=v1&utm_term=drive'
    const carried = carryQueryString(search, AUTHED_REDIRECT_EXCLUDED_PARAMS)
    const qs = new URLSearchParams(carried)
    expect(qs.get('promo')).toBe('GVLMETA')
    expect(qs.get('utm_source')).toBe('facebook')
    expect(qs.get('utm_medium')).toBe('paid')
    expect(qs.get('utm_campaign')).toBe('launch')
    expect(qs.get('utm_content')).toBe('v1')
    expect(qs.get('utm_term')).toBe('drive')
  })

  test('strips canceled and returnTo but nothing else', () => {
    const carried = carryQueryString(
      'canceled=true&returnTo=%2Fhome&promo=GVLMETA&code=OTHER',
      AUTHED_REDIRECT_EXCLUDED_PARAMS
    )
    const qs = new URLSearchParams(carried)
    expect(qs.get('canceled')).toBeNull()
    expect(qs.get('returnTo')).toBeNull()
    expect(qs.get('promo')).toBe('GVLMETA')
    expect(qs.get('code')).toBe('OTHER')
  })

  test('empty / fully-excluded query → empty string (bare path, no dangling ?)', () => {
    expect(carryQueryString('', AUTHED_REDIRECT_EXCLUDED_PARAMS)).toBe('')
    expect(carryQueryString('canceled=true&returnTo=%2Fx', AUTHED_REDIRECT_EXCLUDED_PARAMS)).toBe('')
  })

  test('accepts input with or without leading ? and returns a ?-prefixed string', () => {
    expect(carryQueryString('?promo=GVLMETA')).toBe('?promo=GVLMETA')
    expect(carryQueryString('promo=GVLMETA')).toBe('?promo=GVLMETA')
  })

  test('middleware use: no exclusions → everything carried, returnTo overridable after', () => {
    // Mirrors middleware.ts: subscribeUrl.search = carryQueryString(...), then
    // searchParams.set('returnTo', pathname) wins over any inbound returnTo.
    const url = new URL('https://endless-tales.com/subscribe')
    url.search = carryQueryString('promo=GVLMETA&utm_source=facebook&returnTo=%2Fevil')
    url.searchParams.set('returnTo', '/home')
    expect(url.searchParams.get('promo')).toBe('GVLMETA')
    expect(url.searchParams.get('utm_source')).toBe('facebook')
    expect(url.searchParams.getAll('returnTo')).toEqual(['/home'])
  })
})

describe('ORION-RESUB-FUNNEL-001: buildSubscribeSignupPath (anonymous CTA)', () => {
  test('promo + returnTo both carried', () => {
    const path = buildSubscribeSignupPath('GVLMETA', '/home')
    const qs = new URLSearchParams(path.split('?')[1])
    expect(path.startsWith('/signup?')).toBe(true)
    expect(qs.get('promo')).toBe('GVLMETA')
    expect(qs.get('returnTo')).toBe('/home')
  })

  test('promo is normalized like the signup page reads it', () => {
    expect(buildSubscribeSignupPath('  gvl meta ', null)).toBe('/signup?promo=GVLMETA')
  })

  test('no promo → legacy returnTo-only path; nothing → plain /signup', () => {
    expect(buildSubscribeSignupPath(null, '/home')).toBe(`/signup?returnTo=${encodeURIComponent('/home')}`)
    expect(buildSubscribeSignupPath(null, '')).toBe('/signup')
  })
})

describe('ORION-RESUB-FUNNEL-001: buildSubscribeCheckoutPayload (signed-in CTA)', () => {
  const attribution: SignupAttribution = {
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'launch',
    utm_captured_at: '2026-07-12T00:00:00.000Z',
    promo_code: 'GVLMETA',
  }

  test('includes promo attribution, trialDays, and monthly billing (matches /api/checkout contract)', () => {
    const payload = buildSubscribeCheckoutPayload({
      userId: 'u-1',
      email: 'canceled@example.com',
      firstName: 'Dana',
      trialDays: 14,
      returnTo: '/home',
      attribution,
    })
    expect(payload).toEqual({
      userId: 'u-1',
      email: 'canceled@example.com',
      firstName: 'Dana',
      trialDays: 14,
      billingCycle: 'monthly',
      returnTo: '/home',
      attribution,
    })
    expect(payload.attribution.promo_code).toBe('GVLMETA')
  })

  test('missing optionals become undefined (dropped by JSON.stringify), never empty strings', () => {
    const payload = buildSubscribeCheckoutPayload({
      userId: 'u-2',
      email: null,
      trialDays: 7,
      attribution: { ...attribution, promo_code: null },
    })
    expect(payload.email).toBeUndefined()
    expect(payload.firstName).toBeUndefined()
    expect(payload.returnTo).toBeUndefined()
    const wire = JSON.parse(JSON.stringify(payload))
    expect('returnTo' in wire).toBe(false)
    expect('firstName' in wire).toBe(false)
  })

  test('empty-string returnTo (no returnTo param on /subscribe) is treated as absent', () => {
    const payload = buildSubscribeCheckoutPayload({
      userId: 'u-3',
      email: 'x@y.com',
      trialDays: 7,
      returnTo: '',
      attribution,
    })
    expect(payload.returnTo).toBeUndefined()
  })
})
