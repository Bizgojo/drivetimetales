/**
 * /api/auth/google — Initiates Google OAuth flow
 *
 * ⚠️  DO NOT CHANGE sameSite TO 'lax' — THIS WILL BREAK iOS PWA LOGIN ⚠️
 *
 * iOS PWA (home screen app) runs in a completely isolated cookie container,
 * separate from Safari. When Google OAuth redirects back to the app, cookies
 * set with sameSite:'lax' are dropped at the PWA/Safari boundary.
 *
 * sameSite:'none' + secure:true is the ONLY setting that survives the
 * PWA → Google → PWA redirect chain on iOS. Confirmed working April 12 2026.
 * Do not revert this.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/home'
  const origin = url.origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn('[Google OAuth] WARNING: NEXT_PUBLIC_APP_URL is not set')
  }
  const redirectTo = `${appUrl}/auth/callback`
  const cookieStore = cookies()

  // Collect cookies to set — PKCE code verifier must be set on the response
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
    options: { redirectTo, skipBrowserRedirect: true }
  })

  if (!data?.url) {
    console.error('[Google OAuth] No URL returned:', error)
    return NextResponse.redirect(`${origin}/signin?error=auth_failed`)
  }

  const response = NextResponse.redirect(data.url)

  // Set ALL cookies on the response — including PKCE code verifier
  // ⚠️  sameSite:'none' is REQUIRED for iOS PWA — do not change to 'lax'
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...(options as Parameters<typeof response.cookies.set>[2]),
      sameSite: 'none',
      secure: true,
    })
  })

  response.cookies.set('auth_return_to', returnTo, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 300,
    path: '/',
  })

  console.log(`[Google OAuth] Redirecting to Google. PKCE cookies set: ${cookiesToSet.length}`)
  return response
}
