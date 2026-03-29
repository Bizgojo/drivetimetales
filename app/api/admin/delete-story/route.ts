import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('[Delete Story] Missing env vars:', { url: !!supabaseUrl, key: !!supabaseKey })
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { storyId } = await req.json()

    if (!storyId) {
      return NextResponse.json({ error: 'Missing storyId' }, { status: 400 })
    }

    console.log('[Delete Story] Looking up story:', storyId)

    // Step 1: Get the story's audio_url and cover_url before deleting (use table, not view)
    const { data: story, error: fetchError } = await supabase
      .from('stories')
      .select('id, title, audio_url, cover_url')
      .eq('id', storyId)
      .single()

    console.log('[Delete Story] Fetch result:', { story: story?.title, error: fetchError?.message, code: fetchError?.code })

    if (fetchError || !story) {
      return NextResponse.json({ error: 'Story not found', details: fetchError?.message || 'No data returned' }, { status: 404 })
    }

    console.log('[Delete Story] Starting cascade delete for:', story.title, story.id)

    // Step 2: Delete from user_library (play history, progress, purchases)
    const { error: libraryError } = await supabase
      .from('user_library')
      .delete()
      .eq('story_id', storyId)

    if (libraryError) {
      console.error('[Delete Story] user_library error:', libraryError)
    } else {
      console.log('[Delete Story] Cleared user_library')
    }

    // Step 3: Delete from user_preferences (wishlists, not-for-me)
    const { error: prefsError } = await supabase
      .from('user_preferences')
      .delete()
      .eq('story_id', storyId)

    if (prefsError) {
      console.error('[Delete Story] user_preferences error:', prefsError)
    } else {
      console.log('[Delete Story] Cleared user_preferences')
    }

    // Step 4: Delete from story_reviews
    const { error: reviewsError } = await supabase
      .from('story_reviews')
      .delete()
      .eq('story_id', storyId)

    if (reviewsError) {
      console.error('[Delete Story] story_reviews error:', reviewsError)
    } else {
      console.log('[Delete Story] Cleared story_reviews')
    }

    // Step 5: Delete audio file from Supabase storage (if stored there)
    const audioUrl = story.audio_url
    if (audioUrl && audioUrl.includes('supabase.co/storage')) {
      const audioMatch = audioUrl.match(/\/object\/public\/([^/]+)\/(.+)$/)
      if (audioMatch) {
        const bucket = audioMatch[1]
        const filePath = decodeURIComponent(audioMatch[2])
        const { error: audioDeleteError } = await supabase.storage
          .from(bucket)
          .remove([filePath])

        if (audioDeleteError) {
          console.error('[Delete Story] Audio storage delete error:', audioDeleteError)
        } else {
          console.log('[Delete Story] Deleted audio file from storage:', bucket, filePath)
        }
      }
    }

    // Step 6: Delete cover file from Supabase storage (if stored there)
    const coverUrl = story.cover_url
    if (coverUrl && coverUrl.includes('supabase.co/storage')) {
      const coverMatch = coverUrl.match(/\/object\/public\/([^/]+)\/(.+)$/)
      if (coverMatch) {
        const bucket = coverMatch[1]
        const filePath = decodeURIComponent(coverMatch[2])
        const { error: coverDeleteError } = await supabase.storage
          .from(bucket)
          .remove([filePath])

        if (coverDeleteError) {
          console.error('[Delete Story] Cover storage delete error:', coverDeleteError)
        } else {
          console.log('[Delete Story] Deleted cover file from storage:', bucket, filePath)
        }
      }
    }

    // Step 7: Delete the story row itself (must use the table, not the view)
    const { error: storyDeleteError } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)

    if (storyDeleteError) {
      console.error('[Delete Story] stories table error:', storyDeleteError)
      return NextResponse.json({ error: 'Failed to delete story record' }, { status: 500 })
    }

    console.log('[Delete Story] CASCADE DELETE COMPLETE for:', story.title)

    return NextResponse.json({
      success: true,
      deleted: {
        story: story.title,
        storyId: story.id,
        clearedTables: ['user_library', 'user_preferences', 'story_reviews'],
        storageFiles: {
          audio: story.audio_url ? 'attempted' : 'none',
          cover: story.cover_url ? 'attempted' : 'none',
        }
      }
    })

  } catch (error) {
    console.error('[Delete Story] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
