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

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function extractTitle(script: string): string | null {
  const m = script.match(/^TITLE:\s*(.+)$/m)
  return m?.[1]?.trim() || null
}

function extractHeader(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function replaceOrInsertHeader(script: string, key: string, value: string): string {
  const headerPattern = new RegExp(`^${key}:\\s*.*$`, 'm')
  if (headerPattern.test(script)) {
    return script.replace(headerPattern, `${key}: ${value}`)
  }

  if (/^GENRE:\s*.*$/m.test(script)) {
    return script.replace(/^GENRE:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  }

  if (/^AUTHOR:\s*.*$/m.test(script)) {
    return script.replace(/^AUTHOR:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  }

  return `${key}: ${value}\n${script}`
}

function deterministicDescriptionForGenre(genre: string): string {
  const normalizedGenre = genre.toLowerCase()

  if (normalizedGenre.includes('mystery') || normalizedGenre.includes('thriller')) {
    return 'A driver finds a secret someone is willing to kill for.'
  }
  if (normalizedGenre.includes('horror')) {
    return 'A quiet place hides something that should not be awake.'
  }
  if (normalizedGenre.includes('comedy')) {
    return 'One bad decision turns an ordinary trip sideways.'
  }

  return 'One discovery changes everything before the road ends.'
}

function isInvalidDescription(description: string): boolean {
  const clean = description
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim()

  if (!clean) return true
  if (clean.length > 65) return true
  if (/[.]{2,}|…/.test(clean)) return true
  if (!/[.!?]$/.test(clean)) return true

  const withoutPunctuation = clean.replace(/[.!?]+$/g, '').trim()
  const weakEnding = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an|ancient|old|forgotten|abandoned)$/i
  if (weakEnding.test(withoutPunctuation)) return true

  const weakGeneric = /^(a|an|the)?\s*(story|tale|journey|adventure)\s+(about|of)\b/i
  if (weakGeneric.test(withoutPunctuation)) return true

  const cutoffPatterns = [
    /\b(beneath|under|inside|outside|near|behind|beyond|within|between)\s+(the|a|an)\s+\w+$/i,
    /\b(secret|truth|clue|killer|stranger|place|thing|road|town|house)\s+(that|who|where|when)$/i,
  ]
  return cutoffPatterns.some((pattern) => pattern.test(withoutPunctuation))
}

function normalizeDescription(script: string, genre: string) {
  const currentDescription = extractHeader(script, 'DESCRIPTION')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim()

  const description = isInvalidDescription(currentDescription)
    ? deterministicDescriptionForGenre(genre)
    : currentDescription

  return {
    script: replaceOrInsertHeader(script, 'DESCRIPTION', description),
    description,
  }
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

async function loadRecentStoryTexts() {
  const { data, error } = await supabase
    .from('stories')
    .select('title,script,script_json')
    .not('script', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []

  return data.map((story: any) => [
    story.title || '',
    story.script || '',
    story.script_json?.raw_script || '',
  ].join('\n'))
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, model = 'claude-opus-4-6' } = await req.json()
    if (!storyId) return bad('storyId required')

    const { data: story, error } = await supabase
      .from('stories')
      .select('id,title,author,author_style,genre,narrative_voice,brief_json,status,script_version,series_id')
      .eq('id', storyId)
      .single()

    if (error || !story) return bad(error?.message || 'Story not found', 404)
    if (!story.brief_json) return bad('brief_json missing')

    const brief = story.brief_json as any

    // PREMISE-UNIQUENESS-001: mandatory premise check at the brief gate
    // before Stage 2. COLLISION bounces the brief for rework; override only
    // via Marc's recorded brief_json.premise_gate_override — never silent.
    const premiseGate = await runPremiseGate(supabase, {
      storyId: story.id,
      seriesId: story.series_id || null,
      premise: String(brief.premise || ''),
      briefJson: brief,
    })
    if (premiseGate.verdict === 'COLLISION') {
      return NextResponse.json({
        success: false,
        error: formatPremiseCollisionMessage(premiseGate),
        premiseGate: { verdict: premiseGate.verdict, collisions: premiseGate.collisions },
      }, { status: 409 })
    }
    if (premiseGate.overrideApplied) {
      console.warn('[generate-script] PREMISE-UNIQUENESS-001 override applied', {
        storyId: story.id,
        approvedBy: premiseGate.overrideApplied.approved_by,
        reason: premiseGate.overrideApplied.reason,
        overriddenCollisions: premiseGate.collisions,
      })
    }
    const target = runtimeTarget(brief.runtime || '')
    const recentStoryTexts = await loadRecentStoryTexts()
    const namePaletteBlock = buildNamePalettePromptBlock({
      genre: story.genre || brief.genre || '',
      setting: [brief.setting, brief.location, brief.region].filter(Boolean).join(' '),
      era: brief.era || brief.period || '',
      recentStoryTexts,
    })

    const prompt = `You are the Endless Tales Stage 2 script writer.

🎯 ENTERTAINMENT FIRST RULE — NON-NEGOTIABLE

The primary purpose of every Endless Tales story is to entertain.
Listeners come for suspense, curiosity, emotion, mystery, wonder, humor, fear, connection, and the desire to know what happens next.

NEVER interrupt a story to teach a lesson.
NEVER have the narrator explain the meaning of the story.
NEVER include speeches whose primary purpose is to educate, persuade, moralize, lecture, or preach.
NEVER allow a character to become the author's mouthpiece.

If a story contains a lesson, theme, or insight — it must emerge naturally through character choices, consequences, conflict, sacrifice, failure, success, and events. The listener discovers meaning. You do not explain it.

Story first. Theme second. Lesson last.
The story is the meal. The lesson is seasoning.

⭐ MANDATORY FIRST STEP: STORY RESOLUTION MAP ⭐

BEFORE you write a single line of dialogue, create a Story Resolution Map. Output it as a comment block at the top of the script (it will be removed before audio production). The map must contain all six sections:

1. MAIN HOOK / PROBLEM
   What urgent question, danger, mystery, desire, emotional wound, or conflict pulls the listener in?

2. WHY THE SOLUTION SEEMS DIFFICULT
   Explain why the solution appears almost impossible, dangerous, risky, costly, hidden, morally difficult, emotionally painful, or unlikely at the beginning.

3. WHAT CHANGES IN THE MIDDLE
   List the smaller problems, discoveries, reversals, clues, choices, leverage, escalating consequences, or emotional shifts that gradually make the solution possible.

4. FINAL DECISIVE ACTION
   State the concrete onstage action the protagonist takes BEFORE you draft the script. The action must resolve, answer, reverse, or transform the main problem. Do not leave it vague.

5. EMOTIONAL PAYOFF / WHY THE ENDING IS EARNED
   Explain how the middle prepares the listener for the final action without making it obvious too early, and what the ending costs, heals, reveals, or changes.

6. VARIETY GUARDRAIL
   How does this story differ in structure, tone, pacing, setting, mood, plot shape, and type of solution from the recent stories you've seen? List the differences to ensure you're not repeating the same pattern.

Allowed solution types:
- Clever discovery
- Emotional confession
- Moral choice
- Sacrifice
- Escape
- Rescue
- Revelation
- Reversal
- Justice
- Forgiveness
- Survival
- Transformation
- Bittersweet acceptance
- Series cliffhanger with episode-level resolution

Hard rules for the map:
- The solution must feel difficult at the beginning.
- The middle must progressively increase understanding, reveal leverage, and escalate consequences.
- The ending must make the listener feel the story has paid off its promise.
- The climax must happen onstage.
- The protagonist must affect the outcome through decisive action.
- The ending must resolve through dramatic action and consequence, not explanation alone.
- Avoid offscreen solutions, coincidence/deus-ex-machina fixes, passive symbolic endings, abrupt explanation dumps, "villain already dead" anticlimax, and endings where the protagonist only watches or learns what happened.
- Standalone stories must resolve the main hook completely.
- Non-final series episodes must resolve the episode problem while strengthening the larger series hook.
- Final series episodes must resolve the series problem completely.
- Do not force this story into the same plot pattern as prior stories. Vary structure, tone, pacing, and solution type.

Use the CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- Series episodes: Belle B intro MUST name the series title (e.g. "In Room Three Twelve, [LISTENER_NAME]..."). Standalone episodes do not include a series name.
- Series non-finale episodes: Belle B outro must NOT credit the author or narrator — save those credits for the finale only. Non-finale outros must tease what comes next or end on the cliffhanger emotion.
- Series finale episodes: Belle B outro credits the author by name and says "an Endless Tales original".
- Standalone episodes: Belle B outro credits the author by name and says "an Endless Tales original".
- No SFX in the published story body.
- The title may be blank in the brief; if blank, choose the best title from the story.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output the complete script (including the STORY RESOLUTION MAP as a comment block at the top). No additional commentary outside the script.

${namePaletteBlock}

Required script structure:
TITLE: [1 to 5 words, 28 characters or fewer]
SERIES:
EPISODE:
EPISODE_TITLE:
SERIES_TOTAL_EPISODES:
SERIES_IS_FINALE:
AUTHOR:
GENRE:
DESCRIPTION: [70 characters or fewer, present tense only]
NARRATOR: [assigned voice name from narrator_voices — ALWAYS the voice talent name (e.g. "Ray Dolan"), NEVER a story character name, even when NARRATOR_IS_CHARACTER is true]
ANNOUNCER: Belle B
NARRATIVE_VOICE:
NARRATOR_IS_CHARACTER: [true/false — true means the narrator IS a story character speaking in first person, but the NARRATOR header must still be the voice talent name]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally and not always at the start, reads gracefully if the name is omitted, includes the story title in quotes, references something specific from the story, no time-of-day reference, no author/narrator credit, no "Endless Tales original"]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: [one or two short sentences, reflective, no time-of-day reference. For series non-finales: do NOT credit the author or narrator — tease the next episode or hold the cliffhanger emotion instead. For series finales and all standalone episodes: credit the author by name and say "an Endless Tales original".]

Production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Wrong: DEPUTY PIKE: Pike's jaw tightened.
- Right: NARRATOR: Pike's jaw tightened.

Additional rules:
- DESCRIPTION must be 70 characters or fewer and present tense only so it fits two lines on story cards. If the brief-provided description is longer than 70 characters or uses past-tense constructions, rewrite it to comply. Reject past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- NARRATOR header must ALWAYS be the assigned voice talent name (e.g. "Ray Dolan", "Samuel Cord"). Never a story character name. This rule has no exceptions. (HAL-SCRIPT-001)
- If NARRATOR_IS_CHARACTER is false, the narrator is a detached third-person voice.
- If NARRATOR_IS_CHARACTER is true, the narrator is a story character speaking in first person — but the NARRATOR header still uses the voice talent name, not the character name.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Keep narrator voice consistent.
- Do not include markdown fences.

USER NOTES / CONSTRAINTS:
${String(brief.requirements || '').trim() || 'None'}

RUNTIME TARGET:
Requested runtime: ${target.runtime}
Target script length: ${target.range} words total.
Hard maximum: ${target.max.toLocaleString()} words total.
If needed, simplify plot, reduce scene count, and tighten dialogue before exceeding the hard maximum.

STORY BRIEF JSON:
${JSON.stringify(brief, null, 2)}
`

    const response = await anthropic.messages.create({
      model,
      max_tokens: 12000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    })

    const generatedScript = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()
    const { script, description } = normalizeDescription(generatedScript, story.genre || brief.genre || '')

    const generatedTitle = extractTitle(script) || story.title || ''
    const wordCount = countWords(generatedTitle)

    if (!generatedTitle) return bad('Claude did not return a title', 422)
    if (wordCount < 1 || wordCount > 5) {
      return bad(`Generated title must be 1 to 5 words. Got: "${generatedTitle}"`, 422)
    }

    const script_json = {
      generated_title: generatedTitle,
      model,
      generated_at: new Date().toISOString(),
      raw_script: generatedScript,
      normalized_description: description,
    }

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        title: generatedTitle,
        description,
        script,
        script_json,
        status: 'script_drafted',
        script_version: (story.script_version || 1) + 1,
      })
      .eq('id', storyId)
      .select('id,title,status,description,script,script_json')
      .single()

    if (updateError) return bad(updateError.message, 500)

    logAnthropicCall({
      route: '/api/v2/generate-script',
      purpose: 'story-script',
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      storyId,
      storyTitle: generatedTitle,
      metadata: { is_v2: true },
    }).catch(() => {})

    return NextResponse.json({ success: true, story: updated })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
