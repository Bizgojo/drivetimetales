import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    console.log('🎵 Music callback received:', JSON.stringify(data).slice(0, 300))
    const sunoData = data?.data?.response?.sunoData || data?.data?.sunoData || []
    const tracks = Array.isArray(sunoData) ? sunoData : [sunoData]
    const done = tracks.find((t: any) => t?.audioUrl && t?.status === 'complete')
    if (!done?.audioUrl) return NextResponse.json({ received: true })
    const storyId = data?.data?.taskId
    if (!storyId) return NextResponse.json({ received: true })
    const audioResp = await fetch(done.audioUrl)
    if (!audioResp.ok) return NextResponse.json({ received: true })
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer())
    const storagePath = `asc3/${storyId}/background_music.mp3`
    await supabase.storage.from('audio').upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
    console.log(`  ✅ Music saved for ${storyId}`)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Music callback error:', err)
    return NextResponse.json({ received: true })
  }
}
