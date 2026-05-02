import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const storyId = String(body.storyId || '').trim()
    const queueId = String(body.queueId || '').trim()
    const title = String(body.title || '').trim()
    const author = String(body.author || '').trim()
    const genre = String(body.genre || '').trim()
    const audio_url = String(body.audio_url || '').trim()
    const cover_url = String(body.cover_url || '').trim()
    const description = String(body.description || '').trim()
    const duration_mins = Number(body.duration_mins || 0)
    const is_free = Boolean(body.is_free)

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    }

    const { data: existingStory, error: existingError } = await supabase
      .from('stories')
      .select('id, title, author, genre, audio_url, cover_url, description, duration_mins')
      .eq('id', storyId)
      .single()

    if (existingError || !existingStory) {
      return NextResponse.json(
        { success: false, error: existingError?.message || `Story not found: ${storyId}` },
        { status: existingError?.code === 'PGRST116' ? 404 : 500 }
      )
    }

    const effectiveTitle = title || String(existingStory.title || '').trim()
    const effectiveAuthor = author || String(existingStory.author || '').trim()
    const effectiveGenre = genre || String(existingStory.genre || '').trim()
    const effectiveAudioUrl = audio_url || String(existingStory.audio_url || '').trim()
    const effectiveCoverUrl = cover_url || String(existingStory.cover_url || '').trim()
    const effectiveDescription = description || String(existingStory.description || '').trim()
    const effectiveDurationMins = duration_mins || Number(existingStory.duration_mins || 0)

    const missing: string[] = []
    if (!effectiveTitle) missing.push('title')
    if (!effectiveAuthor) missing.push('author')
    if (!effectiveGenre) missing.push('genre')
    if (!effectiveAudioUrl) missing.push('audio_url')
    if (!effectiveCoverUrl) missing.push('cover_url')
    if (!effectiveDescription) missing.push('description')
    if (!effectiveDurationMins) missing.push('duration_mins')

    if (missing.length) {
      return NextResponse.json(
        { success: false, error: `Missing required publish field(s): ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const payload: Record<string, any> = {
      title: effectiveTitle,
      author: effectiveAuthor,
      genre: effectiveGenre,
      audio_url: effectiveAudioUrl,
      cover_url: effectiveCoverUrl,
      description: effectiveDescription,
      duration_mins: effectiveDurationMins,
      is_free,
      status: 'published',
      is_hidden: false,
      published_on: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('stories')
      .update(payload)
      .eq('id', storyId)
      .select('id, title, author, genre, audio_url, cover_url, description, duration_mins, is_free, status, is_hidden, published_on')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (queueId) {
      const { error: queueError } = await supabase
        .from('story_queue_items')
        .update({
          story_id: storyId,
          status: 'published',
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId)

      if (queueError) {
        return NextResponse.json(
          { success: false, error: `Story published, but failed to update queue item: ${queueError.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      story: data,
      queueId: queueId || null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to publish story' },
      { status: 500 }
    )
  }
}
