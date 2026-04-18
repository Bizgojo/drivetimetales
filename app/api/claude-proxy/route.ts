import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: body.max_tokens || 4000,
        messages: body.messages || [],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            data?.error?.type ||
            'Anthropic API error',
          raw: data,
        },
        { status: response.status }
      )
    }

    const text = data?.content?.[0]?.text || ''

    return NextResponse.json({
      success: true,
      text,
      model: data?.model || 'unknown',
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
