import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST-TRIAL-BELLE-001: Generate and cache Belle's post-trial wall audio.
// Called client-side when the trial wall first appears.
// The wall is shown BEFORE this call — audio is an enhancement only.
// Caches per-user in Supabase storage; URL saved to users table.
// Returns { url } on success; errors are silent (wall still works without audio).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BELLE_B = CANONICAL_BELLE_B_VOICE_ID
const EL_KEY = process.env.ELEVENLABS_API_KEY!
const EL_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}

// NOTE TO MARC: Bucket is 'audio' (same as welcome audio).
// Upload paths: audio/post-trial-samples/<type>-<userId>.mp3
// Please confirm the 'audio' bucket allows these paths before go-live.
const BUCKET = 'audio'
const BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`

const STANDALONE_TEMPLATE =
  "That's a taste of it, [NAME] — and I'd hate to leave you there. Your free week has ended, but a subscription opens this story and everything else in the library. Tap subscribe and I'll take you right back to it."

const SERIES_TEMPLATE =
  "That's where episode one ends, [NAME]. There's more of this story — and I'd like to keep telling it to you. Your free week is over, but a subscription opens the rest of this series and everything else in the library. Tap subscribe and we'll pick up right where we left off."

async function generateAudio(text: string): Promise<Buffer> {
  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: EL_SETTINGS,
  })
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B}`, {
    method: 'POST',
    headers: {
      'xi-api-key': EL_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body,
  })
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function resolveRequestUser(req: NextRequest) {
  try {
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    return user || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // GET: return cached URL if exists, otherwise null
  const type = req.nextUrl.searchParams.get('type') as 'standalone' | 'series' | null
  if (!type || !['standalone', 'series'].includes(type)) {
    return NextResponse.json({ error: 'type must be standalone or series' }, { status: 400 })
  }

  const authUser = await resolveRequestUser(req)
  if (!authUser?.id) {
    return NextResponse.json({ url: null })
  }

  const col = type === 'standalone' ? 'post_trial_belle_standalone_url' : 'post_trial_belle_series_url'
  const { data } = await supabase
    .from('users')
    .select(col)
    .eq('id', authUser.id)
    .maybeSingle()

  const cached = data?.[col as keyof typeof data] as string | null | undefined
  return NextResponse.json({ url: cached || null })
}

export async function POST(req: NextRequest) {
  const { type, firstName: rawFirstName } = await req.json() as {
    type: 'standalone' | 'series'
    firstName?: string
  }

  if (!type || !['standalone', 'series'].includes(type)) {
    return NextResponse.json({ error: 'type must be standalone or series' }, { status: 400 })
  }

  const authUser = await resolveRequestUser(req)
  if (!authUser?.id) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  const col = type === 'standalone' ? 'post_trial_belle_standalone_url' : 'post_trial_belle_series_url'

  // Check cached URL on users row first
  const { data: userRow } = await supabase
    .from('users')
    .select(`first_name, ${col}`)
    .eq('id', authUser.id)
    .maybeSingle()

  const cachedUrl = userRow?.[col as keyof typeof userRow] as string | null | undefined
  if (cachedUrl) {
    // Verify file still exists in storage
    const headCheck = await fetch(cachedUrl, { method: 'HEAD' })
    if (headCheck.ok) return NextResponse.json({ url: cachedUrl, cached: true })
    // File gone from storage — regenerate below
  }

  // Resolve name
  const firstName = String(rawFirstName || userRow?.first_name || 'friend').trim() || 'friend'
  const safeName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()

  const template = type === 'standalone' ? STANDALONE_TEMPLATE : SERIES_TEMPLATE
  const text = template.replace('[NAME]', safeName)

  // Upload path: NOTE bucket/path must be confirmed by Marc before go-live
  // PLACEHOLDER_PATH: audio/post-trial-samples/<type>-<userId>.mp3
  const storagePath = `post-trial-samples/${type}-${authUser.id}.mp3`
  const publicUrl = `${BASE_URL}/${storagePath}`

  try {
    const audioBuf = await generateAudio(text)

    // Try stereo conversion via ffmpeg (optional; mono is fine for voice-only)
    let buf = audioBuf
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)
      const os = await import('os')
      const pathMod = await import('path')
      const fsNode = await import('fs')
      const tmpIn = pathMod.default.join(os.default.tmpdir(), `pt_belle_in_${Date.now()}.mp3`)
      const tmpOut = pathMod.default.join(os.default.tmpdir(), `pt_belle_out_${Date.now()}.mp3`)
      fsNode.default.writeFileSync(tmpIn, audioBuf)
      await execFileAsync('ffmpeg', ['-i', tmpIn, '-ac', '2', '-ar', '44100', '-b:a', '192k', '-y', tmpOut])
      buf = fsNode.default.readFileSync(tmpOut)
      try { fsNode.default.unlinkSync(tmpIn); fsNode.default.unlinkSync(tmpOut) } catch {}
    } catch {
      // ffmpeg unavailable — mono is fine
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(uploadErr.message)

    // Save URL to users table
    await supabase
      .from('users')
      .update({ [col]: publicUrl })
      .eq('id', authUser.id)

    return NextResponse.json({ url: publicUrl, cached: false })
  } catch (err) {
    console.error('[post-trial-belle] generation failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'generation failed' }, { status: 500 })
  }
}
