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

const EPISODE_SELECT = 'id,title,description,status,brief_json,script,script_json,validator_result,validator_report,validator_passed_at,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type'
const TITLE_MAX_CHARS = 28
const DESCRIPTION_MAX_CHARS = 70
const DESCRIPTION_PAST_TENSE_RE = /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden)\b/i

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
  const weakEnding = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an)$/i
  let next = source

  if (next.length > DESCRIPTION_MAX_CHARS) {
    next = ''
    for (const word of source.split(' ')) {
      const candidate = next ? `${next} ${word}` : word
      const punctuated = /[.!?]$/.test(candidate) ? candidate : `${candidate}.`
      if (punctuated.length > DESCRIPTION_MAX_CHARS) break
      next = candidate
    }
  }

  next = (next || source.slice(0, DESCRIPTION_MAX_CHARS))
    .replace(/[,\-:;.!?]+$/g, '')
    .trim()

  while (weakEnding.test(next) && next.includes(' ')) {
    next = next.split(' ').slice(0, -1).join(' ').trim()
  }

  if (!next) next = fallback.replace(/[.!?]+$/g, '')
  if (!/[.!?]$/.test(next)) next = `${next}.`
  if (next.length > DESCRIPTION_MAX_CHARS) next = fallback

  return next
}

async function normalizeEpisodeDescriptionBeforeValidation(episode: any, episodeNo: number) {
  const brief = episode.brief_json && typeof episode.brief_json === 'object' ? episode.brief_json : {}
  const description = sanitizeDescription(extractHeader(episode.script, 'DESCRIPTION') || brief.description || episode.description || '')
  const script = replaceOrInsertHeader(episode.script, 'DESCRIPTION', description)
  const existingJson = episode.script_json && typeof episode.script_json === 'object'
    ? episode.script_json
    : {}
  const script_json = {
    ...existingJson,
    raw_script: script,
    series_generation: {
      ...(existingJson as any).series_generation,
      summary: {
        ...((existingJson as any).series_generation?.summary || {}),
        description,
      },
    },
  }
  const brief_json = { ...brief, description }

  if (script === episode.script && episode.description === description && brief.description === description) {
    return episode
  }

  console.log('[DESCRIPTION NORMALIZED BEFORE VALIDATION]', {
    episodeNumber: episodeNo,
    storyId: episode.id,
    originalLength: String(extractHeader(episode.script, 'DESCRIPTION') || brief.description || episode.description || '').length,
    finalLength: description.length,
  })

  const { data: updated, error } = await supabase
    .from('stories')
    .update({
      description,
      script,
      script_json,
      brief_json,
    })
    .eq('id', episode.id)
    .select(EPISODE_SELECT)
    .single()

  if (error || !updated) throw new Error(error?.message || `Episode ${episodeNo} description normalization failed`)

  return updated
}

function validateCardCopy(script: string) {
  const title = extractHeader(script, 'TITLE')
  const description = extractHeader(script, 'DESCRIPTION')
  const issues: string[] = []
  const titleWords = countWords(title)

  if (!title) {
    issues.push('TITLE is required.')
  } else {
    if (titleWords < 1 || titleWords > 5) {
      issues.push(`TITLE must be 1 to 5 words. Current: ${titleWords} words.`)
    }
    if (title.length > TITLE_MAX_CHARS) {
      issues.push(`TITLE must be ${TITLE_MAX_CHARS} characters or fewer so it fits one line on story cards. Current: ${title.length} characters.`)
    }
  }

  if (!description) {
    issues.push('DESCRIPTION is required.')
  } else {
    if (description.length > DESCRIPTION_MAX_CHARS) {
      issues.push(`DESCRIPTION must be ${DESCRIPTION_MAX_CHARS} characters or fewer so it fits two lines on story cards. Current: ${description.length} characters.`)
    }
    if (DESCRIPTION_PAST_TENSE_RE.test(description)) {
      issues.push('DESCRIPTION contains forbidden past-tense story-card phrasing.')
    }
  }

  return issues
}

