/**
 * Endless Tales — Analytics Library
 * Tracks play sessions, user behavior, and device info.
 * All functions are fire-and-forget — never block the player.
 */

import { supabase } from './supabase'

// ORION-ANALYTICS-GAP-001 (2026-07-15): 'tab_hidden' (session left open, audio
// paused, tab went hidden) and 'playback_error' (terminal player error — stall
// unrecovered / final-mix retries exhausted) added so session ends are
// diagnosable. Values are free text in play_events.stop_reason (no DB
// constraint); the API whitelist in app/api/analytics/play-event/route.ts is
// the single server-side vocabulary.
type StopReason =
  | 'completed'
  | 'not_for_me'
  | 'navigated_away'
  | 'network_error'
  | 'app_closed'
  | 'manual_pause'
  | 'tab_hidden'
  | 'playback_error'

// ORION-ANALYTICS-GAP-001: how a play session STARTED. Proven gap (walk account
// gvlwalk0715a/69c3ab3a, 2026-07-14/15): sessions were only created on
// user-gesture play, so auto-advanced Ep2/Ep3 produced ZERO play_events rows and
// the Ep1→Ep2 continuation metric was blind. play_events has NO jsonb/metadata
// column (see supabase/migrations/20260527000_create_play_events.sql), so the
// discriminator is encoded in the existing text column `origin`:
//   - 'gesture'      → origin keeps its acquisition semantics (direct/tiktok/…)
//   - 'autoplay'     → origin = 'autoplay'
//   - 'auto_advance' → origin = 'auto_advance'
// Auto-started rows did not exist before this change, so no existing
// acquisition query loses data; acquisition origin lives on the gesture row
// that started the listening chain.
export type PlayStartSource = 'gesture' | 'autoplay' | 'auto_advance'

// Marker value for the spurious-ended diagnostic beacon rows (NOT a session
// stop reason — the session keeps running after recovery). Beacon rows are
// zero-length rows with origin = 'diagnostic_beacon' so every session/
// listening query can exclude them with one predicate.
export const SPURIOUS_ENDED_STOP_REASON = 'spurious_ended_recovered'
export const DIAGNOSTIC_BEACON_ORIGIN = 'diagnostic_beacon'

type PlayEventSnapshot = {
  userId: string | undefined
  storyId: string
  genre?: string
  author?: string
  narrator?: string
  durationMins?: number
  startedAt: string
}

// ── Device detection ──────────────────────────────────────────────────────────

export function getDeviceInfo() {
  if (typeof window === 'undefined') return { device_type: 'unknown', device_os: 'unknown', browser: 'unknown' }

  const ua = navigator.userAgent.toLowerCase()

  const device_type = /mobile|iphone|ipod|android.*mobile/.test(ua)
    ? 'mobile'
    : /tablet|ipad|android(?!.*mobile)/.test(ua)
    ? 'tablet'
    : 'desktop'

  const device_os = /iphone|ipad|ipod/.test(ua)
    ? 'ios'
    : /android/.test(ua)
    ? 'android'
    : /mac os x/.test(ua)
    ? 'macos'
    : /windows/.test(ua)
    ? 'windows'
    : 'unknown'

  const browser = /firefox/.test(ua)
    ? 'firefox'
    : /edg/.test(ua)
    ? 'edge'
    : /chrome/.test(ua)
    ? 'chrome'
    : /safari/.test(ua)
    ? 'safari'
    : 'unknown'

  return { device_type, device_os, browser }
}

