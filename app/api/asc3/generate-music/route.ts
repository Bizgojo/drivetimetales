import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

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

    // Step 1: Submit generation task
    // Always use production URL for callback — kie.ai can't reach localhost
    const callbackBase = 'https://app.endless-tales.com'
    const genResp = await fetch(`${KIE_BASE}/api/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_API_KEY}` },
      body: JSON.stringify({
        prompt: prompt,
        customMode: false,
        instrumental: true,
        model: 'V4',
        title: `ET-${storyId.slice(0, 8)}`,
        callBackUrl: `${callbackBase}/api/asc3/music-callback`
      })
    })

    if (!genResp.ok) {
      const errText = await genResp.text()
      throw new Error(`kie.ai generate failed ${genResp.status}: ${errText}`)
    }

    const genData = await genResp.json()
    console.log('  Gen response:', JSON.stringify(genData).slice(0, 200))

    const taskId = genData?.data?.taskId || genData?.taskId
    if (!taskId) throw new Error(`No taskId returned: ${JSON.stringify(genData)}`)
    console.log(`  Task ID: ${taskId}`)
    // Mark story as pending so callback can find it
    await supabase.from('stories').update({ background_music_url: `pending:${taskId}` }).eq('id', storyId)

    // Step 2: Poll for completion (backup)
    let audioUrl: string | null = null
    for (let i = 0; i < 60; i++) {
      await sleep(5000)
      const statusResp = await fetch(`${KIE_BASE}/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
      })
      if (!statusResp.ok) { console.warn(`  Poll ${i+1} failed: ${statusResp.status}`); continue }
      const statusData = await statusResp.json()
      const sunoData = statusData?.data?.response?.sunoData || statusData?.data?.sunoData || []
      const tracks = Array.isArray(sunoData) ? sunoData : [sunoData]
      const done = tracks.find((t: any) => t?.audioUrl)
      console.log(`  Poll ${i+1}: ${tracks.length} tracks, done=${!!done}, status=${tracks[0]?.status}`)
      if (done?.audioUrl) { audioUrl = done.audioUrl; break }
    }

    if (!audioUrl) throw new Error('Music generation timed out')
    console.log(`  ✅ Audio URL: ${audioUrl}`)

    // Step 3: Download and upload to Supabase
    const audioResp = await fetch(audioUrl)
    if (!audioResp.ok) throw new Error(`Download failed: ${audioResp.status}`)
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer())
    console.log(`  Downloaded: ${audioBuffer.length} bytes`)

    const storagePath = `asc3/${storyId}/background_music.mp3`
    const { error: uploadErr } = await supabase.storage.from('audio').upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg', upsert: true
    })
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    console.log(`  ✅ Uploaded: ${publicUrl}`)

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (err) {
    console.error('generate-music error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
