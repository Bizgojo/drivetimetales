// app/api/name-audio/route.ts
//
// Renders the full Belle welcome Seg 1 sentence ("Welcome, [Name]. I'm glad
// you decided to join us.") for a given first name, caches in name_audio table,
// and returns the public URL.
//
// Cache versioning: old entries rendered just the bare name with wrong settings
// (stability 0.5 / similarity 0.8 / style 0.3). New entries use the Marc-approved
// settings and the full sentence. To avoid serving stale audio, the DB lookup
// key uses first_name = '${name}-v2' (note the -v2 suffix). Old rows keyed on
// bare name will never match and will not be served.
//
// Volume=1.5 is applied via ffmpeg if available (local dev); skipped gracefully
// (raw ElevenLabs MP3) if ffmpeg is not on PATH in the deployment runtime.
// In production, the server-side invite-signup route (Step 3 in the welcome
// wiring) is the primary path and applies volume there. This route is the
// client-side fallback for when welcome_seg1_url is missing from user_metadata.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Marc-approved Belle B voice settings (2026-08-11)
const BELLE_VOICE_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}

/**
 * Apply volume=1.5 via ffmpeg if available; return raw buffer on ffmpeg failure.
 * Written to /tmp to avoid serverless /tmp size limits for large files.
 */
function applyVolumeFfmpeg(rawBuf: Buffer): Buffer {
  const tmpDir = os.tmpdir()
  const rawPath = path.join(tmpDir, `name_audio_raw_${Date.now()}.mp3`)
  const wavPath = path.join(tmpDir, `name_audio_${Date.now()}.wav`)
  const outPath = path.join(tmpDir, `name_audio_final_${Date.now()}.mp3`)
  try {
    fs.writeFileSync(rawPath, rawBuf)
    execSync(`ffmpeg -y -i ${rawPath} -ar 44100 -ac 2 -c:a pcm_s16le ${wavPath}`, { stdio: 'pipe', timeout: 15000 })
    execSync(`ffmpeg -y -i ${wavPath} -af "volume=1.5" -c:a libmp3lame -b:a 192k -ar 44100 -ac 2 ${outPath}`, { stdio: 'pipe', timeout: 15000 })
    return fs.readFileSync(outPath)
  } catch {
    // ffmpeg not available or failed — return raw buffer without volume boost
    console.warn('[name-audio] ffmpeg volume step skipped; serving raw ElevenLabs MP3')
    return rawBuf
  } finally {
    for (const f of [rawPath, wavPath, outPath]) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawName = searchParams.get('name')?.trim()
  const voiceId = CANONICAL_BELLE_B_VOICE_ID

  if (!rawName) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  // Normalize: capitalize first letter, lowercase rest
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase()

  // -v2 suffix separates new full-sentence cache rows from old bare-name rows
  const cacheKey = `${name}-v2`

  const { data: cached } = await supabase
    .from('name_audio')
    .select('audio_url')
    .eq('first_name', cacheKey)
    .eq('voice_id', voiceId)
    .single()

  if (cached?.audio_url) return NextResponse.json({ audio_url: cached.audio_url, cached: true })

  const elKey = process.env.ELEVENLABS_API_KEY
  if (!elKey) return NextResponse.json({ error: 'EL key not configured' }, { status: 500 })

  // Full Seg 1 sentence — Marc-approved phrasing (2026-08-11)
  const seg1Text = `Welcome, ${name}. I'm glad you decided to join us.`

  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: seg1Text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: BELLE_VOICE_SETTINGS,
    }),
  })

  if (!elRes.ok) return NextResponse.json({ error: 'ElevenLabs generation failed' }, { status: 500 })

  const rawBuf = Buffer.from(await elRes.arrayBuffer())
  const audioBuffer = applyVolumeFfmpeg(rawBuf)

  // File name includes -v2 to match cache key convention
  const fileName = `welcome-seg1-${name.toLowerCase()}-${voiceId.slice(0, 8)}-v2.mp3`

  const { error: uploadError } = await supabase.storage
    .from('names')
    .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('names').getPublicUrl(fileName)

  await supabase.from('name_audio').upsert({
    first_name: cacheKey,
    voice_id: voiceId,
    audio_url: publicUrl,
  })

  return NextResponse.json({ audio_url: publicUrl, cached: false })
}
