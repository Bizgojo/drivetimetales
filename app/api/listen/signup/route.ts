// app/api/listen/signup/route.ts — GVL-EAVESDROP-001
// Free-week account creation for the /listen eavesdrop landing page.
//
// No Stripe. User gets immediate access via subscription_ends_at.
// Returns a magicToken (hashed OTP) so the client can navigate to /auth/callback
// and receive a real browser session without an email round-trip.
// Name + email only. service role key used — never shipped client-side.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

// Episode 4 — the first post-signup episode (GVL Wearing My Face series)
const EP4_ID = 'eac2b1ef-6456-46b1-8c17-bbdf32d8ff5d'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.endless-tales.com'

/** Generate a one-tap login token for the browser session handoff.
 * Non-fatal — if it fails the client falls back to the plain app URL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateMagicToken(supabaseAdmin: any, email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${APP_URL}/home` },
    })
    if (error || !data?.properties?.hashed_token) {
      console.warn('[listen/signup] generateMagicToken failed (non-fatal):', error?.message)
      return null
    }
    return data.properties.hashed_token as string
  } catch (e) {
    console.warn('[listen/signup] generateMagicToken error (non-fatal):', e)
    return null
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Body size guard
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 4096) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }

    const body = await req.json()
    const { firstName, email: rawEmail, arm, sessionId, utmSource, utmCampaign } = body

    // firstName is optional — LANDING-GATE-001 email-only capture does not send it.
    // EavesdropClient still sends it; both paths coexist.
    const displayName =
      typeof firstName === 'string' && firstName.trim().length > 0
        ? firstName.trim()
        : ''

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const email = normalizeEmail(rawEmail)
    if (!email) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const armNum = Number(arm)
    if (![1, 2, 3].includes(armNum)) {
      return NextResponse.json({ error: 'arm must be 1, 2, or 3' }, { status: 400 })
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // 1. Create Supabase auth user (passwordless — email confirmed immediately)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: displayName },
    })

    if (authError) {
      // If user already exists, look them up
      if (authError.status === 422) {
        // GoTrue returns status 422 (Unprocessable Entity) with code 'email_exists'
        // or 'user_already_exists' for duplicate email — branch on structured error,
        // not message substrings. Use O(1) indexed email lookup in public.users.
        const { data: existingProfile, error: lookupError } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', email)
          .single()
        if (lookupError || !existingProfile) {
          console.error('[listen/signup] existing user lookup in public.users failed:', {
            authError: { message: authError.message, status: authError.status, code: authError.code },
            lookupError,
          })
          return NextResponse.json({ error: 'Account lookup failed' }, { status: 500 })
        }
        // Update existing user record
        await supabase.from('users').upsert({
          id: existingProfile.id,
          email,
          display_name: displayName,
          first_name: displayName,
          plan: 'subscriber',
          subscription_ends_at: trialEndsAt,
          subscription_type: 'trial',
          signup_source: 'gvl-listen',
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          listen_arm: armNum,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

        // Fetch Ep4 audio_url (token generated at tap time via /api/listen/auth-link now)
        const { data: ep4 } = await supabase.from('stories').select('story_audio_url').eq('id', EP4_ID).single()

        return NextResponse.json({
          ok: true,
          userId: existingProfile.id,
          continueEpisodeId: EP4_ID,
          continueAudioUrl: ep4?.story_audio_url ?? null,
          note: 'existing user updated',
        })
      }

      console.error('[listen/signup] auth createUser error:', { message: authError.message, status: authError.status, code: authError.code })
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Insert/upsert users record
    const { error: userError } = await supabase.from('users').upsert({
      id: userId,
      email,
      display_name: displayName,
      first_name: displayName,
      plan: 'subscriber',
      subscription_ends_at: trialEndsAt,
      subscription_type: 'trial',
      signup_source: 'gvl-listen',
      utm_source: utmSource ?? null,
      utm_campaign: utmCampaign ?? null,
      listen_arm: armNum,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    if (userError) {
      console.error('[listen/signup] users upsert error:', userError)
      // Auth user created but profile failed — still return userId so client can proceed
      return NextResponse.json({ error: 'Profile creation failed', userId }, { status: 500 })
    }

    // 3. Fire wall_submit tracking event via the go-listen ingest endpoint
    // (fire-and-forget — tracking never blocks signup response)
    if (sessionId && typeof sessionId === 'string') {
      const variant = `listen-arm${armNum}` as const
      // Server-side fire: use the app's own base URL (localhost in dev, VERCEL_URL in prod)
      const appBase = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3001'
      void fetch(`${appBase}/api/go-listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          variant,
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          event: 'wall_submit',
          position_seconds: 0,
        }),
        // keepalive not needed server-side
      }).catch(() => { /* silent — tracking never blocks */ })
    }

    // 4. Fetch Ep4 audio_url + seed user_library in parallel
    // Token is generated at tap time via /api/listen/auth-link (not here)
    const [ep4Result] = await Promise.all([
      supabase.from('stories').select('story_audio_url').eq('id', EP4_ID).single(),
      (async () => {
        try {
          const { error } = await supabase.from('user_library').upsert({
            user_id: userId,
            story_id: EP4_ID,
            progress: 61, // Just above ContinueListening >60s threshold; updated to real position on /home
            completed: false,
            hide_from_home: false,
            not_for_me: false,
            last_played: new Date().toISOString(),
          }, { onConflict: 'user_id,story_id' })
          if (error) console.warn('[listen/signup] user_library seed failed (non-fatal):', error.message)
        } catch (e) { console.warn('[listen/signup] user_library seed error (non-fatal):', e) }
      })(),
    ])

    return NextResponse.json({
      ok: true,
      userId,
      continueEpisodeId: EP4_ID,
      continueAudioUrl: ep4Result.data?.story_audio_url ?? null,
    })
  } catch (err) {
    console.error('[listen/signup] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
