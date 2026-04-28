import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERIES_EPISODE_COUNTS = [3, 5, 7, 13]

function runtimeToMinutes(runtime: string): number {
  const match = runtime.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 15
}

export async function GET(req: NextRequest) {
  try {
    const storyId = req.nextUrl.searchParams.get('storyId')?.trim()
    if (!storyId) return bad('storyId required')
    if (!UUID_RE.test(storyId)) return bad('storyId must be a valid UUID')

    const { data, error } = await supabase
      .from('stories')
      .select('id,title,status,brief_json,story_type,series_name,series_episode_number,series_total_episodes,series_is_finale')
      .eq('id', storyId)
      .single()

    if (error) return bad(error.message, 500)

    const brief = (data?.brief_json && typeof data.brief_json === 'object') ? data.brief_json as any : {}
    return NextResponse.json({
      success: true,
      story: {
        id: data?.id || '',
        title: data?.title || '',
        status: data?.status || '',
        type: data?.story_type || brief?.type || 'standalone',
        series_name: data?.series_name || brief?.series_name || '',
        series_episode_number: data?.series_episode_number ?? brief?.series_episode_number ?? null,
        series_total_episodes: data?.series_total_episodes ?? brief?.series_total_episodes ?? null,
        series_is_finale: data?.series_is_finale ?? brief?.series_is_finale ?? null,
        series_arc_plan: brief?.series_arc_plan || null,
      }
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const title = (body.title || '').trim()
    const type = (body.type || 'standalone').trim()
    const author = (body.author || '').trim()
    const author_style = (body.author_style || '').trim()
    const genre = (body.genre || '').trim()
    const narrative_voice = (body.narrative_voice || '').trim() || null
    const premise = (body.premise || '').trim()
    const setting = (body.setting || '').trim()
    const runtime_label = (body.runtime || '').trim()
    const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : ''
    const series_total_episodes = body.series_total_episodes == null ? null : Number(body.series_total_episodes)
    const series_episode_number = body.series_episode_number == null ? null : Number(body.series_episode_number)

    if (!author) return bad('author required')
    if (!author_style) return bad('author_style required')
    if (!genre) return bad('genre required')
    if (!premise) return bad('premise required')
    if (!setting) return bad('setting required')
    if (!runtime_label) return bad('runtime required')
    if (!['standalone', 'series'].includes(type)) return bad('type must be standalone or series')
    if (storyId && !UUID_RE.test(storyId)) return bad('storyId must be a valid UUID')

    if (type === 'series') {
      if (!body.series_name) return bad('series_name required for series')
      if (series_total_episodes == null || !SERIES_EPISODE_COUNTS.includes(series_total_episodes)) {
        return bad('series_total_episodes must be one of 3, 5, 7, or 13 for series')
      }
      if (series_episode_number == null) return bad('series_episode_number required for series')
      if (body.series_is_finale == null) return bad('series_is_finale required for series')
    }

    const brief_json = {
      title: title || null,
      type,
      series_name: body.series_name || null,
      series_episode_number: type === 'series' ? series_episode_number : null,
      series_total_episodes: type === 'series' ? series_total_episodes : null,
      series_is_finale: body.series_is_finale ?? null,
      series_arc_plan: type === 'series' ? body.series_arc_plan || null : null,
      author,
      author_style,
      genre,
      narrative_voice,
      premise,
      setting,
      runtime: runtime_label,
      characters: body.characters || null,
      requirements: body.requirements || null,
      previous_episode: body.previous_episode || null,
      next_episode: body.next_episode || null,
      music_energy: body.music_energy || null,
      music_reference: body.music_reference || null,
      music_moments: body.music_moments || null,
      audio_notes: body.audio_notes || null,
      description: body.description || null,
    }

    const payload = {
      title: title || 'Untitled Draft',
      author,
      author_style,
      genre,
      narrative_voice,
      description: body.description || null,
      brief_json,
      is_v2: true,
      status: 'brief_complete',
      script_version: 1,
      story_type: type,
      series_name: body.series_name || null,
      series_episode_number: type === 'series' ? series_episode_number : null,
      series_total_episodes: type === 'series' ? series_total_episodes : null,
      series_is_finale: body.series_is_finale ?? null,
      duration_label: runtime_label,
      duration_mins: runtimeToMinutes(runtime_label),
    }

    if (storyId) {
      console.log('story-brief: UPDATE existing story', storyId)
      const { data, error } = await supabase
        .from('stories')
        .update(payload)
        .eq('id', storyId)
        .select('id,title,status,brief_json,is_v2')
        .single()

      if (error) return bad(error.message, 500)
      return NextResponse.json({ success: true, story: data })
    }

    console.log('story-brief: INSERT new story')
    const { data, error } = await supabase
      .from('stories')
      .insert(payload)
      .select('id,title,status,brief_json,is_v2')
      .single()

    if (error) return bad(error.message, 500)
    return NextResponse.json({ success: true, story: data })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
