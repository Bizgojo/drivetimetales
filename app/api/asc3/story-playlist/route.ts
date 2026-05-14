import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const INTRO_OUTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
const BELLE_B_NAME_VOICE_IDS = [CANONICAL_BELLE_B_VOICE_ID]
const EL_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }
const BELLE_AUDIO_CACHE_VERSION = 'v1'

type BelleVariant = {
  id: string
  kind: 'intro' | 'outro'
  variant_key: string
  text: string
  uses_name: boolean
  tone?: string | null
  series_position?: string | null
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'friend'
}

function normalizeFirstName(value?: string | null) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

function getSeriesPosition(story: any) {
  if (!story?.series_id && !story?.series_name) return null
  const episodeNumber = Number(story?.episode_number || story?.series_number || 0)
  const total = Number(story?.series_total || story?.series_total_episodes || 0)
  if (episodeNumber <= 1) return 'first'
  if (total > 0 && episodeNumber >= total) return 'finale'
  return 'middle'
}

function pickBelleVariant(
  variants: BelleVariant[],
  kind: 'intro' | 'outro',
  story: any,
  firstName: string,
  lastVariantKey: string | null,
  sessionCount: number
) {
  const position = getSeriesPosition(story)
  const sameKind = variants.filter((variant) => variant.kind === kind)
  const seriesAware = position ? sameKind.filter((variant) => !variant.series_position || variant.series_position === position) : sameKind
  const pool = seriesAware.length > 0 ? seriesAware : sameKind

  const introPreference = (() => {
    if (position && position !== 'first') return ['session_continue', 'simple', 'returning_listener', 'session_first']
    if (sessionCount <= 0) return ['session_first', 'simple', 'returning_listener', 'session_continue']
    return ['session_continue', 'returning_listener', 'simple', 'session_first']
  })()
  const outroPreference = position && position !== 'finale'
    ? ['series_continue', 'reflective', 'simple']
    : ['reflective', 'simple', 'series_continue']
  const preference = kind === 'intro' ? introPreference : outroPreference

  const eligible = pool.filter((variant) => !variant.uses_name || Boolean(firstName))
  const nonRepeated = eligible.filter((variant) => variant.variant_key !== lastVariantKey)
  const candidates = nonRepeated.length > 0 ? nonRepeated : eligible
  return preference.map((key) => candidates.find((variant) => variant.variant_key === key)).find(Boolean) || candidates[0] || null
}

async function getCachedAudioUrl(cachePath: string) {
  const publicUrl = `${BASE_URL}/${cachePath}`
  try {
    const res = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' })
    return res.ok ? publicUrl : null
  } catch {
    return null
  }
}

