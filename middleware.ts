import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = new Set([
  '/signin', '/signup', '/welcome', '/guest', '/forgot-password',
  '/player',
  '/reset-password', '/auth/callback', '/auth/signup',
  '/subscribe',
  '/terms', '/privacy',
])

const PUBLIC_PREFIXES = ['/api/', '/_next/', '/images/', '/icons/', '/favicon', '/podcast', '/player/']

const SUBSCRIPTION_REQUIRED_PREFIXES = [
  '/home',
  '/library',
  '/player/',
]

function requiresSubscription(pathname: string): boolean {
  return SUBSCRIPTION_REQUIRED_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}

function hasActiveSubscription(
  subscriptionType: string | null,
  subscriptionEndsAt: string | null
): boolean {
  if (subscriptionType !== 'active') return false
  if (!subscriptionEndsAt) return false
  return new Date(subscriptionEndsAt) > new Date()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (PUBLIC_ROUTES.has(pathname)) return NextResponse.next()

  const response = NextResponse.next()

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
    const redirect = NextResponse.redirect(signinUrl)
    request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-'))
      .forEach(c => redirect.cookies.delete(c.name))
    return redirect
  }

  if (requiresSubscription(pathname)) {
    const { data: dbUser } = await supabase
      .from('users')
      .select('plan, subscription_type, subscription_ends_at')
      .eq('id', user.id)
      .single()

    const isMarc = user.email === 'marc@endless-tales.com'

    if (!isMarc && !hasActiveSubscription(
      dbUser?.subscription_type ?? null,
      dbUser?.subscription_ends_at ?? null
    )) {
      const subscribeUrl = new URL('/subscribe', request.url)
      subscribeUrl.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(subscribeUrl)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|api|podcast).*)'],
}
