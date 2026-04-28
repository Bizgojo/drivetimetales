import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const EPISODE_SELECT = 'id,title,author,genre,status,brief_json,script,script_json,validator_result,validator_report,validator_passed_at,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type'

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status })
}

function episodeNumber(episode: any, fallback: number) {
  return Number(episode.episode_number || episode.series_episode_number || fallback)
}

function isValidated(episode: any) {
  return episode.status === 'validator_passed'
    || episode.validator_result === 'PASS'
    || episode.script_json?.series_score_validate?.validator_result === 'PASS'
}

export async function POST(req: NextRequest) {
  try {
    const { seriesId } = await req.json()
    const cleanSeriesId = String(seriesId || '').trim()

    if (!cleanSeriesId) return bad('seriesId required')
    if (!UUID_RE.test(cleanSeriesId)) return bad('seriesId must be a valid UUID')

    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('id', cleanSeriesId)
      .single()

    if (seriesError || !series) return bad(seriesError?.message || 'Series package not found', 404)

    const { data: episodes, error: episodesError } = await supabase
      .from('stories')
      .select(EPISODE_SELECT)
      .eq('series_id', cleanSeriesId)
      .order('episode_number', { ascending: true })

    if (episodesError) return bad(episodesError.message, 500)
    if (!episodes?.length) return bad('No child episodes found for series package', 404)

    const handoffEpisodes = []
    const updatedEpisodes = []
    const preparedEpisodes = []
    const now = new Date().toISOString()

    for (let index = 0; index < episodes.length; index += 1) {
      const episode = episodes[index]
      const number = episodeNumber(episode, index + 1)

      if (!episode.script) {
        return bad(`Episode ${number} script missing`, 422, {
          failedEpisode: number,
          failedStoryId: episode.id,
        })
      }

      if (!isValidated(episode)) {
        return bad(`Episode ${number} is not validator_passed`, 422, {
          failedEpisode: number,
          failedStoryId: episode.id,
          status: episode.status,
          validator_result: episode.validator_result || episode.script_json?.series_score_validate?.validator_result || null,
        })
      }

      preparedEpisodes.push({ episode, number })
    }

    for (const { episode, number } of preparedEpisodes) {
      const existingJson = episode.script_json && typeof episode.script_json === 'object'
        ? episode.script_json
        : {}

      const script_json = {
        ...existingJson,
        series_asc_handoff: {
          prepared_at: now,
          series_id: cleanSeriesId,
          episode_number: number,
        },
      }

      const { data: updated, error: updateError } = await supabase
        .from('stories')
        .update({
          status: 'audio_pending',
          script_json,
        })
        .eq('id', episode.id)
        .select(EPISODE_SELECT)
        .single()

      if (updateError || !updated) {
        return bad(updateError?.message || `Episode ${number} handoff update failed`, 500, {
          failedEpisode: number,
          failedStoryId: episode.id,
        })
      }

      updatedEpisodes.push(updated)
      handoffEpisodes.push({
        storyId: episode.id,
        title: episode.title,
        author: episode.author || '',
        genre: episode.genre || '',
        script: episode.script,
        episodeNumber: number,
        seriesId: cleanSeriesId,
        seriesTitle: series.title || episode.series_name || '',
        seriesName: episode.series_name || series.title || '',
        seriesTotalEpisodes: episode.series_total_episodes || series.total_episodes || episodes.length,
        seriesIsFinale: Boolean(episode.series_is_finale),
        status: 'ready_for_asc',
      })
    }

    const handoff = {
      type: 'series_package',
      seriesId: cleanSeriesId,
      title: series.title || '',
      episodeCount: handoffEpisodes.length,
      status: 'ready_for_asc',
      updatedAt: now,
      episodes: handoffEpisodes,
    }

    return NextResponse.json({
      success: true,
      adminAscPackage: true,
      handoff,
      package: {
        series,
        episodes: updatedEpisodes,
      },
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
