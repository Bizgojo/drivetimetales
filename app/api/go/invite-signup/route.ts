// app/api/go/invite-signup/route.ts — LANDING-GATE-001
//
// Name + email invitation signup for the Bell Beneath Falls Park funnel.
// firstName from the form fills [LISTENER_NAME] in Belle B's welcome audio
// and pre-fills the paywall. Defaults to 'Listener' if blank.
//
// Creates a 7-day free trial account (no Stripe). Same pattern as
// app/api/listen/signup/route.ts but simplified for the invitation gate.
//
// signup_source: 'bell-invitation' distinguishes these users in analytics.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 2048) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }

    const body = await req.json()
    const { email: rawEmail, firstName: rawFirstName, arm, sessionId, utmSource, utmCampaign } = body
    const firstName = (typeof rawFirstName === 'string' && rawFirstName.trim()) ? rawFirstName.trim() : 'Listener'

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }
    const email = normalizeEmail(rawEmail)
    if (!email) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const armNum = [1, 2, 3].includes(Number(arm)) ? Number(arm) : 1
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // 1. Create Supabase auth user (email-confirmed, passwordless)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName },
    })

    if (authError) {
      // Existing user path — look up, update subscription
      if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existing = existingUsers?.users?.find(
          (u: { email?: string; id: string }) => u.email === email
        )
        if (!existing) {
          console.error('[invite-signup] existing user lookup failed:', authError)
          return NextResponse.json({ error: 'Account lookup failed' }, { status: 500 })
        }
        await supabase.from('users').upsert({
          id: existing.id,
          email,
          first_name: firstName,
          display_name: firstName,
          plan: 'subscriber',
          subscription_ends_at: trialEndsAt,
          subscription_type: 'trial',
          signup_source: 'bell-invitation',
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          listen_arm: armNum,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        return NextResponse.json({ ok: true, userId: existing.id, note: 'existing user' })
      }
      console.error('[invite-signup] createUser error:', authError)
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Upsert users profile
    const { error: userError } = await supabase.from('users').upsert({
      id: userId,
      email,
      display_name: firstName,
      first_name: firstName,
      plan: 'subscriber',
      subscription_ends_at: trialEndsAt,
      subscription_type: 'trial',
      signup_source: 'bell-invitation',
      utm_source: utmSource ?? null,
      utm_campaign: utmCampaign ?? null,
      listen_arm: armNum,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    if (userError) {
      console.error('[invite-signup] users upsert error:', userError)
      // Auth user exists; profile failed — still return ok so client navigates
      return NextResponse.json({ error: 'Profile creation failed', userId }, { status: 500 })
    }

    // 3. Fire wall_submit tracking event (fire-and-forget — never blocks response)
    if (sessionId && typeof sessionId === 'string' && sessionId.length > 0) {
      const appBase = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3001'
      void fetch(`${appBase}/api/go-listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          variant: `bell-arm${armNum}`,
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          event: 'wall_submit',
          position_seconds: 0,
        }),
      }).catch(() => { /* silent — tracking never blocks signup */ })
    }

    return NextResponse.json({ ok: true, userId })
  } catch (err) {
    console.error('[invite-signup] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