function renderBelleText(variant: BelleVariant, firstName: string) {
  if (variant.uses_name) return variant.text.replace(/\[LISTENER_NAME\]/g, firstName || 'friend')
  return variant.text.replace(/\s*\[LISTENER_NAME\]\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function hashBelleText(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

async function generateBelleAudio(storyId: string, variant: BelleVariant, firstName: string) {
  const personalized = variant.uses_name && Boolean(firstName)
  const namePart = personalized ? `name_${safeName(firstName)}` : 'generic'
  const text = renderBelleText(variant, firstName)
  const textHash = hashBelleText(text)
  const cacheKey = `${BELLE_AUDIO_CACHE_VERSION}/${storyId}/${variant.id}/${CANONICAL_BELLE_B_VOICE_ID}/${namePart}_${textHash}`
  const cachePath = `belle/${cacheKey}.mp3`
  const cached = await getCachedAudioUrl(cachePath)
  if (cached) {
    return {
      audioUrl: cached,
      cached: true,
      cachePath,
      cacheKey,
      finalText: text,
      selectedBelleVoiceId: CANONICAL_BELLE_B_VOICE_ID,
    }
  }

  const elKey = process.env.ELEVENLABS_API_KEY
  if (!elKey) throw new Error('ELEVENLABS_API_KEY is not configured')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CANONICAL_BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS }),
  })
  if (!res.ok) throw new Error(`Belle audio generation failed: ${res.status} ${await res.text()}`)
  const audioBuffer = Buffer.from(await res.arrayBuffer())
  const { error } = await supabase.storage.from('audio').upload(cachePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Belle audio upload failed: ${error.message}`)
  return {
    audioUrl: `${BASE_URL}/${cachePath}`,
    cached: false,
    cachePath,
    cacheKey,
    finalText: text,
    selectedBelleVoiceId: CANONICAL_BELLE_B_VOICE_ID,
  }
}

async function resolveBelleAudio(story: any, kind: 'intro' | 'outro', firstName: string, lastVariantKey: string | null, sessionCount: number) {
  const { data: variants, error } = await supabase
    .from('story_belle_variants')
    .select('id,kind,variant_key,text,uses_name,tone,series_position')
    .eq('story_id', story.id)
    .eq('kind', kind)
  if (error || !variants?.length) return null

  const selected = pickBelleVariant(variants as BelleVariant[], kind, story, firstName, lastVariantKey, sessionCount)
  if (!selected) return null

  try {
    const audio = await generateBelleAudio(story.id, selected, firstName)
    return { variant: selected, ...audio }
  } catch (err) {
    console.warn('[story-playlist] selected Belle audio failed; trying generic fallback:', {
      storyId: story.id,
      kind,
      variant_key: selected.variant_key,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const fallback = (variants as BelleVariant[]).find((variant) => variant.kind === kind && !variant.uses_name && variant.id !== selected.id)
  if (!fallback) return null
  try {
    const audio = await generateBelleAudio(story.id, fallback, '')
    return { variant: fallback, ...audio }
  } catch (err) {
    console.warn('[story-playlist] fallback Belle audio failed:', {
      storyId: story.id,
      kind,
      variant_key: fallback.variant_key,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function belleDebug(audio: any) {
  if (!audio) return null
  return {
    variant: audio.variant || null,
    selectedBelleVoiceId: audio.selectedBelleVoiceId || null,
    usedCachedAudio: Boolean(audio.cached),
    cacheKey: audio.cacheKey || null,
    finalBelleText: audio.finalText || null,
    audioUrl: audio.audioUrl || null,
  }
}

function jsonWithBelleSession(payload: Record<string, unknown>, introVariantKey?: string | null) {
  const response = NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  if (introVariantKey) {
    response.cookies.set('et_last_belle_variant_key', introVariantKey, { path: '/', sameSite: 'lax' })
    response.cookies.set('et_belle_session_count', String(Number(payload.belleSessionCount || 0) + 1), { path: '/', sameSite: 'lax' })
  }
  return response
}

export async function GET(req: NextRequest) {
  const storyId = req.nextUrl.searchParams.get('storyId')
  const rawFirstName = req.nextUrl.searchParams.get('firstName')?.trim()
  const firstName = normalizeFirstName(rawFirstName)
  const lastBelleVariantKey = req.cookies.get('et_last_belle_variant_key')?.value || null
  const belleSessionCount = Number(req.cookies.get('et_belle_session_count')?.value || 0)
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, author, audio_url, intro_audio_url, intro_before_url, intro_after_url, story_audio_url, outro_audio_url, background_music_url, script, series_id, series_name, episode_number, series_number, series_total, series_total_episodes')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const refUrl = story.audio_url || ''
  const has3Files = !!(story.intro_audio_url)
  const hasSplitIntro = !!(story.intro_before_url && story.intro_after_url && (story as any).story_audio_url)
  const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`
  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []
  const belleIntro = await resolveBelleAudio(story, 'intro', firstName, lastBelleVariantKey, belleSessionCount)
  const belleOutro = await resolveBelleAudio(story, 'outro', firstName, null, belleSessionCount)
  const usesBelleVariantAudio = Boolean(belleIntro?.audioUrl || belleOutro?.audioUrl)

  queue.push({ url: STING_URL, type: 'intro', label: 'Sting' })

  if (hasSplitIntro) {
    let nameAudioUrl: string | null = null
    if (!belleIntro && rawFirstName) {
      const { data: cachedNameAudio, error: nameAudioError } = await supabase
        .from('name_audio')
        .select('audio_url,voice_id')
        .eq('first_name', firstName)
        .in('voice_id', BELLE_B_NAME_VOICE_IDS)

      if (nameAudioError) {
        console.warn('[story-playlist] cached name audio lookup failed:', {
          storyId,
          firstName,
          message: nameAudioError.message,
        })
      }
      const preferredNameAudio = (cachedNameAudio || [])
        .sort((a: any, b: any) => BELLE_B_NAME_VOICE_IDS.indexOf(a.voice_id) - BELLE_B_NAME_VOICE_IDS.indexOf(b.voice_id))[0]
      nameAudioUrl = preferredNameAudio?.audio_url || null
    }

    if (belleIntro?.audioUrl) {
      queue.push({ url: belleIntro.audioUrl, type: 'intro', label: 'Belle' })
    } else {
      queue.push({ url: story.intro_before_url!, type: 'intro', label: 'Intro' })
      if (nameAudioUrl) {
        queue.push({ url: nameAudioUrl, type: 'intro', label: 'Name' })
      }
      queue.push({ url: story.intro_after_url!, type: 'intro', label: 'Intro' })
    }
    queue.push({ url: (story as any).story_audio_url, type: 'story', label: 'Story' })
    if (belleOutro?.audioUrl || story.outro_audio_url) {
      queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })
    }

    return jsonWithBelleSession({
      queue,
      useFinalMix: false,
      introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: usesBelleVariantAudio ? null : ((story as any).background_music_url || null),
      totalSegments: queue.length,
      belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
      belleSessionCount,
    }, belleIntro?.variant?.variant_key)
  }

  const isImportedAscFinalMix = refUrl.includes('/asc/') && refUrl.endsWith('/final.mp3')
  const isAsc3FinalMix = refUrl.includes('/asc3/') && refUrl.includes('final_mix.mp3')
  const isPlainAudio = !has3Files && refUrl && !refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
  if ((belleIntro?.audioUrl || belleOutro?.audioUrl) && (story as any).story_audio_url) {
    if (belleIntro?.audioUrl) queue.push({ url: belleIntro.audioUrl, type: 'intro', label: 'Belle' })
    queue.push({ url: (story as any).story_audio_url, type: 'story', label: 'Story' })
    if (belleOutro?.audioUrl) queue.push({ url: belleOutro.audioUrl, type: 'outro', label: 'Belle' })
    return jsonWithBelleSession({
      queue,
      useFinalMix: false,
      introOutroMusicUrl: null,
      backgroundMusicUrl: null,
      totalSegments: queue.length,
      belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
      belleSessionCount,
    }, belleIntro?.variant?.variant_key)
  }

  if (isImportedAscFinalMix || isAsc3FinalMix || isPlainAudio || (!has3Files && (refUrl.includes('final_mix') || refUrl.includes('/final.mp3')))) {
    return NextResponse.json({
      queue: [],
      useFinalMix: true,
      finalMixUrl: refUrl,
      introOutroMusicUrl: null,
      backgroundMusicUrl: null,
      totalSegments: 0,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Intro — always use intro_audio_url directly, no personalization
  if (story.intro_audio_url) {
    queue.push({ url: belleIntro?.audioUrl || story.intro_audio_url, type: 'intro', label: belleIntro ? 'Belle' : 'Intro' })
  }

  if ((story as any).story_audio_url) {
    queue.push({ url: (story as any).story_audio_url, type: 'story', label: 'Story' })
    if (belleOutro?.audioUrl || story.outro_audio_url) {
      queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })
    }
    return jsonWithBelleSession({
      queue,
      introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: usesBelleVariantAudio ? null : ((story as any).background_music_url || null),
      totalSegments: queue.length,
      belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
      belleSessionCount,
    }, belleIntro?.variant?.variant_key)
  }

  const isNewASC = refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
  const isHal3File = has3Files && !isNewASC

  if (isNewASC || isHal3File) {
    const storyUrl = story.audio_url
    if (storyUrl) queue.push({ url: storyUrl, type: 'story', label: 'Story' })
    if (belleOutro?.audioUrl || story.outro_audio_url) queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })
    return jsonWithBelleSession({
      queue,
      introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: usesBelleVariantAudio ? null : ((story as any).background_music_url || null),
      totalSegments: queue.length,
      belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
      belleSessionCount,
    }, belleIntro?.variant?.variant_key)
  }

  const folderMatch = refUrl.match(/asc3\/([^/]+)\//)
  const folderId = folderMatch?.[1]

  if (folderId) {
    const { data: files } = await supabase.storage
      .from('audio')
      .list(`asc3/${folderId}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })

    const segments = (files || [])
      .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const seg of segments) {
      queue.push({ url: `${BASE_URL}/asc3/${folderId}/${seg.name}`, type: 'story', label: 'Story' })
    }

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const backgroundMusicUrl = bgFile ? `${BASE_URL}/asc3/${folderId}/background_music.mp3` : null

    if (belleOutro?.audioUrl || story.outro_audio_url) queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })

    return jsonWithBelleSession({
      queue,
      introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: usesBelleVariantAudio ? null : backgroundMusicUrl,
      totalSegments: queue.length,
      belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
      belleSessionCount,
    })
  }

  if (belleOutro?.audioUrl || story.outro_audio_url) queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })

  return jsonWithBelleSession({
    queue,
    introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
    backgroundMusicUrl: null,
    totalSegments: queue.length,
    belle: { intro: belleDebug(belleIntro), outro: belleDebug(belleOutro) },
    belleSessionCount,
  }, belleIntro?.variant?.variant_key)
}