function extractTotal(text: string): number | null {
  const patterns = [
    /TOTAL\s*[:\-]\s*(\d{1,2})\s*\/\s*25/i,
    /OVERALL SCORE\s*[:\-]\s*(\d{1,2})\s*\/\s*25/i,
    /TOTAL SCORE\s*[:\-]\s*(\d{1,2})\s*\/\s*25/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function episodeNumber(episode: any, fallback: number) {
  return Number(episode.episode_number || episode.series_episode_number || fallback)
}

async function loadPackage(seriesId: string) {
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) {
    return { error: seriesError?.message || 'Series package not found', status: 404 }
  }

  const { data: episodes, error: episodesError } = await supabase
    .from('stories')
    .select(EPISODE_SELECT)
    .eq('series_id', seriesId)
    .order('episode_number', { ascending: true })

  if (episodesError) return { error: episodesError.message, status: 500 }

  return {
    package: {
      series,
      episodes: episodes || [],
    },
  }
}

function packageStatus(episodes: any[]) {
  if (!episodes.length) return 'empty'
  if (episodes.some((episode) => episode.status === 'validator_failed')) return 'validator_failed'
  if (episodes.every((episode) => episode.status === 'validator_passed')) return 'ready_for_asc'
  if (episodes.some((episode) => episode.script_json?.pre_audio_review)) return 'score_validate_in_progress'
  return 'script_drafted'
}

const REVIEW_PROMPT = `You are reviewing an Endless Tales script BEFORE audio production.

⭐ MANDATORY FIRST CHECK: STORY RESOLUTION MAP

Check the top of the script for the Story Resolution Map comment block. It MUST include all six sections:
1. Main Hook / Problem — is it clear and urgent?
2. Why the Solution Seems Difficult — is it explained?
3. Minor Problems / Middle Movement — are they listed?
4. Final Solution — is it concrete and non-vague?
5. Why the Ending Is Earned — is the connection to the middle explicit?
6. Variety Guardrail — does it show how this story differs from prior stories?

If the map is missing or any section is vague, flag it in RESOLUTION FLAGS below.

Score the script in five dimensions from 1 to 5:
1. Hook
2. Clarity
3. Pacing
4. Character / Voice Fit
5. Ending / Landing

Rules:
- Use the CURRENT Endless Tales published story expectations.
- The story must work for drivers and listeners who cannot rewind easily.
- Be tough, practical, and specific.
- Recommend concrete fixes that Claude can apply before audio production.
- If something in the header is mislabeled or weak, say so.
- If narrator naming, narrative voice, or Belle B usage looks wrong, call it out.

CRITICAL RESOLUTION CHECKS — flag any violation:
- Main hook unclear or missing
- Final solution vague or unresolved
- Ending does not resolve the story promise
- Standalone story leaves major problems unresolved
- Final series episode leaves series problem unresolved
- Story feels formulaic or too similar to prior stories

Return in exactly this format:

HOOK: X/5
CLARITY: X/5
PACING: X/5
CHARACTER: X/5
LANDING: X/5
TOTAL: X/25

RESOLUTION FLAGS: [List any violations. If none, write "NONE"]

TOP FIXES:
1. ...
2. ...
3. ...

SHORT VERDICT:
...

Do not use markdown tables.`

const VALIDATOR_PROMPT = `You are validating an Endless Tales production script.

Use the CURRENT rules:
- Belle B is the announcer.
- Belle B is never narrator or character.
- No SFX in the published story body.
- The title must be 1 to 5 words and 28 characters or fewer.
- DESCRIPTION must be 70 characters or fewer and present tense only.
- DESCRIPTION fails if it uses past-tense constructions or past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- The script must include the required header fields.
- The script must include a CHARACTER GUIDE.
- The script must include BELLE B INTRO and BELLE B OUTRO blocks.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.

Return exactly one of these:
✅ VALIDATOR RESULT: PASS
Script is cleared for production.

or

❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
- [specific issue]

Be specific.
`

async function scoreEpisode(episode: any, episodeNo: number, model: string) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 3000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${REVIEW_PROMPT}\n\nSCRIPT:\n${episode.script}`,
    }],
  })

  const reviewText = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()

  if (!reviewText) throw new Error(`Episode ${episodeNo} score returned empty review`)

  const total = extractTotal(reviewText)
  const existingJson = episode.script_json && typeof episode.script_json === 'object'
    ? episode.script_json
    : {}

  const script_json = {
    ...existingJson,
    pre_audio_review: {
      reviewed_at: new Date().toISOString(),
      model,
      total,
      review_text: reviewText,
    },
    series_score_validate: {
      ...(existingJson as any).series_score_validate,
      scored_at: new Date().toISOString(),
      episode_number: episodeNo,
      score_total: total,
    },
  }

  const { data: updated, error } = await supabase
    .from('stories')
    .update({ script_json })
    .eq('id', episode.id)
    .select(EPISODE_SELECT)
    .single()

  if (error || !updated) throw new Error(error?.message || `Episode ${episodeNo} score update failed`)

  logAnthropicCall({
    route: '/api/v2/series-package/score-validate',
    purpose: 'series-episode-script-review',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: episode.id,
    storyTitle: episode.title,
    metadata: { is_v2: true, series_id: episode.series_id, episode_number: episodeNo },
  }).catch(() => {})

  return { updated, reviewText, total }
}

async function validateEpisode(episode: any, episodeNo: number, model: string) {
  const cardCopyIssues = validateCardCopy(episode.script)
  if (cardCopyIssues.length > 0) {
    const report = `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
${cardCopyIssues.map((issue) => `- ${issue}`).join('\n')}`
    const now = new Date().toISOString()
    const existingJson = episode.script_json && typeof episode.script_json === 'object'
      ? episode.script_json
      : {}

    const script_json = {
      ...existingJson,
      series_score_validate: {
        ...(existingJson as any).series_score_validate,
        validated_at: now,
        episode_number: episodeNo,
        validator_result: 'FAIL',
      },
    }

    const { data: updated, error } = await supabase
      .from('stories')
      .update({
        script_json,
        validator_result: 'FAIL',
        validator_report: report,
        validator_passed_at: null,
        status: 'validator_failed',
      })
      .eq('id', episode.id)
      .select(EPISODE_SELECT)
      .single()

    if (error || !updated) throw new Error(error?.message || `Episode ${episodeNo} validator update failed`)

    return { updated, report, passed: false }
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${VALIDATOR_PROMPT}\n\nSCRIPT:\n${episode.script}`,
    }],
  })

  const report = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()

  if (!report) throw new Error(`Episode ${episodeNo} validator returned empty report`)

  const passed = /VALIDATOR RESULT:\s*PASS/i.test(report)
  const now = new Date().toISOString()
  const existingJson = episode.script_json && typeof episode.script_json === 'object'
    ? episode.script_json
    : {}

  const script_json = {
    ...existingJson,
    series_score_validate: {
      ...(existingJson as any).series_score_validate,
      validated_at: now,
      episode_number: episodeNo,
      validator_result: passed ? 'PASS' : 'FAIL',
    },
  }

  const { data: updated, error } = await supabase
    .from('stories')
    .update({
      script_json,
      validator_result: passed ? 'PASS' : 'FAIL',
      validator_report: report,
      validator_passed_at: passed ? now : null,
      status: passed ? 'validator_passed' : 'validator_failed',
    })
    .eq('id', episode.id)
    .select(EPISODE_SELECT)
    .single()

  if (error || !updated) throw new Error(error?.message || `Episode ${episodeNo} validator update failed`)

  logAnthropicCall({
    route: '/api/v2/series-package/score-validate',
    purpose: 'series-episode-script-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: episode.id,
    storyTitle: episode.title,
    metadata: { is_v2: true, series_id: episode.series_id, episode_number: episodeNo },
  }).catch(() => {})

  return { updated, report, passed }
}

