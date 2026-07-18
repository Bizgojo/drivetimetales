import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { buildNamePalettePromptBlock } from '@/lib/story/namePalette'
import { runPremiseGate, formatPremiseCollisionMessage } from '@/lib/premiseGate'

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

function replaceOrInsertHeader(script: string, key: string, value: string): string {
  const headerPattern = new RegExp(`^${key}:\\s*.*$`, 'm')
  if (headerPattern.test(script)) return script.replace(headerPattern, `${key}: ${value}`)
  if (/^GENRE:\s*.*$/m.test(script)) return script.replace(/^GENRE:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  if (/^AUTHOR:\s*.*$/m.test(script)) return script.replace(/^AUTHOR:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  return `${key}: ${value}\n${script}`
}

function sanitizeDescription(description: string): string {
  const original = String(description || '')
  const clean = original
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .replace(/[.]{2,}|…/g, '')
    .trim()

  const fallback = 'A dangerous secret pulls every choice toward the truth.'
  const source = clean || fallback
  const maxChars = 70
  const weakEnding = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an)$/i

  let next = source
  if (next.length > maxChars) {
    next = ''
    for (const word of source.split(' ')) {
      const candidate = next ? `${next} ${word}` : word
      const punctuated = /[.!?]$/.test(candidate) ? candidate : `${candidate}.`
      if (punctuated.length > maxChars) break
      next = candidate
    }
  }

  next = (next || source.slice(0, maxChars))
    .replace(/[,\-:;.!?]+$/g, '')
    .trim()

  while (weakEnding.test(next) && next.includes(' ')) {
    next = next.split(' ').slice(0, -1).join(' ').trim()
  }

  if (!next) next = fallback.replace(/[.!?]+$/g, '')
  if (!/[.!?]$/.test(next)) next = `${next}.`
  if (next.length > maxChars) next = fallback

  console.log('[DESCRIPTION SANITIZED]', {
    originalLength: original.length,
    finalLength: next.length,
  })

  return next
}

function normalizeScriptDescription(script: string, fallbackDescription = '') {
  const description = sanitizeDescription(extractHeader(script, 'DESCRIPTION') || fallbackDescription)
  return {
    script: replaceOrInsertHeader(script, 'DESCRIPTION', description),
    description,
  }
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

function buildPrompt(series: any, episode: any, allEpisodes: any[], continuityBundle: any[], namePaletteBlock: string) {
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

⭐ MANDATORY FIRST STEP: STORY RESOLUTION MAP ⭐

BEFORE you write a single line of dialogue, output a Story Resolution Map as a comment block at the top of the script. All six sections are required:

1. MAIN HOOK / PROBLEM
   What urgent question, danger, mystery, desire, or conflict pulls the listener in this episode?

2. WHY THE SOLUTION SEEMS DIFFICULT
   Why does the solution appear impossible, dangerous, hidden, or costly at the start of this episode?

3. WHAT CHANGES IN THE MIDDLE
   List the smaller problems, discoveries, reversals, choices, leverage, escalating consequences, or emotional shifts that gradually make the episode solution possible.

4. FINAL DECISIVE ACTION
   State the concrete onstage action the protagonist takes BEFORE drafting. Must resolve the episode problem.
   ${isFinale ? '⚠️ SERIES FINALE: The solution must also resolve the full series problem.' : 'Non-finale: resolve the episode problem while deepening the series hook.'}

5. EMOTIONAL PAYOFF / WHY THE ENDING IS EARNED
   How does the middle make the decisive action feel possible but not obvious, and what does the ending cost, heal, reveal, or change?

6. VARIETY GUARDRAIL
   How does this episode differ in structure, tone, pacing, and solution type from other episodes in this series?

Hard rules:
- The solution must feel difficult at the beginning of this episode.
- The middle must progressively increase understanding, reveal leverage, and escalate consequences.
- The climax must happen onstage.
- The protagonist must affect the outcome through decisive action.
- The ending must resolve through dramatic action and consequence, not explanation alone.
- Avoid offscreen solutions, coincidence/deus-ex-machina fixes, passive symbolic endings, abrupt explanation dumps, "villain already dead" anticlimax, and endings where the protagonist only watches or learns what happened.
- ${isFinale ? 'This is the SERIES FINALE. The core series problem MUST be fully resolved with emotional closure.' : 'This is a non-finale. Resolve the episode problem while advancing series tension and strengthening the series hook.'}
- Do not repeat the same plot pattern as other episodes in this series.

CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- Belle B intro for series episodes MUST name the series title by name — the listener must hear the series they are in.
- ${belleOutroRule}
- No SFX in the published story body.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output the complete script (including the STORY RESOLUTION MAP as a comment block at the top). No additional commentary.

${namePaletteBlock}

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
NARRATOR: [assigned voice name from narrator_voices — ALWAYS the voice talent name (e.g. "Ray Dolan"), NEVER a story character name, even when NARRATOR_IS_CHARACTER is true]
ANNOUNCER: Belle B
NARRATIVE_VOICE: ${episode.narrative_voice || brief.narrative_voice || ''}
NARRATOR_IS_CHARACTER: [true/false — true means the narrator IS a story character speaking in first person, but the NARRATOR header must still be the voice talent name]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally and not always at the start, reads gracefully if the name is omitted, MUST name the series title (e.g. "In [Series Name], [LISTENER_NAME]..." or "[LISTENER_NAME], in [Series Name], ..."), includes the episode title or a specific detail, references something specific from the episode, no time-of-day reference, no author/narrator credit, no "Endless Tales original"]

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
- NARRATOR header must ALWAYS be the assigned voice talent name (e.g. "Ray Dolan", "Samuel Cord"). Never a story character name. This rule has no exceptions. (HAL-SCRIPT-001)
- If NARRATOR_IS_CHARACTER is false, the narrator is a detached third-person voice.
- If NARRATOR_IS_CHARACTER is true, the narrator is a story character speaking in first person — but the NARRATOR header still uses the voice talent name, not the character name.
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

async function loadRecentStoryTexts(seriesId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('title,script,script_json,series_id')
    .not('script', 'is', null)
    .or(`series_id.is.null,series_id.neq.${seriesId}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []

  return data.map((story: any) => [
    story.title || '',
    story.script || '',
    story.script_json?.raw_script || '',
  ].join('\n'))
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
      .select('id,title,author,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
      .eq('series_id', cleanSeriesId)
      .order('episode_number', { ascending: true })

    if (episodesError) return bad(episodesError.message, 500)
    if (!episodes || episodes.length === 0) return bad('No child episodes found for series package', 404)

    // PREMISE-UNIQUENESS-001: mandatory premise check at the brief gate
    // before Stage 2 — every episode brief that still needs a script is gated
    // against premise_index (sibling episodes of this series are excluded by
    // the gate). Any COLLISION bounces the whole package for rework; override
    // only via Marc's recorded brief_json.premise_gate_override.
    for (const episode of episodes) {
      if (episode.script) continue
      const episodeBrief = episode.brief_json as any
      if (!episodeBrief) continue // per-episode brief_json errors are handled in the loop below
      const premiseGate = await runPremiseGate(supabase, {
        storyId: episode.id,
        seriesId: cleanSeriesId,
        premise: String(episodeBrief.premise || ''),
        briefJson: episodeBrief,
      })
      if (premiseGate.verdict === 'COLLISION') {
        return bad(formatPremiseCollisionMessage(premiseGate), 409, {
          failedEpisode: Number(episode.episode_number || episode.series_episode_number || 0),
          failedStoryId: episode.id,
          premiseGate: { verdict: premiseGate.verdict, collisions: premiseGate.collisions },
        })
      }
      if (premiseGate.overrideApplied) {
        console.warn('[series-package/generate-scripts] PREMISE-UNIQUENESS-001 override applied', {
          storyId: episode.id,
          approvedBy: premiseGate.overrideApplied.approved_by,
          reason: premiseGate.overrideApplied.reason,
          overriddenCollisions: premiseGate.collisions,
        })
      }
    }

    const priorGenerated: Array<{ episode: any; script: string; scriptJson: any }> = []
    const generatedEpisodes = []
    const recentStoryTexts = await loadRecentStoryTexts(cleanSeriesId)

    for (let episode of episodes) {
      const episodeNumber = Number(episode.episode_number || episode.series_episode_number || generatedEpisodes.length + 1)
      const brief = episode.brief_json as any

      if (!brief) {
        return bad(`Episode ${episodeNumber} brief_json missing`, 422, { failedEpisode: episodeNumber, failedStoryId: episode.id })
      }

      if (episode.script) {
        console.log(`[series-package/generate-scripts] Skipping episode ${episodeNumber} because script exists`)
        const normalized = normalizeScriptDescription(episode.script, brief.description || '')
        const existingJson = episode.script_json && typeof episode.script_json === 'object'
          ? episode.script_json
          : {}
        const nextBrief = { ...brief, description: normalized.description }
        const nextScriptJson = {
          ...existingJson,
          series_generation: {
            ...(existingJson.series_generation || {}),
            summary: {
              ...(existingJson.series_generation?.summary || {}),
              description: normalized.description,
            },
          },
          raw_script: normalized.script,
        }

        if (normalized.script !== episode.script || episode.description !== normalized.description || brief.description !== normalized.description) {
          console.log('[DESCRIPTION NORMALIZED EXISTING]', {
            episodeNumber,
            storyId: episode.id,
            finalLength: normalized.description.length,
          })

          const { data: updatedExisting, error: existingUpdateError } = await supabase
            .from('stories')
            .update({
              script: normalized.script,
              description: normalized.description,
              brief_json: nextBrief,
              script_json: nextScriptJson,
            })
            .eq('id', episode.id)
            .select('id,title,author,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
            .single()

          if (existingUpdateError || !updatedExisting) {
            return bad(
              existingUpdateError?.message || `Episode ${episodeNumber} description normalization failed`,
              500,
              { failedEpisode: episodeNumber, failedStoryId: episode.id }
            )
          }

          episode = updatedExisting
        }

        priorGenerated.push({
          episode,
          script: normalized.script,
          scriptJson: nextScriptJson,
        })
        continue
      }

      console.log(`[series-package/generate-scripts] Generating missing episode ${episodeNumber}`)

      const continuityBundle = buildContinuityBundle(priorGenerated)
      const namePaletteBlock = buildNamePalettePromptBlock({
        genre: episode.genre || brief.genre || '',
        setting: [brief.setting, brief.location, brief.region, series.setting].filter(Boolean).join(' '),
        era: brief.era || brief.period || '',
        seriesContinuityText: continuityBundle.map((item) => JSON.stringify(item)).join('\n'),
        recentStoryTexts,
      })
      const prompt = buildPrompt(series, episode, episodes, continuityBundle, namePaletteBlock)

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

      const rawScript = response.content
        .map((c: any) => ('text' in c ? c.text : ''))
        .join('')
        .trim()
      const normalized = normalizeScriptDescription(rawScript, brief.description || '')
      const script = normalized.script
      const description = normalized.description

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
      const nextBrief = { ...brief, description }

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
            description,
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
          description,
          script,
          script_json,
          brief_json: nextBrief,
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

    const { data: episodesToNormalize, error: normalizeLoadError } = await supabase
      .from('stories')
      .select('id,description,brief_json,script,script_json,series_id,episode_number,series_episode_number')
      .eq('series_id', cleanSeriesId)
      .order('episode_number', { ascending: true })

    if (normalizeLoadError) return bad(normalizeLoadError.message, 500)

    for (const episode of episodesToNormalize || []) {
      if (!episode.script) continue

      const episodeNumber = Number(episode.episode_number || episode.series_episode_number || 0)
      const brief = episode.brief_json && typeof episode.brief_json === 'object' ? episode.brief_json as any : {}
      const normalized = normalizeScriptDescription(episode.script, brief.description || episode.description || '')
      const existingJson = episode.script_json && typeof episode.script_json === 'object'
        ? episode.script_json as any
        : {}
      const nextBrief = { ...brief, description: normalized.description }
      const nextScriptJson = {
        ...existingJson,
        series_generation: {
          ...(existingJson.series_generation || {}),
          summary: {
            ...(existingJson.series_generation?.summary || {}),
            description: normalized.description,
          },
        },
        raw_script: normalized.script,
      }

      if (
        normalized.script === episode.script
        && episode.description === normalized.description
        && brief.description === normalized.description
      ) {
        continue
      }

      console.log('[DESCRIPTION NORMALIZED EXISTING]', {
        episodeNumber,
        storyId: episode.id,
        finalLength: normalized.description.length,
      })

      const { error: normalizeUpdateError } = await supabase
        .from('stories')
        .update({
          description: normalized.description,
          script: normalized.script,
          brief_json: nextBrief,
          script_json: nextScriptJson,
        })
        .eq('id', episode.id)

      if (normalizeUpdateError) {
        return bad(
          normalizeUpdateError.message || `Episode ${episodeNumber} description normalization failed`,
          500,
          { failedEpisode: episodeNumber, failedStoryId: episode.id }
        )
      }
    }

    const { data: refreshedEpisodes, error: refreshError } = await supabase
      .from('stories')
      .select('id,title,status,description,brief_json,script,script_json,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
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
