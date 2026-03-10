import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GEN_URL = 'https://studio-api.prod.suno.com/api/generate/v2/'
const FEED_URL = 'https://studio-api.prod.suno.com/api/feed/'
const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`

function cleanPrompt(prompt: string): string {
  // Remove any vocal/singing words — Suno must be instrumental only
  const cleaned = prompt.replace(/\b(vocal|vocals|singing|singer|lyrics|with lyrics|song|voice)\b/gi, '').trim()
  return cleaned.includes('instrumental') ? cleaned : cleaned + ', instrumental only, no vocals, no lyrics'
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, sunoPrompt, title, sunoCookie: cookieFromBody } = await req.json()

    // Cookie priority: body > env
    const cookie = (cookieFromBody || process.env.SUNO_COOKIE || '').trim()

    if (!cookie) {
      return NextResponse.json({
        success: false,
        error: 'NO_COOKIE',
        message: 'Suno cookie not set. Paste your Suno session cookie in the admin settings.',
      }, { status: 400 })
    }

    const prompt = cleanPrompt(sunoPrompt || `Cinematic thriller instrumental, dark and atmospheric, suspenseful, no vocals`)

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cookie}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    }

    // Step 1: Submit generation request
    const genRes = await fetch(GEN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        mv: 'chirp-v3-5',
        title: title || 'Background Music',
        tags: 'instrumental cinematic atmospheric',
        make_instrumental: true,
        wait_audio: false,
      }),
    })

    if (genRes.status === 401 || genRes.status === 403) {
      return NextResponse.json({
        success: false,
        error: 'COOKIE_EXPIRED',
        message: 'Suno cookie is expired. Go to suno.com, open DevTools → Application → Cookies, copy the session cookie value and update it in admin settings.',
      }, { status: 401 })
    }

    if (!genRes.ok) {
      const errText = await genRes.text()
      return NextResponse.json({
        success: false,
        error: 'SUNO_ERROR',
        message: `Suno API error ${genRes.status}: ${errText.slice(0, 200)}`,
      }, { status: 500 })
    }

    const genData = await genRes.json()
    const clipIds: string[] = (genData.clips || []).map((c: any) => c.id)

    if (!clipIds.length) {
      return NextResponse.json({
        success: false,
        error: 'NO_CLIPS',
        message: 'Suno returned no clips. Cookie may be invalid.',
      }, { status: 500 })
    }

    // Step 2: Poll until ready (max 4 minutes)
    let audioUrl: string | null = null
    for (let attempt = 0; attempt < 48; attempt++) {
      await new Promise(r => setTimeout(r, 5000)) // wait 5s between polls

      const feedRes = await fetch(`${FEED_URL}?ids=${clipIds.join('%2C')}`, { headers })
      if (!feedRes.ok) continue

      const clips: any[] = await feedRes.json()
      const ready = clips.filter(c => c.audio_url && c.status === 'complete')

      if (ready.length >= clipIds.length) {
        audioUrl = ready[0].audio_url // always take track 1
        break
      }

      // Check for error state
      const errored = clips.filter(c => c.status === 'error')
      if (errored.length === clipIds.length) {
        return NextResponse.json({
          success: false,
          error: 'SUNO_GENERATION_FAILED',
          message: 'Suno generation failed. The prompt may have been rejected.',
        }, { status: 500 })
      }
    }

    if (!audioUrl) {
      return NextResponse.json({
        success: false,
        error: 'TIMEOUT',
        message: 'Suno generation timed out after 4 minutes.',
      }, { status: 500 })
    }

    // Step 3: Download the track
    const dlRes = await fetch(audioUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!dlRes.ok) {
      return NextResponse.json({
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: 'Failed to download Suno track.',
      }, { status: 500 })
    }
    const audioBuffer = await dlRes.arrayBuffer()

    // Step 4: Upload to Supabase Storage
    const storagePath = `asc3/${storyId}/background_music.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({
        success: false,
        error: 'UPLOAD_FAILED',
        message: `Storage upload failed: ${uploadErr.message}`,
      }, { status: 500 })
    }

    const musicUrl = `${BASE_STORAGE}/${storagePath}`

    return NextResponse.json({ success: true, musicUrl })
  } catch (err) {
    console.error('generate-music error:', err)
    return NextResponse.json({
      success: false,
      error: 'INTERNAL',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
