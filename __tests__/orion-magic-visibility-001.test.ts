/**
 * ORION-MAGIC-VISIBILITY-001 (Marc walk leg 0714b, 2026-07-14): the magic-link
 * route returned ok:true on EVERY Supabase failure, so a rejected/rate-limited
 * send looked like success — no auth user was ever created for the address,
 * no email arrived, UI said "link sent." shouldCreateUser:true means there is
 * no enumeration concern; masking had no security value. Pins the visibility.
 */
import fs from 'fs'
import path from 'path'

const route = fs.readFileSync(path.join(process.cwd(), 'app/api/auth/magic-link/route.ts'), 'utf8')
const page = fs.readFileSync(path.join(process.cwd(), 'app/signin/page.tsx'), 'utf8')

describe('ORION-MAGIC-VISIBILITY-001: magic-link failures are visible', () => {
  test('route no longer returns ok:true on error', () => {
    expect(route).not.toMatch(/console\.error\('\[MagicLink\] Error:', error\.message\)\s*\n\s*return NextResponse\.json\(\{ ok: true \}\)/)
    expect(route).toMatch(/ok: false/)
  })

  test('rate limits are distinguished (429) with an actionable message', () => {
    expect(route).toMatch(/error\.status === 429/)
    expect(route).toMatch(/rate_limited/)
    expect(route).toMatch(/status: isRateLimit \? 429 : 502/)
  })

  test('signin page surfaces the real failure message to the user', () => {
    expect(page).toMatch(/const body = await res\.json\(\)\.catch\(\(\) => null\)/)
    expect(page).toMatch(/body\?\.message \|\| 'Request failed'/)
  })
})