export async function GET(req: NextRequest) {
  try {
    const seriesId = req.nextUrl.searchParams.get('seriesId')?.trim()
    if (!seriesId) return bad('seriesId required')
    if (!UUID_RE.test(seriesId)) return bad('seriesId must be a valid UUID')

    const loaded = await loadPackage(seriesId)
    if ('error' in loaded) return bad(loaded.error, loaded.status)

    return NextResponse.json({
      success: true,
      packageStatus: packageStatus(loaded.package.episodes),
      package: loaded.package,
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

    const loaded = await loadPackage(cleanSeriesId)
    if ('error' in loaded) return bad(loaded.error, loaded.status)

    const episodes = loaded.package.episodes
    if (!episodes.length) return bad('No child episodes found for series package', 404)

    for (let index = 0; index < episodes.length; index += 1) {
      let episode = episodes[index]
      const episodeNo = episodeNumber(episode, index + 1)

      if (!episode.script) {
        return bad(`Episode ${episodeNo} script missing`, 422, {
          failedEpisode: episodeNo,
          failedStoryId: episode.id,
          failurePhase: 'score',
          failureReport: 'script missing',
        })
      }

      try {
        episode = await normalizeEpisodeDescriptionBeforeValidation(episode, episodeNo)
      } catch (err) {
        return bad(err instanceof Error ? err.message : `Episode ${episodeNo} description normalization failed`, 500, {
          failedEpisode: episodeNo,
          failedStoryId: episode.id,
          failurePhase: 'description_normalization',
          failureReport: err instanceof Error ? err.message : 'Unknown description normalization failure',
        })
      }

      let scored
      try {
        scored = await scoreEpisode(episode, episodeNo, model)
      } catch (err) {
        return bad(err instanceof Error ? err.message : `Episode ${episodeNo} scoring failed`, 500, {
          failedEpisode: episodeNo,
          failedStoryId: episode.id,
          failurePhase: 'score',
          failureReport: err instanceof Error ? err.message : 'Unknown score failure',
        })
      }

      let validated
      try {
        validated = await validateEpisode(scored.updated, episodeNo, model)
      } catch (err) {
        return bad(err instanceof Error ? err.message : `Episode ${episodeNo} validation failed`, 500, {
          failedEpisode: episodeNo,
          failedStoryId: episode.id,
          failurePhase: 'validate',
          failureReport: err instanceof Error ? err.message : 'Unknown validation failure',
        })
      }

      if (!validated.passed) {
        const refreshed = await loadPackage(cleanSeriesId)
        return NextResponse.json({
          success: false,
          error: `Episode ${episodeNo} failed validation`,
          failedEpisode: episodeNo,
          failedStoryId: episode.id,
          failurePhase: 'validate',
          failureReport: validated.report,
          packageStatus: 'validator_failed',
          package: 'package' in refreshed ? refreshed.package : loaded.package,
        }, { status: 422 })
      }
    }

    const refreshed = await loadPackage(cleanSeriesId)
    if ('error' in refreshed) return bad(refreshed.error, refreshed.status)

    return NextResponse.json({
      success: true,
      packageStatus: packageStatus(refreshed.package.episodes),
      package: refreshed.package,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
