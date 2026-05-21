/**
 * POST /api/landing/regenerate-announcer
 * Regenerates intro or outro audio for a landing_stories entry using Belle B.
 * Body: { landingStoryId, type: 'intro' | 'outro', text }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const BELLE_B_VOICE_ID = CANONICAL_BELLE_B_VOICE_ID

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

export async function POST(req: NextRequest) {
  try {
    const { landingStoryId, type, text } = await req.json()
    if (!landingStoryId || !type || !text) return NextResponse.json({ error: 'landingStoryId, type, text required' }, { status: 400 })
    if (!['intro', 'outro'].includes(type)) return NextResponse.json({ error: 'type must be intro or outro' }, { status: 400 })

    const buffer = await generateAudio(text)
    const storagePath = `landing/${landingStoryId}/${type}.mp3`

    const { error: uploadErr } = await supabase.storage.from('audio').upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    const dbField = type === 'intro'
      ? { intro_audio_url: publicUrl, intro_text: text }
      : { outro_audio_url: publicUrl, outro_text: text }

    await supabase.from('landing_stories').update(dbField).eq('id', landingStoryId)

    return NextResponse.json({ success: true, audioUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
