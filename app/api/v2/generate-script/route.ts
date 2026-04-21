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

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function extractTitle(script: string): string | null {
  const m = script.match(/^TITLE:\s*(.+)$/m)
  return m?.[1]?.trim() || null
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, model = 'claude-opus-4-6' } = await req.json()
    if (!storyId) return bad('storyId required')

    const { data: story, error } = await supabase
      .from('stories')
      .select('id,title,author,author_style,genre,narrative_voice,brief_json,status,script_version')
      .eq('id', storyId)
      .single()

    if (error || !story) return bad(error?.message || 'Story not found', 404)
    if (!story.brief_json) return bad('brief_json missing')

    const brief = story.brief_json as any

    const prompt = `You are the Endless Tales Stage 2 script writer.

Use the CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B never addresses the listener by name.
- No SFX in the published story body.
- The title may be blank in the brief; if blank, choose the best title from the story.
- Final title must be 1 to 5 words.
- Output ONLY the script. No commentary.

Required script structure:
TITLE: [1 to 5 words]
SERIES:
EPISODE:
EPISODE_TITLE:
SERIES_TOTAL_EPISODES:
SERIES_IS_FINALE:
AUTHOR:
GENRE:
DESCRIPTION:
NARRATOR:
ANNOUNCER: Belle B
NARRATIVE_VOICE:
NARRATOR_IS_CHARACTER:
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, no listener name]

[START AUDIO DRAMA SCRIPT]
[NARRATOR]: ...
[CHARACTER NAME]: ...

BELLE B OUTRO
---
BELLE B: [one or two short sentences, reflective, credits the author and says "an Endless Tales original"]

Additional rules:
- DESCRIPTION must be 24 words maximum and present tense.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Keep narrator voice consistent.
- Do not include markdown fences.

STORY BRIEF JSON:
${JSON.stringify(brief, null, 2)}
`

    const response = await anthropic.messages.create({
      model,
      max_tokens: 12000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    })

    const script = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()

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
      raw_script: script,
    }

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        title: generatedTitle,
        script,
        script_json,
        status: 'script_drafted',
        script_version: (story.script_version || 1) + 1,
      })
      .eq('id', storyId)
      .select('id,title,status,script,script_json')
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
