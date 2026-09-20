import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendServerEvent } from '@/lib/tracking/capi'
import { playStartEventId } from '@/lib/tracking/events'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STOP_REASONS = new Set([
  'completed',
  'not_for_me',
  'navigated_away',
  'network_error',
  'app_closed',
  'manual_pause',
  // ORION-ANALYTICS-GAP-001 (2026-07-15): diagnostic stop reasons —
  // tab_hidden = session left open with audio paused when the tab went hidden;
  // playback_error = terminal player error (stall unrecovered / final-mix
  // retries exhausted). Free text in play_events.stop_reason; this set is the
  // server-side vocabulary.
  'tab_hidden',
  'playback_error',
])

// ORION-ANALYTICS-GAP-001: how the play session started. Encoded in the
// existing text column `origin` for non-gesture starts (play_events has no
// jsonb/metadata column; adding one requires Marc-approved schema work).
const VALID_START_SOURCES = new Set(['gesture', 'autoplay', 'auto_advance'])

const SPURIOUS_ENDED_STOP_REASON = 'spurious_ended_recovered'
const DIAGNOSTIC_BEACON_ORIGIN = 'diagnostic_beacon'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) throw new Error('Missing Supabase service environment')
  return createClient(url, service, { auth: { persistSession: false } })
}

async function currentUser() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/**
 * CAPI-PLAYSTART-001: has this listening session already recorded a start?
 * Called AFTER this request's insert, so the session's first start sees
 * exactly 1 row; a duplicate/retried start sees 2+ and skips the send.
 * Fails OPEN (sends) on a query error — Meta also dedups on event_id, so a
 * rare double send collapses to one event anyway.
 */
async function isFirstStartForSession(supabase: SupabaseClient, sessionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('play_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (error) {
    console.warn('[analytics/play-event] session dedupe check failed:', error.message)
    return true
  }
  return (count ?? 1) <= 1
}

