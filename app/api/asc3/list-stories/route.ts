import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending'

    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Map DB columns back to Story UI shape
    const stories = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      primaryGenre: row.primary_genre || row.genre || '',
      wordCount: row.word_count || 0,
      series: row.series_id || '',
      episode: row.episode_number?.toString() || '',
      concept: row.description || '',
      tone: row.tone || '',
      authorName: row.author || '',
      authorStyle: row.author_style || '',
      targetDestination: row.target_destination || 'App Library',
      status: row.status || 'pending',
      createdAt: row.created_at,
      generatedScript: row.script || '',
      introAudioUrl: row.intro_audio_url || '',
      storyAudioUrl: row.audio_url || row.story_audio_url || '',
      outroAudioUrl: row.outro_audio_url || '',
      backgroundMusicUrl: '',
      coverImageUrl: row.cover_url || row.cover_image_url || '',
      sfxMetadata: [],
      introText: row.intro_text || '',
      outroText: row.outro_text || '',
    }))

    return NextResponse.json({ success: true, stories })
  } catch (err) {
    console.error('list-stories error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
