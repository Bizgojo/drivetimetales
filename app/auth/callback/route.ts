/**
 * /auth/callback — Server-side OAuth callback (works on iOS Safari, Android, all browsers)
 *
 * Exchanges the OAuth code for a session server-side using Supabase SSR.
 * This avoids all client-side PKCE / sessionStorage / localStorage issues
 * that break Google Sign-In on iOS Safari (ITP).
 *
 * Flow:
 *   1. User clicks "Continue with Google" → /api/auth/google (server route)
 *   2. /api/auth/google → sets auth_return_to cookie + redirects to Google
 *   3. Google → /auth/callback?code=...
 *   4. This route exchanges code → sets session cookies → redirects to /home (or returnTo)
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Use the configured app URL so redirect works correctly in all environments.
  // request.url origin can be the Supabase callback domain, not the app domain.
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

  // Handle OAuth errors from Google/Supabase
  if (errorParam) {
    console.error('[AuthCallback] OAuth error:', errorParam, errorDesc)
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(errorParam)}&desc=${encodeURIComponent(errorDesc || '')}`
    )
  }

  if (!code) {
    console.error('[AuthCallback] No code in callback')
    return NextResponse.redirect(`${origin}/signin?error=no_code`)
  }

  const cookieStore = cookies()

  // Collect cookies Supabase wants to set, then apply to the response
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          cookiesToSet.push(...toSet)
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('[AuthCallback] Code exchange failed:', error?.message)
    return NextResponse.redirect(`${origin}/signin?error=auth_failed`)
  }

  // Ensure user profile exists in DB (non-blocking)
  try {
    const { user } = data.session
    fetch(`${origin}/api/user/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        firstName:
          user.user_metadata?.given_name ||
          user.user_metadata?.full_name?.split(' ')[0] ||
          user.email?.split('@')[0],
      }),
    }).catch((e) => console.error('[AuthCallback] User create error (non-fatal):', e))
  } catch (e) {
    // non-fatal
  }

  // Read returnTo from cookie set by /api/auth/google
  const returnTo = cookieStore.get('auth_return_to')?.value || '/home'

  const response = NextResponse.redirect(`${origin}${returnTo}`)

  // Apply all session cookies Supabase wants to set
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })

  // Clear the returnTo cookie
  response.cookies.set('auth_return_to', '', { maxAge: 0, path: '/' })

  return response
}
