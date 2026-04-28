import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const storyId = req.nextUrl.searchParams.get('storyId')

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        status,
        script,
        validator_report,
        validator_result,
        author,
        author_style,
        genre,
        narrative_voice,
        series_id,
        series_name,
        series_episode_number,
        series_total_episodes,
        series_is_finale,
        story_type,
        duration_label,
        brief_json,
        grade_total,
        grade_notes
      `)
      .eq('id', storyId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const brief = (data?.brief_json && typeof data.brief_json === 'object') ? data.brief_json : {}

    const story = {
      id: data?.id || '',
      title: data?.title || '',
      status: data?.status || '',
      script: data?.script || '',
      validator_report: data?.validator_report || '',
      validator_result: data?.validator_result || '',
      author: data?.author || '',
      author_style: data?.author_style || '',
      genre: data?.genre || '',
      narrative_voice: data?.narrative_voice || '',
      series_id: data?.series_id || brief?.series_id || '',
      premise: brief?.premise || '',
      setting: brief?.setting || '',
      runtime: data?.duration_label || brief?.runtime || '',
      type: data?.story_type || brief?.type || 'standalone',
      series_name: data?.series_name || brief?.series_name || '',
      series_episode_number: data?.series_episode_number ?? brief?.series_episode_number ?? null,
      series_total_episodes: data?.series_total_episodes ?? brief?.series_total_episodes ?? null,
      series_is_finale: data?.series_is_finale ?? brief?.series_is_finale ?? null,
      grade_total: data?.grade_total ?? null,
      grade_notes: data?.grade_notes || '',
    }

    return NextResponse.json({ success: true, story })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