function numberOrNull(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isoOrNow(value: unknown) {
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return new Date().toISOString()
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const action = body?.action
    const storyId = stringOrNull(body?.storyId)
    const sessionId = stringOrNull(body?.sessionId)

    if (!storyId || !sessionId) {
      return NextResponse.json({ error: 'Missing storyId or sessionId' }, { status: 400 })
    }

    const supabase = adminClient()

    if (action === 'start') {
      const device = body?.device || {}
      // ORION-ANALYTICS-GAP-001: non-gesture starts (autoplay / auto_advance)
      // record their start source in `origin`; gesture starts keep the
      // client-detected acquisition origin exactly as before.
      const startSource = stringOrNull(body?.startSource)
      const origin =
        startSource && startSource !== 'gesture' && VALID_START_SOURCES.has(startSource)
          ? startSource
          : stringOrNull(body?.origin) || 'direct'
      const row = {
        user_id: user.id,
        story_id: storyId,
        session_id: sessionId,
        started_at: isoOrNow(body?.startedAt),
        device_type: stringOrNull(device.device_type) || 'unknown',
        device_os: stringOrNull(device.device_os) || 'unknown',
        browser: stringOrNull(device.browser) || 'unknown',
        is_offline: Boolean(body?.isOffline),
        origin,
        referrer_url: stringOrNull(body?.referrerUrl),
        genre: stringOrNull(body?.genre),
        author: stringOrNull(body?.author),
        narrator: stringOrNull(body?.narrator),
        duration_mins: numberOrNull(body?.durationMins),
        stop_reason: null,
        seconds_played: 0,
        progress_pct: 0,
      }
      const { data, error } = await supabase.from('play_events').insert(row).select('id').single()
      if (error) {
        console.warn('[analytics/play-event] start failed:', error.message)
        return NextResponse.json({ error: 'Failed to record play start' }, { status: 500 })
      }

      // CAPI-PLAYSTART-001: server-side PlayStart (Meta CAPI + TikTok Events).
      // The earliest signal we can optimise on — StartTrial lands after
      // checkout and Purchase ~14 days later. Hashed identifiers only
      // (em/external_id are hashed inside sendServerEvent). event_id
      // play_<sessionId> matches the client pixel fire in
      // lib/analytics.ts → platforms dedup client+server to ONE event.
      // Awaited (≤4s, never throws) so Vercel can't kill the request before
      // the send completes — the player does not await this response.
      if (await isFirstStartForSession(supabase, sessionId)) {
        await sendServerEvent({
          name: 'PlayStart',
          eventId: playStartEventId(sessionId),
          email: user.email || null,
          externalId: user.id,
          sourceUrl: `${new URL(req.url).origin}/player/${storyId}`,
          customData: {
            story_id: storyId,
            series_id: stringOrNull(body?.seriesId) || undefined,
            episode_number: numberOrNull(body?.episodeNumber) ?? undefined,
            genre: row.genre || undefined,
            start_source: startSource || 'gesture',
            content_name: 'Endless Tales Story',
          },
        })
      }

      return NextResponse.json({ success: true, id: data?.id || null })
    }

    if (action === 'end') {
      const stopReason = stringOrNull(body?.stopReason) || 'navigated_away'
      if (!VALID_STOP_REASONS.has(stopReason)) {
        return NextResponse.json({ error: 'Invalid stopReason' }, { status: 400 })
      }

      const secondsPlayed = Math.max(0, Math.floor(Number(body?.secondsPlayed || 0)))
      const progressPct = Math.max(0, Math.min(100, Math.round(Number(body?.progressPct || 0))))
      const endedAt = isoOrNow(body?.endedAt)
      const eventId = stringOrNull(body?.eventId)
      const update = {
        ended_at: endedAt,
        seconds_played: secondsPlayed,
        progress_pct: progressPct,
        stop_reason: stopReason,
      }

      if (eventId) {
        const { error } = await supabase
          .from('play_events')
          .update(update)
          .eq('id', eventId)
          .eq('user_id', user.id)
        if (!error) return NextResponse.json({ success: true, mode: 'updated' })
        console.warn('[analytics/play-event] end update by id failed:', error.message)
      }

      const { data: existing, error: lookupError } = await supabase
        .from('play_events')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!lookupError && existing?.id) {
        const { error } = await supabase
          .from('play_events')
          .update(update)
          .eq('id', existing.id)
          .eq('user_id', user.id)
        if (!error) return NextResponse.json({ success: true, mode: 'updated_by_session' })
      }

      const startedAt = isoOrNow(body?.startedAt || new Date(Date.now() - secondsPlayed * 1000).toISOString())
      const device = body?.device || {}
      const { error: insertError } = await supabase.from('play_events').insert({
        user_id: user.id,
        story_id: storyId,
        session_id: sessionId,
        started_at: startedAt,
        ended_at: endedAt,
        device_type: stringOrNull(device.device_type) || 'unknown',
        device_os: stringOrNull(device.device_os) || 'unknown',
        browser: stringOrNull(device.browser) || 'unknown',
        is_offline: Boolean(body?.isOffline),
        origin: stringOrNull(body?.origin) || 'direct',
        referrer_url: stringOrNull(body?.referrerUrl),
        genre: stringOrNull(body?.genre),
        author: stringOrNull(body?.author),
        narrator: stringOrNull(body?.narrator),
        duration_mins: numberOrNull(body?.durationMins),
        seconds_played: secondsPlayed,
        progress_pct: progressPct,
        stop_reason: stopReason,
      })

      if (insertError) {
        console.warn('[analytics/play-event] end fallback insert failed:', insertError.message)
        return NextResponse.json({ error: 'Failed to record play end' }, { status: 500 })
      }

      return NextResponse.json({ success: true, mode: 'inserted_end_fallback' })
    }

    // ORION-ANALYTICS-GAP-001 §3 — spurious-ended diagnostic beacon.
    // Zero-length marker row written when the ORION-PLAYER-ENDED-001 guard
    // suppressed a false 'ended' (Firefox truncated-stream class) and playback
    // recovered in place. NOT a session end — the live session row is untouched.
    // Exclude from all listening metrics via origin = 'diagnostic_beacon'.
    if (action === 'beacon') {
      const device = body?.device || {}
      const nowIso = new Date().toISOString()
      const detail = stringOrNull(body?.detail)
      const { error } = await supabase.from('play_events').insert({
        user_id: user.id,
        story_id: storyId,
        session_id: sessionId,
        started_at: nowIso,
        ended_at: nowIso,
        seconds_played: 0,
        progress_pct: 0,
        stop_reason: SPURIOUS_ENDED_STOP_REASON,
        origin: DIAGNOSTIC_BEACON_ORIGIN,
        referrer_url: detail ? detail.slice(0, 500) : null,
        device_type: stringOrNull(device.device_type) || 'unknown',
        device_os: stringOrNull(device.device_os) || 'unknown',
        browser: stringOrNull(device.browser) || 'unknown',
        is_offline: Boolean(body?.isOffline),
      })
      if (error) {
        console.warn('[analytics/play-event] beacon insert failed:', error.message)
        return NextResponse.json({ error: 'Failed to record beacon' }, { status: 500 })
      }
      return NextResponse.json({ success: true, mode: 'beacon' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[analytics/play-event] unexpected error:', error)
    return NextResponse.json({ error: 'Failed to record play event' }, { status: 500 })
  }
}
