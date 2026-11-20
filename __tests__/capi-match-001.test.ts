import fs from 'fs'
import path from 'path'
import { buildMetaCapiPayload } from '@/lib/tracking/capi'
import { fbcFromFbclid, requestMatchKeys, matchKeysMetadata, matchKeysFromMetadata, sanitizeMatchKeys } from '@/lib/tracking/matchKeys'

const headers = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } })

describe('CAPI-MATCH-001', () => {
  test('fbc is built in Meta format from fbclid', () => {
    expect(fbcFromFbclid('IwAR1abc_DEF-2', 1731600000000)).toBe('fb.1.1731600000000.IwAR1abc_DEF-2')
    expect(fbcFromFbclid('bad value<script>')).toBeNull()
    expect(fbcFromFbclid('')).toBeNull()
  })
  test('request keys come from cookies and headers', () => {
    const k = requestMatchKeys(headers({
      cookie: 'a=1; _fbc=fb.1.1731600000000.IwAR1abc; _fbp=fb.1.1731600000000.123456789',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      'user-agent': 'Mozilla/5.0 Test',
    }))
    expect(k).toEqual({ fbc: 'fb.1.1731600000000.IwAR1abc', fbp: 'fb.1.1731600000000.123456789', clientIp: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' })
  })
  test('junk cookie values are dropped', () => {
    expect(sanitizeMatchKeys({ fbc: 'nope', fbp: 'fb.1.x.y', clientIp: 'not-an-ip!' })).toEqual({ fbc: null, fbp: null, clientIp: null, userAgent: null })
  })
  test('keys survive the Stripe metadata round trip', () => {
    const keys = { fbc: 'fb.1.1731600000000.IwAR1abc', fbp: 'fb.1.1731600000000.123', clientIp: '203.0.113.7', userAgent: 'UA' }
    expect(matchKeysFromMetadata(matchKeysMetadata(keys))).toEqual(keys)
  })
  test('Meta payload carries the match keys; no keys means no fields', () => {
    const p: any = buildMetaCapiPayload({ name: 'CompleteRegistration', eventId: 'e1', email: 'a@b.com', fbc: 'fb.1.1731600000000.IwAR1abc', fbp: 'fb.1.1731600000000.123', clientIp: '203.0.113.7', userAgent: 'UA' })
    const ud = p.data[0].user_data
    expect(ud.fbc).toBe('fb.1.1731600000000.IwAR1abc')
    expect(ud.fbp).toBe('fb.1.1731600000000.123')
    expect(ud.client_ip_address).toBe('203.0.113.7')
    expect(ud.client_user_agent).toBe('UA')
    const bare: any = buildMetaCapiPayload({ name: 'CompleteRegistration', eventId: 'e2', email: 'a@b.com' })
    expect(Object.keys(bare.data[0].user_data)).toEqual(['em'])
  })
  test('every server event site passes match keys; IP/UA never go on the Stripe customer', () => {
    const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    expect(read('app/api/user/create/route.ts')).toContain('...requestMatchKeys(request)')
    expect(read('app/api/analytics/play-event/route.ts')).toContain('...requestMatchKeys(req)')
    expect(read('app/api/go/invite-signup/route.ts').match(/requestMatchKeys\(req\)/g)?.length).toBe(2)
    expect(read('app/api/webhook/route.ts').match(/matchKeysFromMetadata\(/g)?.length).toBe(2)
    const checkout = read('app/api/checkout/route.ts')
    expect(checkout.match(/\.\.\.clickMetadata/g)?.length).toBe(2)
    expect(checkout).not.toMatch(/customers\.(create|update)\([^)]*clickMetadata/s)
  })

  // CAPI-STARTTRIAL-MATCH-001 (Marc, 2026-11-20): the old placement of the
  // fbclid capture sat AFTER captureUtmFromUrl's "no utm_* params -> return"
  // guard, so an ad click carrying only ?fbclid= (Meta does not always append
  // utm_*) persisted no _fbc at all. That is exactly the traffic this exists
  // for, so the capture now runs before that guard.
  test('fbclid is captured before the UTM early-return, so fbclid-only clicks persist _fbc', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/utm.ts'), 'utf8')
    const captureAt = src.indexOf("captureFbclidCookie(params.get('fbclid'))")
    const guardAt = src.indexOf('if (!source && !medium && !campaign && !term && !content) return')
    expect(captureAt).toBeGreaterThan(-1)
    expect(guardAt).toBeGreaterThan(-1)
    expect(captureAt).toBeLessThan(guardAt)
  })

  test('the CAPI StartTrial names the real landing URL, not a hard-coded /signup', () => {
    const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    const webhook = read('app/api/webhook/route.ts')
    // The trial-start event reads the URL from the checkout metadata...
    expect(webhook).toContain('sourceUrl: landingUrlFromMetadata(session.metadata)')
    // ...and falls back to /signup only when the metadata carried none.
    expect(webhook).toMatch(/function landingUrlFromMetadata[\s\S]{0,800}endless-tales\.com\/signup/)
    // The checkout carries it, same-site only.
    expect(read('app/api/checkout/route.ts')).toContain('landing_url: safeLandingUrl(attribution?.landing_url)')
    // The signup page supplies it.
    expect(read('app/signup/page.tsx')).toContain('landing_url:')
  })
})
