import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const BELLE_B = 'wewocdDkjSLm9ZwjO7TD'
const EL_KEY = process.env.ELEVENLABS_API_KEY!
const EL_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`

async function generateAudio(text: string): Promise<Buffer> {
  const body = JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS, output_format: 'mp3_44100_192' })
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B}`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body
  })
  if (!res.ok) throw new Error(`EL error ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function POST(req: NextRequest) {
  const { storyId, firstName, introText, type } = await req.json()
  // type = 'welcome' | 'intro' | 'outro'
  if (!firstName || !introText || !type) {
    return NextResponse.json({ error: 'firstName, introText, type required' }, { status: 400 })
  }

  const safeName = firstName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const cacheKey = type === 'welcome'
    ? `belle/${type}_${safeName}.mp3`
    : `belle/${type}_${storyId}_${safeName}.mp3`
  const cachedUrl = `${BASE}/${cacheKey}`

  // Return cached if exists
  const test = await fetch(cachedUrl, { method: 'HEAD' })
  if (test.ok) return NextResponse.json({ url: cachedUrl, cached: true })

  try {
    // Bake the name into the text
    const personalizedText = introText.replace(/\[LISTENER_NAME\]/g, firstName)
    const buf = await generateAudio(personalizedText)
    const { error } = await supabase.storage.from('audio').upload(cacheKey, buf, {
      contentType: 'audio/mpeg', upsert: true
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ url: cachedUrl, cached: false })
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
