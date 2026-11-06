import { isProtectedAsc3Write, tokenMatches, internalKeyHeaders } from '../lib/admin-center/access-policy'
import fs from 'fs'

describe('ASC3-AUTH-001: /api/asc3 write routes are gated', () => {
  it('protects every write, keeps reads and the vendor callback public', () => {
    for (const p of ['update-story', 'publish-story', 'regenerate-cover', 'generate-story', 'generate-music', 'render-final-mix', 'upload-element', 'authors'])
      expect(isProtectedAsc3Write(`/api/asc3/${p}`, 'POST')).toBe(true)
    expect(isProtectedAsc3Write('/api/asc3/update-story', 'PATCH')).toBe(true)
    expect(isProtectedAsc3Write('/api/asc3/story-playlist', 'GET')).toBe(false)
    expect(isProtectedAsc3Write('/api/asc3/authors', 'GET')).toBe(false)
    expect(isProtectedAsc3Write('/api/asc3/music-callback', 'POST')).toBe(false)
    expect(isProtectedAsc3Write('/api/stripe', 'POST')).toBe(false)
  })
  it('token check is exact and rejects short or missing tokens', () => {
    const t = 'x'.repeat(40)
    expect(tokenMatches(t, t)).toBe(true)
    expect(tokenMatches('y'.repeat(40), t)).toBe(false)
    expect(tokenMatches(null, t)).toBe(false)
    expect(tokenMatches('short', 'short')).toBe(false)
  })
  it('server callers attach the internal key', () => {
    const prev = process.env.ADMIN_INTERNAL_TOKEN
    process.env.ADMIN_INTERNAL_TOKEN = 'k'.repeat(40)
    expect(internalKeyHeaders({ a: '1' })['x-et-internal-key']).toBe('k'.repeat(40))
    process.env.ADMIN_INTERNAL_TOKEN = prev
  })
  it('middleware runs on /api/asc3 and applies the gate', () => {
    const mw = fs.readFileSync('middleware.ts', 'utf8')
    expect(mw).toContain("'/api/asc3/:path*'")
    expect(mw).toContain('isProtectedAsc3Write(pathname, request.method)')
  })
})
