import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERIES_EPISODE_COUNTS = [3, 5, 7, 13]

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function runtimeToMinutes(runtime: string): number {
  const match = String(runtime || '').match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 15
}

function parseJsonObject(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Claude did not return a JSON object')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeEpisodePlan(plan: any, count: number) {
  const episodes = Array.isArray(plan?.episodes) ? plan.episodes : []
  if (episodes.length !== count) {
    throw new Error(`Series plan must contain exactly ${count} episodes`)
  }

  return episodes.map((episode: any, index: number) => ({
    episode_number: index + 1,
    title: String(episode?.title || `Episode ${index + 1}`).trim(),
    premise: String(episode?.premise || '').trim(),
    setting: String(episode?.setting || '').trim(),
    description: String(episode?.description || '').trim(),
    cliffhanger_or_resolution: String(episode?.cliffhanger_or_resolution || '').trim(),
    continuity_notes: String(episode?.continuity_notes || '').trim(),
  }))
}

async function saveSeriesParent(payload: Record<string, any>, seriesId?: string) {
  const categoryPayload: Record<string, any> = { ...payload, category: payload.genre }
  delete categoryPayload.genre

  const genrePayload = { ...payload }

  if (seriesId) {
    const first = await supabase
      .from('series')
      .update(categoryPayload)
      .eq('id', seriesId)
      .select('*')
      .single()

    if (!first.error) return first

    const second = await supabase
      .from('series')
      .update(genrePayload)
      .eq('id', seriesId)
      .select('*')
      .single()

    return second
  }

  const first = await supabase
    .from('series')
    .insert(categoryPayload)
    .select('*')
    .single()

  if (!first.error) return first

  const second = await supabase
    .from('series')
    .insert(genrePayload)
    .select('*')
    .single()

  return second
}

