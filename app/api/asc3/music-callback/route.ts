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
    console.log('🎵 Music callback received:', JSON.stringify(data).slice(0, 200))
    const sunoData = data?.data?.response?.sunoData || data?.data?.sunoData || []
    const tracks = Array.isArray(sunoData) ? sunoData : [sunoData]
    const track = tracks.find((t: any) => t?.audioUrl)
    if (!track?.audioUrl) return NextResponse.json({ ok: true })
    const taskId = data?.data?.taskId || data?.taskId
    if (!taskId) return NextResponse.json({ ok: true })
    // Find story by taskId stored in background_music_url temporarily
    const { data: stories } = await supabase.from('stories')
      .select('id').eq('background_music_url', `pending:${taskId}`).limit(1)
    const storyId = stories?.[0]?.id
    if (!storyId) { console.warn('No story found for taskId:', taskId); return NextResponse.json({ ok: true }) }
    // Download and upload music
    const audioResp = await fetch(track.audioUrl)
    if (!audioResp.ok) throw new Error(`Download failed: ${audioResp.status}`)
    const buf = Buffer.from(await audioResp.arrayBuffer())
    const storagePath = `asc3/${storyId}/background_music.mp3`
    await supabase.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    await supabase.from('stories').update({ background_music_url: publicUrl }).eq('id', storyId)
    console.log(`✅ Music saved for story ${storyId}`)
    return NextResponse.json({ ok: true })
  } catch(e) {
    console.error('Music callback error:', e)
    return NextResponse.json({ ok: true })
  }
}
