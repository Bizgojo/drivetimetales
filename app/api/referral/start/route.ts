import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { accountAdmin } from '@/lib/server/accountUser'
import { normalizeReferralCode } from '@/lib/referral'
import { normalizeEmail } from '@/lib/email'
import { hasValidRequestOrigin, resolveRequestOrigin, isLocalOrigin } from '@/lib/requestOrigin'
import { acceptReferralInvitation } from '@/lib/server/referralInvitation'
export const dynamic = 'force-dynamic'
const attempts = new Map<string, number>()
export async function POST(req: NextRequest) {
  if (!hasValidRequestOrigin(req)) return NextResponse.json({ error: 'Please open the invitation on Endless Tales.' }, { status: 403 })
  try {
    const { firstName, email: rawEmail, code: rawCode } = await req.json()
    const email = normalizeEmail(rawEmail), code = normalizeReferralCode(rawCode)
    if (!code || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof firstName !== 'string' || !firstName.trim() || firstName.length > 100) return NextResponse.json({ error: 'Enter your first name and a valid email address.' }, { status: 400 })
    const now = Date.now()
    attempts.forEach((at, key) => { if (now - at > 60000) attempts.delete(key) })
    const ipKey = `ip:${req.headers.get('x-forwarded-for') || 'unknown'}`
    if (now - (attempts.get(ipKey) || 0) < 10000) return NextResponse.json({ error: 'Please wait a moment before trying again.' }, { status: 429 })
    attempts.set(ipKey, now)
    const admin = accountAdmin()
    const { data: referrer, error: lookupError } = await admin.from('users').select('id').ilike('referral_code', code).maybeSingle()
    if (lookupError || !referrer) return NextResponse.json({ error: 'This invitation link is not available.' }, { status: 400 })
    // Marc's no-email-check trial: create a NEW identity only. A duplicate email
    // must never mint a session into someone else's existing account.
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name: firstName.trim() } })
    if (createError || !created.user) {
      const duplicate = createError?.code === 'email_exists' || createError?.code === 'user_already_exists' || /already.*registered|already.*exists/i.test(createError?.message || '')
      return NextResponse.json({ error: duplicate ? 'This email already has an account. Please sign in to continue.' : 'Could not create your trial account. Please try again.', ...(duplicate ? { signIn: true } : {}) }, { status: duplicate ? 409 : 503 })
    }
    const newUser = created.user
    await acceptReferralInvitation(admin, newUser, code)
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data?.properties?.hashed_token || data.user?.id !== newUser.id) throw new Error('Could not start your session.')
    const origin = resolveRequestOrigin(req), local = isLocalOrigin(origin)
    const response = NextResponse.json({ success: true, redirectTo: '/home' }, { headers: { 'Cache-Control': 'no-store' } })
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => req.cookies.getAll(), setAll: updates => updates.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, sameSite: local ? 'lax' : 'none', secure: !local, path: '/', maxAge: 31536000 })) },
    })
    const verified = await auth.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' })
    if (verified.error || verified.data.user?.id !== newUser.id || !verified.data.session) throw new Error('Could not start your session.')
    return response
  } catch { return NextResponse.json({ error: 'Your account may have been created, but we could not open it. Please sign in to continue.', signIn: true }, { status: 503 }) }
}
