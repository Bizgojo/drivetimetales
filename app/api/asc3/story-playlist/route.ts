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
    .select('id, title, author, audio_url, intro_audio_url, intro_before_url, intro_after_url, story_audio_url, outro_audio_url, background_music_url, script')
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

  const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v6.mp3`
  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []
  // Always start with the sting
  queue.push({ url: STING_URL, type: 'intro', label: 'Sting' })

  // 1. Intro — always generate personalized Belle B intro with name baked in
  if (firstName && (story as any).script) {
    try {
      const introMatch = (story as any).script?.match(/BELLE B INTRO\s*\n---\s*\n([\s\S]*?)\n---/i)
      const introLine = introMatch?.[1]?.match(/BELLE B:\s*(.+)/i)?.[1]?.trim()
      if (introLine) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.endless-tales.com'
        const res = await fetch(`${appUrl}/api/admin/generate-belle-intro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId, firstName, introText: introLine, type: 'intro' })
        })
        const data = res.ok ? await res.json() : null
        if (data?.url) {
          queue.push({ url: data.url, type: 'intro', label: 'Intro' })
        } else if (story.intro_audio_url) {
          queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
        }
      } else if (story.intro_audio_url) {
        queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
      }
    } catch(e) {
      if (story.intro_audio_url) queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
    }
  } else if (story.intro_audio_url) {
    queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
  }

  // 2. Use story_audio_url (story_body.mp3) if available — queue mode with personalized intro
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

  // Detect architecture: new ASC (asc/slug/story_body.mp3) vs old ASC3 (asc3/id/segment_*.mp3)
  const refUrl = story.audio_url || ''
  const isNewASC = refUrl.includes('/asc/') && !refUrl.includes('/asc3/')
  const isHal3File = has3Files && !isNewASC

  if (isNewASC || isHal3File) {
    const storyUrl = story.audio_url
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
