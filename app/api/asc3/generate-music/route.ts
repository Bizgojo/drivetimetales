import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KIE_API_KEY = process.env.KIE_API_KEY!
const KIE_BASE = 'https://api.kie.ai'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  try {
    const { storyId, prompt } = await req.json()
    if (!storyId || !prompt) return NextResponse.json({ success: false, error: 'storyId and prompt required' }, { status: 400 })

    console.log(`🎵 Generating music for ${storyId}`)
    console.log(`  Prompt: ${prompt.slice(0, 100)}...`)

    // Step 1: Submit generation task (custom mode, instrumental)
    const genResp = await fetch(`${KIE_BASE}/api/v1/music/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`
      },
      body: JSON.stringify({
        customMode: true,
        instrumental: true,
        model: 'V4_5',
        title: `ET Story ${storyId.slice(0, 8)}`,
        style: prompt,
        prompt: ''
      })
    })

    const genData = await genResp.json()
    console.log('  Gen response:', JSON.stringify(genData).slice(0, 200))

    const taskId = genData?.data?.taskId || genData?.taskId
    if (!taskId) throw new Error(`No taskId returned: ${JSON.stringify(genData)}`)
    console.log(`  Task ID: ${taskId}`)

    // Step 2: Poll for completion (up to 5 minutes)
    let audioUrl: string | null = null
    for (let i = 0; i < 60; i++) {
      await sleep(5000)
      const statusResp = await fetch(`${KIE_BASE}/api/v1/music/record-info?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
      })
      const statusData = await statusResp.json()
      const tracks = statusData?.data?.response?.sunoData || statusData?.data || []
      const track = Array.isArray(tracks) ? tracks.find((t: any) => t.audioUrl) : null
      console.log(`  Poll ${i + 1}: status=${track?.status}, hasUrl=${!!track?.audioUrl}`)
      if (track?.audioUrl) {
        audioUrl = track.audioUrl
        break
      }
    }

    if (!audioUrl) throw new Error('Music generation timed out after 5 minutes')
    console.log(`  ✅ Audio URL: ${audioUrl}`)

    // Step 3: Download audio
    const audioResp = await fetch(audioUrl)
    if (!audioResp.ok) throw new Error(`Failed to download audio: ${audioResp.status}`)
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer())
    console.log(`  Downloaded ${audioBuffer.length} bytes`)

    // Step 4: Upload to Supabase storage
    const storagePath = `asc3/${storyId}/background_music.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    console.log(`  ✅ Uploaded to Supabase: ${publicUrl}`)

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (err) {
    console.error('generate-music error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
