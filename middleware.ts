import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { carryQueryString } from '@/lib/subscribeFunnel'

const PUBLIC_ROUTES = new Set([
  '/signin', '/login', '/signup', '/welcome', '/guest', '/forgot-password',
  '/player',
  '/reset-password', '/auth/callback', '/auth/signup', '/auth/confirm', '/auth/magic-sent',
  '/subscribe',
  // SUS/ATL-LANDING-001: /go is the paid-ads campaign landing page. It must
  // render identically for anonymous and signed-in visitors — no auth checks,
  // no subscription checks, no redirects (the '/' signed-in bounce below does
  // NOT apply here because pathname === '/go', not '/').
  '/go',
  '/terms', '/privacy',
  '/sw.js',
])

// Path prefixes that are always public (checked below)
const ADDITIONAL_PUBLIC_PREFIXES = ['/promo/']

// manifest.json + sw.js + offline.html: PWA assets MUST be public — middleware
// was 307-redirecting /manifest.json to signin HTML, breaking PWA install
// (console: 'Manifest: syntax error') for signed-out visitors (found in
// pre-launch audit, 2026-07-12).
const PUBLIC_PREFIXES = ['/api/', '/_next/', '/images/', '/icons/', '/favicon', '/podcast', '/player/', '/manifest.json', '/sw.js', '/offline.html']

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
  const host = request.headers.get('host')?.toLowerCase().split(':')[0]

  if (host === 'drivetimetales.com' || host === 'www.drivetimetales.com') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.protocol = 'https:'
    redirectUrl.hostname = 'endless-tales.com'
    redirectUrl.port = ''
    return NextResponse.redirect(redirectUrl, 301)
  }

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
    if (landingUser) {
      // ORION-LANDING-PARAMS-001 (2026-07-11): carry the query string through
      // this redirect. A signed-in user clicking an ad link was bounced to
      // /home with utm_*/promo params silently dropped — attribution lost and,
      // during launch rehearsal, indistinguishable from a broken redirect
      // chain. Params on /home are harmless; UtmCapture still records them.
      const homeUrl = new URL('/home', request.url)
      homeUrl.search = request.nextUrl.search
      return NextResponse.redirect(homeUrl)
    }
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
      // ORION-RESUB-FUNNEL-001: carry the original query (promo/utm/etc.)
      // onto /subscribe — previously only returnTo survived, so a non-entitled
      // user's ad-click promo was dropped at this hop. returnTo is still set
      // last (pathname only, as before) and overrides any inbound returnTo.
      subscribeUrl.search = carryQueryString(request.nextUrl.search)
      subscribeUrl.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(subscribeUrl)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|api|podcast|manifest.json|sw.js|offline.html).*)'],
}
