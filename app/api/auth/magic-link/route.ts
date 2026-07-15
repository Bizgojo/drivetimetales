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
  const redirectTo = `${appUrl}/auth/confirm`

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
    // ORION-MAGIC-VISIBILITY-001 (Marc walk 0714b, 2026-07-14): this route
    // used to return ok:true on EVERY failure — Marc's magic link was
    // rejected upstream (no auth user was ever created for the address) and
    // the UI still said "link sent." With shouldCreateUser:true there is no
    // user-enumeration concern (every address gets an account), so masking
    // has no security value here — it only hides outages and rate limits.
    console.error('[MagicLink] Error:', error.status, error.code, error.message)
    const isRateLimit =
      error.status === 429 || /rate limit|too many/i.test(error.message || '')
    return NextResponse.json(
      {
        ok: false,
        error: isRateLimit ? 'rate_limited' : 'send_failed',
        message: isRateLimit
          ? 'Too many login emails right now — wait a minute and try again.'
          : 'We couldn\u2019t send the login link. Try again, or sign in with your password.',
      },
      { status: isRateLimit ? 429 : 502 }
    )
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
