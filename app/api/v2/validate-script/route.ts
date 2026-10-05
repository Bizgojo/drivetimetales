import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { validateCardCopy, extractHeader } from '@/lib/validateCardCopy'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

const VALIDATOR_PROMPT = `You are validating an Endless Tales production script.

Use the CURRENT rules:
- Belle B is the announcer.
- Belle B is never narrator or character.
- SFX cues are ALLOWED inside the audio-drama script body. [SFX: ...] lines (e.g. [SFX: a door latch clicking open]) are the intended production format: the audio pipeline parses them into real sound-effect segments. Do NOT fail a script for containing [SFX: ...] lines in the body. The only SFX restriction is that SFX must never appear in the reader-facing DESCRIPTION / story-card text.
- The title must be 1 to 5 words and 28 characters or fewer.
- DESCRIPTION must be 70 characters or fewer and present tense only.
- DESCRIPTION fails if it uses past-tense constructions or past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- The script must include the required header fields.
- The script must include a CHARACTER GUIDE.
- The script must include BELLE B INTRO and BELLE B OUTRO blocks.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Narrator-as-voice-actor is VALID and must PASS. When the NARRATOR field names a voice actor and NARRATIVE_VOICE is third_limited or first_person, it is CORRECT for narration lines to be tagged with the CHARACTER name (e.g. NORA VANE:, COLE:) rather than the voice-actor name, as long as the CHARACTER GUIDE marks that character as the narrator. The NARRATOR field identifies the performer; the body tag identifies the voiced character. Do NOT flag this as a narrator/attribution conflict and do NOT fail a script for it. Only flag a genuine conflict: two different characters both delivering narration, or narration tagged to a name that appears in neither the NARRATOR field nor the CHARACTER GUIDE.
- Difficult Solution Rule: the main problem must feel genuinely difficult at the beginning, the middle must reveal leverage and escalating consequences that make the solution possible, and the ending must feel emotionally and logically earned.
- Fail endings where the climax happens offscreen, the protagonist does not affect the outcome, the ending resolves through exposition instead of dramatic action, the emotional arc is unresolved, series episode state is not satisfied, or the final solution is passive, too easy, coincidence/deus-ex-machina, or a "villain already dead" anticlimax.

Return exactly one of these:
✅ VALIDATOR RESULT: PASS
Script is cleared for production.

or

❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
- [specific issue]

Be specific.
`

export async function POST(req: NextRequest) {
  try {
    const { storyId, model = 'claude-opus-4-6' } = await req.json()
    if (!storyId) return bad('storyId required')

    const { data: story, error } = await supabase
      .from('stories')
      .select('id,title,script,status')
      .eq('id', storyId)
      .single()

    if (error || !story) return bad(error?.message || 'Story not found', 404)
    if (!story.script) return bad('script missing')

    const cardCopyIssues = validateCardCopy(story.script)
    if (cardCopyIssues.length > 0) {
      const report = `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
${cardCopyIssues.map((issue) => `- ${issue}`).join('\n')}`

      const { data: updated, error: updateError } = await supabase
        .from('stories')
        .update({
          validator_result: 'FAIL',
          validator_report: report,
          validator_passed_at: null,
          status: 'validator_failed',
        })
        .eq('id', storyId)
        .select('id,title,status,validator_result,validator_report')
        .single()

      if (updateError) return bad(updateError.message, 500)

      return NextResponse.json({
        success: true,
        passed: false,
        descriptionSynced: false,
        story: updated,
      })
    }

    // LANDING-STORY-001 is a Belle-exempt variant — skip Belle B requirement check only
    const variant = extractHeader(story.script, 'VARIANT')
    const isBelleExempt = /LANDING-STORY-001|No Belle B/i.test(variant)
    const validatorPrompt = isBelleExempt
      ? VALIDATOR_PROMPT.replace(/^- The script must include BELLE B INTRO and BELLE B OUTRO blocks\.\n/m, '')
      : VALIDATOR_PROMPT

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `${validatorPrompt}\n\nSCRIPT:\n${story.script}`,
      }],
    })

    const report = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()

    const passed = /VALIDATOR RESULT:\s*PASS/i.test(report)
    const validatedDescription = passed ? normalizeHeaderValue(extractHeader(story.script, 'DESCRIPTION')) : ''

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        validator_result: passed ? 'PASS' : 'FAIL',
        validator_report: report,
        validator_passed_at: passed ? new Date().toISOString() : null,
        status: passed ? 'validator_passed' : 'validator_failed',
        ...(passed && validatedDescription ? { description: validatedDescription } : {}),
      })
      .eq('id', storyId)
      .select('id,title,status,description,validator_result,validator_report')
      .single()

    if (updateError) return bad(updateError.message, 500)

    logAnthropicCall({
      route: '/api/v2/validate-script',
      purpose: 'script-validator',
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      storyId,
      storyTitle: story.title,
      metadata: { is_v2: true },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      passed,
      descriptionSynced: passed && Boolean(validatedDescription),
      metadata: {
        description: validatedDescription || null,
      },
      story: updated,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
