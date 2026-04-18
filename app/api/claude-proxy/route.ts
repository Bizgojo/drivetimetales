import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Add the required model field that frontend doesn't include
    const anthropicPayload = {
      model: 'claude-3-haiku-20240307', // Working model from our tests
      messages: body.messages || [],
      max_tokens: body.max_tokens || 4000
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicPayload)
    })

    const data = await response.json()

    // Check response.ok and return proper errors
    if (!response.ok) {
      return NextResponse.json({ 
        error: data.error?.message || `API Error ${response.status}` 
      }, { status: response.status })
    }

    // Return simplified response structure
    return NextResponse.json({
      success: true,
      text: data.content?.[0]?.text || ''
    })

  } catch (error) {
    return NextResponse.json({ 
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}
