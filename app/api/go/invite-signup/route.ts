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
import { sendServerEvent } from '@/lib/tracking/capi'
import { randomEventId } from '@/lib/tracking/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

// Bell story IDs per arm — path segments asc3/<id>/final_mix_cta.mp3 in
// GoInvitationContent.tsx ARE the stories.id values (confirmed from comments
// PV1/arm=1: Liberty Bridge, PV2/arm=2: Mara Vance, PV3-B1/arm=3: Reedy River).
const BELL_STORY_IDS: Record<1 | 2 | 3, string> = {
  1: 'a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e', // PV1 — Liberty Bridge
  2: 'a88084ab-62e3-47f4-9b7a-5cbc32943349', // PV2 — Mara Vance
  3: 'a37fdc46-24d0-49a7-b749-320076978c3b', // PV3-B1 — Reedy River
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Non-fatal user_library seed — sets progress=61 (above ContinueListening's
 * >60s threshold) so the arm's story surfaces as a continue card on /home.
 * Mirrors the pattern in app/api/listen/signup/route.ts (EP4 seeding).
 */
async function seedUserLibrary(userId: string, armNum: 1 | 2 | 3): Promise<void> {
  try {
    const { error } = await supabase.from('user_library').upsert({
      user_id: userId,
      story_id: BELL_STORY_IDS[armNum],
      progress: 61, // just above >60s threshold; updated to real position when user plays
      completed: false,
      hide_from_home: false,
      not_for_me: false,
      last_played: new Date().toISOString(),
    }, { onConflict: 'user_id,story_id' })
    if (error) console.warn('[invite-signup] user_library seed failed (non-fatal):', error.message)
  } catch (e) {
    console.warn('[invite-signup] user_library seed error (non-fatal):', e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 2048) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }

    const body = await req.json()
    const { email: rawEmail, name: rawName, arm, sessionId, utmSource, utmCampaign } = body
    const firstName = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : 'Listener'

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
      // Existing user path — look up, update subscription.
      // GoTrue returns status 422 (Unprocessable Entity) with code 'email_exists'
      // or 'user_already_exists' when the email already has an auth account.
      // Branch on structured error fields — NOT on message substrings.
      if (authError.status === 422) {
        // Resolve against auth.users via paginated loop — NOT public.users.
        // 9 auth accounts currently have no public.users row; querying public.users
        // would fail on exactly those cases. Page through auth.users 50 at a time
        // (correct at any account count, no magic page-size limit).
        let page = 1
        let found: { id: string; email: string } | null = null
        while (true) {
          const { data: pageData, error: pageError } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
          if (pageError || !pageData?.users?.length) break
          const match = pageData.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
          if (match) { found = { id: match.id, email: match.email ?? email }; break }
          if (pageData.users.length < 50) break // last page reached
          page++
        }
        if (!found) {
          console.error('[invite-signup] could not locate existing user in auth after 422:', { email, authErrorCode: authError.code, authErrorStatus: authError.status })
          return NextResponse.json({ error: 'Account lookup failed' }, { status: 500 })
        }
        await supabase.from('users').upsert({
          id: found.id,
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

        // FIX 4: Seed user_library so ContinueListening shows on /home
        await seedUserLibrary(found.id, armNum as 1 | 2 | 3)

        // FIX 1: Fire wall_submit tracking (was missing for existing-user path)
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

        // Fire Lead CAPI for returning users too (GATE-TRACK-001)
        void sendServerEvent({
          name: 'Lead',
          eventId: randomEventId('lead'),
          email,
          customData: { arm: armNum, content_name: 'bell-arm-wall-submit' },
        })
        return NextResponse.json({ ok: true, userId: found.id, note: 'existing user' })
      }
      console.error('[invite-signup] createUser error:', { message: authError.message, status: authError.status, code: authError.code })
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Check for email collision in public.users before upserting.
    // public.users has a UNIQUE index on email (users_email_key). If a row already
    // exists with this email but a different id (orphaned profile — no matching auth
    // account), an INSERT would hit the constraint and fail. Use maybeSingle() to
    // detect and branch before the write.
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile) {
      // Email collision: orphaned public.users row (no matching auth account).
      // UPDATE in-place: swap the id to the new auth id so app/api/user/route.ts
      // can resolve the row by auth id. Preserves stripe_customer_id and all
      // other columns not touched here.
      // Marc 2026-08-11: verified zero child rows across all 13 FKs — safe to swap.
      console.warn('[invite-signup] email-collision: swapping orphaned row id to new auth id', {
        newAuthId: userId,
        orphanedId: existingProfile.id,
      })
      const { error: collisionUpdateError } = await supabase
        .from('users')
        .update({
          id: userId,
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
        })
        .eq('email', email)
        .neq('id', userId) // guard: only targets the orphaned row, not an already-correct one
      if (collisionUpdateError) {
        console.error('[invite-signup] email-collision id-swap failed (full error):', collisionUpdateError)
        return NextResponse.json({ error: 'Profile recovery failed — contact support' }, { status: 500 })
      }
      // Seed user_library with new auth id (row now has id = userId after the swap)
      await seedUserLibrary(userId, armNum as 1 | 2 | 3)
    } else {
      // No collision — proceed with standard upsert
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

      // 2b. Seed user_library — non-fatal; ContinueListening requires progress > 60s
      await seedUserLibrary(userId, armNum as 1 | 2 | 3)
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

    // 4. Fire Lead CAPI to Meta (fire-and-forget — GATE-TRACK-001)
    const appBase = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3001'
    void sendServerEvent({
      name: 'Lead',
      eventId: randomEventId('lead'),
      email,
      customData: { arm: armNum, content_name: 'bell-arm-wall-submit' },
      sourceUrl: `${appBase}/go?arm=${armNum}`,
    })

    return NextResponse.json({ ok: true, userId })
  } catch (err) {
    console.error('[invite-signup] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
