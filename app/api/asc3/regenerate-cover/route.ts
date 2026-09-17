import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { ULTRA_BRIGHT_DIRECTIVE } from '@/lib/coverPrompt'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any
try {
  const sharpMod = eval('require')('sharp')
  sharp = sharpMod?.default || sharpMod
} catch {
  sharp = null
}

// ─── Luminance validation ────────────────────────────────────────────────────
// Threshold: average luminance < 100/255 triggers a brightness retry.
// Marc may tune LUMINANCE_THRESHOLD via env var.
const LUMINANCE_THRESHOLD = parseInt(process.env.COVER_LUMINANCE_THRESHOLD || '100', 10)

/**
 * Compute average luminance (0–255) from a JPEG/PNG buffer using sharp.
 * Returns null if sharp is unavailable.
 */
async function computeAverageLuminance(buffer: Buffer): Promise<number | null> {
  if (!sharp) return null
  try {
    const { data, info } = await sharp(buffer)
      .resize(64, 64) // downscale for speed
      .raw()
      .toBuffer({ resolveWithObject: true })
    const channels = info.channels // 3 = RGB, 4 = RGBA
    let total = 0
    let count = 0
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Rec.709 luminance
      total += 0.2126 * r + 0.7152 * g + 0.0722 * b
      count++
    }
    return count > 0 ? total / count : null
  } catch (err) {
    console.warn('[luminance] sharp error:', err)
    return null
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── Style mapping from essence/style_reference + genre ─────────────────────
function deriveVisualStyle(essence: string | null, styleRef: string | null, genre: string): string {
  const combined = ((essence || '') + ' ' + (styleRef || '')).toLowerCase()
  const g = genre.toLowerCase()

  if ((g.includes('mystery') || g.includes('thriller')) && (combined.includes('highsmith') || combined.includes('psychological'))) {
    return 'dark, psychological, muted palette, noir lighting'
  }
  if (g.includes('sci-fi') || g.includes('science fiction') || combined.includes('space') || combined.includes('near-future')) {
    return 'cinematic, atmospheric, deep space or near-future'
  }
  if (combined.includes('cosmic') || combined.includes('documentary') || combined.includes('science')) {
    return 'sweeping, documentary, deep-field imagery'
  }
  if ((g.includes('thriller')) && (combined.includes('child') || combined.includes('stark'))) {
    return 'stark, high-contrast, lone figure in landscape'
  }
  if (g.includes('western') || combined.includes('western')) {
    return 'dusty, wide-angle, golden hour'
  }
  return `cinematic, dramatic lighting, ${genre} atmosphere`
}

// ─── DB-driven prompt builder ────────────────────────────────────────────────
async function buildDynamicCoverPrompt(
  storyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  story: any,
  genre: string
): Promise<string> {
  let seriesTitle: string | null = null
  let seriesCategory: string | null = null
  let seriesDescription: string | null = null
  let authorStyleRef: string | null = null
  let voiceEssence: string | null = null

  // 1. Check series info if story belongs to a series
  if (story?.series_id) {
    const { data: seriesRow } = await supabase
      .from('series')
      .select('title, category, description')
      .eq('id', story.series_id)
      .single()
    if (seriesRow) {
      seriesTitle = seriesRow.title || null
      seriesCategory = seriesRow.category || null
      seriesDescription = seriesRow.description || null
    }
  }

  // 2. Query authors table for style_reference
  if (story?.author) {
    const { data: authorRow } = await supabase
      .from('authors')
      .select('id, name, style_reference')
      .ilike('name', `%${story.author}%`)
      .limit(1)
      .single()
    if (authorRow) {
      authorStyleRef = authorRow.style_reference || null
      // 3. Query voice_profiles for essence
      const { data: vpRow } = await supabase
        .from('voice_profiles')
        .select('essence')
        .eq('author_id', authorRow.id)
        .limit(1)
        .single()
      if (vpRow) voiceEssence = vpRow.essence || null
    }
  }

  const effectiveTitle = seriesTitle || story?.title || 'Untitled'
  const effectiveGenre = seriesCategory || genre
  const effectiveDescription = seriesDescription || story?.description || ''
  const visualStyle = deriveVisualStyle(voiceEssence, authorStyleRef, effectiveGenre)

  return `Cover art for an audio drama series titled '${effectiveTitle}'. Genre: ${effectiveGenre}. Style: ${visualStyle}. Description: ${cleanConceptPart(effectiveDescription, 400)}. Square format, dramatic, cinematic lighting, no text, no logos.`
}

// ─── Claude-powered image generation ────────────────────────────────────────
// Claude (text) builds a structured, enriched image prompt; DALL-E renders it.
// When Anthropic ships native image generation, swap the renderer below.
async function generateWithClaude(basePrompt: string): Promise<Buffer> {
  // Step 1: Use Claude to produce a detailed, structured image prompt
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are an art director for audiobook cover illustrations. Given a cover brief, output ONLY a single richly detailed image generation prompt (no preamble, no commentary, no quotes). The prompt must be vivid, specific, and optimised for DALL-E. Keep it under 900 characters.\n\nBrief:\n${basePrompt}`,
      }],
    }),
  })

  if (!claudeRes.ok) {
    const errText = await claudeRes.text()
    console.error('[regenerate-cover] Claude prompt enhancement failed:', claudeRes.status, errText.slice(0, 300))
    // Fall through to base prompt if Claude fails
  }

  let enrichedPrompt = basePrompt
  if (claudeRes.ok) {
    const claudeJson = await claudeRes.json() as { content?: { type: string; text: string }[] }
    const claudeText = claudeJson.content?.find(b => b.type === 'text')?.text?.trim()
    if (claudeText) {
      enrichedPrompt = claudeText
      console.log('[regenerate-cover] Claude-enriched prompt:', enrichedPrompt.slice(0, 200))
    }
  }

  // Step 2: Render image via DALL-E (pixel renderer; swap when Anthropic image gen ships)
  const imageRequest: Record<string, unknown> = {
    model: 'gpt-image-1',
    prompt: enrichedPrompt.slice(0, 4000),
    n: 1,
    size: '1024x1024',
    quality: 'high',
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(imageRequest),
  })

  const imageContentType = res.headers.get('content-type') || ''
  if (!res.ok) {
    const errText = await res.text()
    console.error('[regenerate-cover] image renderer failure:', {
      status: res.status,
      contentType: imageContentType,
      bodyPreview: errText.slice(0, 500),
    })
    throw coverFailure('Image renderer error', {
      substep: 'image generation',
      status: res.status,
      contentType: imageContentType,
      responsePreview: errText.slice(0, 300),
    })
  }

  const json = await readJsonOrCoverFailure(res, 'image generation') as {
    data?: { b64_json?: string; url?: string }[]
  }
  console.log('[regenerate-cover] image response success:', {
    hasBase64: Boolean(json.data?.[0]?.b64_json),
    hasUrl: Boolean(json.data?.[0]?.url),
  })

  const b64Json = json.data?.[0]?.b64_json
  if (b64Json) return Buffer.from(b64Json, 'base64')

  const imageUrl = json.data?.[0]?.url
  if (!imageUrl) throw new Error('Image renderer returned no image data')

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

    // Fetch story details including series_id for skip logic
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('id, title, author, genre, primary_genre, description, intro_text, brief_json, prose_text, script, episode_title, series_name, episode_number, series_id')
      .eq('id', storyId)
      .single()

    if (storyErr) console.error('Story fetch error:', storyErr.message)

    // ── Series-level cover skip ──────────────────────────────────────────────
    // If story belongs to a series and series already has a cover_url, reuse it.
    if (story?.series_id) {
      const { data: seriesRow } = await supabase
        .from('series')
        .select('cover_url')
        .eq('id', story.series_id)
        .single()

      if (seriesRow?.cover_url) {
        console.log(`[regenerate-cover] Series cover exists — reusing: ${seriesRow.cover_url}`)
        // Propagate to story if not already set
        if (!candidateOnly) {
          await supabase.from('stories').update({ cover_url: seriesRow.cover_url }).eq('id', storyId)
        }
        return NextResponse.json({
          success: true,
          coverImageUrl: seriesRow.cover_url,
          seriesCoverReused: true,
          ...(candidateOnly ? { candidateOnly: true, candidateCoverUrl: seriesRow.cover_url } : {}),
        })
      }
    }

    const effectiveGenre = story?.genre || story?.primary_genre || genre || 'fiction'

    // ── Dynamic DB-driven prompt ────────────────────────────────────────────
    const dbPrompt = await buildDynamicCoverPrompt(storyId, story, effectiveGenre)

    // Append visual concept and feedback for richness
    const visualConcept = buildStoryVisualConcept(story, candidateOnly === true)
    const feedbackSuffix = coverFeedback ? ` Additional direction: ${coverFeedback}` : ''
    const fullPrompt = visualConcept
      ? `${dbPrompt} Visual context: ${visualConcept}${feedbackSuffix}`
      : `${dbPrompt}${feedbackSuffix}`

    console.log('🎨 Generating cover via Claude-enhanced image pipeline...')
    console.log('  Prompt preview:', fullPrompt.substring(0, 200))

    let rawBuffer = await generateWithClaude(fullPrompt)

    // ── LUMINANCE VALIDATION GATE ────────────────────────────────────────────
    let luminance = await computeAverageLuminance(rawBuffer)
    let luminanceRetried = false
    let luminanceWarning: string | undefined

    console.log(`[luminance] average: ${luminance !== null ? luminance.toFixed(1) : 'n/a'} (threshold: ${LUMINANCE_THRESHOLD})`)

    if (luminance !== null && luminance < LUMINANCE_THRESHOLD) {
      console.warn(`[luminance] ⚠️ Cover too dark (${luminance.toFixed(1)} < ${LUMINANCE_THRESHOLD}) — retrying with ultra-bright constraint`)
      luminanceRetried = true
      const ultraBrightPrompt = `${ULTRA_BRIGHT_DIRECTIVE} ${fullPrompt}`.slice(0, 4000)
      rawBuffer = await generateWithClaude(ultraBrightPrompt)
      luminance = await computeAverageLuminance(rawBuffer)
      console.log(`[luminance] retry average: ${luminance !== null ? luminance.toFixed(1) : 'n/a'}`)

      if (luminance !== null && luminance < LUMINANCE_THRESHOLD) {
        luminanceWarning = `Cover luminance still below threshold after retry (${luminance.toFixed(1)} < ${LUMINANCE_THRESHOLD}). Marc review recommended.`
        console.warn(`[luminance] ⚠️ ${luminanceWarning}`)
      }
    }

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

    // If story is part of a series and series has no cover yet, set it now
    if (story?.series_id && !candidateOnly) {
      await supabase.from('series').update({ cover_url: publicUrl }).eq('id', story.series_id)
      console.log(`[regenerate-cover] Series cover set: ${publicUrl}`)
    }

    if (candidateOnly === true) {
      console.log(`✅ Cover candidate generated: ${publicUrl}`)
      return NextResponse.json({
        success: true,
        candidateOnly: true,
        candidateCoverUrl: publicUrl,
        promptPreview: fullPrompt.slice(0, 900),
        luminance: luminance !== null ? parseFloat(luminance.toFixed(1)) : null,
        luminanceRetried,
        luminanceWarning: luminanceWarning || null,
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
    return NextResponse.json({
      success: true,
      coverImageUrl: publicUrl,
      luminance: luminance !== null ? parseFloat(luminance.toFixed(1)) : null,
      luminanceRetried,
      luminanceWarning: luminanceWarning || null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const details = err && typeof err === 'object' && 'details' in err
      ? (err as { details?: CoverFailureDetails }).details
      : undefined
    console.error('❌ Cover regeneration failed:', { error: msg, details })
    return NextResponse.json({ success: false, error: msg, details }, { status: 500 })
  }
}
