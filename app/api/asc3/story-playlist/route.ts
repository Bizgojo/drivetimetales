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
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, author, audio_url, intro_audio_url, story_audio_url, outro_audio_url')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  // If story has a rendered final_mix.mp3, return empty queue so the player
  // uses audio_url directly (all mixing already done — no segment queue needed)
  if (story.audio_url?.includes('final_mix')) {
    return NextResponse.json({
      queue: [],
      useFinalMix: true,
      finalMixUrl: story.audio_url,
      introOutroMusicUrl: null,
      backgroundMusicUrl: null,
      totalSegments: 0,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Extract storage folder ID — always prefer story_audio_url (segments folder)
  // intro_audio_url may use a different/incorrect folder ID from DB auto-generated ID
  const refUrl = story.story_audio_url || story.intro_audio_url || ''
  const folderMatch = refUrl.match(/asc3\/([^/]+)\//)
  const folderId = folderMatch?.[1]

  const queue: { url: string; type: 'intro' | 'story' | 'outro'; label: string }[] = []

  // 1. Intro
  if (story.intro_audio_url) {
    queue.push({ url: story.intro_audio_url, type: 'intro', label: 'Intro' })
  }

  // 2. Story segments (from storage)
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
        label: `Story`
      })
    }

    // Background music URL
    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const backgroundMusicUrl = bgFile
      ? `${BASE_URL}/asc3/${folderId}/background_music.mp3`
      : null

    // 3. Outro
    if (story.outro_audio_url) {
      queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
    }

    return NextResponse.json({
      queue,
      introOutroMusicUrl: INTRO_OUTRO_MUSIC,
      backgroundMusicUrl,
      totalSegments: queue.length
    })
  }

  // Fallback: just return what we have
  if (story.outro_audio_url) {
    queue.push({ url: story.outro_audio_url, type: 'outro', label: 'Outro' })
  }

  return NextResponse.json({
    queue,
    introOutroMusicUrl: INTRO_OUTRO_MUSIC,
    backgroundMusicUrl: null,
    totalSegments: queue.length
  })
}
