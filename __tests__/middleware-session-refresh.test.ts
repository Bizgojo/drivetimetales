import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

let cookieAdapter: any
let authUser: any = { id: 'owner', email: 'm.postlewaite@gmail.com' }
jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: any) => {
    cookieAdapter = options.cookies
    return { auth: { getUser: async () => {
      if (authUser) cookieAdapter.setAll([{ name: 'sb-test-auth-token', value: 'rotated', options: { path: '/', httpOnly: false, maxAge: 31536000 } }])
      return { data: { user: authUser }, error: authUser ? null : { message: 'temporary network error' } }
    } } }
  },
}))

beforeEach(() => { authUser = { id: 'owner', email: 'm.postlewaite@gmail.com' } })

it.each(['/signin', '/'])('keeps refreshed cookies on %s redirect to Home', async path => {
  const request = new NextRequest(`https://app.endless-tales.com${path}`, { headers: { cookie: 'sb-test-auth-token=old' } })
  const result = await middleware(request)
  expect(result.headers.get('location')).toBe('https://app.endless-tales.com/home')
  expect(result.cookies.get('sb-test-auth-token')?.value).toBe('rotated')
  expect(request.cookies.get('sb-test-auth-token')?.value).toBe('rotated')
})

it('forwards the refreshed session to the protected render', async () => {
  const request = new NextRequest('https://app.endless-tales.com/account')
  const result = await middleware(request)
  expect(result.cookies.get('sb-test-auth-token')?.value).toBe('rotated')
  expect(result.headers.get('x-middleware-request-cookie')).toContain('rotated')
})

it('does not erase stored auth on a failed user lookup and preserves requested destination', async () => {
  authUser = null
  const request = new NextRequest('https://app.endless-tales.com/library?genre=Thriller', { headers: { cookie: 'sb-test-auth-token=existing' } })
  const result = await middleware(request)
  expect(new URL(result.headers.get('location')!).searchParams.get('returnTo')).toBe('/library?genre=Thriller')
  expect(result.cookies.get('sb-test-auth-token')).toBeUndefined()
  expect(request.cookies.get('sb-test-auth-token')?.value).toBe('existing')
})
