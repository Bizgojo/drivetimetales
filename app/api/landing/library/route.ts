import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: add a story from the main stories table into the landing library
//   Body: { storyId: string }  — import from stories table
// OR deactivate an active slot story into the library
//   Body: { moveToLibrary: string }  — landing_stories.id
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Handle move-to-library (deactivate a slot story)
    if (body.moveToLibrary) {
      const { error } = await supabase
        .from('landing_stories')
        .update({ active: false, slot: null, sort_order: null, updated_at: new Date().toISOString() })
        .eq('id', body.moveToLibrary)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    const { storyId } = body
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })

    // Fetch story data from main stories table
    const { data: story, error: fetchErr } = await supabase
      .from('stories')
      .select('id, title, genre, author, duration_mins, cover_url, audio_url')
      .eq('id', storyId)
      .single()

    if (fetchErr || !story) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 })
    }

    // Check if already in landing_stories
    const { data: existing } = await supabase
      .from('landing_stories')
      .select('id')
      .eq('story_id', storyId)
      .single()

    if (existing) {
      return NextResponse.json({ success: false, error: 'Story is already in the landing library or active slots' }, { status: 409 })
    }

    // Insert into landing_stories as library item
    const { error: insertErr } = await supabase
      .from('landing_stories')
      .insert({
        story_id: story.id,
        title: story.title,
        subtitle: `${(story.genre || '').toUpperCase()} · ${(story.author || '').toUpperCase()}`,
        genre: story.genre,
        author: story.author,
        duration_mins: story.duration_mins,
        cover_url: story.cover_url,
        audio_url: story.audio_url,
        active: false,
        slot: null,
        sort_order: null,
      })

    if (insertErr) throw insertErr

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// DELETE: remove a story from the library entirely
// Body: { libraryId: string }
export async function DELETE(req: NextRequest) {
  try {
    const { libraryId } = await req.json()
    if (!libraryId) return NextResponse.json({ success: false, error: 'libraryId required' }, { status: 400 })

    // Only delete if inactive (never delete an active slot story)
    const { error } = await supabase
      .from('landing_stories')
      .delete()
      .eq('id', libraryId)
      .eq('active', false)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