export function getOrigin(): { origin: string; referrer_url: string } {
  if (typeof window === 'undefined') return { origin: 'unknown', referrer_url: '' }

  const referrer = document.referrer || ''
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  const utm_source = params.get('utm_source')

  let origin = 'direct'
  if (ref) origin = 'referral'
  else if (utm_source === 'tiktok') origin = 'tiktok'
  else if (utm_source === 'facebook' || utm_source === 'fb') origin = 'facebook'
  else if (utm_source === 'qr') origin = 'qr'
  else if (referrer.includes('google')) origin = 'google'
  else if (referrer.includes('tiktok')) origin = 'tiktok'
  else if (referrer.includes('facebook') || referrer.includes('fb.com')) origin = 'facebook'
  else if (referrer.includes('twitter') || referrer.includes('x.com')) origin = 'twitter'
  else if (referrer.includes('reddit')) origin = 'reddit'
  else if (referrer && !referrer.includes('endless-tales')) origin = 'organic'

  return { origin, referrer_url: referrer }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

// ── Session tracking ──────────────────────────────────────────────────────────

let currentSessionId: string | null = null
let currentEventId: string | null = null
let playStartTime: number | null = null
let currentSnapshot: PlayEventSnapshot | null = null

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function postPlayEvent(payload: Record<string, unknown>, keepalive = false) {
  if (typeof fetch === 'undefined') return null
  const response = await fetch('/api/analytics/play-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive,
    body: JSON.stringify(payload),
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

/**
 * Call when user taps Play for the first time on a story.
 * Creates a play_events row and returns the event id.
 */
export async function trackPlayStart(params: {
  userId: string | undefined
  storyId: string
  genre?: string
  author?: string
  narrator?: string
  durationMins?: number
  // ORION-ANALYTICS-GAP-001: defaults to 'gesture' so every existing caller
  // keeps its exact behavior; autoplay/auto-advance starts pass their source.
  startSource?: PlayStartSource
}): Promise<void> {
  try {
    currentSessionId = generateUUID()
    playStartTime = Date.now()
    const startedAt = new Date().toISOString()
    currentSnapshot = { ...params, startedAt }

    const startSource: PlayStartSource = params.startSource || 'gesture'
    const { device_type, device_os, browser } = getDeviceInfo()
    const { origin: acquisitionOrigin, referrer_url } = getOrigin()
    // Non-gesture starts encode the start source in `origin` (no jsonb column
    // exists on play_events; adding one needs Marc's word — see PlayStartSource).
    const origin = startSource === 'gesture' ? acquisitionOrigin : startSource

    const row = {
      user_id: params.userId || null,
      story_id: params.storyId,
      session_id: currentSessionId,
      started_at: startedAt,
      device_type,
      device_os,
      browser,
      is_offline: isOffline(),
      origin,
      referrer_url: referrer_url || null,
      genre: params.genre || null,
      author: params.author || null,
      narrator: params.narrator || null,
      duration_mins: params.durationMins || null,
      stop_reason: null,
      seconds_played: 0,
      progress_pct: 0,
    }

    if (params.userId) {
      const apiResult = await postPlayEvent({
        action: 'start',
        sessionId: currentSessionId,
        storyId: params.storyId,
        startedAt,
        startSource,
        genre: params.genre || null,
        author: params.author || null,
        narrator: params.narrator || null,
        durationMins: params.durationMins || null,
        device: { device_type, device_os, browser },
        origin,
        referrerUrl: referrer_url || null,
        isOffline: isOffline(),
      })
      if (apiResult?.id) {
        currentEventId = apiResult.id
        return
      }
    }

    const { data, error } = await supabase.from('play_events').insert(row).select('id').single()
    if (!error && data) {
      currentEventId = data.id
    }
  } catch (e) {
    // Never crash the player
    console.warn('[analytics] trackPlayStart failed:', e)
  }
}

/**
 * Call when play session ends for any reason.
 */
export async function trackPlayEnd(params: {
  userId: string | undefined
  storyId: string
  currentTime: number
  totalDuration: number
  stopReason: StopReason
  keepalive?: boolean
}): Promise<void> {
  try {
    const secondsPlayed = playStartTime ? Math.floor((Date.now() - playStartTime) / 1000) : Math.floor(params.currentTime)
    const progressPct = params.totalDuration > 0 ? Math.round(params.currentTime / params.totalDuration * 100) : 0
    const endedAt = new Date().toISOString()
    const sessionId = currentSessionId
    const eventId = currentEventId
    const snapshot = currentSnapshot

    let completed = false
    const { device_type, device_os, browser } = getDeviceInfo()
    const { origin, referrer_url } = getOrigin()

    if (params.userId) {
      const apiResult = await postPlayEvent({
        action: 'end',
        eventId,
        sessionId,
        storyId: params.storyId,
        startedAt: snapshot?.startedAt || null,
        endedAt,
        currentTime: params.currentTime,
        totalDuration: params.totalDuration,
        secondsPlayed,
        progressPct,
        stopReason: params.stopReason,
        genre: snapshot?.genre || null,
        author: snapshot?.author || null,
        narrator: snapshot?.narrator || null,
        durationMins: snapshot?.durationMins || null,
        device: { device_type, device_os, browser },
        origin,
        referrerUrl: referrer_url || null,
        isOffline: isOffline(),
      }, params.keepalive)
      completed = Boolean(apiResult?.success)
    }

    if (!completed && eventId) {
      const { error } = await supabase.from('play_events').update({
        ended_at: endedAt,
        seconds_played: secondsPlayed,
        progress_pct: progressPct,
        stop_reason: params.stopReason,
      }).eq('id', eventId)
      completed = !error
    }

    if (!completed) {
      await supabase.from('play_events').insert({
        user_id: params.userId || snapshot?.userId || null,
        story_id: params.storyId,
        session_id: sessionId || generateUUID(),
        started_at: snapshot?.startedAt || new Date(Date.now() - Math.max(0, secondsPlayed) * 1000).toISOString(),
        ended_at: endedAt,
        device_type,
        device_os,
        browser,
        is_offline: isOffline(),
        origin,
        referrer_url: referrer_url || null,
        genre: snapshot?.genre || null,
        author: snapshot?.author || null,
        narrator: snapshot?.narrator || null,
        duration_mins: snapshot?.durationMins || null,
        seconds_played: secondsPlayed,
        progress_pct: progressPct,
        stop_reason: params.stopReason,
      })
    }

    // Update user preferences async
    if (params.userId) {
      updateUserPreferences(params.userId).catch(() => {})
    }

    // Reset session
    currentEventId = null
    currentSessionId = null
    playStartTime = null
    currentSnapshot = null
  } catch (e) {
    console.warn('[analytics] trackPlayEnd failed:', e)
  }
}

/**
 * ORION-ANALYTICS-GAP-001 §3 — spurious-ended diagnostic beacon.
 *
 * Called when the ORION-PLAYER-ENDED-001 guard (commit 65507cc0) suppresses a
 * false 'ended' and recovers in place. Until now the only evidence of the
 * Firefox truncated-stream class was a client console.error — invisible
 * server-side. This writes a zero-length marker row to play_events:
 *
 *   stop_reason  = 'spurious_ended_recovered'
 *   origin       = 'diagnostic_beacon'   (exclude with one predicate)
 *   referrer_url = 'spurious_ended:<kind>:at=<s>:elDur=<s>:expected=<s>'
 *   started_at   = ended_at = now, seconds_played = 0
 *   session_id   = the LIVE session id when one exists (ties the beacon to the
 *                  session that survived), else a fresh UUID.
 *
 * The active play session is NOT ended — playback continues after recovery.
 * Fire-and-forget; never blocks the player.
 */
export async function trackSpuriousEndedRecovered(params: {
  userId: string | undefined
  storyId: string
  kind: 'unknown_duration' | 'early_ended' | 'duration_shortfall'
  currentTime: number
  elementDuration: number | null
  expectedDuration: number | null
}): Promise<void> {
  try {
    const fmt = (v: number | null) =>
      v !== null && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : 'na'
    const detail = `spurious_ended:${params.kind}:at=${fmt(params.currentTime)}:elDur=${fmt(params.elementDuration)}:expected=${fmt(params.expectedDuration)}`
    const sessionId = currentSessionId || generateUUID()
    const nowIso = new Date().toISOString()
    const { device_type, device_os, browser } = getDeviceInfo()

    if (params.userId) {
      const apiResult = await postPlayEvent({
        action: 'beacon',
        sessionId,
        storyId: params.storyId,
        detail,
        device: { device_type, device_os, browser },
        isOffline: isOffline(),
      })
      if (apiResult?.success) return
    }

    // Guest / API-failure fallback — same pattern as trackPlayStart (RLS may
    // drop anonymous rows silently; that is acceptable for a diagnostic).
    await supabase.from('play_events').insert({
      user_id: params.userId || null,
      story_id: params.storyId,
      session_id: sessionId,
      started_at: nowIso,
      ended_at: nowIso,
      seconds_played: 0,
      progress_pct: 0,
      stop_reason: SPURIOUS_ENDED_STOP_REASON,
      origin: DIAGNOSTIC_BEACON_ORIGIN,
      referrer_url: detail,
      device_type,
      device_os,
      browser,
      is_offline: isOffline(),
    })
  } catch (e) {
    console.warn('[analytics] trackSpuriousEndedRecovered failed:', e)
  }
}

/**
 * Update aggregated user preferences after a play session.
 */
async function updateUserPreferences(userId: string): Promise<void> {
  try {
    // Fetch all play events for this user
    const { data: events } = await supabase
      .from('play_events')
      .select('genre, author, narrator, duration_mins, seconds_played, progress_pct, stop_reason, device_type, started_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      // ORION-ANALYTICS-GAP-001: diagnostic beacon rows are zero-length markers,
      // not listening sessions — never let them dilute preference aggregates.
      .neq('origin', DIAGNOSTIC_BEACON_ORIGIN)

    if (!events || events.length === 0) return

    // Count genre/author/narrator frequency
    const genreCount: Record<string, number> = {}
    const authorCount: Record<string, number> = {}
    const narratorCount: Record<string, number> = {}
    const durationBuckets: Record<string, number> = { short: 0, medium: 0, long: 0 }

    let totalPct = 0
    let completions = 0

    events.forEach(e => {
      if (e.genre) genreCount[e.genre] = (genreCount[e.genre] || 0) + 1
      if (e.author) authorCount[e.author] = (authorCount[e.author] || 0) + 1
      if (e.narrator) narratorCount[e.narrator] = (narratorCount[e.narrator] || 0) + 1
      if (e.duration_mins) {
        if (e.duration_mins < 20) durationBuckets.short++
        else if (e.duration_mins <= 40) durationBuckets.medium++
        else durationBuckets.long++
      }
      totalPct += e.progress_pct || 0
      if (e.stop_reason === 'completed') completions++
    })

    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g)
    const topAuthors = Object.entries(authorCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a)
    const topNarrators = Object.entries(narratorCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n)
    const preferredDuration = Object.entries(durationBuckets).sort((a, b) => b[1] - a[1])[0][0]
    const avgCompletionRate = events.length > 0 ? Math.round(totalPct / events.length) : 0
    const totalSeconds = events.reduce((sum, e) => sum + (e.seconds_played || 0), 0)
    const lastDevice = events[events.length - 1]?.device_type || null

    await supabase.from('user_preferences').upsert({
      user_id: userId,
      top_genres: topGenres,
      top_authors: topAuthors,
      top_narrators: topNarrators,
      preferred_duration: preferredDuration,
      avg_completion_rate: avgCompletionRate,
      total_plays: events.length,
      total_seconds: totalSeconds,
      device_type: lastDevice,
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  } catch (e) {
    console.warn('[analytics] updateUserPreferences failed:', e)
  }
}

/**
 * Track signup source when user creates account.
 * Call from signup page.
 */
export async function trackSignupSource(userId: string): Promise<void> {
  try {
    const { origin } = getOrigin()
    const { device_type } = getDeviceInfo()
    await supabase.from('users').update({
      signup_source: origin,
      device_type,
    }).eq('id', userId)
  } catch (e) {
    console.warn('[analytics] trackSignupSource failed:', e)
  }
}
