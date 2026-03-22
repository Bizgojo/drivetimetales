import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { elevenLabsTTS } from '@/app/lib/el-logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { voiceId, voiceName, text } = await request.json()

    if (!voiceId || !text) {
      return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 })
    }

    // Generate with logging as 'testing'
    const buffer = await elevenLabsTTS({
      text,
      voiceId,
      voiceName: voiceName || voiceId,
      category: 'testing',
      modelId: 'eleven_multilingual_v2',
    })

    // Upload to Supabase storage
    const fileName = `test-voice/test-${Date.now()}.mp3`
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadError) {
      console.error('[Test Voice] Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName)
    return NextResponse.json({ audioUrl: urlData.publicUrl })
  } catch (error) {
    console.error('[Test Voice] Error:', error)
    return NextResponse.json({ error: 'Voice test failed' }, { status: 500 })
  }
}
