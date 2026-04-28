import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const script = String(body.script || '').trim()
    const selectedFixes = Array.isArray(body.selectedFixes) ? body.selectedFixes : []

    if (!script) return bad('script required')
    if (!selectedFixes.length) return bad('selectedFixes required')

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return bad('OPENAI_API_KEY missing', 500)

    const fixesText = selectedFixes.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')

    const prompt = `
You are revising an audio drama script.

Apply ONLY these selected fixes:
${fixesText}

Rules:
- Preserve title, plot, tone, genre, and ending unless a selected fix explicitly requires a change.
- Preserve Belle B intro/outro structure if present.
- Preserve header fields and improve them if a selected fix requires it.
- Preserve script format and character labels.
- Return ONLY the full revised script text, no commentary.

SCRIPT:
${script}
`.trim()

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You revise audio drama scripts carefully and conservatively.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      }),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      return bad(text || 'AI revision failed', upstream.status)
    }

    const data = JSON.parse(text)
    const revisedScript = data?.choices?.[0]?.message?.content?.trim() || ''

    if (!revisedScript) return bad('AI returned empty revised script', 500)

    return NextResponse.json({
      success: true,
      revisedScript,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
