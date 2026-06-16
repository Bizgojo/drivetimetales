import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHash } from 'crypto'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'
import { anthropicCall } from '@/app/lib/anthropic-logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const INTRO_OUTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
const BELLE_B_NAME_VOICE_IDS = [CANONICAL_BELLE_B_VOICE_ID]
const EL_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }
const BELLE_AUDIO_CACHE_VERSION = 'v1'
const BELLE_PERSONALIZED_CACHE_VERSION = 'v1'

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

function safePathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
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

async function resolvePreferredName(userId: string, queryFirstName: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('first_name,display_name')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return normalizeFirstName(data?.first_name || data?.display_name || queryFirstName)
  } catch (err) {
    console.warn('[story-playlist] preferred name lookup failed:', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return normalizeFirstName(queryFirstName)
  }
}

function getPersonalizedVariantContext(story: any, variant: BelleVariant) {
  const position = getSeriesPosition(story) || 'standalone'
  const sourceHash = hashBelleText(renderBelleText(variant, ''))
  return `intro:${position}:${variant.variant_key}:${variant.id}:${sourceHash}`
}

function extractClaudeText(message: any) {
  return String(message?.content?.find((part: any) => part?.type === 'text')?.text || '').trim()
}

function cleanBelleLine(text: string) {
  return text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^Belle:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function validatePersonalizedIntro(text: string, preferredName: string) {
  const cleaned = cleanBelleLine(text)
  if (!cleaned) return 'empty personalized intro'
  if (cleaned.includes('[LISTENER_NAME]')) return 'personalized intro still contains [LISTENER_NAME]'
  if (/Belle\s+B/i.test(cleaned)) return 'personalized intro says Belle B'
  if (/^(welcome|this is|tonight's story|only on endless tales)\b/i.test(cleaned)) return 'personalized intro is announcer-like'
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 38) return `personalized intro too long: ${words.length} words`
  const escapedName = preferredName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`\\b${escapedName}\\b`, 'i').test(cleaned)) return 'personalized intro did not include preferred name naturally'
  const withoutName = cleaned.replace(new RegExp(`\\b${escapedName}\\b,?\\s*`, 'ig'), '').replace(/\s+/g, ' ').trim()
  if (!/[.!?]$/.test(withoutName)) return 'removing preferred name leaves broken punctuation'
  return null
}

async function generatePersonalizedIntroText(story: any, variant: BelleVariant, preferredName: string) {
  const baseText = renderBelleText(variant, '')
  const prompt = `Rewrite this Belle intro as one natural full line for a listener named ${preferredName}.

Story title: ${story.title || 'Untitled'}
Series: ${story.series_name || 'Standalone'}
Episode number: ${story.episode_number || story.series_number || ''}
Base intro: ${baseText}

Rules:
- Return only the spoken Belle line. No JSON. No label.
- Use ${preferredName} naturally in a complete sentence.
- Do not stitch the name into the middle of a clause.
- Keep the line grounded for audio-first listening.
- Belle sounds like a trusted friend quietly recommending the story.
- 1-2 short sentences, ideally under 35 words.
- No announcer phrases: no "Welcome", no "begins now", no "only on Endless Tales".
- Do not say Belle B.
- Do not summarize the whole plot.`

  const response = await anthropicCall({
    model: 'claude-haiku-4-5',
    max_tokens: 180,
    temperature: 0.55,
    messages: [{ role: 'user', content: prompt }],
  }, {
    route: '/api/asc3/story-playlist',
    purpose: 'belle_intro_personalization',
    storyId: story.id,
    storyTitle: story.title,
    metadata: { variantId: variant.id, variantKey: variant.variant_key },
  })

  const text = cleanBelleLine(extractClaudeText(response))
  const validationError = validatePersonalizedIntro(text, preferredName)
  if (validationError) throw new Error(validationError)
  return text
}

