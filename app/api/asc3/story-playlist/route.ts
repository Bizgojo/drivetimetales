import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import {
  personalizedAssetGateReason,
  recordPersonalizationFallback,
} from '@/lib/personalization/fallbackTelemetry'
import { hasPriorSeriesPlay } from '@/lib/personalization/firstPlayedOpener'
import { liveGreetingClipRoute, liveGreetingEnabledFor, spokenFirstName } from '@/lib/personalization/liveGreeting'
import { loadGreetingStory, startGreetingClip } from '@/lib/personalization/liveGreetingService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PlaybackQueueItem = {
  url: string
  type: 'intro' | 'story' | 'outro'
  label: string
}

type NameOpenerClip = {
  opener_id: string
  intro_audio_url: string | null
  tone_cluster: string | null
}

type OpenerHistoryRow = {
  opener_id: string | null
  played_at?: string | null
}

function normalizeFirstName(value?: string | null) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

async function resolveRequestUser(req: NextRequest) {
  try {
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    )
    const { data: { user } } = await authClient.auth.getUser()
    return user || null
  } catch (err) {
    console.warn('[story-playlist] auth user resolution failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

async function resolveUserPlaybackProfile(userId: string, queryFirstName: string, authUser?: any) {
  const { data, error } = await supabase
    .from('users')
    .select('first_name,display_name,name_pronunciation_key,signup_source')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error('user playback profile lookup failed: ' + error.message)

  const metadataName = authUser?.user_metadata?.first_name || authUser?.user_metadata?.display_name || authUser?.user_metadata?.name
  return {
    preferredName: normalizeFirstName(data?.first_name || data?.display_name || queryFirstName || metadataName),
    pronunciationKey: String(data?.name_pronunciation_key || '').trim(),
    signupSource: String(data?.signup_source || '').trim(),
  }
}

async function resolveToneClusterForStory(story: any) {
  const genre = String(story?.primary_genre || story?.genre || '').trim()
  if (!genre) return 'warm'

  const { data, error } = await supabase
    .from('genre_tone_cluster')
    .select('tone_cluster')
    .ilike('genre', genre)
    .maybeSingle()

  if (error) {
    console.warn('[story-playlist] genre tone lookup failed:', {
      storyId: story?.id,
      genre,
      error: error.message,
    })
    return 'warm'
  }

  return String(data?.tone_cluster || 'warm').trim() || 'warm'
}

async function assertNamePoolReady(pronunciationKey: string) {
  const { data, error } = await supabase
    .from('name_pools')
    .select('status')
    .eq('pronunciation_key', pronunciationKey)
    .maybeSingle()
  if (error) throw new Error('name_pools lookup failed: ' + error.message)
  return String(data?.status || '').toLowerCase() === 'ready'
}

async function pickNameOpenerClip(userId: string, pronunciationKey: string, toneCluster: string) {
  const { data: clips, error: clipError } = await supabase
    .from('name_opener_clips')
    .select('opener_id,intro_audio_url,tone_cluster')
    .eq('pronunciation_key', pronunciationKey)
    .eq('tone_cluster', toneCluster)
    .not('intro_audio_url', 'is', null)

  if (clipError) throw new Error('name_opener_clips lookup failed: ' + clipError.message)
  const availableClips = (clips || []).filter((clip: NameOpenerClip) => clip.opener_id && clip.intro_audio_url)
  if (!availableClips.length) throw new Error('no name opener clips for key ' + pronunciationKey + ' and tone ' + toneCluster)

  const openerIds = availableClips.map((clip: NameOpenerClip) => clip.opener_id)
  const { data: history, error: historyError } = await supabase
    .from('user_opener_history')
    .select('opener_id,played_at')
    .eq('user_id', userId)
    .eq('tone_cluster', toneCluster)
    .in('opener_id', openerIds)
    .order('played_at', { ascending: false })
    .limit(100)

  if (historyError) throw new Error('user_opener_history lookup failed: ' + historyError.message)

  const lastUsedByOpener = new Map<string, number>()
  for (const row of (history || []) as OpenerHistoryRow[]) {
    const openerId = String(row.opener_id || '')
    if (!openerId || lastUsedByOpener.has(openerId)) continue
    const usedAt = row.played_at ? Date.parse(row.played_at) : 0
    lastUsedByOpener.set(openerId, Number.isFinite(usedAt) ? usedAt : 0)
  }

  const recentOpenerIds = new Set(((history || []) as OpenerHistoryRow[])
    .slice(0, 10)
    .map(row => String(row.opener_id || ''))
    .filter(Boolean))
  const nonRecent = availableClips.filter((clip: NameOpenerClip) => !recentOpenerIds.has(clip.opener_id))
  const candidates = nonRecent.length ? nonRecent : availableClips

  const chosen = [...candidates]
    .map((clip: NameOpenerClip) => ({
      clip,
      lastUsedAt: lastUsedByOpener.get(clip.opener_id) || 0,
      random: Math.random(),
    }))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.random - b.random)[0]?.clip

  if (!chosen?.intro_audio_url) throw new Error('failed to choose a name opener clip')

  const { error: insertError } = await supabase
    .from('user_opener_history')
    .insert({
      user_id: userId,
      opener_id: chosen.opener_id,
      tone_cluster: toneCluster,
    })
  if (insertError) throw new Error('user_opener_history insert failed: ' + insertError.message)

  return chosen
}

type PersonalizedQueuePayload = {
  queue: PlaybackQueueItem[]
  toneCluster: string
  openerId: string
}

type PersonalizedQueueResult = {
  payload: PersonalizedQueuePayload | null
  // PERS-FIX-002: when payload is null, the gate reason is returned so the
  // fallback is countable instead of silent.
  fallbackReason: string | null
}

async function buildPersonalizedQueue({
  story,
  userId,
  pronunciationKey,
  suppressNameOpener = false,
}: {
  story: any
  userId: string
  pronunciationKey: string
  // When true (gate arrivals on their very first play — zero rows in
  // play_events — who received the /home Belle welcome), the personalized
  // name-opener clip is omitted from the queue. From their second play
  // onward suppressNameOpener is false and the full personalized queue plays.
  // The rest of the playlist (announcement, story, outro) is always unchanged.
  suppressNameOpener?: boolean
}): Promise<PersonalizedQueueResult> {
  const gateReason = personalizedAssetGateReason(story, pronunciationKey)
  if (gateReason) return { payload: null, fallbackReason: gateReason }
  const outroUrl = String(story?.outro_with_music_url || story?.outro_audio_url || '').trim()
  const storyBodyWithOutroUrl = String(story?.story_body_with_outro_url || '').trim()

  const ready = await assertNamePoolReady(pronunciationKey)
  if (!ready) return { payload: null, fallbackReason: 'name_pool_not_ready' }

  const toneCluster = await resolveToneClusterForStory(story)

  // Gate arrivals (signup_source = 'bell-invitation') skip the name-opener
  // ONLY on their very first play (zero rows in play_events), where the /home
  // Belle welcome already greeted them by name. From play 2 onward
  // suppressNameOpener is false and the full personalized queue plays.
  // Normal library subscribers always receive the full personalized queue.
  if (suppressNameOpener) {
    const queue: PlaybackQueueItem[] = [
      { url: String(story.announcement_url).trim(), type: 'intro', label: 'Story intro' },
    ]
    if (storyBodyWithOutroUrl) {
      // New: single segment covers story + outro, no gap on iOS
      queue.push({ url: storyBodyWithOutroUrl, type: 'story', label: story.title || 'Story' })
      // No outro segment — it's baked in
    } else {
      // Fallback: two segments (existing episodes without story_body_with_outro.mp3)
      queue.push({ url: String(story.story_audio_url).trim(), type: 'story', label: story.title || 'Story' })
      if (outroUrl) queue.push({ url: outroUrl, type: 'outro', label: 'Outro' })
    }
    return {
      payload: { queue, toneCluster, openerId: '' },
      fallbackReason: null,
    }
  }

  const opener = await pickNameOpenerClip(userId, pronunciationKey, toneCluster)
  const queue: PlaybackQueueItem[] = [
    { url: opener.intro_audio_url!, type: 'intro', label: 'Welcome' },
    { url: String(story.announcement_url).trim(), type: 'intro', label: 'Story intro' },
  ]
  if (storyBodyWithOutroUrl) {
    // New: single segment covers story + outro, no gap on iOS
    queue.push({ url: storyBodyWithOutroUrl, type: 'story', label: story.title || 'Story' })
    // No outro segment — it's baked in
  } else {
    // Fallback: two segments (existing episodes without story_body_with_outro.mp3)
    queue.push({ url: String(story.story_audio_url).trim(), type: 'story', label: story.title || 'Story' })
    if (outroUrl) queue.push({ url: outroUrl, type: 'outro', label: 'Outro' })
  }

  return {
    payload: {
      queue,
      toneCluster,
      openerId: opener.opener_id,
    },
    fallbackReason: null,
  }
}

/**
 * PERS-LIVE-001: queue for a live story-specific name greeting.
 *   first played episode of the series: announcement → live greeting → story
 *   finale:                             … story (baked outro) → live sign-off
 * Returns null when neither applies (caller keeps the existing path).
 * Generation starts now so the clip is ready by the time the announcement
 * (or the whole finale) has played; the clip route waits for it if needed.
 */
/**
 * GREETING-REPLAY-001: false when the listener is resuming partway through
 * this episode (saved progress past the first few seconds, not finished).
 * Lookup failure → true (greeting plays; worst case a greeting on a resume).
 */
async function startsFromBeginningFor(userId: string, storyId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('user_library')
      .select('progress,completed')
      .eq('user_id', userId)
      .eq('story_id', storyId)
      .maybeSingle()
    if (!data) return true
    if ((data as any).completed) return true
    return Number((data as any).progress || 0) <= 5
  } catch {
    return true
  }
}

