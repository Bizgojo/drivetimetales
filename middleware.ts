import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = new Set([
  '/signin', '/signup', '/welcome', '/guest', '/forgot-password',
  '/player',
  '/reset-password', '/auth/callback', '/auth/signup',
])

const PUBLIC_PREFIXES = ['/api/', '/_next/', '/images/', '/icons/', '/favicon', '/podcast', '/player/']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (PUBLIC_ROUTES.has(pathname)) return NextResponse.next()

  const response = NextResponse.next()

  // Use Supabase SSR client to properly validate the session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const signinUrl = new URL('/signin', request.url)
    signinUrl.searchParams.set('returnTo', pathname)
    // Clear any stale sb- cookies so old sessions don't persist
    const redirect = NextResponse.redirect(signinUrl)
    request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-'))
      .forEach(c => redirect.cookies.delete(c.name))
    return redirect
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|api|podcast).*)'],
}
