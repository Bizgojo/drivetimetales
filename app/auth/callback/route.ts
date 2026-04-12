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

  // sameSite:none so session cookies work across the PWA/Safari boundary
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
