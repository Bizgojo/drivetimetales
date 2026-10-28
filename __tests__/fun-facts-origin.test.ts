import { hasValidRequestOrigin } from '@/lib/requestOrigin'
import { readFileSync } from 'fs'
import { join } from 'path'

const request = (origin: string | null, forwarded = true) => new Request('http://localhost:3000/api/user/preferences', {
  headers: { ...(origin ? { origin } : {}), ...(forwarded ? { 'x-forwarded-host': 'app.endless-tales.com', 'x-forwarded-proto': 'https' } : {}) },
})
it('accepts the public browser origin behind the EC2 proxy', () => {
  expect(hasValidRequestOrigin(request('https://app.endless-tales.com'))).toBe(true)
})
it('still rejects cross-origin and opaque-origin submissions', () => {
  expect(hasValidRequestOrigin(request('https://unrelated.example'))).toBe(false)
  expect(hasValidRequestOrigin(request('null'))).toBe(false)
})
it('retains direct local and absent-origin behavior', () => {
  expect(hasValidRequestOrigin(request('http://localhost:3000', false))).toBe(true)
  expect(hasValidRequestOrigin(request(null))).toBe(true)
})
it.each(['user/preferences', 'user/photo', 'user/invite', 'user/notifications', 'suggest-story', 'admin/story-ideas'])('uses the proxy-aware check in %s', route => {
  const src = readFileSync(join(process.cwd(), 'app/api', route, 'route.ts'), 'utf8')
  expect(src).toContain('!hasValidRequestOrigin(')
  expect(src).not.toMatch(/headers.get\('origin'\).*nextUrl.origin/)
})
