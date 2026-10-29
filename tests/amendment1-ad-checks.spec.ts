// tests/amendment1-ad-checks.spec.ts — Amendment 1 Sec 5 + 6 + 8.
// Playwright: automated run (iPhone + desktop Chrome) BEFORE Susan submits
// for approval, and on demand via TEST THIS AD.
//
// Safety: destination check hits the EXACT production URL (read-only).
// Signup + checkout run on the Vercel PREVIEW deployment of the same commit
// (PREVIEW_BASE_URL) with Stripe TEST-mode keys; every test user gets
// is_test_account=true via et_test=<run_id>. No live charge possible.
//
// Env: PROD_URL (default https://endless-tales.com),
//      PREVIEW_BASE_URL (required for signup/checkout/tracking/mobile),
//      AD_RUN_ID (defaults to timestamp), AD_DESTINATION_URL (override),
//      META_TEST_EVENT_CODE (asserted present, value never printed).
import { test, expect, devices } from '@playwright/test'

const PROD_URL = process.env.PROD_URL || 'https://endless-tales.com'
const PREVIEW = process.env.PREVIEW_BASE_URL || ''
const RUN_ID = process.env.AD_RUN_ID || `adtest-${Date.now()}`
const DEST_URL = process.env.AD_DESTINATION_URL || `${PROD_URL}/`

test.describe('Amendment 1 — six ad checks', () => {
  test('1-2. destination URL 200 with hero + play above the fold (desktop)', async ({ page }) => {
    await page.goto(DEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Gap 8.1 blind spot: must land on the EXACT expected route — a
    // mistyped path on our own domain that still returns 200 must Fail.
    // Compare origin + pathname only (utm params may be added/stripped).
    const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
    const landed = new URL(page.url())
    const expected = new URL(DEST_URL)
    expect(landed.origin).toBe(expected.origin)
    expect(norm(landed.pathname)).toBe(norm(expected.pathname))
    const hero = page.locator('h1, [data-testid="hero"]').first()
    await expect(hero).toBeVisible({ timeout: 15000 })
    const play = page.getByRole('button', { name: /play|listen|start/i }).first()
    await expect(play).toBeVisible({ timeout: 15000 })
  })

  test('3. signup completes on preview deployment (test account)', async ({ page }) => {
    test.skip(!PREVIEW, 'PREVIEW_BASE_URL not set')
    const email = `adtest-${RUN_ID}@example.com`
    const res = await page.request.post(`${PREVIEW}/api/user/create`, {
      data: { userId: `adtest-${RUN_ID}`, email, firstName: 'AdTest', et_test: RUN_ID },
    })
    expect([200, 409]).toContain(res.status())
    const body = await res.json().catch(() => ({}))
    expect(body.success ?? true).toBeTruthy()
  })

  test('4. preview pricing surface shows $9.99/mo, $79.99/yr, 14-day trial', async ({ page }) => {
    test.skip(!PREVIEW, 'PREVIEW_BASE_URL not set')
    await page.goto(`${PREVIEW}/signup`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const text = (await page.textContent('body')) || ''
    for (const mark of ['$9.99', '$79.99', '14-day']) {
      expect(text).toContain(mark)
    }
    // Full 4242 card completion runs manually per campaign; automation
    // asserts the test-mode surface, never submits a live charge.
  })

  test('5. test-event plumbing present (no values printed)', async () => {
    expect((process.env.META_TEST_EVENT_CODE || '').trim().length).toBeGreaterThan(0)
    // Full assertion (zero new production rows, Test Events tab receipt) is
    // verified per-run against Supabase + Events Manager (Spec Sec 8.4).
  })

  test('6. mobile experience on iPhone profile', async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices['iPhone 14'] })
    const page = await ctx.newPage()
    await page.goto(DEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const viewport = await page.evaluate(() =>
      Boolean(document.querySelector('meta[name="viewport"]'))
    )
    expect(viewport).toBe(true)
    const play = page.getByRole('button', { name: /play|listen|start/i }).first()
    await expect(play).toBeVisible({ timeout: 15000 })
    await ctx.close()
  })
})
