// ORIGIN-RUNTIME-001: /go invitation + /listen signup must build their own
// base URL from the runtime request host, never VERCEL_URL (PR #248 class).
import fs from 'fs'
import path from 'path'
import { resolveRequestOrigin } from '@/lib/requestOrigin'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
const ROUTES = ['app/api/go/invite-signup/route.ts', 'app/api/listen/signup/route.ts']

describe.each(ROUTES)('%s', file => {
  const src = read(file)
  it('never derives an origin from VERCEL_URL', () => {
    expect(src).not.toContain('process.env.VERCEL_URL')
    expect(src).not.toContain('https://${process.env.VERCEL_URL}')
  })
  it('uses the shared runtime-origin helper', () => {
    expect(src).toContain("import { resolveRequestOrigin } from '@/lib/requestOrigin'")
    expect(src).toContain('resolveRequestOrigin(req)')
  })
  it('drops the broken :3001 dev fallback (dev server runs on :3000)', () => {
    expect(src).not.toContain('localhost:3001')
  })
  it('the magic link itself still uses the stable configured app URL (unchanged)', () => {
    expect(src).toMatch(/NEXT_PUBLIC_APP_URL \|\| process\.env\.NEXT_PUBLIC_SITE_URL/)
    expect(src).toContain('redirectTo: `${')
  })
})

describe('what the origin is used for', () => {
  it('invitation: both tracking self-calls and the CAPI source url', () => {
    const src = read('app/api/go/invite-signup/route.ts')
    expect((src.match(/resolveRequestOrigin\(req\)/g) || [])).toHaveLength(3)
    expect(src).toContain('sourceUrl: `${appBase}/go?arm=${armNum}`')
    expect((src.match(/\$\{appBase\}\/api\/go-listen/g) || [])).toHaveLength(2)
  })
  it('listen: the tracking self-call', () => {
    const src = read('app/api/listen/signup/route.ts')
    expect((src.match(/resolveRequestOrigin\(req\)/g) || [])).toHaveLength(1)
    expect(src).toContain('${appBase}/api/go-listen')
  })
})

describe('resolved origin (helper behaviour these routes rely on)', () => {
  const req = (headers: Record<string, string>) =>
    ({ url: 'http://0.0.0.0:3000/api/go/invite-signup', headers: new Headers(headers) }) as unknown as Request

  it('production: the public host, not the deployment host', () => {
    process.env.VERCEL_URL = 'dtt-deploy-xyz.vercel.app'
    expect(resolveRequestOrigin(req({ 'x-forwarded-host': 'app.endless-tales.com', 'x-forwarded-proto': 'https' })))
      .toBe('https://app.endless-tales.com')
    delete process.env.VERCEL_URL
  })
  it('dev: the browser host, so the self-call reaches the running dev server', () => {
    expect(resolveRequestOrigin(req({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
  })
})
