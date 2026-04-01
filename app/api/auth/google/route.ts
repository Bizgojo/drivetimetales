import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/home'
  const origin = url.origin

  // Keep redirect URL clean (no query params) so it matches Supabase's allowed redirect list exactly.
  // Pass returnTo via a short-lived cookie that the callback Route Handler will read.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin
  const redirectTo = `${appUrl}/auth/callback`

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        }
      }
    }
  )

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true }
  })

  if (!data?.url) {
    return NextResponse.redirect(`${origin}/signin?error=auth_failed`)
  }

  // Set the returnTo cookie so the callback handler knows where to send the user
  const response = NextResponse.redirect(data.url)
  response.cookies.set('auth_return_to', returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes — just long enough to survive the OAuth round-trip
    path: '/',
  })
  return response
}
