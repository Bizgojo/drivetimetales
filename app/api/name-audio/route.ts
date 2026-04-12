import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawName = searchParams.get('name')?.trim()
  const voiceId = searchParams.get('voice_id') || 'wewocdDkjSLm9ZwjO7TD'
  if (!rawName) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase()
  const { data: cached } = await supabase.from('name_audio').select('audio_url').eq('first_name', name).eq('voice_id', voiceId).single()
  if (cached?.audio_url) return NextResponse.json({ audio_url: cached.audio_url, cached: true })
  const elKey = process.env.ELEVENLABS_API_KEY
  if (!elKey) return NextResponse.json({ error: 'EL key not configured' }, { status: 500 })
  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: name, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
  })
  if (!elRes.ok) return NextResponse.json({ error: 'ElevenLabs generation failed' }, { status: 500 })
  const audioBuffer = Buffer.from(await elRes.arrayBuffer())
  const fileName = `${name.toLowerCase()}-${voiceId.slice(0, 8)}.mp3`
  const { error: uploadError } = await supabase.storage.from('names').upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
  if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('names').getPublicUrl(fileName)
  await supabase.from('name_audio').upsert({ first_name: name, voice_id: voiceId, audio_url: publicUrl })
  return NextResponse.json({ audio_url: publicUrl, cached: false })
}
