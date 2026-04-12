import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BELLE_B_VOICE_ID = 'wewocdDkjSLm9ZwjO7TD'
const EL_SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true }

// Welcome script split at [LISTENER_NAME] insertion point
// Full line: "[NAME], I'm so glad you're here. I'm Belle..."
const WELCOME_A = "I'm so glad you're here."
const WELCOME_B = "I'm Belle — I'll be your guide on Endless Tales. I'll introduce every story, learn what you love from what you listen to and complete, and make sure you always have something worth your time. Now, let's get started."

async function generateClip(text: string, filename: string): Promise<string> {
  const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/welcome/${filename}`
  try {
    const check = await fetch(storageUrl, { method: 'HEAD' })
    if (check.ok) return storageUrl
  } catch (_) {}

  const elKey = process.env.ELEVENLABS_API_KEY
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey!, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS })
  })
  if (!res.ok) throw new Error(`EL error ${res.status}: ${await res.text()}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { error } = await supabase.storage.from('audio').upload(`welcome/${filename}`, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Upload error: ${error.message}`)
  return storageUrl
}

export async function POST() {
  try {
    const [urlA, urlB] = await Promise.all([
      generateClip(WELCOME_A, 'welcome_A.mp3'),
      generateClip(WELCOME_B, 'welcome_B.mp3'),
    ])
    return NextResponse.json({ success: true, welcome_A: urlA, welcome_B: urlB })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
