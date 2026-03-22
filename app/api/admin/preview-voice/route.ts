import { NextRequest, NextResponse } from 'next/server'
import { elevenLabsTTS } from '@/app/lib/el-logger'

// POST - Preview a voice (logged as 'testing')
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { voiceId, voiceName, text } = body

    if (!voiceId) {
      return NextResponse.json({ success: false, error: 'Missing voiceId' }, { status: 400 })
    }

    const previewText = text || 'Hello, this is a preview of your voice.'

    const buffer = await elevenLabsTTS({
      text: previewText,
      voiceId,
      voiceName: voiceName || voiceId,
      category: 'testing',
    })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[Voice Preview] Error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
