import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { buildNamePalettePromptBlock } from '@/lib/story/namePalette'
import { runPremiseGate, formatPremiseCollisionMessage, formatPremiseAdjacentWarning } from '@/lib/premiseGate'
import { loadActiveExcellenceLessons } from '@/lib/storyExcellenceLedger'

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
  if (countWords(clean) > 24) return true // DESCRIPTION-001: 24-word max (replaces prior 70-char limit)
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

/**
 * Load a canon document from the project root.
 * Throws with a named error code if the file is missing — no silent fallback.
 * A missing canon document is a production blocker, not a graceful degradation case.
 *
 * CANON-001: This registry takes precedence over ET_Story_Rules and STAGE2_SCRIPT_PROMPT
 * wherever they conflict. Conflicts are flagged inline in buildEnrichedPrompt() below.
 */
function loadCanonDoc(relPath: string, errorCode: string): string {
  const fullPath = path.join(process.cwd(), relPath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (err) {
    throw new Error(
      `${errorCode}: Could not read ${relPath} at ${fullPath} — ` +
      `${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Format excellence lessons for inclusion in the prompt.
 * Returns empty string if no lessons — never throws.
 */
function formatExcellenceBlock(lessons: Awaited<ReturnType<typeof loadActiveExcellenceLessons>>): string {
  if (!lessons.length) return ''
  return (
    `\n\n${'='.repeat(80)}\n` +
    `EXCELLENCE LESSONS — MANDATORY (${lessons.length} active from Marc's actual rejections)\n` +
    `${'='.repeat(80)}\n` +
    `Study each lesson. Do not repeat these patterns. These are not suggestions.\n\n` +
    lessons
      .map((l, i) =>
        `[LESSON-${i + 1}] Category: ${l.lesson_category}\n` +
        `${l.lesson_text}` +
        (l.prevention_rule ? `\nPrevention rule: ${l.prevention_rule}` : '')
      )
      .join('\n\n')
  )
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

    // ── SERIES-BIBLE-GATE-001: series bible required for series episode generation ──
    // If this story belongs to a series, the series.description must be non-empty
    // before script generation proceeds. Empty = character identity collisions.
    if (story.series_id) {
      const { data: seriesForGate, error: seriesGateError } = await supabase
        .from('series')
        .select('id, title, description')
        .eq('id', story.series_id)
        .single()
      if (!seriesGateError && seriesForGate) {
        const _bibleFull = (seriesForGate.description || '').trim()
        if (!_bibleFull) {
          return bad(
            `SERIES-BIBLE-GATE-001: Series bible required before generating script for "${story.title}". ` +
            `Set series.description on series "${seriesForGate.title}" with character roster and canonical facts.`,
            422
          )
        }
      }
    }
    // ── END SERIES-BIBLE-GATE-001 ──────────────────────────────────────────

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
    // Known-adjacent cluster warning (Marc ruling 09:47): NOT a bounce — the
    // brief proceeds, but the saturation warning is logged and returned so
    // Orion/Marc see it early.
    if (premiseGate.adjacencies.length > 0) {
      console.warn(`[generate-script] ${formatPremiseAdjacentWarning(premiseGate)}`, {
        storyId: story.id,
        adjacencies: premiseGate.adjacencies,
      })
    }
    // ── CANON DOCUMENT LOADING (feat/canon-hal-brief-001) ───────────────────────────────
    // Port of the four inputs used in the proven manual Hal session (HAL_SESSION_START_PROTOCOL.md).
    // Files are read at request time: updating a file takes effect on the next call, no deploy needed.
    //
    // Hard-fail if any required document is missing — a missing canon doc is a production blocker.
    // Do NOT add silent fallbacks here. If these files are missing, the build is broken.
    //
    // Authority order (CANON-001): Canon Registry > ET Story Rules v3.2 > STAGE2 v2.4 > inline block
    //
    // KNOWN DISCREPANCIES between documents — flagged for Marc's ruling, not silently resolved:
    //   DISC-001: RESOLVED (Marc, 2026-08-29). Use 24 words (DESCRIPTION-001). Prior 70-char limit
    //             was wrong. isInvalidDescription() and inline instructions updated to match.
    //   DISC-002: RESOLVED by CANON-001. SFX-001 (max 3 per episode) governs over ET Rules r11
    //             (every 60–90s) and STAGE2 (3–6 anchors). SFX-001 is already in the canon block above.
    //   DISC-003: STAGE2 footer/header version mismatch — footer says v2.3, header says v2.4.
    //             Header is correct (r42 Early Investment Rule added as v2.4, Jun 26 2026).
    //             No action needed — noted here for completeness. Numbering gap in prior report was
    //             an error: DISC-003 was never a separate code fix, it was a documentation note.
    //   DISC-004: RESOLVED by CANON-001 ordering. Resolution Map goes above Belle B per STAGE2.
    //   DISC-005: RESOLVED (Marc, 2026-08-29). Old inline behavior (series title in EVERY episode's
    //             Belle B intro) was wrong and contradicted BELLE-006. Correct behavior per BELLE-004:
    //             first episode only names title+author in intro. Inline block updated; old requirement
    //             dropped entirely.
    const canonRegistryRules = loadCanonDoc(
      'Bible/CANON_REGISTRY_STORY_RULES.md',
      'ET_CANON_REGISTRY_MISSING'
    )
    const etStoryRules = loadCanonDoc(
      'Bible/ET_Story_Rules_v3_2_CANONICAL.md',
      'ET_STORY_RULES_MISSING'
    )
    const stage2Prompt = loadCanonDoc(
      'docs/STAGE2_SCRIPT_PROMPT.md',
      'STAGE2_PROMPT_MISSING'
    )
    // Excellence lessons: additive, never blocking. Returns [] on any DB error.
    const excellenceLessons = await loadActiveExcellenceLessons(supabase)
    const excellenceBlock = formatExcellenceBlock(excellenceLessons)
    // ── END CANON DOCUMENT LOADING ──────────────────────────────────────────────────────

    const target = runtimeTarget(brief.runtime || '')
    const recentStoryTexts = await loadRecentStoryTexts()
    const namePaletteBlock = buildNamePalettePromptBlock({
      genre: story.genre || brief.genre || '',
      setting: [brief.setting, brief.location, brief.region].filter(Boolean).join(' '),
      era: brief.era || brief.period || '',
      recentStoryTexts,
    })

    const prompt = `${'='.repeat(80)}
CANON REGISTRY — STORY-WRITING RULES
Authority: SUPREME per CANON-001. These rules take precedence over everything below,
including ET Story Rules v3.2 and STAGE2 v2.4, wherever they conflict.
Loaded: ${new Date().toISOString().slice(0, 10)} from Bible/CANON_REGISTRY_STORY_RULES.md
${'='.repeat(80)}

${canonRegistryRules}

${'='.repeat(80)}
ENDLESS TALES STORY BIBLE v3.2 — CANONICAL
Loaded from: Bible/ET_Story_Rules_v3_2_CANONICAL.md
Note: Where this document conflicts with the Canon Registry above, Canon Registry wins (CANON-001).
Known conflict: r11 SFX frequency ("every 60–90 seconds") is superseded by Canon Registry SFX-001
(max 3 SFX per episode). Follow SFX-001.
${'='.repeat(80)}

${etStoryRules}

${'='.repeat(80)}
STAGE 2 MASTER PROMPT v2.4
Loaded from: docs/STAGE2_SCRIPT_PROMPT.md
Note: Where this document conflicts with the Canon Registry above, Canon Registry wins (CANON-001).
Note: Internal footer version mismatch (footer says v2.3, header says v2.4) — header is correct;
      the Early Investment Rule (r42) was added June 26 2026 as v2.4 and the footer was not updated.
DISC-001 RESOLVED: DESCRIPTION constraint is 24 words max (DESCRIPTION-001) per Marc ruling
      2026-08-29. Prior 70-char limit in the inline block below has been updated to match.
Known conflict: SFX frequency — this document (3–6 anchors) supersedes ET Story Rules r11
      (every 60–90s). Canon Registry SFX-001 (max 3) supersedes both. Follow SFX-001.
${'='.repeat(80)}

${stage2Prompt}
${excellenceBlock}

${'='.repeat(80)}
IMMEDIATE PRODUCTION INSTRUCTIONS
The sections above are the canonical inputs from the proven manual Hal session.
Where the sections above and the instructions below conflict, the above sections win (CANON-001).
The instructions below provide story-specific context and production format requirements.
${'='.repeat(80)}

You are the Endless Tales Stage 2 script writer.

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
- BELLE-004: The FIRST episode of a series must name the series title and author in the intro.
- BELLE-006: Interior and final episodes must NOT name the series title or author in the intro or outro. The old requirement to name the series title in every episode's Belle B intro was wrong — it directly contradicted BELLE-006 and has been dropped (Marc ruling, 2026-08-29).
- Series non-finale episodes: Belle B outro must NOT credit the author or narrator — save those credits for the finale only. Non-finale outros must tease what comes next or end on the cliffhanger emotion.
- Series finale episodes: Belle B outro briefly recaps the story, restates the title, credits the author by name, says "an Endless Tales original", and invites the listener to rate the story.
- Standalone episodes: Belle B outro briefly recaps the story, restates the title, credits the author by name, says "an Endless Tales original", and invites the listener to rate the story.
- SFX: at most 3 per episode (SFX-001). Use sparingly; never exceed 3.
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
DESCRIPTION: [24 words or fewer, present tense only — DESCRIPTION-001]
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
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally and not always at the start, reads gracefully if the name is omitted, no time-of-day reference, no author/narrator credit, no "Endless Tales original".
  SERIES FIRST EPISODE (BELLE-004): must name the series title and author.
  INTERIOR + FINAL EPISODES (BELLE-006): must NOT name the series title or author — reference something specific from the story's plot or mood instead.]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: [one or two short sentences, reflective, no time-of-day reference. For series non-finales: do NOT credit the author or narrator — tease the next episode or hold the cliffhanger emotion instead. For series finales and all standalone episodes: briefly recap the story, restate the title, credit the author by name, say "an Endless Tales original", and invite the listener to rate the story.]

Production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Wrong: DEPUTY PIKE: Pike's jaw tightened.
- Right: NARRATOR: Pike's jaw tightened.

Additional rules:
- DESCRIPTION must be 24 words or fewer and present tense only (DESCRIPTION-001). If the brief-provided description is longer than 24 words or uses past-tense constructions, rewrite it to comply. Reject past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
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

    return NextResponse.json({
      success: true,
      story: updated,
      ...(premiseGate.adjacencies.length > 0
        ? { premiseGate: { verdict: premiseGate.verdict, adjacencies: premiseGate.adjacencies, warning: formatPremiseAdjacentWarning(premiseGate) } }
        : {}),
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
