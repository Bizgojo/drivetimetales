// WELCOME-PLAYED-GUARD-001 + OAUTH-ORIGIN-001
import fs from 'fs'
import path from 'path'
import { welcomeClipCompleted, MIN_PLAYED_SECONDS, END_TOLERANCE_SECONDS } from '@/lib/welcomePlayback'
import { resolveRequestOrigin, isLocalOrigin } from '@/lib/requestOrigin'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('welcomeClipCompleted — welcome_played may only be written on a real play', () => {
  it('autoplay blocked / never started → false (listener gets another chance)', () => {
    expect(welcomeClipCompleted({ currentTime: 0, duration: 9 })).toBe(false)
    expect(welcomeClipCompleted({ currentTime: 0, duration: NaN })).toBe(false)
  })
  it('spurious early "ended" partway through → false', () => {
    expect(welcomeClipCompleted({ currentTime: 1, duration: 9 })).toBe(false)
    expect(welcomeClipCompleted({ currentTime: 6, duration: 9 })).toBe(false)
  })
  it('clip actually reached its end → true', () => {
    expect(welcomeClipCompleted({ currentTime: 9, duration: 9 })).toBe(true)
    expect(welcomeClipCompleted({ currentTime: 9 - END_TOLERANCE_SECONDS, duration: 9 })).toBe(true)
  })
  it('unknown duration → needs real playback time', () => {
    expect(welcomeClipCompleted({ currentTime: MIN_PLAYED_SECONDS - 0.1, duration: null })).toBe(false)
    expect(welcomeClipCompleted({ currentTime: MIN_PLAYED_SECONDS, duration: null })).toBe(true)
    expect(welcomeClipCompleted({ currentTime: 4, duration: Infinity })).toBe(true) // live/streaming duration
  })
  it('missing or malformed state → false (never guesses it played)', () => {
    expect(welcomeClipCompleted(null)).toBe(false)
    expect(welcomeClipCompleted(undefined)).toBe(false)
    expect(welcomeClipCompleted({})).toBe(false)
    expect(welcomeClipCompleted({ currentTime: -1, duration: 9 })).toBe(false)
  })
})

describe('player wiring', () => {
  const src = read('components/player/CanonicalPlayer.tsx')
  it('both welcome_played writes are guarded by the predicate', () => {
    const writes = src.match(/welcome_played: true/g) || []
    expect(writes).toHaveLength(2)
    expect(src).toContain('if (user?.id && welcomeClipCompleted(welcomeAudio))')
    expect(src).toContain('const welcomeHeard = welcomeClipCompleted(audioRef.current)')
    expect(src).toContain('if (user?.id && welcomeHeard)')
    // No unguarded write remains.
    expect(src).not.toMatch(/\n\s*if \(user\?\.id\) \{\n\s*supabase\.from\('users'\)\.update\(\{ welcome_played: true \}\)/)
  })
  it('a spurious welcome "ended" still starts the story (no dead end)', () => {
    expect(src).toContain('inWelcomeRef.current = false')
    expect(src).toContain('welcome ended without playing — leaving welcome_played false')
  })
})

describe('Google OAuth redirect origin (OAUTH-ORIGIN-001)', () => {
  const src = read('app/api/auth/google/route.ts')
  it('uses the runtime request origin, never VERCEL_URL', () => {
    expect(src).toContain('const appUrl = resolveRequestOrigin(request)')
    expect(src).not.toMatch(/process\.env\.VERCEL_URL\s*\n?\s*\?/)
    expect(src).not.toContain('`https://${process.env.VERCEL_URL}`')
  })
  it('sends users back to /auth/callback on that same origin', () => {
    expect(src).toContain('const redirectTo = `${appUrl}/auth/callback`')
  })
  it('localhost still gets lax/insecure cookies, production none/secure', () => {
    expect(src).toContain('const isLocalhost = isLocalOrigin(appUrl)')
    expect(src).toContain("sameSite: isLocalhost ? 'lax' : 'none'")
    expect(src).toContain('secure: !isLocalhost')
  })
  it('the callback route uses the same helper (one origin rule for both hops)', () => {
    const cb = read('app/auth/callback/route.ts')
    expect(cb).toContain('const origin = resolveRequestOrigin(request)')
    expect(cb).toContain('const isLocalhost = isLocalOrigin(origin)')
  })
})

describe('resolveRequestOrigin', () => {
  const req = (headers: Record<string, string>, url = 'http://0.0.0.0:3000/api/auth/google') =>
    ({ url, headers: new Headers(headers) }) as unknown as Request

  it('prefers the forwarded host (what the browser actually used)', () => {
    expect(resolveRequestOrigin(req({ 'x-forwarded-host': 'app.endless-tales.com', 'x-forwarded-proto': 'https' })))
      .toBe('https://app.endless-tales.com')
  })
  it('dev: host header beats the 0.0.0.0 bind address in request.url', () => {
    expect(resolveRequestOrigin(req({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
  })
  it('preview deployments keep their own host', () => {
    expect(resolveRequestOrigin(req({ 'x-forwarded-host': 'dtt-abc123.vercel.app', 'x-forwarded-proto': 'https' })))
      .toBe('https://dtt-abc123.vercel.app')
  })
  it('falls back to the request URL when no host headers exist', () => {
    expect(resolveRequestOrigin(req({}))).toBe('http://0.0.0.0:3000')
  })
  it('never derives the origin from VERCEL_URL', () => {
    process.env.VERCEL_URL = 'dtt-deployment-xyz.vercel.app'
    expect(resolveRequestOrigin(req({ 'x-forwarded-host': 'app.endless-tales.com', 'x-forwarded-proto': 'https' })))
      .not.toContain('dtt-deployment-xyz')
    delete process.env.VERCEL_URL
  })
})

describe('isLocalOrigin (auth cookie flags)', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://0.0.0.0:3000'])('%s → local', o => {
    expect(isLocalOrigin(o)).toBe(true)
  })
  it.each(['https://app.endless-tales.com', 'https://dtt-abc.vercel.app'])('%s → not local', o => {
    expect(isLocalOrigin(o)).toBe(false)
  })
})
