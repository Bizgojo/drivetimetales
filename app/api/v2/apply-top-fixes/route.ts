import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

const DESCRIPTION_SAFE_MAX_CHARS = 65
const DESCRIPTION_WEAK_END_RE = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when)$/i
const DESCRIPTION_CUT_OFF_RE = /\band changes$/i

function selectedFixesIncludeDescriptionLimit(selectedFixes: string[]) {
  return selectedFixes.some((fix) => /DESCRIPTION/i.test(fix) && /(character|70|too long|fewer|incomplete|truncated|cut off)/i.test(fix))
}

function extractHeader(script: string, key: string) {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function normalizeDescription(description: string) {
  return description
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^DESCRIPTION:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
}

function descriptionNeedsRepair(description: string) {
  const clean = normalizeDescription(description)
  return (
    clean.length > DESCRIPTION_SAFE_MAX_CHARS
    || DESCRIPTION_WEAK_END_RE.test(clean)
    || DESCRIPTION_CUT_OFF_RE.test(clean)
  )
}

function fallbackDescription(script: string) {
  const title = extractHeader(script, 'TITLE')
  const shortTitle = title.length > 28 ? title.slice(0, 28).trim() : title
  const candidate = shortTitle
    ? `${shortTitle} turns one mistake into danger`
    : 'One mistake pulls strangers into danger'

  if (candidate.length <= DESCRIPTION_SAFE_MAX_CHARS) return candidate
  return 'One mistake pulls strangers into danger'
}

function replaceDescriptionLine(script: string, description: string) {
  return script.replace(/^DESCRIPTION:\s*(.+)$/m, `DESCRIPTION: ${description}`)
}

function shortenDescriptionLine(description: string) {
  const clean = description.trim().replace(/\s+/g, ' ')
  if (clean.length <= DESCRIPTION_SAFE_MAX_CHARS) return clean

  const words = clean.split(' ')
  let next = ''
  for (const word of words) {
    const candidate = next ? `${next} ${word}` : word
    if (candidate.length > DESCRIPTION_SAFE_MAX_CHARS) break
    next = candidate
  }

  return (next || clean.slice(0, DESCRIPTION_SAFE_MAX_CHARS)).replace(/[,\-:;.!?]+$/g, '').trim()
}

async function repairDescriptionLine({
  script,
  selectedFixes,
  apiKey,
}: {
  script: string
  selectedFixes: string[]
  apiKey: string
}) {
  const currentDescription = extractHeader(script, 'DESCRIPTION')
  if (!descriptionNeedsRepair(currentDescription)) return script

  const title = extractHeader(script, 'TITLE')
  const genre = extractHeader(script, 'GENRE')
  const fixesText = selectedFixes.join('\n')

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You write concise, complete story-card descriptions.'
        },
        {
          role: 'user',
          content: `Rewrite this DESCRIPTION only.

Hard rules:
- 45 to 65 characters.
- Complete, coherent thought.
- Present tense.
- No trailing conjunction or cut-off phrase.
- No past-tense story-card phrasing.
- Return only the replacement DESCRIPTION text, with no label or quotes.

TITLE: ${title}
GENRE: ${genre}
CURRENT DESCRIPTION: ${currentDescription}
VALIDATOR FEEDBACK:
${fixesText}`
        }
      ]
    }),
  })

  if (!upstream.ok) return replaceDescriptionLine(script, fallbackDescription(script))

  const data = await upstream.json()
  const repaired = normalizeDescription(data?.choices?.[0]?.message?.content || '')
  if (
    repaired.length >= 45
    && repaired.length <= DESCRIPTION_SAFE_MAX_CHARS
    && !DESCRIPTION_WEAK_END_RE.test(repaired)
    && !DESCRIPTION_CUT_OFF_RE.test(repaired)
  ) {
    return replaceDescriptionLine(script, repaired)
  }

  return replaceDescriptionLine(script, fallbackDescription(script))
}

async function enforceDescriptionSafeLimit(script: string, selectedFixes: string[], apiKey: string) {
  if (!selectedFixesIncludeDescriptionLimit(selectedFixes)) return script

  return repairDescriptionLine({ script, selectedFixes, apiKey })
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
- If fixing a DESCRIPTION character-count error, rewrite only the DESCRIPTION header to 60 to 65 characters. Do not aim for 66 to 70 characters; leave a safety margin so revalidation cannot bounce between 71 and 73 characters.
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
    const revisedScript = await enforceDescriptionSafeLimit(
      data?.choices?.[0]?.message?.content?.trim() || '',
      selectedFixes,
      apiKey
    )

    if (!revisedScript) return bad('AI returned empty revised script', 500)

    return NextResponse.json({
      success: true,
      revisedScript,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
