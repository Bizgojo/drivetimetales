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
    .select('id, title, author, intro_audio_url, story_audio_url, outro_audio_url')
    .eq('id', storyId)
    .single()

  if (error || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  // Extract storage folder ID from intro or story audio URL
  const refUrl = story.intro_audio_url || story.story_audio_url || ''
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
