import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STOP_REASONS = new Set([
  'completed',
  'not_for_me',
  'navigated_away',
  'network_error',
  'app_closed',
  'manual_pause',
])

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
      const row = {
        user_id: user.id,
        story_id: storyId,
        session_id: sessionId,
        started_at: isoOrNow(body?.startedAt),
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
        stop_reason: null,
        seconds_played: 0,
        progress_pct: 0,
      }
      const { data, error } = await supabase.from('play_events').insert(row).select('id').single()
      if (error) {
        console.warn('[analytics/play-event] start failed:', error.message)
        return NextResponse.json({ error: 'Failed to record play start' }, { status: 500 })
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[analytics/play-event] unexpected error:', error)
    return NextResponse.json({ error: 'Failed to record play event' }, { status: 500 })
  }
}
