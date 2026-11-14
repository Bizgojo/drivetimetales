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
    expect(read('lib/utm.ts')).toContain("captureFbclidCookie(urlParams.get('fbclid'))")
  })
})
