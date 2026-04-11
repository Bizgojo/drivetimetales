import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const INTRO_OUTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`

export async function GET(req: NextRequest) {
  const storyId = req.nextUrl.searchParams.get('storyId')
  const firstName = req.nextUrl.searchParams.get('firstName') || ''
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, author, audio_url, intro_audio_url, intro_before_url, intro_after_url, story_audio_url, outro_audio_url, background_music_url')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  // If story has a rendered final_mix.mp3, return empty queue so the player
  // uses audio_url directly (all mixing already done — no segment queue needed)
  // If intro_audio_url exists, always use the 3-file queue — never useFinalMix
  const has3Files = !!(story.intro_audio_url)
  const isPlainAudio = !has3Files && story.audio_url && !story.audio_url.includes('/asc/') && !story.audio_url.includes('/asc3/')
  if (isPlainAudio || (!has3Files && (story.audio_url?.includes('final_mix') || story.audio_url?.includes('/final.mp3')))) {
    return NextResponse.json({
      queue: [],
      useFinalMix: true,
      finalMixUrl: story.audio_url,
      introOutroMusicUrl: null,
      backgroundMusicUrl: null,
      totalSegments: 0,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []

  // 1. Intro — split by name if before/after urls exist
  if ((story as any).intro_before_url && firstName) {
    // Get or generate name clip
    let nameClipUrl = ''
    const BELLE_B_VOICE_ID = 'KWDD3Wyq30ZF5NEL01EJ'
    const { data: nameRow } = await supabase.from('name_audio')
      .select('audio_url').eq('first_name', firstName).eq('voice_id', BELLE_B_VOICE_ID).single()
    if (nameRow?.audio_url) {
      nameClipUrl = nameRow.audio_url
    } else {
      // Generate name clip via ElevenLabs
      try {
        const EL_KEY = process.env.ELEVENLABS_API_KEY!
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE_ID}`, {
          method: 'POST',
          headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({ text: firstName, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true } })
        })
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          const safeName = firstName.toLowerCase().replace(/[^a-z0-9]/g, '-')
          const uploadPath = `names/${safeName}_${BELLE_B_VOICE_ID}.mp3`
          await supabase.storage.from('audio').upload(uploadPath, buf, { contentType: 'audio/mpeg', upsert: true })
          nameClipUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${uploadPath}`
          await supabase.from('name_audio').upsert({ first_name: firstName, voice_id: BELLE_B_VOICE_ID, audio_url: nameClipUrl })
        }
      } catch(e) { console.error('Name clip generation failed:', e) }
    }
    queue.push({ url: (story as any).intro_before_url, type: 'intro', label: 'Intro' })
    if (nameClipUrl) queue.push({ url: nameClipUrl, type: 'intro', label: 'Name' })
    queue.push({ url: (story as any).intro_after_url, type: 'intro', label: 'Intro' })
  } else if (story.intro_audio_url) {
    queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
  }

  // 2. Detect architecture: new ASC (asc/slug/story_body.mp3) vs old ASC3 (asc3/id/segment_*.mp3)
  const refUrl = story.story_audio_url || story.audio_url || ''
  const isNewASC = refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
  const isHal3File = has3Files && !isNewASC

  if (isNewASC || isHal3File) {
    // New 3-file architecture — story_body.mp3 is the full pre-mixed story + BG music
    const storyUrl = story.story_audio_url || story.audio_url
    if (storyUrl) {
      queue.push({ url: storyUrl, type: 'story', label: 'Story' })
    }
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

  // Old ASC3 architecture — segments in asc3/{folderId}/
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
      queue.push({
        url: `${BASE_URL}/asc3/${folderId}/${seg.name}`,
        type: 'story',
        label: 'Story'
      })
    }

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const backgroundMusicUrl = bgFile
      ? `${BASE_URL}/asc3/${folderId}/background_music.mp3`
      : null

    if (story.outro_audio_url) {
      queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
    }

    return NextResponse.json({
      queue,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl,
      totalSegments: queue.length,
    })
  }

  // Fallback
  if (story.outro_audio_url) {
    queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
  }

  return NextResponse.json({
    queue,
    introOutroMusicUrl: INTRO_OUTRO_MUSIC,
    backgroundMusicUrl: null,
    totalSegments: queue.length,
  })
}
