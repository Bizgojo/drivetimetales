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
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { normalizeEmail } from '@/lib/email'
import { sendServerEvent } from '@/lib/tracking/capi'
import { randomEventId } from '@/lib/tracking/events'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

// The arm determines which promo audio plays on the gate page — it does NOT
// determine what gets seeded post-signup. All three arms land on EP2.
// PV IDs (a8c8b8d0, a88084ab, a37fdc46) have status=audio_ready + is_hidden=true
// and cannot be loaded by non-admin users; seeding them caused the continue card
// to show "This story isn't available yet" immediately after signup (Marc, 2026-08-11).
const SEED_STORY_ID = '759dc525-185c-450f-b249-17e4a525ba60' // EP2: The Seventh Token

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Marc-approved Belle B voice settings for welcome audio (2026-08-11)
const BELLE_VOICE_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}

/**
 * Apply volume=1.5 via ffmpeg if available; return raw buffer on failure.
 * Never throws — ffmpeg absence is silently tolerated.
 */
function applyVolumeToMp3(rawBuf: Buffer): Buffer {
  const tmpDir = os.tmpdir()
  const rawPath = path.join(tmpDir, `seg1_raw_${Date.now()}.mp3`)
  const wavPath = path.join(tmpDir, `seg1_${Date.now()}.wav`)
  const outPath = path.join(tmpDir, `seg1_final_${Date.now()}.mp3`)
  try {
    fs.writeFileSync(rawPath, rawBuf)
    execSync(`ffmpeg -y -i ${rawPath} -ar 44100 -ac 2 -c:a pcm_s16le ${wavPath}`, { stdio: 'pipe', timeout: 10000 })
    execSync(`ffmpeg -y -i ${wavPath} -af "volume=1.5" -c:a libmp3lame -b:a 192k -ar 44100 -ac 2 ${outPath}`, { stdio: 'pipe', timeout: 10000 })
    return fs.readFileSync(outPath)
  } catch {
    console.warn('[invite-signup] ffmpeg volume step skipped — serving raw ElevenLabs MP3')
    return rawBuf
  } finally {
    for (const f of [rawPath, wavPath, outPath]) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}

/**
 * BELLE-WELCOME-001 (Marc, 2026-08-11)
 * Pre-render Belle Seg 1 at signup so audio URL is ready when /home loads.
 * Non-fatal: any failure here still allows signup to proceed.
 * Wraps in a 3.5s timeout — if ElevenLabs is slow, skips gracefully.
 * URL stored in user_metadata.welcome_seg1_url; home page reads it on mount.
 */
async function renderAndStoreBelleWelcomeSeg1(
  userId: string,
  firstName: string,
): Promise<void> {
  const elKey = process.env.ELEVENLABS_API_KEY
  if (!elKey) {
    console.warn('[invite-signup] ELEVENLABS_API_KEY missing — skipping welcome seg1 render')
    return
  }

  const voiceId = CANONICAL_BELLE_B_VOICE_ID
  const seg1Text = `Welcome, ${firstName}. I'm glad you decided to join us.`
  const fileName = `welcome-seg1-${firstName.toLowerCase()}-${userId.slice(0, 8)}.mp3`

  const renderWithTimeout = new Promise<void>((resolve) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      console.warn('[invite-signup] Belle Seg1 render timed out at 3.5s — skipping')
      resolve()
    }, 3500)

    ;(async () => {
      try {
        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: seg1Text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: BELLE_VOICE_SETTINGS,
          }),
          signal: controller.signal,
        })

        if (!elRes.ok) {
          console.warn('[invite-signup] ElevenLabs Seg1 render failed:', elRes.status)
          return
        }

        const rawBuf = Buffer.from(await elRes.arrayBuffer())
        const audioBuf = applyVolumeToMp3(rawBuf)

        // Upload to names bucket; upsert so re-signups don't error
        const { error: uploadError } = await supabase.storage
          .from('names')
          .upload(fileName, audioBuf, { contentType: 'audio/mpeg', upsert: true })

        if (uploadError) {
          console.warn('[invite-signup] Seg1 upload failed (non-fatal):', uploadError.message)
          return
        }

        const { data: { publicUrl } } = supabase.storage.from('names').getPublicUrl(fileName)

        // Store on user_metadata so home page can read without an extra API call
        const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { welcome_seg1_url: publicUrl },
        })

        if (metaError) {
          console.warn('[invite-signup] user_metadata update failed (non-fatal):', metaError.message)
        } else {
          console.log('[invite-signup] Belle Seg1 rendered and stored for userId:', userId.slice(0, 8))
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return // timeout handled above
        console.warn('[invite-signup] Belle Seg1 render error (non-fatal):', err?.message)
      } finally {
        clearTimeout(timeoutId)
        resolve()
      }
    })()
  })

  await renderWithTimeout
}

/**
 * Non-fatal user_library seed — sets progress=0 so EP2 surfaces on /home.
 * All arms seed EP2 regardless of which promo played on the gate page.
 * Mirrors the pattern in app/api/listen/signup/route.ts (EP4 seeding).
 */
