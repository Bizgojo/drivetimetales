import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const INTRO_OUTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
const BELLE_B_NAME_VOICE_IDS = ['KWDD3Wyq30ZF5NEL01EJ', 'wewocdDkjSLm9ZwjO7TD']

export async function GET(req: NextRequest) {
  const storyId = req.nextUrl.searchParams.get('storyId')
  const rawFirstName = req.nextUrl.searchParams.get('firstName')?.trim()
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, author, audio_url, intro_audio_url, intro_before_url, intro_after_url, story_audio_url, outro_audio_url, background_music_url, script')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const refUrl = story.audio_url || ''
  const has3Files = !!(story.intro_audio_url)
  const hasSplitIntro = !!(story.intro_before_url && story.intro_after_url && (story as any).story_audio_url)
  const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`
  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []

  queue.push({ url: STING_URL, type: 'intro', label: 'Sting' })

  if (hasSplitIntro) {
    let nameAudioUrl: string | null = null
    if (rawFirstName) {
      const firstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1).toLowerCase()
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

    queue.push({ url: story.intro_before_url!, type: 'intro', label: 'Intro' })
    if (nameAudioUrl) {
      queue.push({ url: nameAudioUrl, type: 'intro', label: 'Name' })
    }
    queue.push({ url: story.intro_after_url!, type: 'intro', label: 'Intro' })
    queue.push({ url: (story as any).story_audio_url, type: 'story', label: 'Story' })
    if (story.outro_audio_url) {
      queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
    }

    return NextResponse.json({
      queue,
      useFinalMix: false,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: (story as any).background_music_url || null,
      totalSegments: queue.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const isImportedAscFinalMix = refUrl.includes('/asc/') && refUrl.endsWith('/final.mp3')
  const isAsc3FinalMix = refUrl.includes('/asc3/') && refUrl.includes('final_mix.mp3')
  const isPlainAudio = !has3Files && refUrl && !refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
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
    queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
  }

  if ((story as any).story_audio_url) {
    queue.push({ url: (story as any).story_audio_url, type: 'story', label: 'Story' })
    if (story.outro_audio_url) {
      queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
    }
    return NextResponse.json({
      queue,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: (story as any).background_music_url || null,
      totalSegments: queue.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const isNewASC = refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
  const isHal3File = has3Files && !isNewASC

  if (isNewASC || isHal3File) {
    const storyUrl = story.audio_url
    if (storyUrl) queue.push({ url: storyUrl, type: 'story', label: 'Story' })
    if (story.outro_audio_url) queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
    return NextResponse.json({
      queue,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl: (story as any).background_music_url || null,
      totalSegments: queue.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
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

    if (story.outro_audio_url) queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })

    return NextResponse.json({
      queue,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl,
      totalSegments: queue.length,
    })
  }

  if (story.outro_audio_url) queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })

  return NextResponse.json({
    queue,
    introOutroMusicUrl: INTRO_OUTRO_MUSIC,
    backgroundMusicUrl: null,
    totalSegments: queue.length,
  })
}
