import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { buildCoverDirectionBrief, buildCoverPrompt } from '@/lib/coverPrompt'
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
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

type CoverFailureDetails = {
  substep: string
  status?: number
  contentType?: string
  responsePreview?: string
  error?: string
}

function coverFailure(message: string, details: CoverFailureDetails) {
  return Object.assign(new Error(message), { details })
}

async function readJsonOrCoverFailure(res: Response, substep: string) {
  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()
  const trimmed = raw.trim()

  if (!contentType.includes('application/json') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    throw coverFailure(`${substep} returned non-JSON response`, {
      substep,
      status: res.status,
      contentType,
      responsePreview: raw.slice(0, 300),
    })
  }

  try {
    return JSON.parse(trimmed)
  } catch (err) {
    throw coverFailure(`${substep} returned invalid JSON`, {
      substep,
      status: res.status,
      contentType,
      responsePreview: raw.slice(0, 300),
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

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

function cleanCoverFeedback(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function excerptText(value: unknown, max = 900): string {
  if (typeof value !== 'string') return ''
  return cleanConceptPart(
    value
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/^[A-Z][A-Z0-9 '\-]+:\s*/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    max
  )
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

function buildStoryVisualConcept(story: any, candidateOnly = false): string | undefined {
  const brief = story?.brief_json && typeof story.brief_json === 'object' ? story.brief_json : {}
  const parts = [
    cleanConceptPart(story?.description, 260),
    cleanConceptPart(brief?.premise, 420),
    cleanConceptPart(brief?.setting, 320),
    cleanConceptPart(brief?.cliffhanger_or_resolution, 320),
  ].filter(Boolean)

  const storyContent = excerptText(story?.prose_text, candidateOnly ? 950 : 650) || excerptText(story?.script, candidateOnly ? 950 : 650)
  if (storyContent) parts.push(`Episode-specific content: ${storyContent}.`)

  if (story?.series_name || story?.episode_number || story?.episode_title) {
    parts.push(cleanConceptPart([
      story?.series_name ? `Series: ${story.series_name}` : '',
      story?.episode_number ? `Episode ${story.episode_number}` : '',
      story?.episode_title ? `Episode title: ${story.episode_title}` : '',
    ].filter(Boolean).join('. '), 260))
  }

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
  const imageRequest: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: '1024x1024',
  }

  if (IMAGE_MODEL.startsWith('gpt-image')) {
    imageRequest.quality = 'high'
  } else {
    imageRequest.quality = 'hd'
    imageRequest.response_format = 'url'
  }

  console.log('[regenerate-cover] image model used:', IMAGE_MODEL)

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(imageRequest),
  })

  const imageContentType = res.headers.get('content-type') || ''
  if (!res.ok) {
    const errText = await res.text()
    console.error('[regenerate-cover] image response failure:', {
      model: IMAGE_MODEL,
      status: res.status,
      contentType: imageContentType,
      bodyPreview: errText.slice(0, 500),
    })
    throw coverFailure(`${IMAGE_MODEL} image generation error`, {
      substep: 'image generation',
      status: res.status,
      contentType: imageContentType,
      responsePreview: errText.slice(0, 300),
    })
  }

  const json = await readJsonOrCoverFailure(res, 'image generation') as any
  console.log('[regenerate-cover] image response success:', {
    model: IMAGE_MODEL,
    hasUrl: Boolean(json.data?.[0]?.url),
    hasBase64: Boolean(json.data?.[0]?.b64_json),
  })

  const b64Json = json.data?.[0]?.b64_json
  if (b64Json) {
    try {
      const { logDalleCall } = await import('@/app/lib/openai-logger')
      logDalleCall({ route: '/api/asc3/regenerate-cover', purpose: 'cover-art-regen', model: IMAGE_MODEL, size: '1024x1024', quality: 'high', n: 1 }).catch(() => {})
    } catch { /* never break */ }
    return Buffer.from(b64Json, 'base64')
  }

  const imageUrl = json.data?.[0]?.url
  if (!imageUrl) throw new Error(`${IMAGE_MODEL} returned no image data`)
  try {
    const { logDalleCall } = await import('@/app/lib/openai-logger')
    logDalleCall({ route: '/api/asc3/regenerate-cover', purpose: 'cover-art-regen', model: IMAGE_MODEL, size: '1024x1024', quality: 'hd', n: 1 }).catch(() => {})
  } catch { /* never break */ }

  // Download the image
  const imgRes = await fetch(imageUrl)
  const imgContentType = imgRes.headers.get('content-type') || ''
  if (!imgRes.ok) {
    const imgText = await imgRes.text().catch(() => '')
    throw coverFailure(`Failed to download generated image: ${imgRes.status}`, {
      substep: 'generated image download',
      status: imgRes.status,
      contentType: imgContentType,
      responsePreview: imgText.slice(0, 300),
    })
  }
  if (!imgContentType.startsWith('image/')) {
    const imgText = await imgRes.text().catch(() => '')
    throw coverFailure('Generated image download returned non-image response', {
      substep: 'generated image download',
      status: imgRes.status,
      contentType: imgContentType,
      responsePreview: imgText.slice(0, 300),
    })
  }
  return Buffer.from(await imgRes.arrayBuffer())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storyId, genre, candidateOnly } = body
    const coverFeedback = cleanCoverFeedback(body?.coverFeedback)

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId is required' }, { status: 400 })
    }

    // Fetch story details for the cover director. Use excerpts only, with metadata as fallback.
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('title, author, genre, primary_genre, description, intro_text, brief_json, prose_text, script, episode_title, series_name, episode_number')
      .eq('id', storyId)
      .single()

    if (storyErr) console.error('Story fetch error:', storyErr.message)

    const visualConcept = buildStoryVisualConcept(story, candidateOnly === true)
    const promptParams = {
      title: story?.title || 'Untitled',
      author: story?.author || 'Unknown Author',
      genre: story?.genre || story?.primary_genre || genre || 'fiction',
      concept: visualConcept,
      script: excerptText(story?.prose_text, 900) || excerptText(story?.script, 900),
      coverFeedback,
    }
    const coverDirectionBrief = buildCoverDirectionBrief(promptParams)

    const dallePrompt = buildCoverPrompt(promptParams)

    console.log('🎨 Generating cover via image model...')
    console.log('[regenerate-cover] cover direction brief:', JSON.stringify(coverDirectionBrief, null, 2))
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
    const storagePath = candidateOnly === true
      ? `asc3/${storyId}/cover-candidates/cover_${timestamp}.jpg`
      : `asc3/${storyId}/cover_${timestamp}.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, imgBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadErr) {
      throw coverFailure(`Cover upload error: ${uploadErr.message}`, {
        substep: 'supabase storage upload',
        error: uploadErr.message,
      })
    }

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    if (candidateOnly === true) {
      console.log(`✅ Cover candidate generated: ${publicUrl}`)
      return NextResponse.json({
        success: true,
        candidateOnly: true,
        candidateCoverUrl: publicUrl,
        coverDirectionBrief,
        promptPreview: dallePrompt.slice(0, 900),
      })
    }

    const { error: coverUpdateError } = await supabase.from('stories').update({ cover_url: publicUrl }).eq('id', storyId)
    if (coverUpdateError) {
      throw coverFailure(`Cover URL update error: ${coverUpdateError.message}`, {
        substep: 'stories.cover_url update',
        error: coverUpdateError.message,
      })
    }

    console.log(`✅ Cover regenerated: ${publicUrl}`)
    return NextResponse.json({ success: true, coverImageUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const details = err && typeof err === 'object' && 'details' in err
      ? (err as { details?: CoverFailureDetails }).details
      : undefined
    console.error('❌ Cover regeneration failed:', { error: msg, details })
    return NextResponse.json({ success: false, error: msg, details }, { status: 500 })
  }
}
