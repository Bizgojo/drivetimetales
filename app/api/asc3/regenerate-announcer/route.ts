import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { elevenLabsTTS } from '@/app/lib/el-logger'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BELLE_B_VOICE_ID = CANONICAL_BELLE_B_VOICE_ID

// POST body: { storyId, type: 'intro' | 'outro', text, storyTitle? }
export async function POST(req: NextRequest) {
  try {
    const { storyId, type, text, storyTitle } = await req.json()

    if (!storyId || !type || !text) {
      return NextResponse.json({ success: false, error: 'storyId, type, and text required' }, { status: 400 })
    }
    if (!['intro', 'outro'].includes(type)) {
      return NextResponse.json({ success: false, error: 'type must be intro or outro' }, { status: 400 })
    }

    console.log(`🎙️ Regenerating ${type} audio for story ${storyId} (${text.length} chars)`)

    // Generate with logging
    const buffer = await elevenLabsTTS({
      text,
      voiceId: BELLE_B_VOICE_ID,
      voiceName: 'Belle B',
      category: 'intro',
      storyTitle: storyTitle || null,
    })

    // Upload to Supabase storage
    const storagePath = `asc3/${storyId}/${type}.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    const dbField = type === 'intro'
      ? { intro_audio_url: publicUrl, intro_text: text }
      : { outro_audio_url: publicUrl, outro_text: text }

    const { error: dbErr } = await supabase.from('stories').update(dbField).eq('id', storyId)
    if (dbErr) console.warn(`DB update warning: ${dbErr.message}`)

    console.log(`✅ ${type} audio regenerated: ${publicUrl}`)
    return NextResponse.json({ success: true, audioUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Regenerate announcer error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
