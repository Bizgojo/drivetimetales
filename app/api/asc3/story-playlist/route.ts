import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

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
    .select('first_name,display_name,name_pronunciation_key')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error('user playback profile lookup failed: ' + error.message)

  const metadataName = authUser?.user_metadata?.first_name || authUser?.user_metadata?.display_name || authUser?.user_metadata?.name
  return {
    preferredName: normalizeFirstName(data?.first_name || data?.display_name || queryFirstName || metadataName),
    pronunciationKey: String(data?.name_pronunciation_key || '').trim(),
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

async function buildPersonalizedQueue({
  story,
  userId,
  pronunciationKey,
}: {
  story: any
  userId: string
  pronunciationKey: string
}) {
  if (!pronunciationKey) return null
  if (!String(story?.announcement_url || '').trim()) return null
  if (!String(story?.story_audio_url || '').trim()) return null
  const outroUrl = String(story?.outro_with_music_url || story?.outro_audio_url || '').trim()
  if (!outroUrl) return null

  const ready = await assertNamePoolReady(pronunciationKey)
  if (!ready) return null

  const toneCluster = await resolveToneClusterForStory(story)
  const opener = await pickNameOpenerClip(userId, pronunciationKey, toneCluster)
  const queue: PlaybackQueueItem[] = [
    { url: opener.intro_audio_url!, type: 'intro', label: 'Welcome' },
    { url: String(story.announcement_url).trim(), type: 'intro', label: 'Story intro' },
    { url: String(story.story_audio_url).trim(), type: 'story', label: story.title || 'Story' },
    { url: outroUrl, type: 'outro', label: 'Outro' },
  ]

  return {
    queue,
    toneCluster,
    openerId: opener.opener_id,
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
  if (authUser?.id) {
    try {
      const profile = await resolveUserPlaybackProfile(authUser.id, firstName, authUser)
      preferredName = profile.preferredName
      pronunciationKey = profile.pronunciationKey
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
    .select('id,title,primary_genre,genre,audio_url,announcement_url,story_audio_url,outro_with_music_url,outro_audio_url,updated_at')
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
  let personalizedPayload: Awaited<ReturnType<typeof buildPersonalizedQueue>> | null = null
  if (authUser?.id && pronunciationKey) {
    try {
      personalizedPayload = await buildPersonalizedQueue({
        story,
        userId: authUser.id,
        pronunciationKey,
      })
    } catch (err) {
      console.warn('[story-playlist] personalized queue failed; falling back to baked final_mix:', {
        storyId: story.id,
        userId: authUser.id,
        pronunciation_key: pronunciationKey,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  console.log('[story-playlist] playback resolution', {
    storyId: story.id,
    personalized: Boolean(personalizedPayload),
    pronunciation_key: pronunciationKey || null,
    tone: personalizedPayload?.toneCluster || null,
    opener_id: personalizedPayload?.openerId || null,
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
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
