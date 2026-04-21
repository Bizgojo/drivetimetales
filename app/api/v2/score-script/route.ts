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

const REVIEW_PROMPT = `You are reviewing an Endless Tales script BEFORE audio production.

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

Return in exactly this format:

HOOK: X/5
CLARITY: X/5
PACING: X/5
CHARACTER: X/5
LANDING: X/5
TOTAL: X/25

TOP FIXES:
1. ...
2. ...
3. ...

SHORT VERDICT:
...

Do not use markdown tables.`

export async function POST(req: NextRequest) {
  try {
    const { storyId, model = 'claude-opus-4-6' } = await req.json()
    if (!storyId) return bad('storyId required')

    const { data: story, error } = await supabase
      .from('stories')
      .select('id,title,script,script_json,status')
      .eq('id', storyId)
      .single()

    if (error || !story) return bad(error?.message || 'Story not found', 404)
    if (!story.script) return bad('script missing')

    const response = await anthropic.messages.create({
      model,
      max_tokens: 3000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `${REVIEW_PROMPT}\n\nSCRIPT:\n${story.script}`,
      }],
    })

    const reviewText = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()

    const total = extractTotal(reviewText)

    const existingJson =
      story.script_json && typeof story.script_json === 'object'
        ? story.script_json
        : {}

    const script_json = {
      ...existingJson,
      pre_audio_review: {
        reviewed_at: new Date().toISOString(),
        model,
        total,
        review_text: reviewText,
      },
    }

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({ script_json })
      .eq('id', storyId)
      .select('id,title,script_json,status')
      .single()

    if (updateError) return bad(updateError.message, 500)

    logAnthropicCall({
      route: '/api/v2/score-script',
      purpose: 'script-review',
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      storyId,
      storyTitle: story.title,
      metadata: { is_v2: true },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      total,
      reviewText,
      story: updated,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
