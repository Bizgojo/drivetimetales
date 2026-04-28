import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type ElevenLabsVoice = {
  voice_id: string
  name: string
  labels?: Record<string, string>
  preview_url?: string | null
  category?: string | null
}

let cachedAt = 0
let cachedVoices: ElevenLabsVoice[] | null = null

const CACHE_MS = 5 * 60 * 1000

async function fetchVoicePage(pageToken?: string) {
  const url = new URL('https://api.elevenlabs.io/v2/voices')
  url.searchParams.set('page_size', '100')
  if (pageToken) url.searchParams.set('next_page_token', pageToken)

  const res = await fetch(url.toString(), {
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
    },
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`ElevenLabs voices failed: ${res.status} ${message}`)
  }

  return res.json()
}

export async function GET() {
  try {
    if (cachedVoices && Date.now() - cachedAt < CACHE_MS) {
      return NextResponse.json({ success: true, voices: cachedVoices, cached: true })
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json({ success: false, error: 'ELEVENLABS_API_KEY is not configured' }, { status: 500 })
    }

    const voices: ElevenLabsVoice[] = []
    let pageToken: string | undefined

    for (let page = 0; page < 20; page += 1) {
      const data = await fetchVoicePage(pageToken)
      voices.push(...((data.voices || []) as any[]).map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        labels: voice.labels || {},
        preview_url: voice.preview_url || null,
        category: voice.category || null,
      })))

      pageToken = data.next_page_token || undefined
      if (!data.has_more || !pageToken) break
    }

    voices.sort((a, b) => a.name.localeCompare(b.name))
    cachedVoices = voices
    cachedAt = Date.now()

    return NextResponse.json({ success: true, voices, cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin/elevenlabs-voices] Error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
