import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { personalizationPublishBlockers } from '@/lib/personalization/publishGuard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { storyId, destinations } = body

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, title, author, genre, audio_url, cover_url, description, duration_mins, announcement_url, announcement_text, script')
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      return NextResponse.json(
        { success: false, error: storyError?.message || `Story not found: ${storyId}` },
        { status: storyError?.code === 'PGRST116' ? 404 : 500 }
      )
    }

    const missing: string[] = []
    if (!String(story.title || '').trim()) missing.push('title')
    if (!String(story.author || '').trim()) missing.push('author')
    if (!String(story.genre || '').trim()) missing.push('genre')
    if (!String(story.audio_url || '').trim()) missing.push('audio_url')
    if (!String(story.cover_url || '').trim()) missing.push('cover_url')
    if (!String(story.description || '').trim()) missing.push('description')
    if (!Number(story.duration_mins || 0)) missing.push('duration_mins')

    if (missing.length) {
      return NextResponse.json(
        { success: false, error: `Missing required publish field(s): ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // PERS-FIX-002: publish-time personalization guard — no story may ship
    // with a NULL announcement_url or a legacy [LISTENER_NAME] token
    // (PERS-DIAG-001: WotW slipped through exactly this way). Blocking.
    const personalizationBlockers = personalizationPublishBlockers(story as any)
    if (personalizationBlockers.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Personalization publish guard: ${personalizationBlockers.join('; ')}`,
          personalizationBlockers,
        },
        { status: 400 }
      )
    }

    // Check for existing published story with same title (duplicate guard)
    const { data: existing } = await supabase
      .from('stories')
      .select('id, title')
      .eq('status', 'published')
      .eq('is_hidden', false)
      .ilike('title', story.title || '')
      .neq('id', storyId)

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        error: `A published story with this title already exists (ID: ${existing[0].id}). Archive the existing one first, or use a different title.`
      }, { status: 409 })
    }

    // Update story: published + visible in library
    const { error, data } = await supabase
      .from('stories')
      .update({ status: 'published', is_hidden: false, published_on: new Date().toISOString() })
      .eq('id', storyId)
      .select('id, title')

    if (error) {
      console.error('Publish error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: `Story not found: ${storyId}` }, { status: 404 })
    }

    console.log(`✅ Published: "${data[0].title}" (${storyId})`)
    return NextResponse.json({ success: true, title: data[0].title })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
