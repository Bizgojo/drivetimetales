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

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

const TITLE_MAX_CHARS = 28
const DESCRIPTION_MAX_CHARS = 70
const DESCRIPTION_PAST_TENSE_RE = /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden)\b/i

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function extractHeader(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
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

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `${VALIDATOR_PROMPT}\n\nSCRIPT:\n${story.script}`,
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