async function generateBelleAudioFromText(storyId: string, text: string, cachePath: string, cacheKey: string) {
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

async function resolvePersonalizedIntro(story: any, variant: BelleVariant, userId: string, preferredName: string) {
  const variantContext = getPersonalizedVariantContext(story, variant)
  const baseQuery = supabase
    .from('story_belle_personalized_cache')
    .select('id,text,audio_url,text_hash,created_at')
    .eq('user_id', userId)
    .eq('story_id', story.id)
    .eq('kind', 'intro')
    .eq('variant_context', variantContext)
    .eq('source_variant_id', variant.id)
    .eq('belle_voice_id', CANONICAL_BELLE_B_VOICE_ID)
    .eq('preferred_name', preferredName)
    .not('audio_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const { data: cachedRows, error: cacheError } = await baseQuery
  if (cacheError) throw new Error(`Belle personalized cache lookup failed: ${cacheError.message}`)
  const cached = cachedRows?.[0]
  if (cached?.audio_url) {
    return {
      variant,
      audioUrl: cached.audio_url,
      cached: true,
      personalizedUsed: true,
      personalizedCacheHit: true,
      personalizedText: cached.text,
      finalText: cached.text,
      cacheKey: `personalized:${cached.id}`,
      selectedBelleVoiceId: CANONICAL_BELLE_B_VOICE_ID,
    }
  }

  const text = await generatePersonalizedIntroText(story, variant, preferredName)
  const textHash = hashBelleText(text)
  const cacheKey = `${BELLE_PERSONALIZED_CACHE_VERSION}/${story.id}/${userId}/${CANONICAL_BELLE_B_VOICE_ID}/${safePathPart(variantContext)}/${textHash}`
  const cachePath = `belle/personalized/${cacheKey}.mp3`
  const audio = await generateBelleAudioFromText(story.id, text, cachePath, cacheKey)
  const { error: insertError } = await supabase
    .from('story_belle_personalized_cache')
    .upsert({
      user_id: userId,
      story_id: story.id,
      kind: 'intro',
      variant_context: variantContext,
      source_variant_id: variant.id,
      belle_voice_id: CANONICAL_BELLE_B_VOICE_ID,
      preferred_name: preferredName,
      text,
      text_hash: textHash,
      audio_url: audio.audioUrl,
    }, { onConflict: 'user_id,story_id,kind,variant_context,belle_voice_id,text_hash' })
  if (insertError) throw new Error(`Belle personalized cache insert failed: ${insertError.message}`)

  return {
    variant,
    ...audio,
    personalizedUsed: true,
    personalizedCacheHit: Boolean(audio.cached),
    personalizedText: text,
    finalText: text,
  }
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

async function resolveBelleAudio(
  story: any,
  kind: 'intro' | 'outro',
  firstName: string,
  lastVariantKey: string | null,
  sessionCount: number,
  personalization?: { userId: string | null; preferredName: string }
) {
  const { data: variants, error } = await supabase
    .from('story_belle_variants')
    .select('id,kind,variant_key,text,uses_name,tone,series_position')
    .eq('story_id', story.id)
    .eq('kind', kind)
  if (error || !variants?.length) return null

  const selected = pickBelleVariant(variants as BelleVariant[], kind, story, firstName, lastVariantKey, sessionCount)
  if (!selected) return null

  if (kind === 'intro' && personalization?.userId && personalization.preferredName) {
    try {
      return await resolvePersonalizedIntro(story, selected, personalization.userId, personalization.preferredName)
    } catch (err) {
      console.warn('[story-playlist] personalized Belle intro failed; falling back to generic:', {
        storyId: story.id,
        variant_key: selected.variant_key,
        error: err instanceof Error ? err.message : String(err),
      })
      ;(selected as any).personalizationFallbackReason = err instanceof Error ? err.message : String(err)
    }
  }

  try {
    const audio = await generateBelleAudio(story.id, selected, firstName)
    return {
      variant: selected,
      ...audio,
      personalizedUsed: false,
      personalizedCacheHit: false,
      personalizationFallbackReason: (selected as any).personalizationFallbackReason || null,
    }
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
    return {
      variant: fallback,
      ...audio,
      personalizedUsed: false,
      personalizedCacheHit: false,
      personalizationFallbackReason: (selected as any).personalizationFallbackReason || null,
    }
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
    personalizedUsed: Boolean(audio.personalizedUsed),
    personalizedCacheHit: Boolean(audio.personalizedCacheHit),
    personalizedText: audio.personalizedText || null,
    personalizationFallbackReason: audio.personalizationFallbackReason || null,
    cacheKey: audio.cacheKey || null,
    finalBelleText: audio.finalText || null,
    selectedText: audio.finalText || null,
    audioUrl: audio.audioUrl || null,
  }
}

function bellePayload(intro: any, outro: any, personalizationDebug: Record<string, unknown>) {
  return {
    intro: belleDebug(intro),
    outro: belleDebug(outro),
    personalizationDebug,
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
  const authUser = await resolveRequestUser(req)
  const preferredName = authUser?.id ? await resolvePreferredName(authUser.id, firstName) : ''
  const personalizationDebug = {
    resolvedUserId: authUser?.id || null,
    resolvedPreferredName: preferredName || null,
    personalizationEligible: Boolean(authUser?.id && preferredName),
    personalizationSkippedReason: authUser?.id
      ? (preferredName ? null : 'missing preferredName')
      : 'missing authenticated user_id',
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, author, audio_url, intro_audio_url, intro_before_url, intro_after_url, story_audio_url, outro_audio_url, background_music_url, script, series_id, series_name, episode_number, series_number, series_total, series_total_episodes')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const refUrl = story.audio_url || ''
  const has3Files = !!(story.intro_audio_url)
  const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`

  // AUTHORITATIVE PLAYBACK RULE:
  // If a rendered final_mix exists (audio_url contains 'final_mix'), always use it as the single
  // authoritative source. Queue mode (hasSplitIntro) is only for intentional live personalization.
  // This prevents stale queue-mode DB fields from routing away from the corrected rendered file.
  const hasRenderedFinalMix = refUrl.includes('/asc3/') && refUrl.includes('final_mix')
  const hasSplitIntro = !!(story.intro_before_url && story.intro_after_url && (story as any).story_audio_url)
  if (hasRenderedFinalMix && !(personalizationDebug.personalizationEligible && hasSplitIntro)) {
    const belleI = await resolveBelleAudio(story, 'intro', preferredName || firstName, lastBelleVariantKey, belleSessionCount, { userId: authUser?.id || null, preferredName })
    const belleO = await resolveBelleAudio(story, 'outro', firstName, null, belleSessionCount)
    return NextResponse.json({
      queue: [],
      useFinalMix: true,
      finalMixUrl: refUrl,
      totalSegments: 1,
      belle: bellePayload(belleI, belleO, personalizationDebug),
      belleSessionCount,
    })
  }

  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []
  const belleIntro = await resolveBelleAudio(story, 'intro', preferredName || firstName, lastBelleVariantKey, belleSessionCount, {
    userId: authUser?.id || null,
    preferredName,
  })
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
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
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
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
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
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
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
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
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
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
      belleSessionCount,
    })
  }

  if (belleOutro?.audioUrl || story.outro_audio_url) queue.push({ url: belleOutro?.audioUrl || story.outro_audio_url, type: 'outro', label: belleOutro ? 'Belle' : 'Outro' })

  return jsonWithBelleSession({
    queue,
    introOutroMusicUrl: usesBelleVariantAudio ? null : INTRO_OUTRO_MUSIC,
    backgroundMusicUrl: null,
    totalSegments: queue.length,
      belle: bellePayload(belleIntro, belleOutro, personalizationDebug),
      belleSessionCount,
    }, belleIntro?.variant?.variant_key)
  }
