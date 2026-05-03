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

function bad(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status })
}

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function extractHeader(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function extractTitle(script: string): string | null {
  return extractHeader(script, 'TITLE') || null
}

function scriptTail(script: string, maxChars = 1400) {
  const clean = script.replace(/\s+/g, ' ').trim()
  return clean.length <= maxChars ? clean : clean.slice(-maxChars)
}

function runtimeTarget(runtime: string) {
  const minutes = parseInt(String(runtime || '').match(/\d+/)?.[0] || '15', 10)
  const targets: Record<number, { range: string; max: number }> = {
    10: { range: '1,200 to 1,450', max: 1550 },
    15: { range: '1,800 to 2,100', max: 2250 },
    20: { range: '2,400 to 2,850', max: 3000 },
    25: { range: '3,000 to 3,550', max: 3750 },
    30: { range: '3,600 to 4,250', max: 4500 },
  }
  const target = targets[minutes] || targets[15]

  return {
    runtime: targets[minutes] ? runtime || '15 min' : '15 min',
    ...target,
  }
}

function buildContinuityBundle(prior: Array<{ episode: any; script: string; scriptJson: any }>) {
  return prior.map(({ episode, script, scriptJson }) => {
    const brief = episode.brief_json || {}
    const generated = scriptJson?.series_generation || {}
    const summary = generated?.summary || {}
    return {
      episode_number: episode.episode_number || brief.series_episode_number,
      title: episode.title,
      generated_title: generated.generated_title || extractTitle(script) || episode.title,
      description: extractHeader(script, 'DESCRIPTION') || summary.description || brief.description || '',
      planned_continuity_notes: brief.continuity_notes || summary.planned_continuity_notes || '',
      planned_cliffhanger_or_resolution: brief.cliffhanger_or_resolution || summary.planned_cliffhanger_or_resolution || '',
      script_tail: summary.script_tail || scriptTail(script),
    }
  })
}

function buildPrompt(series: any, episode: any, allEpisodes: any[], continuityBundle: any[]) {
  const brief = episode.brief_json || {}
  const target = runtimeTarget(brief.runtime || '')
  const episodeNumber = Number(episode.episode_number || brief.series_episode_number || 1)
  const totalEpisodes = Number(episode.series_total_episodes || brief.series_total_episodes || allEpisodes.length)
  const isFinale = Boolean(episode.series_is_finale ?? brief.series_is_finale ?? episodeNumber === totalEpisodes)
  const belleOutroRule = isFinale
    ? 'Belle B outro must resolve/close the series, must not encourage the next episode, and may include the author/narrator credit and "an Endless Tales original".'
    : 'Belle B outro must restate the episode cliffhanger, invite the listener to continue to the next episode, must not say "an Endless Tales original", and must not sound like a full-series ending.'
  const belleOutroTemplate = isFinale
    ? '[one or two short sentences, reflective series closure, no time-of-day reference, no next-episode invitation, may credit the author/narrator and say "an Endless Tales original"]'
    : '[one or two short sentences, reflective cliffhanger tease, no time-of-day reference, invites the next episode, no author/narrator credit, no "Endless Tales original", not a full-series ending]'

  return `You are the Endless Tales Stage 2 series script writer.

Write exactly one production-ready audio drama script for Episode ${episodeNumber} of ${totalEpisodes}.

Use the saved series package as the source of truth. Do not invent a new series premise.

CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- ${belleOutroRule}
- No SFX in the published story body.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output ONLY the script. No commentary.

Required script structure:
TITLE: [${brief.episode_title || episode.title}; 1 to 5 words, 28 characters or fewer]
SERIES: ${series.title || brief.series_name || ''}
EPISODE: ${episodeNumber}
EPISODE_TITLE: ${brief.episode_title || episode.title}
SERIES_TOTAL_EPISODES: ${totalEpisodes}
SERIES_IS_FINALE: ${isFinale ? 'true' : 'false'}
AUTHOR: ${episode.author || brief.author || ''}
GENRE: ${episode.genre || brief.genre || ''}
DESCRIPTION: [70 characters or fewer, present tense only]
NARRATOR: [assigned narrator name, not a story character unless NARRATOR_IS_CHARACTER is true]
ANNOUNCER: Belle B
NARRATIVE_VOICE: ${episode.narrative_voice || brief.narrative_voice || ''}
NARRATOR_IS_CHARACTER: [true/false, must match NARRATOR]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally and not always at the start, reads gracefully if the name is omitted, includes the episode title in quotes, references something specific from the episode, no time-of-day reference, no author/narrator credit, no "Endless Tales original"]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: ${belleOutroTemplate}

Production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Every narration/dialogue paragraph after [START AUDIO DRAMA SCRIPT] must begin with a speaker label.
- Do not write unlabeled continuation paragraphs.
- If narration continues, start a new NARRATOR: line.
- Every spoken line sent to audio must begin with NARRATOR: or CHARACTER NAME:.
- Wrong: DEPUTY PIKE: Pike's jaw tightened.
- Right: NARRATOR: Pike's jaw tightened.

Series rules:
- Episode ${episodeNumber} must match the current episode brief.
- Carry forward consequences from prior episodes.
- Do not repeat prior episode scenes except as brief context.
- ${isFinale ? 'This is the finale. Resolve the season arc completely.' : 'This is not the finale. End on a specific cliffhanger with forward momentum. Do not use "to be continued" phrasing.'}

Additional rules:
- DESCRIPTION must be 70 characters or fewer and present tense only so it fits two lines on story cards. Reject past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- If NARRATOR_IS_CHARACTER is false, NARRATOR must not be a story character name and must not include "(character)".
- If the narrator is a story character, NARRATOR_IS_CHARACTER must be true and the script must use consistent first-person narration.
- Keep narrator voice consistent.
- Do not include markdown fences.

RUNTIME TARGET:
Requested runtime: ${target.runtime}
Target script length: ${target.range} words total.
Hard maximum: ${target.max.toLocaleString()} words total.
If needed, simplify plot, reduce scene count, and tighten dialogue before exceeding the hard maximum.

USER NOTES / CONSTRAINTS:
${String(brief.requirements || '').trim() || 'None'}

SERIES PACKAGE:
${JSON.stringify({
    series_id: series.id,
    series_title: series.title,
    series_bible: series.description || brief.series_bible || '',
    full_episode_plan: brief.full_episode_plan || allEpisodes.map((ep: any) => ep.brief_json).filter(Boolean),
  }, null, 2)}

CURRENT EPISODE BRIEF:
${JSON.stringify(brief, null, 2)}

PRIOR EPISODE CONTINUITY BUNDLE:
	${JSON.stringify(continuityBundle, null, 2)}
	`
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
      .select('id,title,status,brief_json,script,script_json,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
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
    const { seriesId, model = 'claude-opus-4-6' } = await req.json()
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
      .select('id,title,author,author_style,genre,narrative_voice,brief_json,status,script,script_json,script_version,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
      .eq('series_id', cleanSeriesId)
      .order('episode_number', { ascending: true })

    if (episodesError) return bad(episodesError.message, 500)
    if (!episodes || episodes.length === 0) return bad('No child episodes found for series package', 404)

    const priorGenerated: Array<{ episode: any; script: string; scriptJson: any }> = []
    const generatedEpisodes = []

    for (const episode of episodes) {
      const episodeNumber = Number(episode.episode_number || episode.series_episode_number || generatedEpisodes.length + 1)
      const brief = episode.brief_json as any

      if (!brief) {
        return bad(`Episode ${episodeNumber} brief_json missing`, 422, { failedEpisode: episodeNumber, failedStoryId: episode.id })
      }

      if (episode.script) {
        console.log(`[series-package/generate-scripts] Skipping episode ${episodeNumber} because script exists`)
        priorGenerated.push({
          episode,
          script: episode.script,
          scriptJson: episode.script_json && typeof episode.script_json === 'object' ? episode.script_json : {},
        })
        continue
      }

      console.log(`[series-package/generate-scripts] Generating missing episode ${episodeNumber}`)

      const continuityBundle = buildContinuityBundle(priorGenerated)
      const prompt = buildPrompt(series, episode, episodes, continuityBundle)

      let response
      try {
        response = await anthropic.messages.create({
          model,
          max_tokens: 12000,
          temperature: 0.65,
          messages: [{ role: 'user', content: prompt }],
        })
      } catch (err) {
        return bad(
          err instanceof Error ? err.message : `Episode ${episodeNumber} script generation failed`,
          500,
          { failedEpisode: episodeNumber, failedStoryId: episode.id }
        )
      }

      const script = response.content
        .map((c: any) => ('text' in c ? c.text : ''))
        .join('')
        .trim()

      const generatedTitle = extractTitle(script) || episode.title || ''
      const wordCount = countWords(generatedTitle)

      if (!script) {
        return bad(`Episode ${episodeNumber} returned an empty script`, 422, { failedEpisode: episodeNumber, failedStoryId: episode.id })
      }
      if (!generatedTitle || wordCount < 1 || wordCount > 5) {
        return bad(
          `Episode ${episodeNumber} generated title must be 1 to 5 words. Got: "${generatedTitle}"`,
          422,
          { failedEpisode: episodeNumber, failedStoryId: episode.id }
        )
      }

      const existingJson = episode.script_json && typeof episode.script_json === 'object'
        ? episode.script_json
        : {}

      const script_json = {
        ...existingJson,
        series_generation: {
          generated_title: generatedTitle,
          generated_at: new Date().toISOString(),
          model,
          episode_number: episodeNumber,
          series_id: cleanSeriesId,
          continuity_bundle_used: continuityBundle,
          summary: {
            title: generatedTitle,
            description: extractHeader(script, 'DESCRIPTION'),
            planned_continuity_notes: brief.continuity_notes || '',
            planned_cliffhanger_or_resolution: brief.cliffhanger_or_resolution || '',
            script_tail: scriptTail(script),
          },
        },
        raw_script: script,
      }

      const { data: updated, error: updateError } = await supabase
        .from('stories')
        .update({
          title: generatedTitle,
          script,
          script_json,
          status: 'script_drafted',
          script_version: (episode.script_version || 1) + 1,
        })
        .eq('id', episode.id)
        .select('id,title,status,script,script_json,series_id,episode_number,series_episode_number')
        .single()

      if (updateError || !updated) {
        return bad(
          updateError?.message || `Episode ${episodeNumber} update failed`,
          500,
          { failedEpisode: episodeNumber, failedStoryId: episode.id }
        )
      }

      priorGenerated.push({ episode: { ...episode, title: updated.title }, script, scriptJson: script_json })
      generatedEpisodes.push(updated)

      logAnthropicCall({
        route: '/api/v2/series-package/generate-scripts',
        purpose: 'series-episode-script',
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        storyId: episode.id,
        storyTitle: generatedTitle,
        metadata: { is_v2: true, series_id: cleanSeriesId, episode_number: episodeNumber },
      }).catch(() => {})
    }

    const { data: refreshedEpisodes, error: refreshError } = await supabase
      .from('stories')
      .select('id,title,status,brief_json,script,script_json,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
      .eq('series_id', cleanSeriesId)
      .order('episode_number', { ascending: true })

    if (refreshError) return bad(refreshError.message, 500)

    return NextResponse.json({
      success: true,
      package: {
        series,
        episodes: refreshedEpisodes || generatedEpisodes,
      },
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
