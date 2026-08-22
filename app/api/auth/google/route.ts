/**
 * /api/auth/google — Initiates Google OAuth flow
 * Uses PKCE on localhost and production.
 * Localhost needs lax/insecure cookies; production/PWA needs none/secure cookies.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/home'
  const origin = url.origin
  // On Vercel preview deployments NEXT_PUBLIC_APP_URL is baked to the
  // production URL at build time.  VERCEL_URL is injected per-deployment
  // (server-only) and always points to the current deployment — use it
  // so OAuth redirect_uri matches the preview origin, not production.
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || origin)
  const isLocalhost = appUrl.includes('localhost')
  const redirectTo = `${appUrl}/auth/callback`
  const cookieOptions = {
    sameSite: isLocalhost ? 'lax' : 'none',
    secure: !isLocalhost,
  } as const

  const cookieStore = cookies()
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => { cookiesToSet.push(...toSet) }
      }
    }
  )

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    }
  })

  if (!data?.url) {
    console.error('[Google OAuth] No URL returned:', error)
    return NextResponse.redirect(`${origin}/signin?error=auth_failed`)
  }

  const response = NextResponse.redirect(data.url)

  // Set PKCE cookies on response using environment-appropriate options.
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...(options as Parameters<typeof response.cookies.set>[2]),
      ...cookieOptions,
    })
  })

  response.cookies.set('auth_return_to', returnTo, {
    httpOnly: true,
    ...cookieOptions,
    maxAge: 300,
    path: '/',
  })

  console.log(`[Google OAuth] isLocalhost:${isLocalhost} PKCE cookies:${cookiesToSet.length} redirectTo:${redirectTo}`)
  return response
}
