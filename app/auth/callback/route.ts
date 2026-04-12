/**
 * /auth/callback — Server-side OAuth callback
 *
 * ⚠️  DO NOT CHANGE sameSite TO 'lax' ON ANY COOKIE HERE — THIS WILL BREAK iOS PWA LOGIN ⚠️
 *
 * iOS PWA runs in an isolated cookie container separate from Safari.
 * sameSite:'none' + secure:true on ALL cookies is the ONLY configuration
 * that allows the PWA to maintain a login session. Confirmed April 12 2026.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

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
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => { cookiesToSet.push(...toSet) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  console.log('[AuthCallback] Exchange result:', {
    hasSession: !!data?.session,
    hasError: !!error,
    errorMsg: error?.message,
    userId: data?.session?.user?.id?.slice(0, 8),
    cookieCount: cookiesToSet.length,
  })

  if (error || !data.session) {
    console.error('[AuthCallback] Code exchange failed:', error?.message)
    return NextResponse.redirect(
      `${origin}/signin?error=auth_failed&reason=${encodeURIComponent(error?.message || 'no_session')}`
    )
  }

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
  } catch (e) {}

  const returnTo = cookieStore.get('auth_return_to')?.value || '/home'
  const response = NextResponse.redirect(`${origin}${returnTo}`)

  // ⚠️  sameSite:'none' + secure:true REQUIRED on ALL cookies for iOS PWA
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...(options as Parameters<typeof response.cookies.set>[2]),
      sameSite: 'none',
      secure: true,
    })
  })

  response.cookies.set('auth_return_to', '', { maxAge: 0, path: '/' })
  return response
}
