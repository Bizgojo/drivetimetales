import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = new Set([
  '/signin', '/login', '/signup', '/welcome', '/guest', '/forgot-password',
  '/player',
  '/reset-password', '/auth/callback', '/auth/signup', '/auth/confirm', '/auth/magic-sent',
  '/subscribe',
  '/terms', '/privacy',
  '/sw.js',
])

// Path prefixes that are always public (checked below)
const ADDITIONAL_PUBLIC_PREFIXES = ['/promo/']

const PUBLIC_PREFIXES = ['/api/', '/_next/', '/images/', '/icons/', '/favicon', '/podcast', '/player/']

const SUBSCRIPTION_REQUIRED_PREFIXES = [
  '/home',
  '/library',
  '/player/',
]

const AUTH_ENTRY_ROUTES = new Set(['/signin', '/login'])

function requiresSubscription(pathname: string): boolean {
  return SUBSCRIPTION_REQUIRED_PREFIXES.some(p =>
    pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)
  )
}

function hasActiveSubscription(
  plan: string | null,
  subscriptionType: string | null,
  subscriptionEndsAt: string | null
): boolean {
  // Accept either plan='standard'/'premium' OR subscription_type='active'
  const hasValidPlan = plan && plan !== 'free'
  const hasActiveType = subscriptionType === 'active'
  if (!hasValidPlan && !hasActiveType) return false
  // If no end date set yet (e.g. during invite setup), allow access
  if (!subscriptionEndsAt) return true
  // If end date is in the past, block access
  return new Date(subscriptionEndsAt) > new Date()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (ADDITIONAL_PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (AUTH_ENTRY_ROUTES.has(pathname)) {
    const authSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: { user: authEntryUser } } = await authSupabase.auth.getUser()
    if (authEntryUser) {
      const returnTo = request.nextUrl.searchParams.get('returnTo')
      const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/home'
      return NextResponse.redirect(new URL(safeReturnTo, request.url))
    }
    return NextResponse.next()
  }
  if (PUBLIC_ROUTES.has(pathname)) return NextResponse.next()
  // If user hits the root landing page with an active session, send them home
  if (pathname === '/') {
    const tempSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: { user: landingUser } } = await tempSupabase.auth.getUser()
    if (landingUser) return NextResponse.redirect(new URL('/home', request.url))
    return NextResponse.next()
  }

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

    const isMarc = user.email === 'marc@endless-tales.com' || user.email === 'm.postlewaite@gmail.com'

    if (!isMarc && !hasActiveSubscription(
      dbUser?.plan ?? null,
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
