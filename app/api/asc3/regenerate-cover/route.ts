import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const genreVisual: Record<string, string> = {
      thriller: 'dark, shadowy, high contrast, noir atmosphere, tension',
      mystery: 'moody, atmospheric, hidden clues, dramatic lighting',
      horror: 'dark, eerie, unsettling, gothic shadows, dread',
      romance: 'warm, intimate, soft lighting, emotional depth',
      'sci-fi': 'futuristic, cosmic, neon and darkness, vast scale',
      western: 'golden dust, vast landscapes, lone figure, cinematic',
      adventure: 'epic, sweeping vistas, bold colors, action',
      drama: 'cinematic portrait, emotional, naturalistic lighting',
      comedy: 'warm, bright colors, playful, expressive',
      family: 'vibrant, inviting, warm tones, wonder and charm',
    }

    const resolvedGenre = genre || 'fiction'
    const visualStyle =
      Object.entries(genreVisual).find(([k]) => resolvedGenre.toLowerCase().includes(k))?.[1] ||
      'cinematic, sophisticated, dramatic'

    const dallePrompt = `Music album cover art. Square format, 1:1 ratio, filling the entire canvas edge to edge with no borders or padding. This is NOT a book cover — it is a streaming music album cover like Spotify or Apple Music. Genre: ${resolvedGenre}. ${visualStyle}. The image must be purely visual — no text, no title, no artist name, no words, no letters of any kind. Single powerful image that fills the whole square. Style reference: modern streaming platform album artwork.`

    console.log('🎨 Regenerating cover image with DALL-E 3...')

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
      }),
    })

    if (!dalleRes.ok) {
      const errText = await dalleRes.text()
      throw new Error(`DALL-E error: ${dalleRes.status} - ${errText}`)
    }

    const dalleData = (await dalleRes.json()) as { data: { url: string }[] }
    const imageUrl = dalleData.data[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from DALL-E')

    console.log('⬇️ Downloading new cover image...')
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`)

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

    // Upload with a timestamp suffix so Supabase doesn't serve cached version
    const timestamp = Date.now()
    const storagePath = `asc3/${storyId}/cover_${timestamp}.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, imgBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadErr) throw new Error(`Cover upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    // Update the story record with the new cover URL
    const { error: updateErr } = await supabase
      .from('stories')
      .update({ cover_url: publicUrl })
      .eq('id', storyId)

    if (updateErr) {
      console.warn('⚠️ Could not update cover_url in DB:', updateErr.message)
    }

    console.log(`✅ Cover regenerated: ${publicUrl}`)
    return NextResponse.json({ success: true, coverImageUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ Cover regeneration failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
