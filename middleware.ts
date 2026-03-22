import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that do NOT require authentication
const PUBLIC_ROUTES = new Set([
  '/signin',
  '/signup',
  '/welcome',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/signup',
])

// Routes that start with these prefixes are always public
const PUBLIC_PREFIXES = ['/api/', '/_next/', '/images/', '/icons/', '/favicon']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public prefixes
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Always allow exact public routes
  if (PUBLIC_ROUTES.has(pathname)) {
    return NextResponse.next()
  }

  // Check for Supabase session cookie
  const hasSession =
    request.cookies.get('sb-access-token') ||
    request.cookies.get('sb-refresh-token') ||
    [...request.cookies.getAll()].some(c => c.name.includes('supabase') || c.name.includes('sb-'))

  if (!hasSession) {
    const signinUrl = new URL('/signin', request.url)
    signinUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|icons|api).*)',
  ],
}
