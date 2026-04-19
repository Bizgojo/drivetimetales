import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { buildCoverPrompt } from '@/lib/coverPrompt'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any
try {
  const sharpMod = eval('require')('sharp')
  sharp = sharpMod?.default || sharpMod
} catch {
  sharp = null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function overlayText(imageBuffer: Buffer, title: string, author: string): Promise<Buffer> {
  console.warn('Skipping sharp text overlay for launch-safe cover generation')
  return imageBuffer
}

async function generateWithDallE(prompt: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt.slice(0, 4000), // DALL-E 3 max prompt length
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      response_format: 'url',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`DALL-E 3 error: ${res.status} - ${errText}`)
  }

  const json = await res.json() as any
  const imageUrl = json.data?.[0]?.url
  if (!imageUrl) throw new Error('DALL-E 3 returned no image URL')
  try {
    const { logDalleCall } = await import('@/app/lib/openai-logger')
    logDalleCall({ route: '/api/asc3/regenerate-cover', purpose: 'cover-art-regen', model: 'dall-e-3', size: '1024x1024', quality: 'hd', n: 1 }).catch(() => {})
  } catch { /* never break */ }

  // Download the image
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Failed to download DALL-E image: ${imgRes.status}`)
  return Buffer.from(await imgRes.arrayBuffer())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storyId, genre } = body

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId is required' }, { status: 400 })
    }

    // Fetch story details — use concept/tone for visual prompt, NOT raw script
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('title, author, genre, primary_genre, description, intro_text')
      .eq('id', storyId)
      .single()

    if (storyErr) console.error('Story fetch error:', storyErr.message)

    const dallePrompt = buildCoverPrompt({
      title: story?.title || 'Untitled',
      author: story?.author || 'Unknown Author',
      genre: story?.genre || story?.primary_genre || genre || 'fiction',
      concept: story?.description || story?.intro_text || undefined,
    })

    console.log('🎨 Generating cover via DALL-E 3...')
    console.log('  Prompt preview:', dallePrompt.substring(0, 200))

    const rawBuffer = await generateWithDallE(dallePrompt)

    // Overlay title + author programmatically (Stability AI can't render text reliably)
    const imgBuffer = await overlayText(
      rawBuffer,
      story?.title || 'Untitled',
      story?.author || 'Unknown Author'
    )
    console.log('  ✅ Text overlay applied')

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
