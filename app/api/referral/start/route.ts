import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { accountAdmin } from '@/lib/server/accountUser'
import { normalizeReferralCode } from '@/lib/referral'
import { normalizeEmail } from '@/lib/email'
import { hasValidRequestOrigin, resolveRequestOrigin } from '@/lib/requestOrigin'
import { referralInvitationPath } from '@/lib/referralInvitation'
export const dynamic = 'force-dynamic'
// Best-effort per-worker email/IP burst limit; no login tokens leave this endpoint.
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
    const key = `email:${email}`
    if (now - (attempts.get(ipKey) || 0) < 10000) return NextResponse.json({ error: 'Please wait a moment before trying again.' }, { status: 429 })
    if (attempts.has(key)) return NextResponse.json({ error: 'Please wait a minute before requesting another email.' }, { status: 429 })
    attempts.set(key, now)
    attempts.set(ipKey, now)
    const admin = accountAdmin()
    const { data: referrer, error: lookupError } = await admin.from('users').select('id').ilike('referral_code', code).maybeSingle()
    if (lookupError || !referrer) return NextResponse.json({ error: 'This invitation link is not available.' }, { status: 400 })
    // Generate a token server-side but ONLY deliver it to its email owner.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { data: { first_name: firstName.trim() } } })
    if (error || !data?.properties?.hashed_token) throw new Error('Could not prepare your invitation email.')
    const url = new URL(referralInvitationPath(code), resolveRequestOrigin(req))
    url.hash = `token_hash=${encodeURIComponent(data.properties.hashed_token)}`
    const delivery = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Endless Tales <hello@endless-tales.com>', to: email,
      subject: 'Start your two free weeks on Endless Tales',
      text: `Confirm your email to start 14 days of Endless Tales, with no card required. After that, choose a paid subscription to continue. Open this link and tap Start My Two Free Weeks: ${url.toString()}\nIf you already have an account, this does not renew or extend a previous trial.`,
    })
    if (delivery.error) throw new Error('Could not send your invitation email. Please try again.')
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Could not send your invitation email. Please try again.' }, { status: 503 }) }
}
