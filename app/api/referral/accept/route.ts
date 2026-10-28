import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { accountAdmin } from '@/lib/server/accountUser'
import { hasValidRequestOrigin, resolveRequestOrigin, isLocalOrigin } from '@/lib/requestOrigin'
import { normalizeReferralCode } from '@/lib/referral'
import { acceptReferralInvitation } from '@/lib/server/referralInvitation'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  if (!hasValidRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const origin = resolveRequestOrigin(req)
  const local = isLocalOrigin(origin)
  const response = NextResponse.redirect(new URL('/home', origin), 303)
  try {
    const form = await req.formData()
    const token = form.get('token_hash'), code = normalizeReferralCode(String(form.get('code') || ''))
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(token) || !code) throw new Error('Invalid invitation')
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => req.cookies.getAll(), setAll: updates => updates.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, sameSite: local ? 'lax' : 'none', secure: !local, path: '/', maxAge: 31536000 })) },
    })
    const { data, error } = await auth.auth.verifyOtp({ token_hash: token, type: 'email' })
    if (error || !data.user || !data.session) throw new Error('Expired invitation')
    await acceptReferralInvitation(accountAdmin(), data.user, code)
    return response
  } catch {
    // Keep any established session so an expired/existing-account visitor can sign in.
    response.headers.set('location', new URL('/invite?error=accept', origin).toString())
    return response
  }
}
