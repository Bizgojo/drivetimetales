import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const BELLE_B_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'

async function generateAudio(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status} - ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

// POST body: { storyId, type: 'intro' | 'outro', text }
export async function POST(req: NextRequest) {
  try {
    const { storyId, type, text } = await req.json()

    if (!storyId || !type || !text) {
      return NextResponse.json({ success: false, error: 'storyId, type, and text required' }, { status: 400 })
    }
    if (!['intro', 'outro'].includes(type)) {
      return NextResponse.json({ success: false, error: 'type must be intro or outro' }, { status: 400 })
    }

    console.log(`🎙️ Regenerating ${type} audio for story ${storyId} (${text.length} chars)`)

    // Generate new audio with Belle B
    const buffer = await generateAudio(text)

    // Upload to Supabase storage (overwrites existing)
    const storagePath = `asc3/${storyId}/${type}.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    // Update story record with new audio URL + text
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