export async function GET(req: NextRequest) {
  try {
    const seriesId = req.nextUrl.searchParams.get('seriesId')?.trim()
    if (!seriesId) return bad('seriesId required')
    if (!UUID_RE.test(seriesId)) return bad('seriesId must be a valid UUID')

    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single()

    if (seriesError || !series) return bad(seriesError?.message || 'Series package not found', 404)

    const { data: episodes, error: episodesError } = await supabase
      .from('stories')
      .select('id,title,status,brief_json,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true })

    if (episodesError) return bad(episodesError.message, 500)

    return NextResponse.json({
      success: true,
      package: {
        series,
        episodes: episodes || [],
      },
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const seriesId = typeof body.seriesId === 'string' ? body.seriesId.trim() : ''
    const author = String(body.author || '').trim()
    const author_style = String(body.author_style || '').trim()
    const genre = String(body.genre || '').trim()
    const narrative_voice = String(body.narrative_voice || '').trim() || null
    const premise = String(body.premise || '').trim()
    const requirements = String(body.requirements || '').trim()
    const setting = String(body.setting || '').trim()
    const runtime = String(body.runtime || '').trim()
    const episodeCount = Number(body.series_total_episodes || body.episode_count || 0)

    if (seriesId && !UUID_RE.test(seriesId)) return bad('seriesId must be a valid UUID')
    if (!author) return bad('author required')
    if (!author_style) return bad('author_style required')
    if (!genre) return bad('genre required')
    if (!premise) return bad('premise required')
    if (!setting) return bad('setting required')
    if (!runtime) return bad('runtime required')
    if (!SERIES_EPISODE_COUNTS.includes(episodeCount)) {
      return bad('episode count must be one of 3, 5, 7, or 13')
    }

    const prompt = `You are planning a Phase 1 Endless Tales series package.

Create a full package plan before any scripts are written.

Rules:
- Episode count must be exactly ${episodeCount}.
- Return JSON only. No markdown.
- The series title must be 1 to 5 words.
- The series bible must describe the full continuity, character arcs, central mystery/conflict, recurring locations, tonal rules, episode-to-episode consequences, and finale direction.
- Each episode must have a distinct title, a brief-ready premise, setting, present-tense story-card description, continuity notes, and cliffhanger/resolution note.
- Non-final episodes must set up specific forward momentum.
- The final episode must resolve the season arc.
- Do not write scripts.

USER NOTES / CONSTRAINTS:
${requirements || 'None'}

Input:
${JSON.stringify({
      premise,
      requirements: requirements || null,
      setting,
      genre,
      author,
      author_style,
      narrative_voice,
      runtime,
      episode_count: episodeCount,
    }, null, 2)}

Return this exact JSON shape:
{
  "series_title": "",
  "series_bible": "",
  "episodes": [
    {
      "title": "",
      "premise": "",
      "setting": "",
      "description": "",
      "continuity_notes": "",
      "cliffhanger_or_resolution": ""
    }
  ]
}`

    const response = await anthropic.messages.create({
      model: body.model || 'claude-opus-4-6',
      max_tokens: 8000,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()

    const plan = parseJsonObject(raw)
    const seriesTitle = String(plan?.series_title || '').trim()
    const seriesBible = String(plan?.series_bible || '').trim()
    const episodes = normalizeEpisodePlan(plan, episodeCount)

    if (!seriesTitle) return bad('series_title missing from package plan', 422)
    if (!seriesBible) return bad('series_bible missing from package plan', 422)

    const parentPayload = {
      title: seriesTitle,
      description: seriesBible,
      author,
      genre,
      total_episodes: episodeCount,
      is_complete: false,
    }

    const parentResult = await saveSeriesParent(parentPayload, seriesId || undefined)
    if (parentResult.error || !parentResult.data) {
      return bad(parentResult.error?.message || 'Failed to save series package', 500)
    }

    const parent = parentResult.data
    const finalSeriesId = parent.id

    const { data: existingChildren, error: existingError } = await supabase
      .from('stories')
      .select('id,episode_number')
      .eq('series_id', finalSeriesId)

    if (existingError) return bad(existingError.message, 500)

    const existingByEpisode = new Map(
      (existingChildren || []).map((child: any) => [Number(child.episode_number || 0), child.id])
    )

    const savedEpisodes = []
    for (const episode of episodes) {
      const episodeNumber = episode.episode_number
      const isFinale = episodeNumber === episodeCount
      const brief_json = {
        type: 'series',
        package_phase: 'series_package_phase_1',
        series_id: finalSeriesId,
        series_name: seriesTitle,
        series_title: seriesTitle,
        series_bible: seriesBible,
        full_episode_plan: episodes,
        title: episode.title,
        episode_title: episode.title,
        series_episode_number: episodeNumber,
        series_total_episodes: episodeCount,
        series_is_finale: isFinale,
        author,
        author_style,
        genre,
        narrative_voice,
        premise: episode.premise || premise,
        requirements: requirements || null,
        setting: episode.setting || setting,
        runtime,
        description: episode.description || null,
        continuity_notes: episode.continuity_notes || null,
        cliffhanger_or_resolution: episode.cliffhanger_or_resolution || null,
      }

      const storyPayload = {
        title: episode.title,
        author,
        author_style,
        genre,
        narrative_voice,
        description: episode.description || null,
        brief_json,
        is_v2: true,
        status: 'brief_complete',
        script_version: 1,
        story_type: 'series_episode',
        series_id: finalSeriesId,
        series_name: seriesTitle,
        episode_number: episodeNumber,
        series_episode_number: episodeNumber,
        series_total_episodes: episodeCount,
        series_is_finale: isFinale,
        duration_label: runtime,
        duration_mins: runtimeToMinutes(runtime),
        is_hidden: true,
      }

      const existingId = existingByEpisode.get(episodeNumber)
      const result = existingId
        ? await supabase
            .from('stories')
            .update(storyPayload)
            .eq('id', existingId)
            .select('id,title,status,series_id,episode_number,brief_json')
            .single()
        : await supabase
            .from('stories')
            .insert(storyPayload)
            .select('id,title,status,series_id,episode_number,brief_json')
            .single()

      if (result.error || !result.data) {
        return bad(result.error?.message || `Failed to save episode ${episodeNumber}`, 500)
      }

      savedEpisodes.push(result.data)
    }

    logAnthropicCall({
      route: '/api/v2/series-package',
      purpose: 'series-package-plan',
      model: body.model || 'claude-opus-4-6',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      storyId: finalSeriesId,
      storyTitle: seriesTitle,
      metadata: { is_v2: true, episode_count: episodeCount },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      package: {
        series: parent,
        episodes: savedEpisodes,
      },
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