async function seedUserLibrary(userId: string, _armNum: 1 | 2 | 3): Promise<void> {
  try {
    const { error } = await supabase.from('user_library').upsert({
      user_id: userId,
      story_id: SEED_STORY_ID,
      progress: 0, // start from beginning — was 61 (Marc 2026-08-11)
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
        // GATE-PROTECT-001: query subscription status before any field writes.
        // Active users must NEVER be downgraded; trialed users must not receive a second trial.
        const { data: existingUser } = await supabase
          .from('users')
          .select('subscription_type, subscription_ends_at, trial_started_at, first_name')
          .eq('id', found.id)
          .maybeSingle()

        const isActive = existingUser?.subscription_type === 'active'
        const hasHadTrial = existingUser?.trial_started_at != null

        // Helper: fire wall_submit tracking + Lead CAPI (non-fatal, shared across all cases)
        const fireTracking = () => {
          if (sessionId && typeof sessionId === 'string' && sessionId.length > 0) {
            const appBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001'
            void fetch(`${appBase}/api/go-listen`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: sessionId, variant: `bell-arm${armNum}`,
                utm_source: utmSource ?? null, utm_campaign: utmCampaign ?? null,
                event: 'wall_submit', position_seconds: 0,
              }),
            }).catch(() => { /* silent — tracking never blocks signup */ })
          }
          void sendServerEvent({ name: 'Lead', eventId: randomEventId('lead'), email, customData: { arm: armNum, content_name: 'bell-arm-wall-submit' } })
        }

        if (isActive) {
          // Case (c): Currently paying customer — touch ONLY listen_arm. NEVER touch subscription fields.
          await supabase.from('users').update({ listen_arm: armNum, updated_at: new Date().toISOString() }).eq('id', found.id)
          await seedUserLibrary(found.id, armNum as 1 | 2 | 3)
          fireTracking()
          return NextResponse.json({ ok: true, active: true, userId: found.id })
        }

        if (hasHadTrial) {
          // Case (b): Has had a prior trial, not currently active — deny second trial.
          // Do NOT modify subscription_type, subscription_ends_at, or plan.
          await supabase.from('users').update({ listen_arm: armNum, updated_at: new Date().toISOString() }).eq('id', found.id)
          await seedUserLibrary(found.id, armNum as 1 | 2 | 3)
          fireTracking()
          const displayName = existingUser?.first_name || firstName
          return NextResponse.json({ ok: true, returning: true, userId: found.id, firstName: displayName, email: found.email })
        }

        // Case (a) for 422 path: existing auth user but no prior trial record — grant trial.
        // Post-migration this is rare (backfill covers subscription_ends_at rows) but handled defensively.
        await supabase.from('users').upsert({
          id: found.id,
          email,
          first_name: firstName,
          display_name: firstName,
          plan: 'subscriber',
          subscription_ends_at: trialEndsAt,
          subscription_type: 'trial',
          trial_started_at: new Date().toISOString(),
          signup_source: 'bell-invitation',
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          listen_arm: armNum,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

        // FIX 4: Seed user_library so ContinueListening shows on /home
        await seedUserLibrary(found.id, armNum as 1 | 2 | 3)

        // BELLE-WELCOME-001: Pre-render Seg 1 at signup so URL is ready on /home
        await renderAndStoreBelleWelcomeSeg1(found.id, firstName)

        fireTracking()
        return NextResponse.json({ ok: true, userId: found.id, note: 'existing user — first trial granted' })
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
    //
    // FIX-1c: Use ilike() for case-insensitive matching so mixed-case legacy rows
    // (e.g. 'M.Smith@gmail.com') are detected when the incoming address is lowercase.
    // Escape LIKE wildcards ('%' and '_') before passing — underscores appear in real
    // addresses (e.g. first_last@gmail.com) and are single-char wildcards in LIKE.
    const escapedEmail = email.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .ilike('email', escapedEmail)
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
          trial_started_at: new Date().toISOString(),
          signup_source: 'bell-invitation',
          utm_source: utmSource ?? null,
          utm_campaign: utmCampaign ?? null,
          listen_arm: armNum,
          updated_at: new Date().toISOString(),
        })
        .ilike('email', escapedEmail) // case-insensitive — matches mixed-case legacy rows (FIX-1c)
        .neq('id', userId) // guard: only targets the orphaned row, not an already-correct one
      if (collisionUpdateError) {
        console.error('[invite-signup] email-collision id-swap failed (full error):', collisionUpdateError)
        return NextResponse.json({ error: 'Profile recovery failed — contact support' }, { status: 500 })
      }
      // Seed user_library with new auth id (row now has id = userId after the swap)
      await seedUserLibrary(userId, armNum as 1 | 2 | 3)
      // BELLE-WELCOME-001: Pre-render Seg 1 at signup
      await renderAndStoreBelleWelcomeSeg1(userId, firstName)
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
        trial_started_at: new Date().toISOString(),
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
      // BELLE-WELCOME-001: Pre-render Seg 1 at signup so URL is ready on /home
      await renderAndStoreBelleWelcomeSeg1(userId, firstName)
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
