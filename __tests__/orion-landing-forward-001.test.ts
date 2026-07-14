/**
 * ORION-LANDING-FORWARD-001 (Marc walk-blocker, 2026-07-14): the
 * www.endless-tales.com → app.endless-tales.com 308 drops URL paths (query
 * preserved), so mobile ad clicks intended for /go landed on the root
 * marketing page promo-blind, and UTMs were never captured there.
 * Pins the root-page forwarder + attribution capture.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8')

describe('ORION-LANDING-FORWARD-001: root-page ad-param forwarder', () => {
  test('?v= arrivals forward to /go with the full original query', () => {
    expect(src).toMatch(/if \(params\.has\('v'\)\) \{\s*\n\s*router\.replace\(`\/go\$\{qs\}`\)/)
  })

  test('promo/code arrivals (without partner) forward to /signup with full query', () => {
    expect(src).toMatch(/params\.has\('promo'\) \|\| params\.has\('code'\)/)
    expect(src).toMatch(/!params\.has\('partner'\)/)
    expect(src).toMatch(/router\.replace\(`\/signup\$\{qs\}`\)/)
  })

  test('partner QR arrivals are NOT forwarded (root is their landing)', () => {
    const fwd = src.slice(src.indexOf('ORION-LANDING-FORWARD-001'), src.indexOf('attribution safety'))
    expect(fwd).toMatch(/partner/) // partner guard present in the forwarder block
  })

  test('root page captures UTM attribution', () => {
    expect(src).toMatch(/captureUtmFromUrl\(\)/)
    expect(src).toMatch(/import \{ buildSignupCtaHref, captureUtmFromUrl \} from '@\/lib\/utm'/)
  })
})
