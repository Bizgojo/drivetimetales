// app/api/listen/signup/route.ts — GVL-EAVESDROP-001
// Free-week account creation for the /listen eavesdrop landing page.
//
// No Stripe. No email sending. User gets immediate access via subscription_ends_at.
// Name + email only. service role key used — never shipped client-side.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

// Episode 4 — the first post-signup episode (GVL Wearing My Face series)
const EP4_ID = 'eac2b1ef-6456-46b1-8c17-bbdf32d8ff5d'

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

    // Validate required fields
    if (!firstName || typeof firstName !== 'string' || firstName.trim().length < 1) {
      return NextResponse.json({ error: 'firstName is required' }, { status: 400 })
    }
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
      user_metadata: { first_name: firstName.trim() },
    })

    if (authError) {
      // If user already exists, look them up
      if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existing = existingUsers?.users?.find((u: { email?: string; id: string }) => u.email === email)
        if (!existing) {
          console.error('[listen/signup] auth createUser error:', authError)
          return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
        }
        // Update existing user record
        await supabase.from('users').upsert({
          id: existing.id,
          email,
          first_name: firstName.trim(),
          plan: 'subscriber',
          subscription_ends_at: trialEndsAt,
          subscription_type: 'trial',
          signup_source: 'gvl-listen',
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

        // Fetch Ep4 audio_url for the continue experience
        const { data: ep4 } = await supabase
          .from('stories')
          .select('story_audio_url')
          .eq('id', EP4_ID)
          .single()

        return NextResponse.json({
          ok: true,
          userId: existing.id,
          continueEpisodeId: EP4_ID,
          continueAudioUrl: ep4?.story_audio_url ?? null,
          note: 'existing user updated',
        })
      }

      console.error('[listen/signup] auth createUser error:', authError)
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Insert/upsert users record
    const { error: userError } = await supabase.from('users').upsert({
      id: userId,
      email,
      first_name: firstName.trim(),
      plan: 'subscriber',
      subscription_ends_at: trialEndsAt,
      subscription_type: 'trial',
      signup_source: 'gvl-listen',
      utm_source: utmSource ?? null,
      utm_campaign: utmCampaign ?? null,
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
      void fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3001'}/api/go-listen`, {
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

    // 4. Fetch Ep4 audio_url for the continue experience
    const { data: ep4 } = await supabase
      .from('stories')
      .select('story_audio_url')
      .eq('id', EP4_ID)
      .single()

    return NextResponse.json({
      ok: true,
      userId,
      continueEpisodeId: EP4_ID,
      continueAudioUrl: ep4?.story_audio_url ?? null,
    })
  } catch (err) {
    console.error('[listen/signup] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
