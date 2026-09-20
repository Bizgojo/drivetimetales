/**
 * /api/auth/google — Initiates Google OAuth flow
 * Uses PKCE on localhost and production.
 * Localhost needs lax/insecure cookies; production/PWA needs none/secure cookies.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isLocalOrigin, resolveRequestOrigin } from '@/lib/requestOrigin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/home'
  const origin = url.origin
  // OAUTH-ORIGIN-001 (2026-09-20): use the RUNTIME request origin — the same
  // fix already applied to /auth/callback (AUTH-CALLBACK-ORIGIN-001).
  //
  // PREVIOUS BUG: VERCEL_URL is the deployment-specific *.vercel.app host on
  // EVERY deployment, production included, so production sign-ins asked
  // Supabase to return the user to a .vercel.app origin. That is a DIFFERENT
  // origin from the one they started on (app.endless-tales.com), which breaks
  // two things: the PKCE cookies set below live on the request host, and
  // anything else stored per-origin — including the referral code captured by
  // components/ReferralCapture (localStorage + cookie), so a Google signup
  // from an invite link could never claim its referral.
  //
  // The runtime origin is always where the user actually is: the production
  // domain in production, the preview host on a preview deployment, localhost
  // in dev — so redirect_to, the PKCE cookies and the stored referral code all
  // share one origin.
  const appUrl = resolveRequestOrigin(request)
  const isLocalhost = isLocalOrigin(appUrl)
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
