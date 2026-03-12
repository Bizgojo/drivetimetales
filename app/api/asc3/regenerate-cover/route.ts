import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { buildCoverPrompt } from '@/lib/coverPrompt'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any
try { sharp = eval('require')('sharp') } catch { sharp = null }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STABILITY_API_KEY = process.env.STABILITY_API_KEY!

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function overlayText(imageBuffer: Buffer, title: string, author: string): Promise<Buffer> {
  const size = 1024
  const safeTitle = escapeXml(title.toUpperCase())
  const safeAuthor = escapeXml(author)

  // Split title into lines if long
  const words = title.toUpperCase().split(' ')
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (test.length > 16 && current) { lines.push(current); current = w }
    else current = test
  }
  if (current) lines.push(current)

  const titleFontSize = lines.length > 2 ? 72 : 86
  const lineHeight = titleFontSize + 10
  const titleBlockHeight = lines.length * lineHeight
  const titleY = size - 220

  const titleLines = lines.map((line, i) =>
    `<text x="512" y="${titleY + i * lineHeight}" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="bold" fill="white" text-anchor="middle" filter="url(#shadow)">${escapeXml(line)}</text>`
  ).join('\n')

  // Pill badge zone: bottom-right ~200×60px with 20px margin
  const pillW = 220, pillH = 64, pillR = 32, pillMargin = 20
  const pillX = size - pillW - pillMargin
  const pillY = size - pillH - pillMargin

  const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.9"/>
    </filter>
    <!-- Dark gradient bar at bottom for text legibility -->
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.75"/>
    </linearGradient>
    <!-- Radial darkening for pill badge zone (bottom-right) -->
    <radialGradient id="pillGrad" cx="100%" cy="100%" r="30%" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="black" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Bottom gradient overlay -->
  <rect x="0" y="${size - 300}" width="${size}" height="300" fill="url(#grad)"/>
  <!-- Bottom-right darkening for pill badge -->
  <rect x="${size - 300}" y="${size - 200}" width="300" height="200" fill="url(#pillGrad)"/>
  <!-- Pill badge placeholder outline (subtle, ensures area is always clear) -->
  <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" ry="${pillR}" fill="black" fill-opacity="0.45"/>
  <!-- Title lines -->
  ${titleLines}
  <!-- Author -->
  <text x="512" y="${titleY + titleBlockHeight + 28}" font-family="Georgia, serif" font-size="36" fill="#d4a843" text-anchor="middle" filter="url(#shadow)">${safeAuthor}</text>
</svg>`

  return sharp(imageBuffer)
    .resize(size, size)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function generateWithStability(prompt: string): Promise<Buffer> {
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('aspect_ratio', '1:1')
  form.append('output_format', 'jpeg')

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STABILITY_API_KEY}`,
      Accept: 'image/*',
    },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Stability AI error: ${res.status} - ${errText}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

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
      .select('title, author, genre, primary_genre, tone, description')
      .eq('id', storyId)
      .single()

    const dallePrompt = buildCoverPrompt({
      title: story?.title || 'Untitled',
      author: story?.author || 'Unknown Author',
      genre: story?.genre || story?.primary_genre || genre || 'fiction',
      tone: story?.tone || undefined,
    })

    console.log('🎨 Generating cover via Stability AI...')
    console.log('  Prompt preview:', dallePrompt.substring(0, 200))

    const rawBuffer = await generateWithStability(dallePrompt)

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
