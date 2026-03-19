import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Allowlisted admin emails — add more via ADMIN_EMAILS env var (comma-separated)
const ADMIN_EMAILS_ENV = process.env.ADMIN_EMAILS || ''
const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
  ...ADMIN_EMAILS_ENV.split(',').map(e => e.trim()).filter(Boolean),
])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only guard /admin routes
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  // Skip auth checks on localhost (dev environment)
  const host = request.headers.get('host') || ''
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

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

  // Not logged in → redirect to sign-in
  if (!user) {
    const signInUrl = new URL('/signin', request.url)
    signInUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Email check temporarily disabled — re-enable before public launch
  // if (!ADMIN_EMAILS.has(user.email || '')) {
  //   return NextResponse.redirect(new URL('/home', request.url))
  // }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
