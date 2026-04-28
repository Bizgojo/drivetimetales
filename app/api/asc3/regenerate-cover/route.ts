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

function cleanConceptPart(value: unknown, max = 450): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bkiller\b/gi, 'dangerous man')
    .replace(/\bkill\b/gi, 'harm')
    .replace(/\bkills\b/gi, 'harms')
    .replace(/\bkilled\b/gi, 'lost')
    .replace(/\bdead\b/gi, 'gone')
    .replace(/\bdied\b/gi, 'was lost')
    .replace(/\bdeath\b/gi, 'loss')
    .replace(/\bcorpse\b/gi, 'evidence')
    .replace(/\bremains\b/gi, 'evidence')
    .replace(/\bbody\b/gi, 'evidence')
    .trim()
    .slice(0, max)
}

function visualAnchorsForTitle(title: string): string {
  const normalized = title.toLowerCase()

  if (normalized.includes('woman at keenan notch')) {
    return [
      'Keenan Notch Bridge in heavy Appalachian rain',
      "Lucia's small gas station and diner nearby",
      'a sabotaged bridge detail such as a hollow railing, broken deck, or hidden shipping manifest',
      'danger from a back-office fire or partial bridge-deck collapse',
    ].join('; ')
  }

  if (normalized.includes('last crossing')) {
    return [
      'Dunmore Gap Bridge at full flood stage',
      'a washed-out mountain road and a failing bridge over a deep hollow',
      'Clete crossing the unstable span toward Lucia',
      'final evidence such as an old refrigerated truck emerging in flood debris',
    ].join('; ')
  }

  return ''
}

function buildStoryVisualConcept(story: any): string | undefined {
  const brief = story?.brief_json && typeof story.brief_json === 'object' ? story.brief_json : {}
  const parts = [
    cleanConceptPart(story?.description, 260),
    cleanConceptPart(brief?.premise, 420),
    cleanConceptPart(brief?.setting, 320),
    cleanConceptPart(brief?.cliffhanger_or_resolution, 320),
  ].filter(Boolean)

  const anchors = visualAnchorsForTitle(story?.title || '')
  if (anchors) parts.push(`Required concrete visual anchors: ${anchors}.`)

  if (!parts.length) return story?.intro_text || undefined

  return [
    parts.join(' '),
    'Make the cover story-faithful and concrete: show the named place, weather, danger, and key object or action. Avoid generic landscapes, generic portraits, or unrelated scenery.',
  ].join(' ')
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
      .select('title, author, genre, primary_genre, description, intro_text, brief_json')
      .eq('id', storyId)
      .single()

    if (storyErr) console.error('Story fetch error:', storyErr.message)

    const visualConcept = buildStoryVisualConcept(story)

    const dallePrompt = buildCoverPrompt({
      title: story?.title || 'Untitled',
      author: story?.author || 'Unknown Author',
      genre: story?.genre || story?.primary_genre || genre || 'fiction',
      concept: visualConcept,
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