async function buildLiveGreetingQueue({
  story,
  storyId,
  firstName,
  introKind,
}: {
  story: any
  storyId: string
  firstName: string
  /** GREETING-REPLAY-001: which name greeting follows the announcement, if any. */
  introKind: 'series_intro' | 'series_return' | null
}): Promise<PersonalizedQueuePayload | null> {
  const isFinale = Boolean(story?.series_is_finale)
  if (!introKind && !isFinale) return null

  const announcementUrl = String(story?.announcement_url || '').trim()
  const storyAudioUrl = String(story?.story_audio_url || '').trim()
  const storyBodyWithOutroUrl = String(story?.story_body_with_outro_url || '').trim()
  const outroUrl = String(story?.outro_with_music_url || story?.outro_audio_url || '').trim()
  if (!announcementUrl || (!storyBodyWithOutroUrl && !storyAudioUrl)) return null

  const greetingStory = await loadGreetingStory(storyId)
  if (!greetingStory?.series_id) return null

  const queue: PlaybackQueueItem[] = [
    { url: announcementUrl, type: 'intro', label: 'Story intro' },
  ]
  if (introKind) {
    startGreetingClip(greetingStory, introKind, firstName)
    queue.push({ url: liveGreetingClipRoute(storyId, introKind), type: 'intro', label: introKind === 'series_return' ? 'Welcome back' : 'Welcome' })
  }
  // FINALE-SIGNOFF-ORDER-001 (Marc 2026-10-29): on the finale the name
  // sign-off plays right after the last scene, BEFORE Belle's credits —
  // which needs the story and outro as separate files. Without them, the
  // old order (story with baked outro, then sign-off) is kept.
  const splitFinale = isFinale && Boolean(storyAudioUrl && outroUrl)
  if (splitFinale) {
    startGreetingClip(greetingStory, 'finale_signoff', firstName)
    queue.push({ url: storyAudioUrl, type: 'story', label: story.title || 'Story' })
    queue.push({ url: liveGreetingClipRoute(storyId, 'finale_signoff'), type: 'outro', label: 'Thank you' })
    queue.push({ url: outroUrl, type: 'outro', label: 'Outro' })
  } else {
    if (storyBodyWithOutroUrl) {
      queue.push({ url: storyBodyWithOutroUrl, type: 'story', label: story.title || 'Story' })
    } else {
      queue.push({ url: storyAudioUrl, type: 'story', label: story.title || 'Story' })
      if (outroUrl) queue.push({ url: outroUrl, type: 'outro', label: 'Outro' })
    }
    if (isFinale) {
      startGreetingClip(greetingStory, 'finale_signoff', firstName)
      queue.push({ url: liveGreetingClipRoute(storyId, 'finale_signoff'), type: 'outro', label: 'Goodbye' })
    }
  }

  return {
    queue,
    toneCluster: 'live',
    openerId: introKind ? `live:${introKind}` : 'live:finale_signoff',
  }
}

