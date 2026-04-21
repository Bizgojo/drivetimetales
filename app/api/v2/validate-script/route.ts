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

const VALIDATOR_PROMPT = `You are validating an Endless Tales production script.

Use the CURRENT rules:
- Belle B is the announcer.
- Belle B is never narrator or character.
- No SFX in the published story body.
- The title must be 1 to 5 words.
- DESCRIPTION must be present tense and 24 words or fewer.
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

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        validator_result: passed ? 'PASS' : 'FAIL',
        validator_report: report,
        validator_passed_at: passed ? new Date().toISOString() : null,
        status: passed ? 'validator_passed' : 'validator_failed',
      })
      .eq('id', storyId)
      .select('id,title,status,validator_result,validator_report')
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

    return NextResponse.json({ success: true, passed, story: updated })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
