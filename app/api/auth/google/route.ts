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

  const response = NextResponse.redirect(data.url)

  // sameSite:none so this cookie survives the PWA → Google → PWA redirect chain
  response.cookies.set('auth_return_to', returnTo, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 300,
    path: '/',
  })
  return response
}