export async function GET(req: NextRequest) {
  const storyId = req.nextUrl.searchParams.get('storyId')
  const rawFirstName = req.nextUrl.searchParams.get('firstName')?.trim()
  const firstName = normalizeFirstName(rawFirstName)
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

  const authUser = await resolveRequestUser(req)
  let preferredName = ''
  let pronunciationKey = ''
  let signupSource = ''
  if (authUser?.id) {
    try {
      const profile = await resolveUserPlaybackProfile(authUser.id, firstName, authUser)
      preferredName = profile.preferredName
      pronunciationKey = profile.pronunciationKey
      signupSource = profile.signupSource
    } catch (err) {
      console.warn('[story-playlist] user playback profile lookup failed:', {
        storyId,
        userId: authUser.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,primary_genre,genre,audio_url,announcement_url,story_audio_url,story_body_with_outro_url,outro_with_music_url,outro_audio_url,updated_at,series_id,series_episode_number,series_is_finale')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const cacheBustAudioUrl = (url: string) => {
    if (!url) return url
    const updatedAtMs = Date.parse(String((story as any).updated_at || ''))
    const version = Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now()
    const sep = url.includes('?') ? '&' : '?'
    return url + sep + 'v=' + version
  }

  const refUrl = String(story.audio_url || '').trim()
  // Time-bounded gate suppression: for brand-new gate arrivals (signup_source
  // = 'bell-invitation' AND zero rows in play_events) suppress the name-opener
  // on their first play only. After that first listen play_events has at least
  // one row so the condition is false and the name-opener plays from play 2
  // onward. If the count query fails, default to non-zero → name opener plays
  // (safe failure mode).
  let firstPlayForGateUser = false
  if (authUser?.id && signupSource === 'bell-invitation') {
    try {
      const { count } = await supabase
        .from('play_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authUser.id)
        .limit(1)
      firstPlayForGateUser = (count ?? 1) === 0
    } catch {
      // safe default: treat as non-zero → name opener plays
      firstPlayForGateUser = false
    }
  }

  // FIRST-PLAYED-NAME-OPENER: series episodes earn the personalized name
  // opener only on the listener's first played episode of the series (any
  // episode number). A prior play_events row for ANY episode in the series
  // means this play uses the normal Belle intro (baked final mix below).
  // Standalones (no series_id) skip this check — path unchanged.
  // FINALE OUTRO (2026-10-27): no per-user personalized-outro path exists —
  // the outro is always the story's baked outro_with_music_url/outro_audio_url
  // asset (see buildPersonalizedQueue + lib/personalizedFinalMix.ts), so the
  // finale outro is intentionally untouched by this change.
  const seriesId = String((story as any)?.series_id || '').trim()
  let seriesReplay = false
  if (authUser?.id && seriesId) {
    seriesReplay = await hasPriorSeriesPlay(supabase, authUser.id, seriesId)
  }
  // GREETING-REPLAY-001 (Marc 2026-10-29): the name greeting plays when the
  // listener starts Episode 1 from the beginning — every time. If they have
  // heard the series before, it is a warm "welcome back" (series_return).
  // A first-ever play that starts at a later episode still gets the greeting.
  // Resuming partway through an episode never gets one.
  const episodeNo = Number((story as any)?.series_episode_number || 0)
  const startsFromBeginning = authUser?.id && seriesId
    ? await startsFromBeginningFor(authUser.id, story.id)
    : true
  const greetIntro = Boolean(seriesId) && startsFromBeginning && (episodeNo === 1 || !seriesReplay)
  const introKind: 'series_intro' | 'series_return' | null = greetIntro ? (seriesReplay ? 'series_return' : 'series_intro') : null

  let personalizedPayload: PersonalizedQueuePayload | null = null
  let fallbackReason: string | null = null

  // PERS-LIVE-001: live story-specific name greeting (behind LIVE_GREETINGS).
  // Only when it applies — listener's first played episode of the series
  // and/or the finale — does it replace the stock-opener queue below; every
  // other play falls through to the existing path unchanged.
  const liveFirstName = spokenFirstName(preferredName)
  if (authUser?.id && seriesId && liveFirstName && liveGreetingEnabledFor(authUser.id)) {
    try {
      const live = await buildLiveGreetingQueue({
        story,
        storyId: story.id,
        firstName: liveFirstName,
        introKind,
      })
      if (live) personalizedPayload = live
    } catch (err) {
      console.warn('[story-playlist] live greeting queue failed; using existing path:', {
        storyId: story.id,
        userId: authUser.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (personalizedPayload) {
    // live greeting queue chosen above
  } else if (authUser?.id) {
    if (seriesId && !greetIntro) {
      fallbackReason = seriesReplay ? 'series_replay_normal_intro' : 'series_resume_normal_intro'
    } else if (!pronunciationKey) {
      fallbackReason = 'missing_pronunciation_key'
    } else {
      try {
        const result = await buildPersonalizedQueue({
          story,
          userId: authUser.id,
          pronunciationKey,
          // Suppress name-opener only on the gate user's very first play
          // (zero prior play_events rows). From play 2 onward this is false.
          suppressNameOpener: signupSource === 'bell-invitation' && firstPlayForGateUser,
        })
        personalizedPayload = result.payload
        fallbackReason = result.fallbackReason
      } catch (err) {
        fallbackReason = 'personalized_queue_error'
        console.warn('[story-playlist] personalized queue failed; falling back to baked final_mix:', {
          storyId: story.id,
          userId: authUser.id,
          pronunciation_key: pronunciationKey,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // PERS-FIX-002: silent degradation must be countable. Best-effort row +
  // structured log for every AUTHENTICATED play that falls back to the baked
  // final_mix (anonymous plays are expected to be generic — not recorded).
  if (authUser?.id && !personalizedPayload && fallbackReason) {
    await recordPersonalizationFallback(supabase, {
      storyId: story.id,
      userId: authUser.id,
      pronunciationKey,
      reason: fallbackReason,
    })
  }

  console.log('[story-playlist] playback resolution', {
    storyId: story.id,
    personalized: Boolean(personalizedPayload),
    pronunciation_key: pronunciationKey || null,
    tone: personalizedPayload?.toneCluster || null,
    opener_id: personalizedPayload?.openerId || null,
    series_id: seriesId || null,
    series_replay: seriesReplay,
    intro_greeting: introKind,
  })

  if (personalizedPayload) {
    return NextResponse.json({
      queue: personalizedPayload.queue,
      useFinalMix: false,
      introOutroMusicUrl: null,
      backgroundMusicUrl: null,
      totalSegments: personalizedPayload.queue.length,
      personalization: {
        preferredName: preferredName || null,
        pronunciationKey,
        toneCluster: personalizedPayload.toneCluster,
        openerId: personalizedPayload.openerId,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({
    queue: [],
    useFinalMix: true,
    finalMixUrl: cacheBustAudioUrl(refUrl),
    introOutroMusicUrl: null,
    backgroundMusicUrl: null,
    totalSegments: refUrl ? 1 : 0,
    personalization: {
      preferredName: preferredName || null,
      pronunciationKey: pronunciationKey || null,
      skippedReason: pronunciationKey ? 'personalized assets unavailable' : 'missing ready pronunciation key',
      fallbackReason: authUser?.id ? fallbackReason : 'no_auth_user',
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
