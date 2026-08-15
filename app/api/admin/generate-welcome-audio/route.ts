import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BELLE_B_VOICE_ID = CANONICAL_BELLE_B_VOICE_ID

// Canon Belle B settings (ATL-BELLE-SETTINGS-001, PR #90)
const BELLE_B_CANON_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }

// Legacy onboarding clips (split at [LISTENER_NAME] insertion point)
const WELCOME_A = "I'm so glad you're here."
const WELCOME_B = "I'm Belle — I'll be your guide on Endless Tales. I'll introduce every story, learn what you love from what you listen to and complete, and make sure you always have something worth your time. Now, let's get started."

interface VoiceSettings {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
  speed?: number
}

async function generateClip(
  text: string,
  filename: string,
  voiceId: string,
  voiceSettings: VoiceSettings,
  model: string,
  forceRegen = false
): Promise<string> {
  const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/welcome/${filename}`
  if (!forceRegen) {
    try {
      const check = await fetch(storageUrl, { method: 'HEAD' })
      if (check.ok) return storageUrl
    } catch (_) {}
  }

  const elKey = process.env.ELEVENLABS_API_KEY
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey!, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: voiceSettings })
  })
  if (!res.ok) throw new Error(`EL error ${res.status}: ${await res.text()}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { error } = await supabase.storage.from('audio').upload(`welcome/${filename}`, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Upload error: ${error.message}`)
  return storageUrl
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // Parameterised single-clip mode (used by campaign welcome generation)
    if (body.text && body.storageKey) {
      const voiceId: string = body.voiceId ?? BELLE_B_VOICE_ID
      const voiceSettings: VoiceSettings = body.voiceSettings ?? BELLE_B_CANON_SETTINGS
      const model: string = body.model ?? 'eleven_multilingual_v2'
      const storageKey: string = body.storageKey
      const forceRegen: boolean = body.forceRegen ?? true

      const filename = storageKey.endsWith('.mp3') ? storageKey : `${storageKey}.mp3`
      const url = await generateClip(body.text, filename, voiceId, voiceSettings, model, forceRegen)
      const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
      // Fetch size for confirmation
      let size: number | null = null
      try {
        const head = await fetch(url, { method: 'HEAD' })
        size = Number(head.headers.get('content-length') ?? 0) || null
      } catch (_) {}
      return NextResponse.json({
        success: true,
        storageKey,
        url,
        storagePath: `audio/welcome/${filename}`,
        voiceId,
        voiceSettings,
        model,
        size,
        sbUrl: SB_URL,
      })
    }

    // Legacy mode: regenerate both onboarding clips with canon settings
    const [urlA, urlB] = await Promise.all([
      generateClip(WELCOME_A, 'welcome_A.mp3', BELLE_B_VOICE_ID, BELLE_B_CANON_SETTINGS, 'eleven_multilingual_v2'),
      generateClip(WELCOME_B, 'welcome_B.mp3', BELLE_B_VOICE_ID, BELLE_B_CANON_SETTINGS, 'eleven_multilingual_v2'),
    ])
    return NextResponse.json({ success: true, welcome_A: urlA, welcome_B: urlB })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
