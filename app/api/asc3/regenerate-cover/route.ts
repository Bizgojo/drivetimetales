import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCoverPrompt } from '@/lib/coverPrompt'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storyId, genre } = body

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId is required' }, { status: 400 })
    }

    // Fetch story details — use concept/tone for visual prompt, NOT raw script
    const { data: story } = await supabase
      .from('stories')
      .select('title, author, genre, description')
      .eq('id', storyId)
      .single()

    const dallePrompt = buildCoverPrompt({
      title: story?.title || 'Untitled',
      author: story?.author || 'Unknown Author',
      genre: story?.genre || genre || 'fiction',
      // no concept/script — any story context risks content policy violations
    })

    console.log('🎨 Regenerating cover with story-specific prompt (HD)...')
    console.log('  Preview:', dallePrompt.substring(0, 200))

    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
      }),
    })

    if (!dalleRes.ok) {
      const errText = await dalleRes.text()
      throw new Error(`DALL-E error: ${dalleRes.status} - ${errText}`)
    }

    const dalleData = (await dalleRes.json()) as { data: { url: string }[] }
    const imageUrl = dalleData.data[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from DALL-E')

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`)
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

    const timestamp = Date.now()
    const storagePath = `asc3/${storyId}/cover_${timestamp}.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, imgBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadErr) throw new Error(`Cover upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    await supabase.from('stories').update({ cover_url: publicUrl }).eq('id', storyId)

    console.log(`✅ Cover regenerated: ${publicUrl}`)
    return NextResponse.json({ success: true, coverImageUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ Cover regeneration failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
