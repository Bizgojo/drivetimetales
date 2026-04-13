/**
 * /api/auth/magic-link — Sends a magic link (OTP) email via Supabase
 * Uses the same /auth/callback PKCE exchange as Google OAuth.
 * sameSite:none + secure:true on all cookies for iOS PWA compatibility.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email, returnTo = '/home' } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const url = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin
  const isLocalhost = appUrl.includes('localhost')
  const redirectTo = `${appUrl}/auth/callback`

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

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    console.error('[MagicLink] Error:', error.message)
    return NextResponse.json({ ok: true })
  }

  const response = NextResponse.json({ ok: true })

  if (!isLocalhost) {
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...(options as Parameters<typeof response.cookies.set>[2]),
        sameSite: 'none',
        secure: true,
      })
    })
  }

  response.cookies.set('auth_return_to', returnTo, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: isLocalhost ? 'lax' : 'none',
    maxAge: 300,
    path: '/',
  })

  console.log(`[MagicLink] Sent to ${email.slice(0, 4)}*** redirectTo:${redirectTo}`)
  return response
}
